import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AffiliateProviderCredentials } from '../../domain/affiliate/types';

interface Envelope extends Record<string, unknown> { v: 1; iv: string; tag: string; data: string; }
function key(): Buffer {
  const raw = process.env.AFFILIATE_CREDENTIALS_ENCRYPTION_KEY ?? '';
  const decoded = /^[a-f\d]{64}$/iu.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (decoded.length !== 32) throw new Error('AFFILIATE_ENCRYPTION_NOT_CONFIGURED');
  return decoded;
}
export function affiliateEncryptionConfigured(): boolean { try { key(); return true; } catch { return false; } }
export function encryptAffiliateCredentials(value: AffiliateProviderCredentials): Envelope {
  return encryptAffiliatePayload(value);
}
export function encryptAffiliatePayload(value: unknown): Envelope {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}
export function decryptAffiliateCredentials(value: unknown): AffiliateProviderCredentials {
  const parsed = decryptAffiliatePayload(value) as AffiliateProviderCredentials;
  if (!parsed.appId || !parsed.secret || (parsed.partnerTag != null && typeof parsed.partnerTag !== 'string')
    || (parsed.accessToken != null && typeof parsed.accessToken !== 'string')
    || (parsed.refreshToken != null && typeof parsed.refreshToken !== 'string')) throw new Error('AFFILIATE_CREDENTIALS_INVALID');
  return parsed;
}
export function decryptAffiliatePayload(value: unknown): unknown {
  const row = value as Envelope;
  if (!row || row.v !== 1 || !row.iv || !row.tag || !row.data) throw new Error('AFFILIATE_CREDENTIALS_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(row.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
  const decoded = Buffer.concat([decipher.update(Buffer.from(row.data, 'base64')), decipher.final()]);
  return JSON.parse(decoded.toString('utf8'));
}
