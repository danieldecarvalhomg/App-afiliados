import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini lazily
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "AffiFlow AI SaaS Backend", timestamp: new Date().toISOString() });
});

// AI Copywriting & Offer Analyzer API
app.post("/api/ai/generate-copy", async (req, res) => {
  try {
    const {
      productName,
      price,
      originalPrice,
      couponCode,
      marketplace,
      tone,
      keyFeatures,
      destinationChannel,
      customTraining
    } = req.body;
    
    const ai = getGenAI();
    if (!ai) {
      const fallbackCopy = `🔥 *OFERTA ESPECIAL: ${productName || "Produto em Destaque"}* 🔥\n\n` +
        `De ~R$ ${originalPrice || "299,00"}~ por apenas *R$ ${price || "149,90"}*!\n` +
        (couponCode ? `🎟️ Cupom Exclusivo: *${couponCode}*\n` : "") +
        `🛒 Garanta o seu antes que acabe o estoque!\n\n` +
        `👇 *Clique para Comprar no ${marketplace || "Marketplace"}:*\n[LINK_AFILIADO_AQUI]`;
      return res.json({ copy: fallbackCopy, source: "template_fallback" });
    }

    let customPromptSection = "";
    if (customTraining) {
      let ctaText = customTraining.preferredCta || "";
      if (customTraining.forceUppercaseCta && ctaText) {
        ctaText = ctaText.toUpperCase();
      }

      customPromptSection = `
INSTRUÇÕES E DIRETRIZES LIVRES DO USUÁRIO:
- Instruções de Comando para a IA: "${customTraining.ctaInstructions || "Sem instruções específicas, crie uma cópia super persuasiva."}"
${ctaText ? `- Estilo / Texto de CTA Preferido: ${ctaText}` : ""}
`;
    }

    const prompt = `Você é um Copywriter Especialista em Marketing de Afiliados no Brasil com capacidade ilimitada de adaptação.
Crie uma cópia altamente persuasiva e 100% personalizada para publicar no ${destinationChannel || "Telegram e WhatsApp"}.

Informações da Oferta:
- Produto: ${productName || "Oferta Especial"}
- Preço Atual: R$ ${price || "0,00"}
- Preço Original: R$ ${originalPrice || "0,00"}
- Cupom: ${couponCode || "Não informado"}
- Marketplace: ${marketplace || "Amazon / Shopee / Mercado Livre"}
- Tom de Voz: ${tone || "Urgente e Atrativo com Emojis"}
- Detalhes/Destaques: ${keyFeatures || "Melhor custo-benefício do mercado!"}
${customPromptSection}

DIRETRIZES DE DESTRAVAMENTO E LIBERDADE DA IA:
1. ADAPTAÇÃO TOTAL AO ESTILO DO USUÁRIO: Siga 100% o tom de voz, estilo, bordões, instruções de CTA e regras de formatação especificadas pelo usuário.
2. SEM LIMITES RÍGIDOS DE TAMANHO: Crie uma cópia fluida, persuasiva e completa na extensão ideal (curta, média ou longa) de acordo com o pedido do usuário.
3. ESTILIZAÇÃO PARA REDES: Use formatação legível para Telegram e WhatsApp (negrito com *, tachado com ~).
4. EMOJIS E FORMATAÇÃO: Aplique emojis de forma estratégica e alinhada ao tom de voz.
5. RESPEITO A REGRAS: Aplique rigorosamente as palavras obrigatórias e NUNCA utilize as palavras proibidas.
6. LINK AFILIADO: Mantenha espaço reservado para [LINK_AFILIADO].

Responda APENAS com a cópia final pronta para disparo.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 1.0,
        topP: 0.95
      }
    });

    const generatedText = response.text || "Erro ao gerar cópia.";
    return res.json({ copy: generatedText, source: "gemini-2.5-flash" });
  } catch (error: any) {
    console.error("Erro na rota /api/ai/generate-copy:", error);
    return res.status(500).json({ error: error.message || "Falha na geração de cópia com IA" });
  }
});

// Fully Unlocked Dynamic Fallback CTA Generator & NLP Interpreter Engine
function buildDynamicFallbackCta(params: any): string {
  const { tone = '', ctaInstructions = '', mustUseWords = '', forbiddenWords = '', forceUppercaseCta = false } = params;

  const rawInst = (ctaInstructions || '').trim();
  const instLower = rawInst.toLowerCase();

  // 1. Detect Requested Length Intent (Long vs Short vs Medium)
  const isLong = instLower.includes('longa') || instLower.includes('longo') || instLower.includes('extensa') || instLower.includes('detalhada') || instLower.includes('grande') || instLower.includes('completa');
  const isShort = instLower.includes('curta') || instLower.includes('curto') || instLower.includes('direta') || instLower.includes('objetiva');

  // 2. Detect Requested Mood / Energy Intent (Animated, Urgent, Persuasive, Friendly, Funny)
  const isAnimated = instLower.includes('animad') || instLower.includes('empolgad') || instLower.includes('alegre') || instLower.includes('energia') || instLower.includes('entusiasm');
  const isPersuasive = instLower.includes('convenç') || instLower.includes('convenc') || instLower.includes('persuasiv') || instLower.includes('vender') || instLower.includes('comprar');

  // 3. Emoji Position & Type Rules
  let emojiPos: 'start' | 'end' | 'both' = 'start';
  if (instLower.includes('no final') || instLower.includes('no fim') || instLower.includes('ao final') || instLower.includes('ao fim')) {
    emojiPos = 'end';
  } else if (isAnimated || isLong) {
    emojiPos = 'both';
  }

  let selectedEmoji = '🔥';
  if (isAnimated) selectedEmoji = '🎉';
  else if (instLower.includes('raio') || instLower.includes('trovão')) selectedEmoji = '⚡';
  else if (instLower.includes('sirene') || instLower.includes('alerta') || instLower.includes('urgente')) selectedEmoji = '🚨';
  else if (instLower.includes('coração') || instLower.includes('coracao')) selectedEmoji = '🧡';
  else if (tone.includes('Amigável')) selectedEmoji = '🧡';
  else if (tone.includes('Direto')) selectedEmoji = '💰';

  // 4. Topic & Phrase Synthesis
  let phrase = '';

  // Extract quotes e.g. "10gg"
  const quoteMatches = rawInst.match(/['"“]([^'"”]+)['"”]/g);
  let extractedQuote = '';
  if (quoteMatches && quoteMatches.length > 0) {
    extractedQuote = quoteMatches[Math.floor(Math.random() * quoteMatches.length)].replace(/['"“]/g, '').trim();
  }

  if (isLong) {
    if (extractedQuote) {
      phrase = `OBAAA GEEENTE! ESSA É A SUA OPORTUNIDADE DE OURO PRA COMPRAR COM DESCONTO SURREAL! APLIQUE O CUPOM EXCLUSIVO "${extractedQuote.toUpperCase()}", GARANTA SEU DESCONTO E APROVEITE O MENOR PREÇO DO ANO. NÃO DEIXE PRA DEPOIS, CLIQUE AGORA MESMO E RESGATE NO LINK OFICIAL ABAIXO:`;
    } else if (isAnimated || isPersuasive) {
      phrase = `🎉 OBAAA GEEENTE! ESSA É A SUA CHANCE ÚNICA PRA GARANTIR O PRODUTO DOS SEUS SONHOS COM UM DESCONTO SIMPLESMENTE SURREAL! QUALIDADE COMPROVADA, ESTOQUE SUPER LIMITADO E MENOR PREÇO DO ANO GARANTIDO. NÃO PERCA TEMPO, CLIQUE AGORA MESMO E GARANTA O SEU NO LINK OFICIAL ABAIXO:`;
    } else if (instLower.includes('frete')) {
      phrase = `OFERTA ESPECIAL LIBERADA COM FRETE GRÁTIS PARA TODO O BRASIL! GARANTA A SUA UNIDADE COM PREÇO PROMOCIONAL DE CUSTO E RECEBA NO CONFORTO DA SUA CASA. ACESSE AGORA O LINK OFICIAL ABAIXO:`;
    } else {
      phrase = `ATENÇÃO GALERA! SE VOCÊ ESTAVA ESPERANDO O MOMENTO CERTO PRA COMPRAR, A HORA É AGORA! OPORTUNIDADE IMPERDÍVEL COM DESCONTO EXCLUSIVO LIBERADO POR TEMPO LIMITADO. CLIQUE NO LINK ABAIXO E GARANTA JÁ O SEU:`;
    }
  } else if (isShort) {
    phrase = extractedQuote ? `USE O CUPOM ${extractedQuote.toUpperCase()} E COMPRE NO LINK:` : `PREÇO DE CUSTO! COMPRE AGORA NO LINK ABAIXO:`;
  } else {
    // Medium length dynamic phrase
    if (extractedQuote) {
      phrase = `APLIQUE O CUPOM EXCLUSIVO "${extractedQuote.toUpperCase()}" E GARANTA MAIOR DESCONTO NO LINK OFICIAL:`;
    } else if (instLower.includes('cupom') || instLower.includes('desconto')) {
      phrase = `RESGATE SEU CUPOM DE DESCONTO EXCLUSIVO E GARANTA O MENOR PREÇO NO LINK ABAIXO:`;
    } else if (instLower.includes('frete')) {
      phrase = `GARANTA A SUA UNIDADE COM FRETE GRÁTIS DISPONÍVEL NO LINK ABAIXO:`;
    } else if (instLower.includes('pix')) {
      phrase = `APROVEITE O DESCONTO EXCLUSIVO NO PIX ACESSANDO O LINK ABAIXO:`;
    } else if (instLower.includes('estoque') || instLower.includes('urgente')) {
      phrase = `CORRE ANTES QUE ACABE O ESTOQUE! GARANTA A SUA UNIDADE NO LINK ABAIXO:`;
    } else if (tone.includes('Amigável')) {
      phrase = `OBA GEEENTE! OLHA ESSE ACHADINHO SENSACIONAL QUE SEPARAI NO LINK ABAIXO:`;
    } else {
      phrase = `DESCONTO EXCLUSIVO LIBERADO! GARANTA O SEU AGORA MESMO NO LINK ABAIXO:`;
    }
  }

  // 5. Assemble Emoji Position
  let fullCta = '';
  if (emojiPos === 'end') fullCta = `${phrase} ${selectedEmoji}`;
  else if (emojiPos === 'both') fullCta = `${selectedEmoji} ${phrase} 🔥🚀`;
  else fullCta = `${selectedEmoji} ${phrase}`;

  // 6. Inject Must-Use Words
  if (mustUseWords && mustUseWords.trim().length > 0) {
    const wordList = mustUseWords.split(',').map((w: string) => w.trim()).filter(Boolean);
    if (wordList.length > 0) {
      const extraWord = wordList[Math.floor(Math.random() * wordList.length)];
      if (!fullCta.toLowerCase().includes(extraWord.toLowerCase())) {
        fullCta = `${extraWord.toUpperCase()}! ${fullCta}`;
      }
    }
  }

  // 7. Filter Forbidden Words
  if (forbiddenWords && forbiddenWords.trim().length > 0) {
    const forbiddenList = forbiddenWords.split(',').map((w: string) => w.trim()).filter(Boolean);
    forbiddenList.forEach((fw: string) => {
      if (fw) {
        const reg = new RegExp(fw, 'gi');
        fullCta = fullCta.replace(reg, '');
      }
    });
  }

  return forceUppercaseCta ? fullCta.toUpperCase() : fullCta;
}

// AI Dynamic CTA Generator API (Fully Unlocked & Highly Creative)
app.post("/api/ai/generate-cta", async (req, res) => {
  try {
    const { tone, ctaInstructions, mustUseWords, forbiddenWords, forceUppercaseCta } = req.body;

    const ai = getGenAI();
    if (!ai) {
      const fallbackCta = buildDynamicFallbackCta(req.body);
      return res.json({ cta: fallbackCta });
    }

    const cleanInst = (ctaInstructions || '').trim();

    const prompt = `Você é um Copywriter Especialista em Marketing de Afiliados no Brasil com capacidade de adaptação total ao pedido do usuário.

INSTRUÇÕES E DIRETRIZES DO USUÁRIO PARA A CHAMADA PARA AÇÃO (CTA):
"${cleanInst || "Crie uma chamada altamente persuasiva com foco na conversão e no link de afiliado"}"

SUA TAREFA:
Interprete com máxima profundidade o que o usuário deseja e crie a CTA PERFEITA para Telegram/WhatsApp.

REGRAS DE ADAPTAÇÃO TOTAL:
1. COMPRIMENTO E ESTRUTURA: Se o usuário pedir uma chamada LONGA, crie um texto mais extenso, persuasivo e detalhado (2 a 4 linhas). Se pedir CURTA, seja direto. Se não especificar, crie uma frase forte de 1 a 2 linhas.
2. TOM E EMOÇÃO: Adapte 100% o tom ao pedido do usuário (animado, urgente, amigável, refinado, divertido, persuasivo).
3. REGRAS DE FORMATO E EMOJIS: Se o usuário pediu emojis no final, coloque no final. Se pediu emojis festivos ou de fogo, use-os.
4. OBJETIVO DE CONVERSÃO: O texto deve sempre conduzir a pessoa a clicar no link oficial/afiliado.

PARÂMETROS DE ESTILO:
- Tom de Voz Base: ${tone || "Amigável & Descontraído"}
- Palavras Obrigatórias: ${mustUseWords || "Nenhuma"}
- Palavras Proibidas (A EVITAR ESTRITAMENTE): ${forbiddenWords || "Nenhuma"}

${forceUppercaseCta ? "- EXIGÊNCIA OBRIGATÓRIA: ESCREVA O TEXTO TOTALMENTE EM CAIXA ALTA (LETRAS MAIÚSCULAS)." : ""}

Responda APENAS com o texto da CTA pronta para uso (sem aspas, sem explicações).`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 1.0,
        topP: 0.95
      }
    });

    let generatedText = (response.text || "").trim().replace(/^["']|["']$/g, '');
    if (forceUppercaseCta) {
      generatedText = generatedText.toUpperCase();
    }

    return res.json({ cta: generatedText });
  } catch (error: any) {
    console.error("Erro na rota /api/ai/generate-cta:", error);
    const fallbackCta = buildDynamicFallbackCta(req.body);
    return res.json({ cta: fallbackCta });
  }
});

// AI Link Converter / Title Auto-Extractor API
app.post("/api/ai/extract-offer", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL é obrigatória" });
    }

    const ai = getGenAI();
    if (!ai) {
      // Mock extracted offer
      return res.json({
        productName: "Smartphone Galaxy S23 128GB 5G",
        price: 2799.00,
        originalPrice: 3499.00,
        discountPercent: 20,
        marketplace: url.includes("shopee") ? "Shopee" : url.includes("mercadolivre") ? "Mercado Livre" : "Amazon",
        category: "Eletrônicos",
        suggestedCoupon: "TECH10OFF",
        rating: 4.8,
        reviewsCount: 1420,
      });
    }

    const prompt = `Analise este link/URL de produto de marketplace de afiliados (${url}) e deduza/estimule as informações do produto em formato JSON estruturado:
{
  "productName": "Nome descritivo e atrativo do produto",
  "price": 199.90,
  "originalPrice": 299.90,
  "discountPercent": 33,
  "marketplace": "Amazon / Shopee / Mercado Livre / AliExpress / Magalu",
  "category": "Eletrônicos / Moda / Casa / Beleza",
  "suggestedCoupon": "CUPOM10",
  "rating": 4.7,
  "reviewsCount": 850
}
Retorne APENAS o JSON válido sem nenhum bloco de markdown ao redor.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let rawText = response.text || "{}";
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(rawText);

    return res.json(data);
  } catch (error: any) {
    console.error("Erro ao extrair oferta:", error);
    // Fallback on parse failure
    return res.json({
      productName: "Produto Automático Afiliado",
      price: 149.90,
      originalPrice: 199.90,
      discountPercent: 25,
      marketplace: "Amazon BR",
      category: "Destaques",
      suggestedCoupon: "",
      rating: 4.5,
      reviewsCount: 120
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[AffiFlow AI] Servidor rodando com sucesso em http://0.0.0.0:${PORT}`);
  });
}

startServer();
