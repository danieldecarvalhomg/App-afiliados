import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function readKey(): Buffer {
  const value = process.env.WHATSAPP_SESSION_ENCRYPTION_KEY?.trim();
  if (!value) {
    throw new Error('WHATSAPP_SESSION_ENCRYPTION_KEY não configurada.');
  }
  const key = /^[a-f\d]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error('WHATSAPP_SESSION_ENCRYPTION_KEY deve conter exatamente 32 bytes (base64 ou hex).');
  }
  return key;
}

export function isSessionEncryptionConfigured(): boolean {
  try {
    readKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptProtectedPayload(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', readKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptProtectedPayload(payload: string): string {
  const [version, ivValue, tagValue, encryptedValue] = payload.split('.');
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Formato de sessão criptografada inválido.');
  }
  const decipher = createDecipheriv('aes-256-gcm', readKey(), Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export const encryptSession = encryptProtectedPayload;
export const decryptSession = decryptProtectedPayload;
