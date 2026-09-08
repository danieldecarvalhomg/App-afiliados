export interface OriginalMessageConversion {
  text: string;
  originalLinkCount: number;
  convertedLinkCount: number;
}

const validUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

/** Preserva o conteúdo capturado, alterando somente links com conversão concluída. */
export function convertOriginalMessageLinks(
  rawContent: string,
  sourceLinks: string[],
  convertedByOriginal: ReadonlyMap<string, string>,
): OriginalMessageConversion {
  if (!rawContent) throw new Error("CTA_ORIGINAL_MESSAGE_NOT_FOUND");
  const links = [...new Set(sourceLinks.filter(validUrl))].filter((link) =>
    rawContent.includes(link),
  );
  if (!links.length) throw new Error("CTA_ORIGINAL_LINKS_NOT_FOUND");
  if (links.some((link) => !validUrl(convertedByOriginal.get(link) ?? "")))
    throw new Error("CTA_ORIGINAL_LINKS_NOT_CONVERTED");

  let text = rawContent;
  for (const link of links.sort((a, b) => b.length - a.length))
    text = text.split(link).join(convertedByOriginal.get(link)!);
  if (text.length > 20_000) throw new Error("CTA_ORIGINAL_MESSAGE_TOO_LONG");
  return {
    text,
    originalLinkCount: links.length,
    convertedLinkCount: links.length,
  };
}
