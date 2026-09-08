import { extractImageThumb, type WAUrlInfo } from "@whiskeysockets/baileys";
import {
  fetchLinkPreviewPage,
  fetchMarketplaceOfferPage,
  type MarketplacePageEvidence,
} from "../ai/MarketplaceOfferPageFetcher";
import { downloadTrustedImage } from "../media/SupabaseProductMediaStorage";

export interface WhatsAppLinkPreviewInput {
  text: string;
  sourceUrl: string | null;
  affiliateUrl: string | null;
  productTitle: string | null;
  description?: string | null;
}

export interface WhatsAppBuiltLinkPreview extends WAUrlInfo {
  /** Bytes já obtidos com DNS pinning; usados pelo provider no upload thumbnail-link. */
  imageBytes?: Uint8Array;
}

interface PreviewAssets {
  title: string;
  description?: string;
  imageUrl?: string;
  jpegThumbnail?: Buffer;
  imageBytes?: Uint8Array;
}

type EvidenceFetcher = (url: string) => Promise<MarketplacePageEvidence>;
type ImageFetcher = (url: string) => Promise<{ bytes: Uint8Array }>;
type Thumbnailer = (bytes: Uint8Array) => Promise<Buffer>;

const HTTP_URL = /https?:\/\/[^\s<>]+/giu;

export function firstHttpUrl(text: string): string | null {
  const match = text.match(HTTP_URL)?.[0];
  return match?.replace(/[),.;!?]+$/, "") ?? null;
}

export function canonicalShopeeProductUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (host !== "shopee.com.br" && !host.endsWith(".shopee.com.br"))
      return null;
    const match = url.pathname.match(
      /^\/(?:product|[^/]+)\/(\d{5,})\/(\d{5,})(?:\/|$)/i,
    );
    return match
      ? `https://shopee.com.br/product/${match[1]}/${match[2]}`
      : null;
  } catch {
    return null;
  }
}

async function defaultThumbnailer(bytes: Uint8Array): Promise<Buffer> {
  const result = await extractImageThumb(Buffer.from(bytes), 400);
  return Buffer.from(result.buffer);
}

export class WhatsAppLinkPreviewService {
  constructor(
    private readonly fetchEvidence: EvidenceFetcher = fetchPreviewEvidence,
    private readonly fetchImage: ImageFetcher = downloadTrustedImage,
    private readonly thumbnail: Thumbnailer = defaultThumbnailer,
  ) {}

  async build(
    input: WhatsAppLinkPreviewInput,
  ): Promise<WhatsAppBuiltLinkPreview | undefined> {
    const matchedUrl =
      input.affiliateUrl && input.text.includes(input.affiliateUrl)
        ? input.affiliateUrl
        : firstHttpUrl(input.text);
    const evidenceUrl = input.sourceUrl ?? matchedUrl;
    if (!matchedUrl || !evidenceUrl) return undefined;

    const assets = await this.assets(evidenceUrl, input.productTitle).catch(
      () => null,
    );
    if (!assets) return undefined;
    return {
      "canonical-url": matchedUrl,
      "matched-text": matchedUrl,
      title: assets.title,
      description:
        input.description?.trim().slice(0, 500) || assets.description,
      jpegThumbnail: assets.jpegThumbnail,
      originalThumbnailUrl: assets.imageUrl,
      imageBytes: assets.imageBytes,
    };
  }

  private async assets(
    sourceUrl: string,
    fallbackTitle: string | null,
  ): Promise<PreviewAssets | null> {
    let evidence = await this.fetchEvidence(sourceUrl);
    if (!evidence.title || !evidence.imageUrl) {
      const canonicalUrl = canonicalShopeeProductUrl(evidence.finalUrl);
      if (canonicalUrl && canonicalUrl !== evidence.finalUrl) {
        evidence = await this.fetchEvidence(canonicalUrl);
      }
    }

    const title = evidence.title?.trim() || fallbackTitle?.trim();
    if (!title) return null;
    const value: PreviewAssets = {
      title: title.slice(0, 300),
      description: evidence.description?.trim().slice(0, 500) || undefined,
      imageUrl: evidence.imageUrl ?? undefined,
    };
    if (evidence.imageUrl) {
      try {
        const image = await this.fetchImage(evidence.imageUrl);
        value.imageBytes = image.bytes;
        value.jpegThumbnail = await this.thumbnail(image.bytes);
      } catch {
        // O preview textual ainda é útil; falha de imagem nunca impede o envio.
      }
    }
    return value;
  }
}

async function fetchPreviewEvidence(
  url: string,
): Promise<MarketplacePageEvidence> {
  try {
    return await fetchMarketplaceOfferPage(url);
  } catch (error) {
    // O extrator estrito cobre os marketplaces conhecidos. Para qualquer
    // outro domínio público, use somente os metadados da própria página.
    if (
      error instanceof Error &&
      error.message !== "UNSUPPORTED_MARKETPLACE_URL"
    )
      throw error;
    return fetchLinkPreviewPage(url);
  }
}
