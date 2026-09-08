import type { AffiliatePlatform } from './types';

export function resolvePlatform(url: string): AffiliatePlatform {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return 'unsupported'; }
  if (host === 'shopee.com.br' || host.endsWith('.shopee.com.br')) return 'shopee';
  if (host === 'amazon.com.br' || host.endsWith('.amazon.com.br') || host === 'amzn.to') return 'amazon';
  if (host === 'mercadolivre.com.br' || host.endsWith('.mercadolivre.com.br') || host === 'meli.la') return 'mercado_livre';
  if (host === 'magazineluiza.com.br' || host.endsWith('.magazineluiza.com.br') || host === 'magalu.com') return 'magalu';
  if (host === 'aliexpress.com' || host.endsWith('.aliexpress.com')) return 'aliexpress';
  return host ? 'other' : 'unsupported';
}
