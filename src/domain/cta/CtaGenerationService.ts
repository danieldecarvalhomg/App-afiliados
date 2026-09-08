import { createHash, randomUUID } from "node:crypto";
import type { CtaAIProvider, CtaCreativeGenerationInput } from "./CtaAIProvider";
import type { CtaRepository } from "./CtaRepository";
import { buildProductCreativeContext } from "./CtaCreativeContext";
import { CtaCreativeAnglePlanner } from "./CtaCreativeAnglePlanner";
import { CtaCandidateSelector } from "./CtaCandidateSelector";
import { CtaValidator } from "./CtaValidator";
import { legacyBlocksToDocument, documentToDsl } from "./LegacyTemplateAdapter";
import { MessageTemplateRenderer } from "./MessageTemplateRenderer";
import { TemplateDocumentInspector } from "./TemplateDocumentInspector";
import type {
  CtaBlock,
  CtaCandidate,
  CtaFacts,
  CtaGeneration,
  CtaGenerationRequest,
  CtaGeneratedSlot,
  CtaTemplate,
  CtaTemplatePreview,
  MessageGenerationSnapshot,
  MessageTemplateDocument,
} from "./types";
import { productToCtaFacts } from "./types";
import { ctaRuleEligible } from "./SemanticMemoryEligibility";

const similarity = (left: string, right: string) => {
  const words = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().match(/[a-z0-9]{3,}/gu) ?? [];
  const current = words(left);
  if (current.length < 2) return 0;
  const prior = new Set(words(right));
  return current.filter((word) => prior.has(word)).length / current.length;
};

const ctaBlock = (): CtaBlock => ({
  id: "cta_ia", key: "cta_ia", label: "CTA", kind: "creative", enabled: true,
  position: 0, positionMode: "pinned", frequency: "always", conditions: [],
  format: "separate_line", whatsappFormat: "normal", groupId: null,
  generationInstruction: null, fixedText: null, copyMode: "AI_GENERATED",
  copyLibraryItemId: null, objective: "chamada criativa inicial",
});

interface GenerationContext {
  recentTests?: Array<{ text: string; angle: string | null }>;
  facts: CtaFacts;
  template: CtaTemplate;
  document: MessageTemplateDocument;
  profile: Awaited<ReturnType<CtaRepository["getOrCreateProfile"]>>;
  rules: Awaited<ReturnType<CtaRepository["listRules"]>>;
  examples: Awaited<ReturnType<CtaRepository["listRelevantExamples"]>>;
  recent: Awaited<ReturnType<CtaRepository["listRecentGenerations"]>>;
  semanticItems: Awaited<ReturnType<CtaRepository["listRelevantMemory"]>>;
}

interface SelectedCta { text: string; angle: string | null; provider: string; model: string; }

export class CtaGenerationService {
  private readonly recentTests = new Map<string, { expiresAt: number; items: Array<{ text: string; angle: string | null }> }>();
  private readonly replenishing=new Map<string,Promise<void>>();
  constructor(
    private repository: CtaRepository,
    private provider: CtaAIProvider,
    private validator = new CtaValidator(),
    private renderer = new MessageTemplateRenderer(),
    private inspector = new TemplateDocumentInspector(),
    private planner = new CtaCreativeAnglePlanner(),
    private selector = new CtaCandidateSelector(),
  ) {}

  private document(template: CtaTemplate, override?: CtaTemplate["blocks"]): MessageTemplateDocument {
    const document = override === undefined
      ? (template.document ?? legacyBlocksToDocument(template.blocks))
      : legacyBlocksToDocument(override);
    const count = this.inspector.countCta(document);
    if (count > 1) throw new Error("TEMPLATE_MULTIPLE_CTA_SLOTS");
    return document;
  }

  private async context(
    userId: string,
    templateId: string | undefined,
    facts: CtaFacts,
    blocksOverride?: CtaTemplate["blocks"],
    fixedDocument?: MessageTemplateDocument,
  ): Promise<GenerationContext> {
    const [profile, rules, examples, recent, semanticItems] = await Promise.all([
      this.repository.getOrCreateProfile(userId),
      this.repository.listRules(userId),
      this.repository.listRelevantExamples(userId, { title: facts.title, category: facts.category }, 8),
      this.repository.listRecentGenerationMemory
        ? this.repository.listRecentGenerationMemory(userId, 30)
        : this.repository.listRecentGenerations(userId, 30),
      typeof (this.repository as Partial<CtaRepository>).listRelevantMemory === "function"
        ? this.repository.listRelevantMemory(userId, { title: facts.title, category: facts.category, marketplace: facts.marketplace }, 30)
        : Promise.resolve([]),
    ]);
    const template = templateId
      ? await this.repository.getTemplate(userId, templateId)
      : await this.repository.getDefaultTemplate(userId);
    if (!template || !template.active) throw new Error("CTA_TEMPLATE_NOT_FOUND");
    return { facts, template, document: fixedDocument ?? this.document(template, blocksOverride), profile, rules, examples, recent, semanticItems };
  }

  private input(context: GenerationContext, instruction: string | undefined, variantIndex: number, candidateCount: number): CtaCreativeGenerationInput {
    const block = ctaBlock();
    const blueprint = {
      id: context.template.id,
      userId: context.template.userId,
      profileId: context.profile.id,
      version: context.template.version,
      isDefault: context.template.isDefault,
      blocks: [block],
      createdAt: context.template.createdAt,
      updatedAt: context.template.updatedAt,
    };
    const memory = {
      rules: context.rules.filter((rule) => ctaRuleEligible(rule, context.facts)),
      examples: context.examples.slice(0,5),
      semanticItems: context.semanticItems,
      recentSignatures: context.recent.map((item) => item.structureSignature).slice(0, 8),
      recentVariantSlots: [],
      preferences: context.profile.naturalLanguagePreferences,
      recentCtas: [...(context.recentTests ?? []), ...context.recent.filter((item) => item.ctaText).slice(0, 6).map((item) => ({
        text: item.ctaText!,
        angle: (item.structureSnapshot as Partial<MessageGenerationSnapshot>).angle ?? null,
      }))].slice(0, 12),
    };
    const base = {
      facts: context.facts,
      creativeContext: buildProductCreativeContext(context.facts),
      templateContext: this.inspector.context(context.document, context.facts),
      profile: context.profile,
      blueprint,
      memory,
      instruction: instruction?.trim() || null,
      variantIndex,
      candidateCount,
    };
    return { ...base, anglePlan: this.planner.plan(base) };
  }

  private candidates(output: Awaited<ReturnType<CtaAIProvider["generateCta"]>>["output"]): CtaCandidate[] {
    if (output.candidates?.length) return output.candidates;
    return output.slots.filter((slot) => slot.text?.trim()).map((slot, index) => ({ text: slot.text.trim(), angle: slot.angle ?? `candidate-${index + 1}` }));
  }

  private candidatePoolKey(context:GenerationContext,instruction?:string):string{
    return createHash('sha256').update(JSON.stringify({
      version:2,facts:context.facts,templateId:context.template.id,templateVersion:context.template.version,
      document:context.document,profileId:context.profile.id,profileVersion:context.profile.version,
      memoryEpoch:context.profile.memoryEpoch??1,instruction:instruction?.trim()||null,
      model:(this.provider as {model?:string}).model??'provider-default',
    })).digest('hex');
  }

  private usable(candidate:CtaCandidate,context:GenerationContext,selected:SelectedCta[]):boolean{
    if (!this.validator.validate(candidate.text, context.facts, context.rules).valid) return false;
    const asksQuestion = context.semanticItems.some((item) =>
      ["instruction", "correction"].includes(item.kind) &&
      /(?:faça|faca|use|escreva)\s+(?:uma\s+)?pergunta/iu.test(item.semanticText) &&
      !/n[aã]o\s+(?:faça|faca|use|escreva)\s+(?:uma\s+)?pergunta/iu.test(item.semanticText) &&
      /(?:n[aã]o houver|sem|aus[eê]ncia de)\s+descri[çc][aã]o/iu.test(item.semanticText));
    // O contexto criativo atual não fornece descrição validada. A condição
    // explícita "sem descrição, faça uma pergunta" portanto está satisfeita.
    if (asksQuestion && !candidate.text.trim().endsWith("?")) return false;
    if (context.recentTests?.some((item) => similarity(item.text, candidate.text) >= .9)) return false;
    if(selected.some((item)=>item.angle===candidate.angle||similarity(item.text,candidate.text)>=.7))return false;
    const evaluated=this.selector.select([candidate],context.facts,buildProductCreativeContext(context.facts),[
      ...context.recent.filter((item)=>item.ctaText).map((item)=>item.ctaText!),...selected.map((item)=>item.text),
    ]);
    return evaluated.errors.length===0;
  }

  private savePool(userId:string,key:string,candidates:SelectedCta[]):void{
    if(process.env.AI_COST_OPTIMIZATIONS_ENABLED==='false'||!this.repository.saveCtaCandidates||!candidates.length)return;
    void this.repository.saveCtaCandidates(userId,key,candidates.map((item)=>({text:item.text,angle:item.angle??'alternativo',provider:item.provider,model:item.model})),new Date(Date.now()+7*24*60*60_000).toISOString()).catch(()=>undefined);
  }

  private replenish(userId:string,key:string,context:GenerationContext,instruction?:string):void{
    if(!this.repository.saveCtaCandidates||this.replenishing.has(key))return;
    const task=(async()=>{
      const response=await this.provider.generateCta(this.input(context,instruction,Math.floor(Date.now()/60_000),4));
      const accepted:SelectedCta[]=[];
      for(const candidate of this.candidates(response.output))if(this.usable(candidate,context,accepted))accepted.push({text:candidate.text.trim(),angle:candidate.angle,provider:response.provider,model:response.model});
      this.savePool(userId,key,accepted);
    })().catch((error)=>console.warn('[AfiliHub:CTA] Reposição silenciosa de candidatos falhou.',error)).finally(()=>this.replenishing.delete(key));
    this.replenishing.set(key,task);
  }

  private async generateCtas(context: GenerationContext, desired: 1 | 3, instruction?: string,userId?:string): Promise<SelectedCta[]> {
    if (this.inspector.countCta(context.document) === 0) return [{ text: "", angle: null, provider: "deterministic", model: "message-template-renderer" }];
    const owner=userId??context.profile.userId;const poolKey=this.candidatePoolKey(context,instruction);
    const selected:SelectedCta[]=[];
    if(process.env.AI_COST_OPTIMIZATIONS_ENABLED!=='false'&&this.repository.claimCtaCandidates){
      const claimed=await this.repository.claimCtaCandidates(owner,poolKey,desired).catch(()=>({items:[],remaining:0}));
      for(const candidate of claimed.items){
        if(selected.length>=desired)break;
        if(this.usable(candidate,context,selected))selected.push({text:candidate.text.trim(),angle:candidate.angle,provider:'cta-candidate-cache',model:candidate.model});
      }
      if(selected.length>=desired){if(claimed.remaining===0)this.replenish(owner,poolKey,context,instruction);return selected;}
    }
    const input = this.input(context, instruction, 0, desired === 3 ? 4 : 3);
    let response = await this.provider.generateCta(input);
    let pool = this.candidates(response.output);
    const unused:SelectedCta[]=[];
    let attempts = 0;
    while (selected.length < desired && attempts < 3) {
      for (const candidate of pool) {
        if(!this.usable(candidate,context,[...selected,...unused]))continue;
        const value={text:candidate.text.trim(),angle:candidate.angle,provider:response.provider,model:response.model};
        if(selected.length<desired)selected.push(value);else unused.push(value);
      }
      if (selected.length >= desired) break;
      attempts++;
      if (attempts >= 3) break;
      const errors = [selected.length ? "AI_VARIANT_TOO_SIMILAR" : "AI_COPY_TOO_GENERIC", "Verifique também todas as regras do Treinador, inclusive pedido de pergunta quando não há descrição confirmada."];
      response = await this.provider.repairCta({
        ...this.input(context, instruction, attempts, Math.max(3, desired - selected.length + 1)),
        invalidText: pool.map((item) => item.text).join("\n"),
        invalidSlots: pool.map((item): CtaGeneratedSlot => ({ blockId: "cta_ia", text: item.text, angle: item.angle })),
        errors,
      });
      pool = this.candidates(response.output);
    }
    if (!selected.length) throw new Error("CTA_GENERATION_FAILED");
    this.savePool(owner,poolKey,unused);
    return selected;
  }

  private snapshot(context: GenerationContext, cta: SelectedCta): MessageGenerationSnapshot {
    return {
      kind: "message-template-v1",
      templateId: context.template.id,
      templateVersion: context.template.version,
      trainerVersion: context.profile.version,
      document: context.document,
      dsl: context.template.dsl ?? documentToDsl(context.document),
      facts: context.facts,
      ctaText: cta.text,
      angle: cta.angle,
    };
  }

  private async persist(userId: string, context: GenerationContext, cta: SelectedCta, mode: string, index: number, group: string | null) {
    const rendered = this.renderer.render(context.document, context.facts, cta.text);
    if (rendered.markupRepairs.length) console.warn("[AfiliHub:CTA] Marcação WhatsApp normalizada antes da validação.", {
      userId,
      productId: context.facts.productId,
      templateId: context.template.id,
      templateVersion: context.template.version,
      removedMarkers: rendered.markupRepairs,
    });
    const validation = this.validator.validate(rendered.text, context.facts, context.rules);
    const signature = createHash("sha256").update(`${context.template.version}:${context.template.dsl ?? documentToDsl(context.document)}`).digest("hex");
    return this.repository.createGeneration(userId, {
      productId: context.facts.productId,
      ctaProfileId: context.profile.id,
      templateId: context.template.id,
      ctaText: cta.text,
      generatedText: rendered.text,
      finalText: rendered.text,
      wasEdited: false,
      generationMode: mode,
      publishable: validation.publishable,
      status: validation.valid ? "valid" : "invalid",
      structureSignature: signature,
      structureSnapshot: this.snapshot(context, cta),
      provider: cta.provider,
      model: cta.model,
      validationErrors: validation.errors,
      variantIndex: index,
      variantGroupId: group,
      memoryEpoch: context.profile.memoryEpoch ?? 1,
    });
  }

  async generate(userId: string, productId: string, request: CtaGenerationRequest = {}) {
    const product = await this.repository.getProduct(userId, productId);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    const context = await this.context(userId, request.templateId, productToCtaFacts(product));
    const count = request.count === 3 ? 3 : 1;
    const ctas = await this.generateCtas(context, count, request.instruction,userId);
    const group = count === 3 ? randomUUID() : null;
    return Promise.all(ctas.map((cta, index) => this.persist(userId, context, cta, request.mode ?? (count === 3 ? "variants" : "single"), index, group)));
  }

  async testCta(userId: string, productId: string, request: CtaGenerationRequest = {}) {
    const product = await this.repository.getProduct(userId, productId);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    const facts = productToCtaFacts(product);
    const [profile, rules, examples, recent, semanticItems] = await Promise.all([
      this.repository.getOrCreateProfile(userId),
      this.repository.listRules(userId),
      this.repository.listRelevantExamples(userId, { title: facts.title, category: facts.category }, 8),
      this.repository.listRecentGenerationMemory
        ? this.repository.listRecentGenerationMemory(userId, 30)
        : this.repository.listRecentGenerations(userId, 30),
      typeof (this.repository as Partial<CtaRepository>).listRelevantMemory === "function"
        ? this.repository.listRelevantMemory(userId, { title: facts.title, category: facts.category, marketplace: facts.marketplace }, 30)
        : Promise.resolve([]),
    ]);
    const document: MessageTemplateDocument = { version: 1, nodes: [{ id: "trainer_cta", type: "cta" }] };
    const template: CtaTemplate = {
      id: "__trainer_test__", userId, name: "Teste do Treinador", description: null,
      active: true, isDefault: false, version: 1, blocks: [], document,
      presentation: { defaultCaption: "", watermark: { enabled: false, text: "", position: "bottom-right", opacity: 0.72 } },
      dsl: "{cta_ia}", editorMode: "blocks", officialKey: null, createdAt: "", updatedAt: "",
    };
    // Feedback muda a versão do perfil, mas não apaga o que acabou de ser exibido.
    const testKey = JSON.stringify([userId, productId, profile.id, profile.memoryEpoch ?? 1]);
    const prior = this.recentTests.get(testKey);
    const recentTests = prior && prior.expiresAt > Date.now() ? prior.items : [];
    const context: GenerationContext = { facts, template, document, profile, rules, examples, recent, semanticItems, recentTests };
    const desired = request.count === 3 ? 3 : 1;
    const ctas = await this.generateCtas(context, desired, request.instruction);
    const values = ctas.map((cta) => ({ text: cta.text, angle: cta.angle }));
    this.recentTests.delete(testKey);
    if (this.recentTests.size >= 200) this.recentTests.delete(this.recentTests.keys().next().value!);
    this.recentTests.set(testKey, { expiresAt: Date.now() + 30 * 60_000, items: [...values, ...recentTests].slice(0, 12) });
    return values;
  }

  regenerate(userId: string, productId: string, input: CtaGenerationRequest) {
    return this.generate(userId, productId, { ...input, count: input.count ?? 1, mode: input.mode ?? "regenerate" });
  }

  async regenerateCta(userId: string, generationId: string, instruction?: string) {
    if (typeof (this.repository as Partial<CtaRepository>).getGeneration !== "function") throw new Error("CTA_REGENERATION_SNAPSHOT_UNAVAILABLE");
    const base = await this.repository.getGeneration(userId, generationId);
    const snapshot = base?.structureSnapshot as Partial<MessageGenerationSnapshot> | undefined;
    if (!base || snapshot?.kind !== "message-template-v1" || !snapshot.document || !snapshot.facts || !snapshot.templateId || !Number.isInteger(snapshot.templateVersion))
      throw new Error("CTA_REGENERATION_SNAPSHOT_UNAVAILABLE");
    const facts = snapshot.facts;
    const [profile, rules, examples, recent, semanticItems] = await Promise.all([
      this.repository.getOrCreateProfile(userId),
      this.repository.listRules(userId),
      this.repository.listRelevantExamples(userId, { title: facts.title, category: facts.category }, 8),
      this.repository.listRecentGenerationMemory
        ? this.repository.listRecentGenerationMemory(userId, 30)
        : this.repository.listRecentGenerations(userId, 30),
      typeof (this.repository as Partial<CtaRepository>).listRelevantMemory === "function"
        ? this.repository.listRelevantMemory(userId, { title: facts.title, category: facts.category, marketplace: facts.marketplace }, 30)
        : Promise.resolve([]),
    ]);
    // O template pode ter sido editado ou até removido desde a geração.
    // A regeneração é deliberadamente autocontida pelo snapshot imutável.
    const template: CtaTemplate = {
      id: snapshot.templateId, userId, name: "Snapshot da mensagem",
      description: null, active: true, isDefault: false,
      version: snapshot.templateVersion!, blocks: [], document: snapshot.document,
      presentation: { defaultCaption: "", watermark: { enabled: false, text: "", position: "bottom-right", opacity: 0.72 } },
      dsl: snapshot.dsl ?? documentToDsl(snapshot.document), editorMode: "manual",
      officialKey: null, createdAt: base.createdAt, updatedAt: base.createdAt,
    };
    const context: GenerationContext = { facts, template, document: snapshot.document, profile, rules, examples, recent, semanticItems };
    const [cta] = await this.generateCtas(context, 1, instruction);
    return this.persist(userId, context, cta, "regenerate_cta", 0, null);
  }

  async preview(
    userId: string,
    templateId: string,
    facts: CtaFacts,
    instruction?: string,
    blocksOverride?: CtaTemplate["blocks"],
    documentOverride?: MessageTemplateDocument,
  ): Promise<CtaTemplatePreview> {
    const context = await this.context(userId, templateId, facts, blocksOverride, documentOverride);
    if (this.inspector.countCta(context.document) === 0) {
      const rendered = this.renderer.render(context.document, context.facts, "");
      const validation = this.validator.validate(rendered.text, facts, context.rules);
      return { text: rendered.text, publishable: validation.publishable, status: validation.valid ? "valid" : "invalid", validationErrors: validation.errors, provider: "deterministic", model: "message-template-renderer", structureSignature: createHash("sha256").update(documentToDsl(context.document)).digest("hex") };
    }
    const [cta] = await this.generateCtas(context, 1, instruction);
    const rendered = this.renderer.render(context.document, facts, cta.text);
    const validation = this.validator.validate(rendered.text, facts, context.rules);
    return { text: rendered.text, publishable: validation.publishable, status: validation.valid ? "valid" : "invalid", validationErrors: validation.errors, provider: cta.provider, model: cta.model, structureSignature: createHash("sha256").update(documentToDsl(context.document)).digest("hex") };
  }
}
