type AffiliateTag = { tag?: unknown; id?: unknown; name?: unknown; in_use?: unknown };

function tagList(payload: unknown): AffiliateTag[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const value = payload as { tags?: unknown; data?: unknown };
  if (Array.isArray(value.tags)) return value.tags;
  return Array.isArray(value.data) ? value.data : [];
}

function tagValue(item: AffiliateTag | undefined): string | null {
  for (const value of [item?.tag, item?.id, item?.name]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function selectMercadoLivreTrackingTag(payload: unknown, requestedLabel?: string | null): string | null {
  const tags = tagList(payload);
  const requested = requestedLabel?.trim() ?? '';
  const requestedTag = requested
    ? tags.find((item) => [item.tag, item.id, item.name].some((value) => value === requested))
    : undefined;
  return tagValue(requestedTag)
    ?? tagValue(tags.find((item) => item.in_use === true))
    ?? tagValue(tags.find((item) => tagValue(item) !== null))
    ?? (requested || null);
}

export function extractMercadoLivreGeneratedUrl(payload: unknown): string | null {
  return extractMercadoLivreGeneratedUrls(payload)[0] ?? null;
}

export function extractMercadoLivreGeneratedUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const value = payload as { urls?: unknown; results?: unknown; data?: unknown; short_url?: unknown; long_url?: unknown };
  const candidates = Array.isArray(value.urls) ? value.urls
    : Array.isArray(value.results) ? value.results
      : Array.isArray(value.data) ? value.data
        : [value];
  const urls: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as { short_url?: unknown; long_url?: unknown };
    if (typeof item.short_url === 'string' && item.short_url) urls.push(item.short_url);
    else if (typeof item.long_url === 'string' && item.long_url) urls.push(item.long_url);
  }
  return urls;
}
