import type { CtaAIProvider } from "./CtaAIProvider";
import type { CtaRepository } from "./CtaRepository";
import { CtaGenerationService } from "./CtaGenerationService";
import { CtaPreferenceAgent } from "./CtaPreferenceAgent";
import { CtaStructureEngine, validateBlocks } from "./CtaStructureEngine";
import { CtaValidator } from "./CtaValidator";
import { TrainingIngestionService, validateTrainingSource } from "./TrainingIngestionService";
import { TemplateParser } from "./TemplateParser";
import { TemplateSerializer, templateDocumentsEquivalent } from "./TemplateSerializer";
import { legacyBlocksToDocument } from "./LegacyTemplateAdapter";
import { MessageTemplateRenderer } from "./MessageTemplateRenderer";
import { PreferenceConflictResolver } from "./PreferenceConflictResolver";
import type {
  CtaCopyLibraryItem,
  CtaFacts,
  CtaGenerationRequest,
  CtaProfile,
  CtaStructureOperation,
  CtaTemplate,
  MessageTemplateDocument,
} from "./types";
import { productToCtaFacts } from "./types";
import type { UsageQuotaService } from "../usage/UsageQuotaService";

export class CtaIntelligenceService {
  private preference: CtaPreferenceAgent;
  private generation: CtaGenerationService;
  private training: TrainingIngestionService;
  private parser = new TemplateParser();
  private serializer = new TemplateSerializer();
  private messageRenderer = new MessageTemplateRenderer();
  constructor(
    private repository: CtaRepository,
    provider: CtaAIProvider,
    private memoryReset?: { reset(userId: string): Promise<void> },
    private structures = new CtaStructureEngine(),
    private validator = new CtaValidator(),
    private conflictResolver = new PreferenceConflictResolver(),
    private quota?: UsageQuotaService,
  ) {
    this.preference = new CtaPreferenceAgent(provider);
    this.generation = new CtaGenerationService(repository, provider, validator);
    this.training = new TrainingIngestionService(repository, provider);
  }
  private async consumeAi(userId:string,feature:'ai_cta'|'ai_trainer',productId?:string) {
    await this.quota?.assertFeature?.(userId,feature);
    if (feature === 'ai_cta' && productId && this.quota?.consumeAiGeneration) {
      await this.quota.consumeAiGeneration(userId, productId);
      return;
    }
    await this.quota?.consume(userId,'ai_generation');
  }

  private async requireProduct(userId:string,productId:string) {
    const product = await this.repository.getProduct(userId, productId);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    return product;
  }

  profile(userId: string) {
    return this.repository.getOrCreateProfile(userId);
  }
  async updateProfile(userId: string, patch: Partial<CtaProfile>) {
    const allowed: Partial<CtaProfile> = {};
    if (typeof patch.tone === "string") allowed.tone = patch.tone.slice(0, 100);
    if (["short", "medium", "long"].includes(String(patch.length)))
      allowed.length = patch.length;
    if (["none", "moderate", "heavy"].includes(String(patch.emojiLevel)))
      allowed.emojiLevel = patch.emojiLevel;
    if (
      ["low", "balanced", "flexible", "custom"].includes(
        String(patch.repetitionMode),
      )
    )
      allowed.repetitionMode = patch.repetitionMode;
    if (
      patch.structuredPreferences &&
      typeof patch.structuredPreferences === "object"
    )
      allowed.structuredPreferences = patch.structuredPreferences;
    if (
      typeof patch.naturalLanguagePreferences === "string" ||
      patch.naturalLanguagePreferences === null
    )
      allowed.naturalLanguagePreferences =
        patch.naturalLanguagePreferences?.slice(0, 5000) ?? null;
    return this.repository.updateProfile(userId, allowed);
  }
  undoPreferences(userId: string) {
    return this.repository.undoProfile(userId);
  }
  rules(userId: string) {
    return this.repository.listRules(userId);
  }
  async addRule(
    userId: string,
    input: {
      ruleType: string;
      value: string;
      scope?: string;
      condition?: unknown[];
    },
  ) {
    const profile = await this.profile(userId);
    if (typeof input?.value !== "string" || !input.value.trim() || typeof input.ruleType !== "string" || !input.ruleType.trim()) throw new Error("CTA_RULE_INVALID");
    return this.repository.addRule(userId, profile.id, {
      ...input,
      value: input.value.trim().slice(0, 500),
      scope: input.scope ?? "persistent",
    });
  }
  deleteRule(userId: string, id: string) {
    return this.repository.deleteRule(userId, id);
  }
  examples(userId: string) {
    return this.repository.listExamples(userId);
  }
  async addExample(
    userId: string,
    input: { text: string; sentiment: "positive" | "negative" | "reference" },
  ) {
    if (typeof input?.text !== "string" || !input.text.trim() || input.text.length > 20_000 || !["positive", "negative", "reference"].includes(input.sentiment)) throw new Error("CTA_EXAMPLE_INVALID");
    await this.repository.addExample(userId, {
      text: input.text.trim().slice(0, 20000),
      sentiment: input.sentiment,
      traits: [],
      context: { source: "manual" },
    });
    return true;
  }
  deleteExample(userId: string, id: string) {
    return this.repository.deleteExample(userId, id);
  }

  private async templateAsBlueprint(userId: string) {
    const profile = await this.profile(userId);
    return {
      id: "trainer-cta-only",
      userId,
      profileId: profile.id,
      version: profile.version,
      isDefault: true,
      blocks: [],
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
  async assistant(userId: string, message: string) {
    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 100_000
    )
      throw new Error("CTA_MESSAGE_INVALID");
    await this.consumeAi(userId,'ai_trainer');
    const [profile, blueprint, rules, recent, memory, conversation] = await Promise.all([
      this.profile(userId),
      this.templateAsBlueprint(userId),
      this.rules(userId),
      this.repository.listRecentGenerations(userId, 10),
      this.repository.listMemoryItems?.(userId, true) ?? Promise.resolve([]),
      this.repository.listConversation?.(userId, 12) ?? Promise.resolve([]),
    ]);
    await this.repository.addConversation(userId, "user", message.trim());
    const interpreted = await this.preference.interpret({
      message: message.trim(),
      profile,
      blueprint,
      rules,
      memory,
      conversation,
      recentGenerations: recent.map((item) => ({
        id: item.id,
        text: item.finalText,
        variantIndex: item.variantIndex,
      })),
    });
    const out = interpreted.output;
    let nextProfile = profile;
    const applyPersistent =
      out.scope !== "one_off" && !out.requiresConfirmation;
    if (applyPersistent) for (const id of out.archiveMemoryIds ?? []) await this.repository.deleteMemoryItem(userId, id);
    if (applyPersistent && Object.keys(out.profilePatch).length)
      nextProfile = await this.updateProfile(
        userId,
        out.profilePatch as Partial<CtaProfile>,
      );
    if (applyPersistent) {
      const resolved = this.conflictResolver.resolve(rules, out.ruleChanges, out.scope);
      for (const ruleId of resolved.archiveIds) {
        if (this.repository.archiveRule) await this.repository.archiveRule(userId, ruleId);
      }
      for (const change of resolved.explicitArchives) {
        if (!resolved.archiveIds.length)
          await this.repository.archiveConflictingRules(
            userId,
            change.ruleType,
            change.value,
          );
      }
      for (const change of resolved.additions)
        await this.repository.addRule(userId, profile.id, {
            ruleType: change.ruleType,
            value: change.value,
            scope: change.scope ?? out.scope,
            condition: change.condition,
          });
    }
    if (applyPersistent) for (const example of out.examples ?? [])
      await this.repository.addExample(userId, {
        text: example.text,
        sentiment: example.sentiment,
        traits: example.traits,
        context: { scope: out.scope },
      });
    if (out.feedback && !out.requiresConfirmation)
      await this.repository.addFeedback(userId, {
        generationId: out.feedback.generationId,
        strength: out.feedback.strength,
        aspects: out.feedback.aspects,
        text: message.trim(),
        explicit: true,
      });
    if (out.requiresConfirmation)
      await this.repository.addInference(userId, {
        kind: "assistant_inference",
        value: { profilePatch: out.profilePatch, ruleChanges: out.ruleChanges },
        evidenceCount: 1,
      });
    if (applyPersistent && this.repository.recordMemoryItems) {
      const semanticItems = [
        ...(out.ruleChanges.some((change) => change.action === "add") ? [] : out.changeSummary).map((semanticText) => ({
          kind: "instruction" as const,
          scope: out.scope,
          semanticText,
          condition: {},
          polarity: "neutral" as const,
          priority: 90,
        })),
        ...out.ruleChanges.filter((change) => change.action === "add").map((change) => ({
          kind: "instruction" as const,
          scope: change.scope ?? out.scope,
          semanticText: change.value,
          condition: Array.isArray(change.condition) ? { conditions: change.condition } : {},
          polarity: change.ruleType.startsWith("forbidden") ? "negative" as const : "positive" as const,
          priority: 95,
        })),
      ];
      if (semanticItems.length) {
        await this.repository.recordMemoryItems(userId, nextProfile.id, semanticItems);
        nextProfile = await this.profile(userId);
      }
    }
    await this.repository.addConversation(userId, "assistant", out.reply, {
      scope: out.scope,
      applied: applyPersistent,
      changeSummary: out.changeSummary,
      requiresConfirmation: out.requiresConfirmation,
    });
    return {
      reply: out.reply,
      scope: out.scope,
      applied: applyPersistent,
      requiresConfirmation: out.requiresConfirmation,
      changeSummary: out.changeSummary,
      profile: nextProfile,
      blueprint,
      undoAvailable:
        applyPersistent && Object.keys(out.profilePatch).length > 0,
    };
  }
  conversation(userId: string) {
    return this.repository.listConversation(userId, 100);
  }
  history(userId: string) {
    return this.repository.listRecentGenerations(userId, 100);
  }

  templates(userId: string) {
    return this.repository.listTemplates(userId);
  }
  template(userId: string, id: string) {
    return this.repository.getTemplate(userId, id);
  }
  async createTemplate(
    userId: string,
    input: {
      name: string;
      description?: string | null;
      blocks?: CtaTemplate["blocks"];
      document?: MessageTemplateDocument;
      dsl?: string;
      editorMode?: CtaTemplate["editorMode"];
      presentation?: CtaTemplate["presentation"];
      active?: boolean;
      isDefault?: boolean;
    },
  ) {
    if (!input.name?.trim()) throw new Error("CTA_TEMPLATE_INVALID");
    const blocks = validateBlocks(input.blocks ?? []);
    const document = this.resolveTemplateDocument(input, blocks);
    const dsl = this.serializer.serialize(document);
    return this.repository.createTemplate(userId, {
      ...input,
      name: input.name.trim().slice(0, 120),
      blocks,
      document,
      dsl,
      editorMode: input.editorMode ?? "blocks",
    });
  }
  async updateTemplate(
    userId: string,
    id: string,
    patch: Partial<
      Pick<CtaTemplate, "name" | "description" | "blocks" | "document" | "dsl" | "editorMode" | "presentation" | "active">
    >,
  ) {
    if (patch.blocks) patch.blocks = validateBlocks(patch.blocks);
    if (patch.dsl !== undefined || patch.document !== undefined || patch.blocks !== undefined) {
      const current = await this.repository.getTemplate(userId, id);
      if (!current) throw new Error("CTA_TEMPLATE_NOT_FOUND");
      const document = this.resolveTemplateDocument(
        {
          dsl: patch.dsl,
          document: patch.document,
        },
        patch.blocks ?? current.blocks,
        patch.dsl === undefined && patch.document === undefined,
      );
      patch.document = document;
      patch.dsl = this.serializer.serialize(document);
    }
    if (patch.name !== undefined && !patch.name.trim())
      throw new Error("CTA_TEMPLATE_INVALID");
    return this.repository.updateTemplate(userId, id, {
      ...patch,
      name: patch.name?.trim().slice(0, 120),
    });
  }
  private resolveTemplateDocument(
    input: { dsl?: string; document?: MessageTemplateDocument },
    blocks: CtaTemplate["blocks"],
    preferBlocks = false,
  ) {
    if (input.dsl !== undefined) {
      const parsed = this.parser.parse(input.dsl);
      if (input.document && !templateDocumentsEquivalent(parsed, input.document))
        throw new Error("TEMPLATE_ROUND_TRIP_MISMATCH");
      return parsed;
    }
    if (input.document) {
      // Serializar e parsear valida toda a AST e garante que o Manual consegue
      // representar exatamente a mesma fonte canônica.
      const parsed = this.parser.parse(this.serializer.serialize(input.document));
      if (!templateDocumentsEquivalent(parsed, input.document)) throw new Error("TEMPLATE_ROUND_TRIP_MISMATCH");
      return input.document;
    }
    return preferBlocks || blocks.length ? legacyBlocksToDocument(blocks) : { version: 1 as const, nodes: [] };
  }
  parseTemplate(dsl: string) {
    const document = this.parser.parse(dsl);
    return { document, dsl: this.serializer.serialize(document) };
  }
  serializeTemplate(document: MessageTemplateDocument) {
    const dsl = this.serializer.serialize(document);
    const parsed = this.parser.parse(dsl);
    if (!templateDocumentsEquivalent(parsed, document)) throw new Error("TEMPLATE_ROUND_TRIP_MISMATCH");
    return { document, dsl };
  }
  structuralPreview(document: MessageTemplateDocument) {
    return { text: this.messageRenderer.structuralPreview(document) };
  }
  duplicateTemplate(userId: string, id: string) {
    return this.repository.duplicateTemplate(userId, id);
  }
  deleteTemplate(userId: string, id: string) {
    return this.repository.deleteTemplate(userId, id);
  }
  setDefaultTemplate(userId: string, id: string) {
    return this.repository.setDefaultTemplate(userId, id);
  }
  async applyTemplateOperations(
    userId: string,
    id: string,
    operations: CtaStructureOperation[],
  ) {
    if (!Array.isArray(operations) || operations.length > 30)
      throw new Error("CTA_STRUCTURE_INVALID");
    const current = await this.repository.getTemplate(userId, id);
    if (!current) throw new Error("CTA_TEMPLATE_NOT_FOUND");
    // A operação legada trabalha sobre blocos. Nunca aponte uma AST canônica
    // manual para esse caminho, pois isso converteria a mensagem para o
    // subconjunto antigo e descartaria condicionais/textos customizados.
    const blocksDocument = legacyBlocksToDocument(current.blocks);
    if (
      current.editorMode === "manual" ||
      (current.document &&
        !templateDocumentsEquivalent(current.document, blocksDocument))
    )
      throw new Error("CTA_STRUCTURE_CANONICAL_CONFLICT");
    const profile = await this.profile(userId);
    const blueprint = {
      id: current.id,
      userId,
      profileId: profile.id,
      version: current.version,
      isDefault: current.isDefault,
      blocks: current.blocks,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    };
    const updated = this.structures.apply(blueprint, operations);
    const document = legacyBlocksToDocument(updated.blocks);
    return this.repository.updateTemplate(userId, id, {
      blocks: updated.blocks,
      document,
      dsl: this.serializer.serialize(document),
      editorMode: "blocks",
    });
  }
  copy(userId: string) {
    return this.repository.listCopy(userId);
  }
  createCopy(
    userId: string,
    input: Omit<
      CtaCopyLibraryItem,
      "id" | "userId" | "createdAt" | "updatedAt"
    >,
  ) {
    this.validateCopy(input);
    return this.repository.createCopy(userId, input);
  }
  updateCopy(
    userId: string,
    id: string,
    patch: Partial<
      Omit<CtaCopyLibraryItem, "id" | "userId" | "createdAt" | "updatedAt">
    >,
  ) {
    if (
      patch.mode ||
      patch.exactText !== undefined ||
      patch.instruction !== undefined
    )
      this.validateCopy({
        name: patch.name ?? "copy",
        type: patch.type ?? "custom",
        mode: patch.mode ?? (patch.exactText ? "EXACT_TEXT" : "AI_GENERATED"),
        objective: patch.objective ?? null,
        instruction: patch.instruction ?? null,
        exactText: patch.exactText ?? null,
      });
    return this.repository.updateCopy(userId, id, patch);
  }
  deleteCopy(userId: string, id: string) {
    return this.repository.deleteCopy(userId, id);
  }
  private validateCopy(
    input: Omit<
      CtaCopyLibraryItem,
      "id" | "userId" | "createdAt" | "updatedAt"
    >,
  ) {
    if (!input.name?.trim()) throw new Error("CTA_COPY_INVALID");
    if (input.mode === "EXACT_TEXT" && !input.exactText?.trim())
      throw new Error("CTA_COPY_EXACT_TEXT_REQUIRED");
    if (input.mode === "AI_GENERATED" && !input.objective?.trim())
      throw new Error("CTA_COPY_OBJECTIVE_REQUIRED");
  }

  async resetMemory(userId: string) {
    if (!this.memoryReset) throw new Error("CTA_MEMORY_RESET_UNAVAILABLE");
    await this.memoryReset.reset(userId);
    return { reset: true };
  }
  async trainingReview(userId: string, source: string) {
    validateTrainingSource(source);
    await this.consumeAi(userId,'ai_trainer');
    return this.training.analyze(userId, source);
  }
  async applyTraining(userId: string, sourceId: string) {
    await this.quota?.assertFeature?.(userId, 'ai_trainer');
    return this.training.apply(userId, sourceId);
  }
  learnedMemory(userId: string) {
    return this.training.memory(userId);
  }
  deleteLearnedMemory(userId: string, id: string) {
    return this.training.removeMemory(userId, id);
  }
  async reusable(userId: string, productId: string, templateId?: string) {
    const [current, saved, profile, effectiveTemplate] = await Promise.all([
      this.repository.getProduct(userId, productId),
      this.repository.findReusableGeneration(userId, productId),
      this.repository.getOrCreateProfile(userId),
      templateId ? this.repository.getTemplate(userId, templateId) : this.repository.getDefaultTemplate(userId),
    ]);
    if (!current || !saved) return null;
    const snapshot = saved.structureSnapshot as Partial<import("./types").MessageGenerationSnapshot>;
    if (
      snapshot.kind !== "message-template-v1" ||
      !effectiveTemplate ||
      snapshot.templateId !== effectiveTemplate.id ||
      snapshot.templateVersion !== effectiveTemplate.version ||
      snapshot.trainerVersion !== profile.version
    ) return null;
    const source =
      saved.productId === productId
        ? current
        : await this.repository.getProduct(userId, saved.productId);
    if (!source) return null;
    let finalText = saved.finalText;
    if (
      source.affiliateUrl &&
      current.affiliateUrl &&
      source.affiliateUrl !== current.affiliateUrl
    )
      finalText = finalText
        .split(source.affiliateUrl)
        .join(current.affiliateUrl);
    const validation = this.validator.validate(
      finalText,
      productToCtaFacts(current),
      await this.rules(userId),
    );
    if (!validation.valid || !validation.publishable) return null;
    if (saved.productId === productId && finalText === saved.finalText)
      return saved;
    return this.repository.createGeneration(userId, {
      productId,
      ctaProfileId: saved.ctaProfileId,
      templateId: saved.templateId,
      generatedText: finalText,
      finalText,
      wasEdited: false,
      generationMode: "reused",
      publishable: true,
      status: "valid",
      structureSignature: saved.structureSignature,
      structureSnapshot: saved.structureSnapshot,
      provider: "promofy",
      model: "saved-cta",
      validationErrors: [],
      variantIndex: 0,
      variantGroupId: null,
      memoryEpoch: profile.memoryEpoch ?? 1,
    });
  }
  async originalMessage(userId: string, productId: string) {
    const product = await this.repository.getProduct(userId, productId);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    if (product.sourceType !== "whatsapp")
      throw new Error("CTA_ORIGINAL_MESSAGE_UNAVAILABLE");
    const original = await this.repository.getOriginalConvertedMessage(
      userId,
      productId,
    );
    if (!original) throw new Error("CTA_ORIGINAL_MESSAGE_NOT_FOUND");
    // A mensagem capturada preserva o texto original, mas herda a apresentação
    // fixa do template padrão (legenda e marca d'água) no snapshot de envio.
    const presentationTemplate = await this.repository.getDefaultTemplate(userId);
    const recent = await this.repository.listRecentGenerations(userId, 100);
    const saved = recent.find(
      (item) =>
        item.productId === productId &&
        item.generationMode === "original_message" &&
        item.templateId === presentationTemplate.id &&
        Number(
          (item.structureSnapshot as Record<string, unknown> | null)
            ?.sourceVersion,
        ) === presentationTemplate.version &&
        item.finalText === original.text &&
        item.publishable &&
        item.status === "valid",
    );
    if (saved) return saved;
    const structureSignature = "original-message-v1";
    const structureSnapshot = {
      kind: "original-message-v1" as const,
      captureId: original.captureId,
      linkCount: original.convertedLinkCount,
      sourceVersion: presentationTemplate.version,
      presentationTemplateId: presentationTemplate.id,
    };
    return this.repository.createGeneration(userId, {
      productId,
      ctaProfileId: null,
      templateId: presentationTemplate.id,
      generatedText: original.text,
      finalText: original.text,
      wasEdited: false,
      generationMode: "original_message",
      publishable: true,
      status: "valid",
      structureSignature,
      structureSnapshot,
      provider: "promofy",
      model: "original-message-link-converter",
      validationErrors: [],
      variantIndex: 0,
      variantGroupId: null,
    });
  }
  async originalMessagePreview(userId: string, productId: string) {
    const product = await this.repository.getProduct(userId, productId);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    if (product.sourceType !== "whatsapp")
      throw new Error("CTA_ORIGINAL_MESSAGE_UNAVAILABLE");
    const original = await this.repository.getOriginalConvertedMessage(
      userId,
      productId,
    );
    if (!original) throw new Error("CTA_ORIGINAL_MESSAGE_NOT_FOUND");
    return { text: original.text, publishable: true, validationErrors: [] };
  }
  async generate(
    userId: string,
    productId: string,
    input: CtaGenerationRequest = {},
  ) {
    await this.requireProduct(userId, productId);
    await this.consumeAi(userId,'ai_cta',productId);
    return this.generation.generate(userId, productId, input);
  }
  async testCta(userId: string, productId: string, input: CtaGenerationRequest = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        (input.count !== undefined && input.count !== 1 && input.count !== 3) ||
        (input.instruction !== undefined && (typeof input.instruction !== "string" || input.instruction.length > 5_000)))
      throw new Error("CTA_TEST_REQUEST_INVALID");
    await this.requireProduct(userId, productId);
    await this.consumeAi(userId,'ai_cta',productId);
    return this.generation.testCta(userId, productId, input);
  }
  async regenerate(userId: string, productId: string, input: CtaGenerationRequest) {
    await this.requireProduct(userId, productId);
    await this.consumeAi(userId,'ai_cta',productId);
    return this.generation.regenerate(userId, productId, input);
  }
  async regenerateCta(userId: string, generationId: string, instruction?: string) {
    const generation = await this.repository.getGeneration(userId, generationId);
    if (!generation) throw new Error("CTA_GENERATION_NOT_FOUND");
    await this.consumeAi(userId,'ai_cta',generation.productId);
    return this.generation.regenerateCta(userId, generationId, instruction);
  }
  async productAiGenerationUsage(userId: string, productId: string) {
    await this.requireProduct(userId, productId);
    return this.quota?.getProductAiGenerationUsage?.(userId, productId) ?? null;
  }
  async preview(
    userId: string,
    templateId: string,
    input: {
      productId?: string;
      facts?: CtaFacts;
      instruction?: string;
      blocks?: CtaTemplate["blocks"];
      document?: MessageTemplateDocument;
      dsl?: string;
    },
  ) {
    let facts = input.facts;
    if (input.productId) {
      const product = await this.repository.getProduct(userId, input.productId);
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      facts = productToCtaFacts(product);
    }
    if (!facts) throw new Error("CTA_PREVIEW_FACTS_REQUIRED");
    await this.consumeAi(userId,'ai_cta',input.productId);
    const blocks = input.blocks === undefined ? undefined : validateBlocks(input.blocks);
    const document = input.dsl !== undefined
      ? this.parser.parse(input.dsl)
      : input.document;
    return this.generation.preview(
      userId,
      templateId,
      facts,
      input.instruction,
      blocks,
      document,
    );
  }
  async edit(userId: string, id: string, finalText: string) {
    if (
      typeof finalText !== "string" ||
      !finalText.trim() ||
      finalText.length > 20_000
    )
      throw new Error("CTA_TEXT_INVALID");
    const recent = await this.repository.listRecentGenerations(userId, 100);
    const generation = recent.find((item) => item.id === id);
    if (!generation) throw new Error("CTA_GENERATION_NOT_FOUND");
    const product = await this.repository.getProduct(
      userId,
      generation.productId,
    );
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    const rules = await this.rules(userId);
    const validation = this.validator.validate(
      finalText.trim(),
      productToCtaFacts(product),
      rules,
    );
    const updated = await this.repository.updateGeneration(
      userId,
      id,
      finalText.trim(),
      validation.errors,
      validation.publishable,
      validation.valid ? "valid" : "invalid",
    );
    return updated;
  }
  async learnFromEdit(userId: string, id: string, ctaText: string) {
    const generation = await this.repository.getGeneration(userId, id);
    if (!generation?.wasEdited) throw new Error("CTA_EDIT_NOT_FOUND");
    if (typeof ctaText !== "string" || !ctaText.trim() || ctaText.length > 5_000)
      throw new Error("CTA_TEXT_INVALID");
    await Promise.all([
      this.repository.addExample(userId, {
        text: ctaText.trim(), sentiment: "positive", traits: [],
        context: { source: "explicit_edit", generationId: id },
      }),
      this.repository.addFeedback(userId, {
        generationId: id, strength: "positive", aspects: { edit: "explicit_learning" },
        text: "Usuário pediu explicitamente para aprender com a edição.", explicit: true,
      }),
    ]);
    return { learned: true };
  }
}
