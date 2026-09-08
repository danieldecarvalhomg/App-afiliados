const PRODUCT_CONTEXT = /\b(compre|comprar|produto|garanta|aproveite|confira|pegue|oferta)\b/i;
const COUPON_CONTEXT = /\b(cupom|cupons|voucher|resgat\w*)\b/i;

function scoreContext(value: string, sameLine: boolean): number {
  let score = 0;
  if (PRODUCT_CONTEXT.test(value)) score += sameLine ? 80 : 35;
  if (COUPON_CONTEXT.test(value)) score -= sameLine ? 120 : 70;
  return score;
}

export function selectPrimaryProductLink(links: string[], rawContent?: string | null): string | null {
  if (!links.length) return null;
  if (links.length === 1) return links[0];
  if (!rawContent?.trim()) return null;
  const lines = rawContent.split(/\r?\n/);
  const ranked = links.map((link, index) => {
    const lineIndex = lines.findIndex((line) => line.includes(link));
    if (lineIndex < 0) return { link, index, score: 0 };
    const sameLine = lines[lineIndex].replace(link, ' ');
    const previous = lines.slice(Math.max(0, lineIndex - 2), lineIndex).filter((line) => line.trim()).join(' ');
    let score = scoreContext(sameLine, true) + scoreContext(previous, false);
    try { if (new URL(link).searchParams.get('lp') === 'aff') score += 10; } catch { /* URL já foi validada antes */ }
    return { link, index, score };
  });
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0].score > 0 ? ranked[0].link : null;
}
