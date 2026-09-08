import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { CtaRepository } from "../../domain/cta/CtaRepository";
import { officialTemplateSeeds } from "../../domain/cta/defaultTemplates";
import { normalizeBlockPositions } from "../../domain/cta/CtaStructureEngine";
import { isSamePromotion } from "../../domain/cta/PromotionIdentity";
import { semanticMemoryEligible } from "../../domain/cta/SemanticMemoryEligibility";
import { convertOriginalMessageLinks } from "../../domain/cta/OriginalMessageLinkConverter";
import { documentToDsl, legacyBlocksToDocument } from "../../domain/cta/LegacyTemplateAdapter";
import type {
  CtaBlueprint,
  CtaConversationMessage,
  CtaCopyLibraryItem,
  CtaCandidate,
  CtaPooledCandidate,
  CtaExample,
  CtaGeneration,
  CtaMemoryItem,
  CtaMemoryView,
  CtaOriginalMessage,
  CtaProfile,
  CtaRule,
  CtaStructureOperation,
  CtaTemplate,
  CtaTrainingReview,
  CtaTrainingSource,
} from "../../domain/cta/types";
import { mapProduct, reconcileProductCouponUrl } from "../affiliate/SupabaseAffiliateRepository";
const defaultCtaBlocks = () => [];
type Row = Record<string, any>;
export function groupCtaMemoryItems(items: CtaMemoryItem[], version: number): CtaMemoryView {
  return {
    version,
    general: items.filter((item) => item.scope === "persistent" && item.polarity !== "negative" && !item.kind.includes("example") && item.kind !== "reference"),
    conditional: items.filter((item) => item.scope === "conditional"),
    exceptions: items.filter((item) => item.scope === "exception"),
    avoid: items.filter((item) => item.polarity === "negative"),
    examples: items.filter((item) => item.kind === "positive_example" || item.kind === "negative_example" || item.kind === "reference"),
  };
}
const defaultPresentation = () => ({ defaultCaption: "", watermark: { enabled: false, text: "", position: "bottom-right" as const, opacity: 0.72 } });
const presentationColumnMissing = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const value = error as Row;
  return value.code === "42703" || value.code === "PGRST204" || String(value.message ?? "").includes("presentation_settings");
};
const templatePresentation = (value: unknown): CtaTemplate["presentation"] => {
  const row = value && typeof value === "object" ? value as Row : {};
  const mark = row.watermark && typeof row.watermark === "object" ? row.watermark as Row : {};
  const positions = ["top-left", "top-right", "bottom-left", "bottom-right", "center"] as const;
  const position = positions.includes(mark.position) ? mark.position : "bottom-right";
  const opacity = Number(mark.opacity);
  return { defaultCaption: typeof row.defaultCaption === "string" ? row.defaultCaption : "", watermark: { enabled: Boolean(mark.enabled), text: typeof mark.text === "string" ? mark.text : "", position, opacity: Number.isFinite(opacity) && opacity >= 0.1 && opacity <= 1 ? opacity : 0.72 } };
};
const profile = (r: Row): CtaProfile => ({
  id: r.id,
  userId: r.user_id,
  tone: r.tone ?? "natural",
  length: r.length ?? "medium",
  emojiLevel: r.emoji_level ?? "moderate",
  repetitionMode: r.repetition_mode ?? "balanced",
  structuredPreferences: r.structured_preferences ?? {},
  naturalLanguagePreferences: r.natural_language_preferences ?? null,
  version: Number(r.version ?? 1),
  memoryEpoch: Number(r.memory_epoch ?? 1),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const blueprint = (r: Row): CtaBlueprint => ({
  id: r.id,
  userId: r.user_id,
  profileId: r.profile_id,
  version: Number(r.version ?? 1),
  isDefault: Boolean(r.is_default),
  blocks: r.blocks ?? defaultCtaBlocks(),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const template = (r: Row): CtaTemplate => {
  const blocks = r.blocks ?? defaultCtaBlocks();
  const document = r.canonical_template ?? legacyBlocksToDocument(blocks);
  return ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  description: r.description ?? null,
  active: r.active !== false,
  isDefault: Boolean(r.is_default),
  version: Number(r.version ?? 1),
  blocks,
  document,
  dsl: r.template_dsl ?? documentToDsl(document),
  editorMode: r.editor_mode === "manual" ? "manual" : "blocks",
  presentation: templatePresentation(r.presentation_settings),
  legacyFinalCta: Array.isArray(r.legacy_final_cta) ? r.legacy_final_cta : [],
  legacyUnconvertedBlocks: Array.isArray(r.legacy_unconverted_blocks) ? r.legacy_unconverted_blocks : [],
  officialKey: r.official_key ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  });
};
const copyItem = (r: Row): CtaCopyLibraryItem => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  type: r.copy_type,
  mode: r.mode,
  objective: r.objective ?? null,
  instruction: r.instruction ?? null,
  exactText: r.exact_text ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const rule = (r: Row): CtaRule => ({
  id: r.id,
  userId: r.user_id,
  profileId: r.profile_id,
  ruleType: r.rule_type,
  value: r.value,
  scope: r.scope ?? "persistent",
  condition: r.condition ?? [],
  active: r.active !== false,
  createdAt: r.created_at,
});
const generation = (r: Row): CtaGeneration => ({
  id: r.id,
  userId: r.user_id,
  productId: r.product_id,
  ctaProfileId: r.cta_profile_id,
  templateId: r.template_id ?? null,
  ctaText: r.generated_cta ?? null,
  generatedText: r.generated_text ?? r.cta_text,
  finalText: r.final_text ?? r.cta_text,
  wasEdited: Boolean(r.was_edited),
  generationMode: r.generation_mode ?? "single",
  publishable: Boolean(r.publishable),
  status: r.generation_status ?? "draft",
  structureSignature: r.structure_signature ?? "",
  structureSnapshot: r.structure_snapshot ?? {},
  provider: r.provider ?? null,
  model: r.model ?? null,
  validationErrors: r.validation_errors ?? [],
  variantIndex: Number(r.variant_index ?? 0),
  variantGroupId: r.variant_group_id ?? null,
  memoryEpoch: Number(r.memory_epoch ?? 1),
  createdAt: r.created_at,
});
const trainingSource = (r: Row): CtaTrainingSource => ({
  id: r.id,
  status: r.status,
  charCount: Number(r.char_count ?? 0),
  chunkCount: Number(r.chunk_count ?? 0),
  createdAt: r.created_at,
});
const memoryItem = (r: Row): CtaMemoryItem => ({
  id: r.id,
  userId: r.user_id,
  profileId: r.profile_id,
  sourceId: r.source_id ?? null,
  kind: r.kind,
  scope: r.scope,
  semanticText: r.semantic_text,
  condition: r.condition ?? {},
  polarity: r.polarity ?? "neutral",
  priority: Number(r.priority ?? 50),
  active: r.active !== false,
  supersedesItemId: r.supersedes_item_id ?? null,
  metadata: r.metadata ?? {},
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const conversation = (r: Row): CtaConversationMessage => ({
  id: r.id,
  userId: r.user_id,
  role: r.role,
  content: r.content,
  metadata: r.metadata ?? {},
  createdAt: r.created_at,
});
export class SupabaseCtaRepository implements CtaRepository {
  constructor(private db: SupabaseClient) {}
  private async attachVersionPresentation(userId: string, rows: Row[]) {
    if (!rows.length || rows.some((row) => row.presentation_settings !== undefined)) return rows;
    const { data, error } = await this.db.from("cta_template_versions").select("template_id,version,template_snapshot").eq("user_id", userId).in("template_id", rows.map((row) => row.id)).order("version", { ascending: false });
    if (error) throw error;
    const latest = new Map<string, unknown>();
    for (const version of data ?? []) if (!latest.has(version.template_id)) latest.set(version.template_id, version.template_snapshot?.presentation);
    return rows.map((row) => ({ ...row, presentation_settings: latest.get(row.id) }));
  }
  async getOriginalConvertedMessage(
    userId: string,
    productId: string,
  ): Promise<CtaOriginalMessage | null> {
    const product = await this.getProduct(userId, productId);
    if (
      !product ||
      product.sourceType !== "whatsapp" ||
      !product.sourceReferenceId
    )
      return null;
    const { data: analysis, error: analysisError } = await this.db
      .from("promotion_analyses")
      .select("id,captured_message_id,source_links")
      .eq("user_id", userId)
      .eq("id", product.sourceReferenceId)
      .maybeSingle();
    if (analysisError) throw analysisError;
    if (!analysis?.captured_message_id) return null;
    const { data: capture, error: captureError } = await this.db
      .from("captured_messages")
      .select("raw_content")
      .eq("user_id", userId)
      .eq("id", analysis.captured_message_id)
      .maybeSingle();
    if (captureError) throw captureError;
    if (typeof capture?.raw_content !== "string" || !capture.raw_content)
      return null;
    const links = Array.isArray(analysis.source_links)
      ? analysis.source_links.filter(
          (link: unknown): link is string =>
            typeof link === "string" && /^https?:\/\//i.test(link),
        )
      : [];
    if (!links.length) throw new Error("CTA_ORIGINAL_LINKS_NOT_FOUND");
    const { data: conversions, error: conversionError } = await this.db
      .from("affiliate_conversions")
      .select("original_url,converted_url,status")
      .eq("user_id", userId)
      .eq("source_type", "whatsapp")
      .eq("source_reference_id", analysis.id)
      .in("original_url", links);
    if (conversionError) throw conversionError;
    const converted = new Map<string, string>(
      (conversions ?? [])
        .filter(
          (row: Row) =>
            row.status === "converted" && typeof row.converted_url === "string",
        )
        .map((row: Row) => [String(row.original_url), String(row.converted_url)]),
    );
    return {
      ...convertOriginalMessageLinks(capture.raw_content, links, converted),
      captureId: String(analysis.captured_message_id),
    };
  }
  async getOrCreateProfile(userId: string) {
    let { data, error } = await this.db
      .from("cta_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const inserted = await this.db
        .from("cta_profiles")
        .insert({
          user_id: userId,
          tone: "natural",
          length: "medium",
          emoji_level: "moderate",
          repetition_mode: "balanced",
          structured_preferences: {},
          version: 1,
        })
        .select("*")
        .single();
      if (inserted.error?.code === "23505") {
        // Perfil e conversa podem ser solicitados juntos na primeira visita.
        const existing = await this.db.from("cta_profiles").select("*").eq("user_id", userId).single();
        if (existing.error) throw existing.error;
        data = existing.data;
      } else {
        if (inserted.error) throw inserted.error;
        data = inserted.data;
      }
    }
    return profile(data);
  }
  async updateProfile(userId: string, patch: Partial<CtaProfile>) {
    const row: Row = { updated_at: new Date().toISOString() };
    if (patch.tone !== undefined) row.tone = patch.tone;
    if (patch.length !== undefined) row.length = patch.length;
    if (patch.emojiLevel !== undefined) row.emoji_level = patch.emojiLevel;
    if (patch.repetitionMode !== undefined)
      row.repetition_mode = patch.repetitionMode;
    if (patch.structuredPreferences !== undefined)
      row.structured_preferences = patch.structuredPreferences;
    if (patch.naturalLanguagePreferences !== undefined)
      row.natural_language_preferences = patch.naturalLanguagePreferences;
    const { data, error } = await this.db.rpc("update_cta_profile_versioned", {
      p_user_id: userId,
      p_patch: row,
    });
    if (error) throw error;
    return profile(Array.isArray(data) ? data[0] : data);
  }
  async undoProfile(userId: string) {
    const { data, error } = await this.db.rpc("undo_cta_profile", {
      p_user_id: userId,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? profile(row) : null;
  }
  async getOrCreateBlueprint(userId: string, profileId: string) {
    let { data, error } = await this.db
      .from("cta_blueprints")
      .select("*")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const inserted = await this.db
        .from("cta_blueprints")
        .insert({
          user_id: userId,
          profile_id: profileId,
          is_default: true,
          version: 1,
          blocks: defaultCtaBlocks(),
        })
        .select("*")
        .single();
      if (inserted.error) throw inserted.error;
      data = inserted.data;
      await this.db
        .from("cta_blueprint_versions")
        .insert({
          user_id: userId,
          blueprint_id: data.id,
          version: 1,
          blocks: data.blocks,
          source: "system",
        });
    }
    return blueprint(data);
  }
  async saveBlueprint(
    userId: string,
    value: CtaBlueprint,
    operations: CtaStructureOperation[],
    source: "manual" | "assistant",
  ) {
    const { data, error } = await this.db.rpc("save_cta_blueprint_version", {
      p_user_id: userId,
      p_blueprint_id: value.id,
      p_blocks: value.blocks,
      p_operations: operations,
      p_source: source,
    });
    if (error) throw error;
    return blueprint(Array.isArray(data) ? data[0] : data);
  }
  async undoBlueprint(userId: string) {
    const { data, error } = await this.db.rpc("undo_cta_blueprint", {
      p_user_id: userId,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? blueprint(row) : null;
  }
  async listTemplates(userId: string) {
    let { data, error } = await this.db
      .from("cta_templates")
      .select("*")
      .eq("user_id", userId)
      .order("created_at");
    if (error) throw error;
    const hasDemo = (data ?? []).some(
      (row: Row) => row.official_key === "promofy_demo",
    );
    if (!hasDemo) {
      const seed = officialTemplateSeeds()[0];
      const inserted = await this.db
        .from("cta_templates")
        .insert({
          user_id: userId,
          name: seed.name,
          description: seed.description,
          blocks: seed.blocks,
          canonical_template: seed.document,
          template_dsl: seed.dsl,
          editor_mode: "blocks",
          official_key: seed.officialKey,
          is_default: !(data ?? []).some((row: Row) => row.is_default),
          active: true,
        })
        .select("*")
        .single();
      if (inserted.error) throw inserted.error;
      await this.db
        .from("cta_template_versions")
        .insert({
          user_id: userId,
          template_id: inserted.data.id,
          version: 1,
          template_snapshot: {
            name: inserted.data.name,
            description: inserted.data.description,
            active: true,
            blocks: inserted.data.blocks,
            document: inserted.data.canonical_template,
            dsl: inserted.data.template_dsl,
            editorMode: inserted.data.editor_mode,
          },
          source: "system",
        });
      data = [...(data ?? []), inserted.data];
    }
    const preferred =
      (data ?? []).find((row: Row) => row.is_default && row.active) ??
      (data ?? []).find((row: Row) => row.active) ??
      (data ?? [])[0];
    if (preferred) {
      const { data: profileRow, error: profileError } = await this.db
        .from("cta_profiles")
        .select("id,default_template_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (
        profileRow &&
        profileRow.default_template_id !== preferred.id
      ) {
        const { error: profileUpdateError } = await this.db
          .from("cta_profiles")
          .update({
            default_template_id: preferred.id,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("id", profileRow.id);
        if (profileUpdateError) throw profileUpdateError;
      }
    }
    return (await this.attachVersionPresentation(userId, data ?? [])).map(template);
  }
  async getTemplate(userId: string, id: string) {
    const { data, error } = await this.db
      .from("cta_templates")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? template((await this.attachVersionPresentation(userId, [data]))[0]) : null;
  }
  async getDefaultTemplate(userId: string) {
    const list = await this.listTemplates(userId);
    return (
      list.find((item) => item.isDefault && item.active) ??
      list.find((item) => item.active) ??
      list[0]
    );
  }
  async createTemplate(
    userId: string,
    input: {
      name: string;
      description?: string | null;
      blocks: CtaTemplate["blocks"];
      document?: CtaTemplate["document"];
      dsl?: string;
      editorMode?: CtaTemplate["editorMode"];
      presentation?: CtaTemplate["presentation"];
      active?: boolean;
      isDefault?: boolean;
      officialKey?: string | null;
    },
  ) {
    const document = input.document ?? legacyBlocksToDocument(input.blocks);
    const dsl = input.dsl ?? documentToDsl(document);
    const row = {
        user_id: userId,
        name: input.name,
        description: input.description ?? null,
        blocks: input.blocks,
        canonical_template: document,
        template_dsl: dsl,
        editor_mode: input.editorMode ?? "blocks",
        presentation_settings: input.presentation ?? defaultPresentation(),
        active: input.active ?? true,
        is_default: false,
        official_key: input.officialKey ?? null,
      };
    let { data, error } = await this.db.from("cta_templates").insert(row).select("*").single();
    if (presentationColumnMissing(error)) {
      const { presentation_settings: _presentation, ...legacyRow } = row;
      ({ data, error } = await this.db.from("cta_templates").insert(legacyRow).select("*").single());
    }
    if (error) throw error;
    await this.db
      .from("cta_template_versions")
      .insert({
        user_id: userId,
        template_id: data.id,
        version: 1,
        template_snapshot: {
          name: data.name,
          description: data.description,
          active: data.active,
          blocks: data.blocks,
          document: data.canonical_template,
          dsl: data.template_dsl,
          editorMode: data.editor_mode,
          presentation: input.presentation ?? defaultPresentation(),
        },
        source: "manual",
      });
    if (input.isDefault)
      return (await this.setDefaultTemplate(userId, data.id))!;
    return template({ ...data, presentation_settings: input.presentation ?? defaultPresentation() });
  }
  async updateTemplate(
    userId: string,
    id: string,
    patch: Partial<
      Pick<CtaTemplate, "name" | "description" | "blocks" | "document" | "dsl" | "editorMode" | "presentation" | "active">
    >,
  ) {
    const current = await this.getTemplate(userId, id);
    if (!current) return null;
    const row: Row = {
      version: current.version + 1,
      updated_at: new Date().toISOString(),
    };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.blocks !== undefined) row.blocks = patch.blocks;
    if (patch.document !== undefined) row.canonical_template = patch.document;
    if (patch.dsl !== undefined) row.template_dsl = patch.dsl;
    if (patch.editorMode !== undefined) row.editor_mode = patch.editorMode;
    if (patch.presentation !== undefined) row.presentation_settings = patch.presentation;
    if (patch.active !== undefined) row.active = patch.active;
    let { data, error } = await this.db.from("cta_templates").update(row).eq("user_id", userId).eq("id", id).select("*").maybeSingle();
    if (presentationColumnMissing(error)) {
      const { presentation_settings: _presentation, ...legacyRow } = row;
      ({ data, error } = await this.db.from("cta_templates").update(legacyRow).eq("user_id", userId).eq("id", id).select("*").maybeSingle());
    }
    if (error) throw error;
    if (!data) return null;
    const { error: versionError } = await this.db
      .from("cta_template_versions")
      .insert({
        user_id: userId,
        template_id: id,
        version: data.version,
        template_snapshot: {
          name: data.name,
          description: data.description,
          active: data.active,
          blocks: data.blocks,
          document: data.canonical_template,
          dsl: data.template_dsl,
          editorMode: data.editor_mode,
          presentation: patch.presentation ?? current.presentation ?? defaultPresentation(),
        },
        source: "manual",
      });
    if (versionError) throw versionError;
    return template({ ...data, presentation_settings: patch.presentation ?? current.presentation ?? defaultPresentation() });
  }
  async duplicateTemplate(userId: string, id: string) {
    const source = await this.getTemplate(userId, id);
    if (!source) return null;
    return this.createTemplate(userId, {
      name: `${source.name} — cópia`,
      description: source.description,
      blocks: source.blocks,
      document: source.document,
      dsl: source.dsl,
      editorMode: source.editorMode,
      presentation: source.presentation,
      active: true,
    });
  }
  async deleteTemplate(userId: string, id: string) {
    const current = await this.getTemplate(userId, id);
    if (!current || current.isDefault) return false;
    const { data, error } = await this.db
      .from("cta_templates")
      .delete()
      .eq("user_id", userId)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  async setDefaultTemplate(userId: string, id: string) {
    const target = await this.getTemplate(userId, id);
    if (!target) return null;
    const { error } = await this.db.rpc("set_default_cta_template", {
      p_user_id: userId,
      p_template_id: id,
    });
    if (error) throw error;
    return this.getTemplate(userId, id);
  }
  async listCopy(userId: string) {
    const { data, error } = await this.db
      .from("cta_copy_library")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(copyItem);
  }
  async createCopy(
    userId: string,
    input: Omit<
      CtaCopyLibraryItem,
      "id" | "userId" | "createdAt" | "updatedAt"
    >,
  ) {
    const { data, error } = await this.db
      .from("cta_copy_library")
      .insert({
        user_id: userId,
        name: input.name,
        copy_type: input.type,
        mode: input.mode,
        objective: input.objective,
        instruction: input.instruction,
        exact_text: input.exactText,
      })
      .select("*")
      .single();
    if (error) throw error;
    return copyItem(data);
  }
  async updateCopy(
    userId: string,
    id: string,
    patch: Partial<
      Omit<CtaCopyLibraryItem, "id" | "userId" | "createdAt" | "updatedAt">
    >,
  ) {
    const row: Row = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.type !== undefined) row.copy_type = patch.type;
    if (patch.mode !== undefined) row.mode = patch.mode;
    if (patch.objective !== undefined) row.objective = patch.objective;
    if (patch.instruction !== undefined) row.instruction = patch.instruction;
    if (patch.exactText !== undefined) row.exact_text = patch.exactText;
    const { data, error } = await this.db
      .from("cta_copy_library")
      .update(row)
      .eq("user_id", userId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? copyItem(data) : null;
  }
  async deleteCopy(userId: string, id: string) {
    const { data, error } = await this.db
      .from("cta_copy_library")
      .delete()
      .eq("user_id", userId)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  async listRules(userId: string) {
    const { data, error } = await this.db
      .from("cta_rules")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map(rule);
  }
  async addRule(
    userId: string,
    profileId: string,
    input: {
      ruleType: string;
      value: string;
      scope: string;
      condition?: unknown[];
    },
  ) {
    const { data, error } = await this.db
      .from("cta_rules")
      .insert({
        user_id: userId,
        profile_id: profileId,
        rule_type: input.ruleType,
        value: input.value,
        scope: input.scope,
        condition: input.condition ?? [],
        active: true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return rule(data);
  }
  async archiveConflictingRules(
    userId: string,
    ruleType: string,
    value: string,
  ) {
    const { error } = await this.db
      .from("cta_rules")
      .update({
        active: false,
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("rule_type", ruleType)
      .ilike("value", value);
    if (error) throw error;
  }
  async archiveRule(userId: string, id: string) {
    const { error } = await this.db
      .from("cta_rules")
      .update({ active: false, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw error;
  }
  async deleteRule(userId: string, id: string) {
    const { data, error } = await this.db
      .from("cta_rules")
      .delete()
      .eq("user_id", userId)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  async getProduct(userId: string, productId: string) {
    const { data, error } = await this.db
      .from("products")
      .select("*")
      .eq("user_id", userId)
      .eq("id", productId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapProduct(await reconcileProductCouponUrl(this.db, userId, data)) : null;
  }
  async listRelevantExamples(
    userId: string,
    facts: { title: string; category: string | null },
    limit: number,
  ) {
    let query = this.db
      .from("cta_examples")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 20));
    const { data, error } = await query;
    if (error) throw error;
    const terms = new Set(
      `${facts.title} ${facts.category ?? ""}`
        .toLowerCase()
        .split(/\W+/)
        .filter((item) => item.length > 3),
    );
    return (data ?? [])
      .sort((a, b) => {
        const score = (r: Row) =>
          [...terms].filter(
            (term) =>
              JSON.stringify(r.context ?? {})
                .toLowerCase()
                .includes(term) || r.original_text.toLowerCase().includes(term),
          ).length;
        return score(b) - score(a);
      })
      .slice(0, limit)
      .map(
        (r: Row): CtaExample => ({
          id: r.id,
          text: r.original_text,
          sentiment: r.sentiment,
          inferredTraits: r.inferred_traits ?? [],
          context: r.context ?? {},
          createdAt: r.created_at,
        }),
      );
  }
  async listExamples(userId: string) {
    const { data, error } = await this.db.from("cta_examples").select("*")
      .eq("user_id", userId).eq("active", true).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []).map((r: Row): CtaExample => ({
      id: r.id, text: r.original_text, sentiment: r.sentiment,
      inferredTraits: r.inferred_traits ?? [], context: r.context ?? {}, createdAt: r.created_at,
    }));
  }
  async addExample(
    userId: string,
    input: {
      text: string;
      sentiment: string;
      traits: string[];
      context?: Record<string, unknown>;
    },
  ) {
    const { error } = await this.db
      .from("cta_examples")
      .insert({
        user_id: userId,
        original_text: input.text,
        sentiment: input.sentiment,
        inferred_traits: input.traits,
        context: input.context ?? {},
        active: true,
      });
    if (error) throw error;
  }
  async deleteExample(userId: string, id: string) {
    const { data, error } = await this.db
      .from("cta_examples")
      .delete()
      .eq("user_id", userId)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  async addFeedback(
    userId: string,
    input: {
      generationId?: string;
      strength: string;
      aspects: Record<string, string>;
      text: string;
      explicit: boolean;
    },
  ) {
    const { error } = await this.db
      .from("cta_feedback")
      .insert({
        user_id: userId,
        generation_id: input.generationId ?? null,
        strength: input.strength,
        aspects: input.aspects,
        feedback_text: input.text,
        explicit: input.explicit,
      });
    if (error) throw error;
  }
  async addInference(
    userId: string,
    input: {
      kind: string;
      value: Record<string, unknown>;
      evidenceCount: number;
    },
  ) {
    const { error } = await this.db
      .from("cta_inferred_preferences")
      .insert({
        user_id: userId,
        inference_type: input.kind,
        inferred_value: input.value,
        evidence_count: input.evidenceCount,
        status: "suggested",
      });
    if (error) throw error;
  }
  async addConversation(
    userId: string,
    role: "user" | "assistant",
    content: string,
    metadata: Record<string, unknown> = {},
  ) {
    const { data, error } = await this.db
      .from("cta_conversations")
      .insert({ user_id: userId, role, content, metadata })
      .select("*")
      .single();
    if (error) throw error;
    return conversation(data);
  }
  async listConversation(userId: string, limit: number) {
    const { data, error } = await this.db
      .from("cta_conversations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).reverse().map(conversation);
  }
  async listRecentGenerations(userId: string, limit: number) {
    const { data, error } = await this.db
      .from("cta_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(generation);
  }
  async listRecentGenerationMemory(userId: string, limit: number) {
    const profile = await this.getOrCreateProfile(userId);
    const { data, error } = await this.db
      .from("cta_history")
      .select("*")
      .eq("user_id", userId)
      .eq("memory_epoch", profile.memoryEpoch ?? 1)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(generation);
  }
  async getGeneration(userId: string, id: string) {
    const { data, error } = await this.db
      .from("cta_history")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? generation(data) : null;
  }
  async findReusableGeneration(userId: string, productId: string) {
    const current = await this.getProduct(userId, productId);
    if (!current) return null;
    const { data: rows, error } = await this.db
      .from("cta_history")
      .select("*")
      .eq("user_id", userId)
      .eq("publishable", true)
      .eq("generation_status", "valid")
      .neq("generation_mode", "original_message")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    if (!rows?.length) return null;
    const productIds = [
      ...new Set(
        rows.map((row: Row) => String(row.product_id)).filter(Boolean),
      ),
    ];
    const { data: productRows, error: productsError } = await this.db
      .from("products")
      .select("*")
      .eq("user_id", userId)
      .in("id", productIds);
    if (productsError) throw productsError;
    const compatible = new Set(
      (productRows ?? [])
        .map(mapProduct)
        .filter((candidate) => isSamePromotion(current, candidate))
        .map((candidate) => candidate.id),
    );
    const found = rows.find((row: Row) => compatible.has(row.product_id));
    return found ? generation(found) : null;
  }
  async claimCtaCandidates(userId:string,cacheKey:string,limit:number):Promise<{items:CtaPooledCandidate[];remaining:number}>{
    const {data,error}=await this.db.rpc('claim_cta_candidates',{p_user_id:userId,p_cache_key:cacheKey,p_limit:Math.max(1,Math.min(limit,12))});
    if(error){if(['42883','PGRST202'].includes((error as {code?:string}).code??''))return {items:[],remaining:0};throw error;}
    const rows=Array.isArray(data)?data:[];
    const items:CtaPooledCandidate[]=rows.map((row:Row)=>({id:row.id,text:String(row.text),angle:String(row.angle),provider:String(row.provider),model:String(row.model)}));
    const {count}=await this.db.from('cta_candidate_pool').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('cache_key',cacheKey).eq('status','available').gt('expires_at',new Date().toISOString());
    return {items,remaining:count??0};
  }

  async saveCtaCandidates(userId:string,cacheKey:string,candidates:Array<CtaCandidate&{provider:string;model:string}>,expiresAt:string):Promise<number>{
    if(!candidates.length)return 0;
    const rows=candidates.map((candidate)=>{const text=candidate.text.trim();return {user_id:userId,cache_key:cacheKey,text,text_hash:createHash('sha256').update(text.toLocaleLowerCase('pt-BR')).digest('hex'),angle:candidate.angle.trim(),provider:candidate.provider,model:candidate.model,expires_at:expiresAt};});
    const {data,error}=await this.db.from('cta_candidate_pool').upsert(rows,{onConflict:'user_id,cache_key,text_hash',ignoreDuplicates:true}).select('id');
    if(error){if(['42P01','PGRST205'].includes((error as {code?:string}).code??''))return 0;throw error;}
    return data?.length??0;
  }

  async createGeneration(
    userId: string,
    input: Omit<CtaGeneration, "id" | "userId" | "createdAt">,
  ) {
    const { data, error } = await this.db
      .from("cta_history")
      .insert({
        user_id: userId,
        product_id: input.productId,
        cta_profile_id: input.ctaProfileId,
        template_id: input.templateId ?? null,
        generated_cta: input.ctaText ?? null,
        cta_text: input.finalText,
        generated_text: input.generatedText,
        final_text: input.finalText,
        was_edited: input.wasEdited,
        generation_mode: input.generationMode,
        publishable: input.publishable,
        generation_status: input.status,
        structure_signature: input.structureSignature,
        structure_snapshot: input.structureSnapshot,
        provider: input.provider,
        model: input.model,
        validation_errors: input.validationErrors,
        variant_index: input.variantIndex,
        variant_group_id: input.variantGroupId,
        memory_epoch: input.memoryEpoch ?? 1,
      })
      .select("*")
      .single();
    if (error) throw error;
    return generation(data);
  }
  async updateGeneration(
    userId: string,
    id: string,
    finalText: string,
    validationErrors: string[],
    publishable: boolean,
    status: CtaGeneration["status"],
  ) {
    const { data, error } = await this.db
      .from("cta_history")
      .update({
        final_text: finalText,
        cta_text: finalText,
        was_edited: true,
        validation_errors: validationErrors,
        publishable,
        generation_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? generation(data) : null;
  }

  async createTrainingSource(
    userId: string,
    input: { content: string; charCount: number; chunkCount: number },
  ) {
    const { data, error } = await this.db
      .from("cta_training_sources")
      .insert({
        user_id: userId,
        original_content: input.content,
        char_count: input.charCount,
        chunk_count: input.chunkCount,
        status: "analyzing",
      })
      .select("id,status,char_count,chunk_count,created_at")
      .single();
    if (error) throw error;
    return trainingSource(data);
  }

  async saveTrainingReview(
    userId: string,
    sourceId: string,
    review: Omit<CtaTrainingReview, "source">,
  ) {
    const { data, error } = await this.db
      .from("cta_training_sources")
      .update({ status: "review", interpretation: review, error_code: null, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", sourceId)
      .eq("status", "analyzing")
      .select("id,status,char_count,chunk_count,created_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("CTA_TRAINING_SOURCE_NOT_FOUND");
    return { source: trainingSource(data), ...review };
  }

  async getTrainingReview(userId: string, sourceId: string) {
    const { data, error } = await this.db
      .from("cta_training_sources")
      .select("id,status,char_count,chunk_count,interpretation,created_at")
      .eq("user_id", userId)
      .eq("id", sourceId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.interpretation) return null;
    const review = data.interpretation as Omit<CtaTrainingReview, "source">;
    return { source: trainingSource(data), ...review };
  }

  async failTrainingSource(userId: string, sourceId: string, errorCode: string) {
    const { error } = await this.db
      .from("cta_training_sources")
      .update({ status: "failed", error_code: errorCode, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", sourceId)
      .eq("status", "analyzing");
    if (error) throw error;
  }

  async applyTrainingMemory(
    userId: string,
    profileId: string,
    sourceId: string,
    review: CtaTrainingReview,
  ) {
    const { data, error } = await this.db.rpc("apply_cta_training_memory", {
      p_user_id: userId,
      p_profile_id: profileId,
      p_source_id: sourceId,
      p_items: review.items,
      p_conflicts: review.conflicts,
      p_summary: review.summary,
    });
    if (error) throw error;
    return Number(data);
  }

  async listMemoryItems(userId: string, activeOnly = false) {
    let query = this.db
      .from("cta_memory_items")
      .select("*")
      .eq("user_id", userId)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2_000);
    if (activeOnly) query = query.eq("active", true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(memoryItem);
  }

  async listRelevantMemory(
    userId: string,
    facts: { title: string; category: string | null; marketplace: string },
    limit: number,
  ) {
    const items = await this.listMemoryItems(userId, true);
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase();
    const terms = new Set(normalize(`${facts.title} ${facts.category ?? ""} ${facts.marketplace}`).match(/[a-z0-9]{4,}/gu) ?? []);
    const ranked = items.map((item) => {
      const haystack = normalize(`${item.semanticText} ${JSON.stringify(item.condition)}`);
      const matches = [...terms].filter((term) => haystack.includes(term)).length;
      const contextual = item.scope === "conditional" || item.scope === "exception";
      return { item, score: item.priority + matches * 25 + (!contextual ? 15 : 0), eligible: semanticMemoryEligible(item, facts) };
    }).filter((entry) => entry.eligible).sort((a, b) => b.score - a.score);
    return ranked.slice(0, Math.max(1, Math.min(limit, 100))).map((entry) => entry.item);
  }

  async deleteMemoryItem(userId: string, id: string) {
    const { data, error } = await this.db.rpc("deactivate_cta_memory_item", {
      p_user_id: userId,
      p_item_id: id,
    });
    if (error) throw error;
    return Boolean(data);
  }

  async recordMemoryItems(userId: string, profileId: string, items: CtaTrainingReview["items"]) {
    const { data, error } = await this.db.rpc("record_cta_conversation_memory", {
      p_user_id: userId,
      p_profile_id: profileId,
      p_items: items,
    });
    if (error) throw error;
    return Number(data);
  }

  async memoryView(userId: string): Promise<CtaMemoryView> {
    const [items, versionResult] = await Promise.all([
      this.listMemoryItems(userId, true),
      this.db.from("cta_memory_versions").select("version").eq("user_id", userId).order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (versionResult.error) throw versionResult.error;
    return groupCtaMemoryItems(items, Number(versionResult.data?.version ?? 0));
  }
}
