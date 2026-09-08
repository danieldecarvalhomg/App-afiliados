import type {
  CtaAssistantResult,
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
} from "./types";
import type { ProductRecord } from "../products/types";
export interface CtaRepository {
  getOrCreateProfile(userId: string): Promise<CtaProfile>;
  updateProfile(
    userId: string,
    patch: Partial<CtaProfile>,
  ): Promise<CtaProfile>;
  undoProfile(userId: string): Promise<CtaProfile | null>;
  getOrCreateBlueprint(
    userId: string,
    profileId: string,
  ): Promise<CtaBlueprint>;
  saveBlueprint(
    userId: string,
    blueprint: CtaBlueprint,
    operations: CtaStructureOperation[],
    source: "manual" | "assistant",
  ): Promise<CtaBlueprint>;
  undoBlueprint(userId: string): Promise<CtaBlueprint | null>;
  listTemplates(userId: string): Promise<CtaTemplate[]>;
  getTemplate(userId: string, id: string): Promise<CtaTemplate | null>;
  getDefaultTemplate(userId: string): Promise<CtaTemplate>;
  createTemplate(
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
  ): Promise<CtaTemplate>;
  updateTemplate(
    userId: string,
    id: string,
    patch: Partial<
      Pick<CtaTemplate, "name" | "description" | "blocks" | "document" | "dsl" | "editorMode" | "presentation" | "active">
    >,
  ): Promise<CtaTemplate | null>;
  duplicateTemplate(userId: string, id: string): Promise<CtaTemplate | null>;
  deleteTemplate(userId: string, id: string): Promise<boolean>;
  setDefaultTemplate(userId: string, id: string): Promise<CtaTemplate | null>;
  listCopy(userId: string): Promise<CtaCopyLibraryItem[]>;
  createCopy(
    userId: string,
    input: Omit<
      CtaCopyLibraryItem,
      "id" | "userId" | "createdAt" | "updatedAt"
    >,
  ): Promise<CtaCopyLibraryItem>;
  updateCopy(
    userId: string,
    id: string,
    patch: Partial<
      Omit<CtaCopyLibraryItem, "id" | "userId" | "createdAt" | "updatedAt">
    >,
  ): Promise<CtaCopyLibraryItem | null>;
  deleteCopy(userId: string, id: string): Promise<boolean>;
  listRules(userId: string): Promise<CtaRule[]>;
  addRule(
    userId: string,
    profileId: string,
    input: {
      ruleType: string;
      value: string;
      scope: string;
      condition?: unknown[];
    },
  ): Promise<CtaRule>;
  archiveConflictingRules(
    userId: string,
    ruleType: string,
    value: string,
  ): Promise<void>;
  archiveRule?(userId: string, id: string): Promise<void>;
  deleteRule(userId: string, id: string): Promise<boolean>;
  getProduct(userId: string, productId: string): Promise<ProductRecord | null>;
  getOriginalConvertedMessage(
    userId: string,
    productId: string,
  ): Promise<CtaOriginalMessage | null>;
  listRelevantExamples(
    userId: string,
    facts: { title: string; category: string | null },
    limit: number,
  ): Promise<CtaExample[]>;
  listExamples(userId: string): Promise<CtaExample[]>;
  addExample(
    userId: string,
    input: {
      text: string;
      sentiment: string;
      traits: string[];
      context?: Record<string, unknown>;
    },
  ): Promise<void>;
  deleteExample(userId: string, id: string): Promise<boolean>;
  addFeedback(
    userId: string,
    input: {
      generationId?: string;
      strength: string;
      aspects: Record<string, string>;
      text: string;
      explicit: boolean;
    },
  ): Promise<void>;
  addInference(
    userId: string,
    input: {
      kind: string;
      value: Record<string, unknown>;
      evidenceCount: number;
    },
  ): Promise<void>;
  addConversation(
    userId: string,
    role: "user" | "assistant",
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<CtaConversationMessage>;
  listConversation(
    userId: string,
    limit: number,
  ): Promise<CtaConversationMessage[]>;
  listRecentGenerations(
    userId: string,
    limit: number,
  ): Promise<CtaGeneration[]>;
  listRecentGenerationMemory?(userId: string, limit: number): Promise<CtaGeneration[]>;
  getGeneration(userId: string, id: string): Promise<CtaGeneration | null>;
  findReusableGeneration(
    userId: string,
    productId: string,
  ): Promise<CtaGeneration | null>;
  createGeneration(
    userId: string,
    input: Omit<CtaGeneration, "id" | "userId" | "createdAt">,
  ): Promise<CtaGeneration>;
  claimCtaCandidates?(userId:string,cacheKey:string,limit:number):Promise<{items:CtaPooledCandidate[];remaining:number}>;
  saveCtaCandidates?(userId:string,cacheKey:string,candidates:Array<CtaCandidate&{provider:string;model:string}>,expiresAt:string):Promise<number>;
  updateGeneration(
    userId: string,
    id: string,
    finalText: string,
    validationErrors: string[],
    publishable: boolean,
    status: CtaGeneration["status"],
  ): Promise<CtaGeneration | null>;
  createTrainingSource(
    userId: string,
    input: { content: string; charCount: number; chunkCount: number },
  ): Promise<CtaTrainingSource>;
  saveTrainingReview(
    userId: string,
    sourceId: string,
    review: Omit<CtaTrainingReview, "source">,
  ): Promise<CtaTrainingReview>;
  getTrainingReview(userId: string, sourceId: string): Promise<CtaTrainingReview | null>;
  failTrainingSource(userId: string, sourceId: string, errorCode: string): Promise<void>;
  applyTrainingMemory(
    userId: string,
    profileId: string,
    sourceId: string,
    review: CtaTrainingReview,
  ): Promise<number>;
  listMemoryItems(userId: string, activeOnly?: boolean): Promise<CtaMemoryItem[]>;
  listRelevantMemory(
    userId: string,
    facts: { title: string; category: string | null; marketplace: string },
    limit: number,
  ): Promise<CtaMemoryItem[]>;
  deleteMemoryItem(userId: string, id: string): Promise<boolean>;
  recordMemoryItems?(
    userId: string,
    profileId: string,
    items: CtaTrainingReview["items"],
  ): Promise<number>;
  memoryView(userId: string): Promise<CtaMemoryView>;
}
export type { CtaAssistantResult };
