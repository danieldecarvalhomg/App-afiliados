import { GoogleGenAI } from '@google/genai';

const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

/**
 * Resolve o modelo no servidor, mantendo a chave da API fora do bundle do
 * browser. CTA/mídia podem usar CTA_MODEL; o pipeline de detecção usa
 * PROMOTION_AI_MODEL. GEMINI_MODEL continua sendo o fallback global.
 */
export const GEMINI_MODEL =
  process.env.CTA_MODEL?.trim() ||
  process.env.GEMINI_MODEL?.trim() ||
  DEFAULT_GEMINI_MODEL;
export const PROMOTION_GEMINI_MODEL =
  process.env.PROMOTION_AI_MODEL?.trim() ||
  process.env.GEMINI_MODEL?.trim() ||
  DEFAULT_GEMINI_MODEL;
export const GEMINI_HTTP_TIMEOUT_MS = 45_000;

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: GEMINI_HTTP_TIMEOUT_MS },
  });
}
