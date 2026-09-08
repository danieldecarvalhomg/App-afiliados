import { CtaGenericityValidator } from "./CtaGenericityValidator";
import { CtaSlotBoundaryValidator } from "./CtaSlotBoundaryValidator";
import type { CtaBlock, CtaCandidate, CtaFacts, CtaProductCreativeContext } from "./types";

const normalizedWords = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().match(/[a-z0-9]{3,}/gu) ?? [];
const overlap = (left: string, right: string) => {
  const a = normalizedWords(left);
  if (!a.length) return 0;
  const b = new Set(normalizedWords(right));
  return a.filter((word) => b.has(word)).length / a.length;
};

export class CtaCandidateSelector {
  constructor(
    private genericity = new CtaGenericityValidator(),
    private boundary = new CtaSlotBoundaryValidator(),
  ) {}

  select(
    candidates: CtaCandidate[],
    facts: CtaFacts,
    context: CtaProductCreativeContext,
    recent: string[],
  ): { candidate: CtaCandidate; errors: string[] } {
    const block: CtaBlock = {
      id: "cta_ia",
      key: "cta_ia",
      label: "CTA",
      kind: "creative",
      enabled: true,
      position: 0,
      positionMode: "pinned",
      frequency: "always",
      conditions: [],
      format: "separate_line",
      whatsappFormat: "normal",
      groupId: null,
      generationInstruction: null,
      fixedText: null,
      copyMode: "AI_GENERATED",
      objective: "chamada criativa inicial",
    };
    const ranked = candidates.map((candidate, index) => {
      const slots = [{ blockId: block.id, text: candidate.text }];
      const errors = [
        ...this.boundary.validate([block], slots, facts),
        ...this.genericity.validate(slots, context),
      ];
      const repetition = Math.max(0, ...recent.map((prior) => overlap(candidate.text, prior)));
      const forced = /\b(?:revoluciona(?:r|́rio)?|muda sua vida|dos sonhos|universo|mágic[oa])\b/iu.test(candidate.text) ? 1 : 0;
      const empty = candidate.text.trim().length < 4 ? 1 : 0;
      return { candidate, errors: [...new Set(errors)], score: errors.length * 100 + repetition * 20 + forced * 8 + empty * 100 + index / 100 };
    }).sort((a, b) => a.score - b.score);
    if (!ranked.length) throw new Error("CTA_AI_EMPTY_RESPONSE");
    return { candidate: ranked[0].candidate, errors: ranked[0].errors };
  }
}
