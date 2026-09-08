import type { ProductRecord } from "../products/types";
import type { DispatchPresentationSettings } from "../dispatch/types";

export type CtaRepetitionMode = "low" | "balanced" | "flexible" | "custom";
export type CtaLength = "short" | "medium" | "long";
export type CtaEmojiLevel = "none" | "moderate" | "heavy";
export type CtaInstructionScope =
  | "persistent"
  | "conditional"
  | "exception"
  | "one_off";
export type CtaBlockKind = "factual" | "creative" | "custom";
export type CtaPositionMode = "pinned" | "flexible";
export type CtaFrequency =
  | "always"
  | "frequent"
  | "sometimes"
  | "rarely"
  | "never";
export type CtaGenerationStatus =
  | "draft"
  | "generating"
  | "generated"
  | "validating"
  | "valid"
  | "invalid"
  | "generation_failed";
export type CtaFeedbackStrength =
  | "weak_positive"
  | "positive"
  | "strong_positive"
  | "weak_negative"
  | "negative"
  | "strong_negative";
export type CtaCopyMode = "AI_GENERATED" | "EXACT_TEXT";
export type CtaWhatsAppFormat =
  | "normal"
  | "bold"
  | "italic"
  | "strikethrough"
  | "monospace"
  | "quote"
  | "bullet_list"
  | "numbered_list";
export type CtaCopyType =
  | "opening"
  | "cta"
  | "transition"
  | "coupon"
  | "discount"
  | "closing"
  | "notice"
  | "custom";

export interface CtaProfile {
  id: string;
  userId: string;
  tone: string;
  length: CtaLength;
  emojiLevel: CtaEmojiLevel;
  repetitionMode: CtaRepetitionMode;
  structuredPreferences: Record<string, unknown>;
  naturalLanguagePreferences: string | null;
  version: number;
  memoryEpoch?: number;
  createdAt: string;
  updatedAt: string;
}
export type CtaConditionField =
  | "coupon"
  | "coupon_link"
  | "discount"
  | "price"
  | "original_price"
  | "free_shipping"
  | "marketplace";
export type CtaConditionOperator =
  | "exists"
  | "not_exists"
  | "gte"
  | "gt"
  | "lte"
  | "lt"
  | "eq"
  | "neq";
export interface CtaCondition {
  field: CtaConditionField;
  operator: CtaConditionOperator;
  value?: number | string | boolean | null;
}
export interface CtaBlock {
  id: string;
  key: string;
  label: string;
  kind: CtaBlockKind;
  enabled: boolean;
  position?: number;
  positionMode: CtaPositionMode;
  frequency: CtaFrequency;
  conditions: CtaCondition[];
  format: "inline" | "separate_line" | "grouped";
  whatsappFormat?: CtaWhatsAppFormat;
  groupId: string | null;
  generationInstruction: string | null;
  fixedText: string | null;
  copyMode?: CtaCopyMode | null;
  copyLibraryItemId?: string | null;
  objective?: string | null;
}
export interface CtaBlueprint {
  id: string;
  userId: string;
  profileId: string;
  version: number;
  isDefault: boolean;
  blocks: CtaBlock[];
  createdAt: string;
  updatedAt: string;
}
export interface CtaTemplate {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  active: boolean;
  isDefault: boolean;
  version: number;
  blocks: CtaBlock[];
  /** Fonte única da verdade. `blocks` existe apenas para migração legada. */
  document?: MessageTemplateDocument;
  /** Serialização manual canônica do mesmo `document`. */
  dsl?: string;
  editorMode?: TemplateEditorMode;
  presentation: DispatchPresentationSettings;
  /** Conteúdo legado preservado para auditoria, nunca renderizado como CTA. */
  legacyFinalCta?: CtaBlock[];
  legacyUnconvertedBlocks?: CtaBlock[];
  officialKey: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CtaCopyLibraryItem {
  id: string;
  userId: string;
  name: string;
  type: CtaCopyType;
  mode: CtaCopyMode;
  objective: string | null;
  instruction: string | null;
  exactText: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CtaTemplatePreview {
  text: string;
  publishable: boolean;
  status: CtaGenerationStatus;
  validationErrors: string[];
  provider: string;
  model: string;
  structureSignature: string;
}
export interface EffectiveCtaBlueprint extends CtaBlueprint {
  sourceVersion: number;
  oneOffInstructions: string[];
  structureSignature: string;
}
export type EffectiveTemplateBlocks = CtaBlock[];
export interface CtaRule {
  id: string;
  userId: string;
  profileId: string;
  ruleType: string;
  value: string;
  scope: CtaInstructionScope;
  condition: Array<{ field: string; operator: string; value?: unknown }>;
  active: boolean;
  createdAt: string;
}
export interface CtaExample {
  id: string;
  text: string;
  sentiment: "positive" | "negative" | "reference";
  inferredTraits: string[];
  context: Record<string, unknown>;
  createdAt: string;
}
export interface CtaFacts {
  productId: string;
  title: string;
  category: string | null;
  price: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  couponCode: string | null;
  couponDescription: string | null;
  couponLink?: string | null;
  freeShipping: boolean | null;
  marketplace: string;
  affiliateUrl: string | null;
  sourceUrl: string | null;
}
export interface CtaProductCreativeContext {
  productId: string;
  title: string;
  category: string | null;
  marketplace: string | null;
  price: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  coupon: string | null;
  couponDescription: string | null;
  freeShipping: boolean | null;
  validatedAttributes: string[];
  validatedDescription: string | null;
  hasAffiliateUrl: boolean;
  hasCouponLink?: boolean;
}
export interface CtaTemplateContextBlock {
  blockId: string;
  key: string;
  label: string;
  position: number;
  kind: CtaBlockKind;
  copyMode: CtaCopyMode | null;
  objective: string | null;
  instruction: string | null;
}
export interface CtaTemplateCreativeContext {
  orderedBlocks: CtaTemplateContextBlock[];
  visibleFactualBlocks: Record<string, boolean>;
  aiSlotIds: string[];
}
export interface CtaGeneration {
  id: string;
  userId: string;
  productId: string;
  ctaProfileId: string | null;
  templateId?: string | null;
  /** Somente a chamada criativa inicial; nunca contém a mensagem completa. */
  ctaText?: string | null;
  generatedText: string;
  finalText: string;
  wasEdited: boolean;
  generationMode: string;
  publishable: boolean;
  status: CtaGenerationStatus;
  structureSignature: string;
  structureSnapshot:
    | EffectiveCtaBlueprint
    | MessageGenerationSnapshot
    | { kind: "original-message-v1"; captureId: string; linkCount: number };
  provider: string | null;
  model: string | null;
  validationErrors: string[];
  variantIndex: number;
  variantGroupId: string | null;
  memoryEpoch?: number;
  createdAt: string;
}
export interface CtaOriginalMessage {
  text: string;
  captureId: string;
  originalLinkCount: number;
  convertedLinkCount: number;
}
export interface CtaConversationMessage {
  id: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface CtaHistoryEntry extends CtaGeneration {
  ctaText: string;
  rating: "good" | "bad" | "neutral" | null;
}
export interface CtaAssistantResult {
  reply: string;
  scope: CtaInstructionScope;
  applied: boolean;
  requiresConfirmation: boolean;
  changeSummary: string[];
  profile: CtaProfile;
  blueprint: CtaBlueprint;
  undoAvailable: boolean;
}

export type TemplateEditorMode = "blocks" | "manual";
export type MessageTemplateVariable =
  | "produto"
  | "preco"
  | "preco_original"
  | "desconto"
  | "cupom"
  | "coupon_link"
  | "affiliate_link"
  | "marketplace"
  | "frete_gratis";

export type MessageTemplateConditionField =
  | "preco_original"
  | "desconto"
  | "cupom"
  | "coupon_link"
  | "frete_gratis"
  | "marketplace"
  | "preco";

export type MessageTemplateConditionOperator =
  | "exists"
  | "not_exists"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export interface MessageTemplateCondition {
  field: MessageTemplateConditionField;
  operator: MessageTemplateConditionOperator;
  value?: string | number | boolean | null;
}

export type MessageTemplateNode =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "cta"; format?: CtaWhatsAppFormat }
  | { id: string; type: "variable"; key: MessageTemplateVariable; format?: CtaWhatsAppFormat }
  | {
      id: string;
      type: "conditional";
      condition: MessageTemplateCondition;
      then: MessageTemplateNode[];
      else: MessageTemplateNode[];
    };

export interface MessageTemplateDocument {
  version: 1;
  nodes: MessageTemplateNode[];
}

export type CtaMemoryKind =
  | "instruction"
  | "positive_example"
  | "negative_example"
  | "reference"
  | "feedback"
  | "comparison"
  | "correction"
  | "meta_feedback";

export interface CtaMemoryItem {
  id: string;
  userId: string;
  profileId: string;
  sourceId: string | null;
  kind: CtaMemoryKind;
  scope: CtaInstructionScope;
  semanticText: string;
  condition: Record<string, unknown>;
  polarity: "positive" | "negative" | "neutral";
  priority: number;
  active: boolean;
  supersedesItemId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CtaTrainingSource {
  id: string;
  status: "analyzing" | "review" | "applied" | "failed";
  charCount: number;
  chunkCount: number;
  createdAt: string;
}

export interface CtaTrainingReview {
  source: CtaTrainingSource;
  summary: string[];
  items: Array<
    Pick<
      CtaMemoryItem,
      "kind" | "scope" | "semanticText" | "condition" | "polarity" | "priority"
    >
  >;
  counts: {
    rules: number;
    conditions: number;
    avoided: number;
    positiveExamples: number;
    negativeExamples: number;
  };
  conflicts: Array<{ prior: string; replacement: string; resolution: string }>;
}

export interface CtaMemoryView {
  version: number;
  general: CtaMemoryItem[];
  conditional: CtaMemoryItem[];
  exceptions: CtaMemoryItem[];
  avoid: CtaMemoryItem[];
  examples: CtaMemoryItem[];
}
export interface CtaStudioState {
  profile: CtaProfile;
  blueprint: CtaBlueprint;
  rules: CtaRule[];
  conversation: CtaConversationMessage[];
  history: CtaGeneration[];
  products: ProductRecord[];
}
export interface CtaGenerationRequest {
  count?: 1 | 3;
  instruction?: string;
  mode?: string;
  templateId?: string;
}
export interface MessageGenerationSnapshot {
  kind: "message-template-v1";
  templateId: string;
  templateVersion: number;
  trainerVersion: number;
  document: MessageTemplateDocument;
  dsl: string;
  facts: CtaFacts;
  ctaText: string;
  angle: string | null;
}
/** Compatibilidade do contrato legado; o fluxo novo usa Product persistido por id. */
export interface CtaGenerateParams {
  userId: string;
  productName: string;
  price: string;
  store: string;
  coupon?: string;
  freightFree?: boolean;
  pixDiscount?: boolean;
}
export interface CtaGeneratedSlot {
  blockId: string;
  text: string;
  angle?: string;
}
export interface CtaCandidate {
  text: string;
  angle: string;
}
export interface CtaPooledCandidate extends CtaCandidate {
  id: string;
  provider: string;
  model: string;
}
export interface CtaStructuredGenerationOutput {
  slots: CtaGeneratedSlot[];
  candidates?: CtaCandidate[];
  selected?: number;
}
export type CtaStructureOperation =
  | { type: "move_block"; blockId: string; toIndex: number }
  | { type: "enable_block" | "disable_block"; blockId: string }
  | { type: "group_blocks"; blockIds: string[]; groupId: string }
  | { type: "ungroup_blocks"; blockIds: string[] }
  | { type: "set_condition"; blockId: string; conditions: CtaCondition[] }
  | { type: "set_frequency"; blockId: string; frequency: CtaFrequency }
  | { type: "set_format"; blockId: string; format: CtaBlock["format"] }
  | {
      type: "set_position_mode";
      blockId: string;
      positionMode: CtaPositionMode;
    }
  | {
      type: "set_generation_instruction";
      blockId: string;
      instruction: string | null;
    }
  | { type: "set_fixed_text"; blockId: string; text: string | null }
  | { type: "add_custom_block"; block: CtaBlock; toIndex?: number }
  | { type: "remove_custom_block"; blockId: string };
export function productToCtaFacts(product: ProductRecord): CtaFacts {
  return {
    productId: product.id,
    title: product.title,
    category: product.category,
    price: product.price,
    originalPrice: product.originalPrice,
    discountPercent: product.discountPercent,
    couponCode: product.couponCode,
    couponDescription: product.couponDescription,
    couponLink: product.couponLink ?? null,
    freeShipping: product.freeShipping,
    marketplace: product.marketplace,
    affiliateUrl: product.affiliateUrl,
    sourceUrl: product.sourceUrl,
  };
}
