import { resolvePlatform } from '../../../domain/affiliate/PlatformResolver';
import { MercadoLivreCompanionError } from './companion/types';

export function extractMercadoLivreItemId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hash = new URLSearchParams(parsed.hash.replace(/^#/u, ''));
    const explicit = parsed.searchParams.get('wid') ?? parsed.searchParams.get('item_id')
      ?? hash.get('wid') ?? hash.get('item_id');
    const value = explicit?.match(/MLB[-_]?\d{6,}/iu)?.[0]
      ?? `${parsed.pathname}${parsed.search}`.match(/MLB[-_]?\d{6,}/iu)?.[0];
    return value ? value.replace(/[-_]/gu, '').toUpperCase() : null;
  } catch { return null; }
}

export function normalizeMercadoLivreProductUrl(raw: string): string {
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'URL Mercado Livre inválida.'); }
  if (parsed.protocol !== 'https:' || resolvePlatform(parsed.toString()) !== 'mercado_livre') {
    throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'A URL não pertence ao Mercado Livre.');
  }
  if (!/MLB[-_]?\d{6,}/iu.test(`${parsed.pathname}${parsed.search}`)) {
    throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'Use o link direto da página do produto do Mercado Livre.');
  }
  parsed.hash = '';
  return parsed.toString();
}

export function isMercadoLivreProductUrl(raw: string): boolean {
  try { normalizeMercadoLivreProductUrl(raw); return true; }
  catch { return false; }
}

export class MercadoLivreAffiliateLinkValidator {
  validate(sourceUrl: string, candidate: unknown): string {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      throw new MercadoLivreCompanionError('INVALID_AFFILIATE_URL', 'O Companion não retornou uma URL.');
    }
    let source: URL;
    let affiliate: URL;
    try { source = new URL(sourceUrl); affiliate = new URL(candidate.trim()); }
    catch { throw new MercadoLivreCompanionError('INVALID_AFFILIATE_URL', 'O Companion retornou uma URL inválida.'); }
    if (affiliate.protocol !== 'https:' || affiliate.toString() === source.toString()) {
      throw new MercadoLivreCompanionError('INVALID_AFFILIATE_URL', 'O link afiliado não é seguro ou não foi convertido.');
    }
    if (resolvePlatform(source.toString()) !== 'mercado_livre' || resolvePlatform(affiliate.toString()) !== 'mercado_livre') {
      throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'A origem ou o resultado não pertence ao Mercado Livre.');
    }
    if (/login|captcha|auth|verification/iu.test(affiliate.pathname)) {
      throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'O resultado aponta para autenticação, não para um link afiliado.');
    }
    if (affiliate.hostname === 'www.mercadolivre.com.br' && /^\/afiliados(?:\/|$)/iu.test(affiliate.pathname)) {
      throw new MercadoLivreCompanionError('INVALID_AFFILIATE_URL', 'O resultado é uma rota do Portal, não um link afiliado.');
    }
    if (affiliate.hostname === 'meli.la') {
      // O Portal retorna um código curto em um único segmento. Rotas como
      // /social/... e /auth/... não são links de produto afiliados.
      if (!/^\/[A-Za-z0-9][A-Za-z0-9_-]{2,63}\/?$/u.test(affiliate.pathname)) {
        throw new MercadoLivreCompanionError('INVALID_AFFILIATE_URL', 'O link curto retornado é inválido.');
      }
    } else {
      const productPath = /MLB[-_]?\d{6,}/iu.test(`${affiliate.pathname}${affiliate.search}`);
      const tracking = ['matt_word', 'matt_tool', 'matt_source', 'utm_source', 'utm_medium', 'utm_campaign']
        .some((key) => affiliate.searchParams.has(key));
      if (!productPath || !tracking) {
        throw new MercadoLivreCompanionError('INVALID_AFFILIATE_URL', 'A URL não possui identificação de afiliado.');
      }
      const sourceItem = extractMercadoLivreItemId(source.toString());
      const affiliateItem = extractMercadoLivreItemId(affiliate.toString());
      if (sourceItem && affiliateItem && sourceItem !== affiliateItem) {
        throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'O resultado aponta para outro produto.');
      }
    }
    return affiliate.toString();
  }
}
