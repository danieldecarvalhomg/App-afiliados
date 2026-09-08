import type { CtaWhatsAppFormat } from "./types";

export function applyWhatsAppFormat(text: string, format: CtaWhatsAppFormat): string {
  const value = text.trim();
  if (!value) return "";
  switch (format) {
    case "bold": return `*${value}*`;
    case "italic": return `_${value}_`;
    case "strikethrough": return `~${value}~`;
    case "monospace": return `\`\`\`${value}\`\`\``;
    case "quote": return value.split("\n").map((line) => `> ${line}`).join("\n");
    case "bullet_list": return value.split("\n").map((line) => `- ${line.replace(/^[-*]\s*/, "")}`).join("\n");
    case "numbered_list": return value.split("\n").map((line, index) => `${index + 1}. ${line.replace(/^\d+[.)]\s*/, "")}`).join("\n");
    default: return value;
  }
}

export function hasValidWhatsAppMarkup(text: string): boolean {
  return normalizeWhatsAppMarkup(text).text === text;
}

export interface WhatsAppMarkupNormalization {
  text: string;
  removedMarkers: string[];
}

const urlRanges = (text: string) => [...text.matchAll(/https?:\/\/[^\s<>]+/giu)].map((match) => ({
  start: match.index ?? 0,
  end: (match.index ?? 0) + match[0].length,
}));

/**
 * Remove apenas delimitadores WhatsApp sem par. URLs ficam protegidas porque
 * underscores e outros caracteres nelas são dados, não formatação.
 */
export function normalizeWhatsAppMarkup(text: string): WhatsAppMarkupNormalization {
  const protectedRanges = urlRanges(text);
  const protectedAt = (index: number) => protectedRanges.some((range) => index >= range.start && index < range.end);
  const removals = new Map<number, string>();

  const collect = (marker: string) => {
    const indices: number[] = [];
    for (let index = 0; index <= text.length - marker.length;) {
      if (text.startsWith(marker, index) && !protectedAt(index)) {
        // Underscores no meio de identificadores/palavras também não são markup.
        const embeddedUnderscore = marker === "_" && /[\p{L}\p{N}]/u.test(text[index - 1] ?? "")
          && /[\p{L}\p{N}]/u.test(text[index + 1] ?? "");
        if (!embeddedUnderscore) indices.push(index);
        index += marker.length;
      } else index++;
    }
    if (indices.length % 2 !== 0) removals.set(indices.at(-1)!, marker);
  };

  collect("```");
  for (const marker of ["*", "_", "~"]) collect(marker);
  if (!removals.size) return { text, removedMarkers: [] };

  let normalized = "";
  for (let index = 0; index < text.length;) {
    const marker = removals.get(index);
    if (marker) {
      index += marker.length;
      continue;
    }
    normalized += text[index++];
  }
  return { text: normalized, removedMarkers: [...removals.values()] };
}
