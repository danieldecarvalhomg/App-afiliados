import { ThinkingLevel, type GoogleGenAI } from '@google/genai';
import { AIProviderError, type AIProvider, type AIProviderResult, type PromotionAIInput } from '../../domain/ai/AIProvider';
import { createGeminiClient, GEMINI_MODEL } from './geminiConfig';

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isPromotion','confidence','productName','price','originalPrice','coupon','freeShipping','marketplace','primaryProductLink','couponLinks'],
  properties: {
    isPromotion: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    productName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    price: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    originalPrice: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    coupon: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object', additionalProperties: false, required: ['code','description'],
          properties: {
            code: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
      ],
    },
    freeShipping: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
    marketplace: { type: 'string', enum: ['shopee','amazon','mercado_livre','magalu','aliexpress','other','unknown'] },
    primaryProductLink: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    couponLinks: { type: 'array', items: { type: 'string' } },
  },
} as const;

const SYSTEM_INSTRUCTION = `Analise mensagens de grupos comerciais e classifique se representam uma promoção ou oferta.
Extraia somente dados explicitamente presentes ou inequivocamente deriváveis. Nunca invente produto, preço, preço anterior, cupom, frete ou marketplace. Use null quando ausente ou ambíguo.
Mensagens comuns, agradecimentos, dúvidas, pedidos recebidos e promoções encerradas não são promoção.
Exemplos: "Echo Dot por R$ 249" é promoção; "Cupom CASA20 20% OFF" é promoção; "Bom dia pessoal" não é promoção; "A promoção acabou" não é promoção.
Quando houver múltiplas URLs, interprete o texto ao redor de cada uma. primaryProductLink deve ser a URL que leva ao produto/oferta anunciada, associada a expressões como "compre aqui", e nunca uma página de resgate ou central de cupons. couponLinks deve conter somente URLs usadas para obter/resgatar cupons. Copie as URLs exatamente da lista recebida; use null e [] quando não for possível distinguir.
Retorne somente a estrutura solicitada.`;

function providerError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;
  const row = error as { status?: number; code?: string | number; message?: string };
  const status = Number(row?.status ?? row?.code);
  const message = row?.message ?? 'Falha ao consultar o Gemini.';
  if (message.includes('PROMOTION_AI_TIMEOUT')) return new AIProviderError('AI_TIMEOUT', true, 'Tempo limite do provider excedido.');
  if (status === 429) return new AIProviderError('AI_RATE_LIMITED', true, 'Limite temporário do provider atingido.');
  if (status === 404) return new AIProviderError('AI_MODEL_NOT_AVAILABLE', false, 'O modelo configurado não está disponível.');
  if (status >= 500 || /network|fetch|unavailable|ECONN/iu.test(message)) return new AIProviderError('AI_UNAVAILABLE', true, 'Provider temporariamente indisponível.');
  return new AIProviderError('AI_PROVIDER_ERROR', false, message);
}

export class GeminiProvider implements AIProvider {
  private readonly client: GoogleGenAI;
  readonly providerName = 'gemini';

  constructor(apiKey: string, readonly model = GEMINI_MODEL) {
    this.client = createGeminiClient(apiKey);
  }

  async analyzePromotion(input: PromotionAIInput): Promise<AIProviderResult> {
    const started = Date.now();
    let timeout: NodeJS.Timeout | undefined;
    const prompt = `${SYSTEM_INSTRUCTION}\n\nMensagem:\n${input.text}\n\nURLs preservadas:\n${JSON.stringify(input.links)}\nValores monetários normalizados encontrados pelo código: ${JSON.stringify(input.normalizedMoneyCandidates)}\nMarketplace pelo domínio: ${input.deterministicMarketplace ?? 'não determinado'}`;
    try {
      const response = await Promise.race([
        this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            temperature: 0.1,
            maxOutputTokens: 768,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            responseMimeType: 'application/json',
            responseJsonSchema: RESPONSE_SCHEMA,
          },
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('PROMOTION_AI_TIMEOUT')), 45_000);
        }),
      ]);
      const text = response.text?.trim();
      if (!text) throw new AIProviderError('AI_EMPTY_RESPONSE', false, 'O provider retornou uma resposta vazia.');
      let output: unknown;
      try { output = JSON.parse(text); }
      catch { throw new AIProviderError('AI_INVALID_JSON', false, 'O provider retornou JSON inválido.'); }
      return {
        output,
        provider: this.providerName,
        model: this.model,
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
        processingMs: Date.now() - started,
      };
    } catch (error) { throw providerError(error); }
    finally { if (timeout) clearTimeout(timeout); }
  }
}
