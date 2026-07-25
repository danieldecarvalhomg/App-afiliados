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
      let activeTone = customTraining.tone || tone || "Personalizado";
      if (Array.isArray(customTraining.tones) && customTraining.tones.length > 0) {
        activeTone = customTraining.tones[Math.floor(Math.random() * customTraining.tones.length)];
      }

      let ctaText = customTraining.preferredCta || "Padrão";
      if (customTraining.forceUppercaseCta && ctaText) {
        ctaText = ctaText.toUpperCase();
      }

      customPromptSection = `
INSTRUÇÕES ESPECÍFICAS DE TREINAMENTO E ESTILO DO USUÁRIO:
- Tom de Voz Aplicado: ${activeTone}
- Instruções Específicas do Usuário para a CTA / Chamada: "${customTraining.ctaInstructions || "Sem instruções específicas"}"
- Palavras/Expressões OBRIGATÓRIAS a utilizar: ${customTraining.mustUseWords || "Nenhuma"}
- Palavras/Expressões PROIBIDAS (NÃO UTILIZAR DE FORMA ALGUMA): ${customTraining.forbiddenWords || "Nenhuma"}
- Estilo da Chamada para Ação (CTA): ${ctaText} ${customTraining.forceUppercaseCta ? "(ATENÇÃO: A CTA DEVE ESTAR TOTALMENTE EM CAIXA ALTA / LETRAS MAIÚSCULAS)" : ""}
- Exemplo do Estilo Pessoal do Usuário para ESPELHAR EXATAMENTE:
"""
${customTraining.exampleCopy || "Nenhum exemplo fornecido."}
"""
`;
    }

    const prompt = `Você é um Copywriter Especialista em Marketing de Afiliados no Brasil.
Crie uma cópia altamente persuasiva para publicar no ${destinationChannel || "Telegram e WhatsApp"}.

Informações da Oferta:
- Produto: ${productName || "Oferta Especial"}
- Preço Atual: R$ ${price || "0,00"}
- Preço Original: R$ ${originalPrice || "0,00"}
- Cupom: ${couponCode || "Não informado"}
- Marketplace: ${marketplace || "Amazon / Shopee / Mercado Livre"}
- Tom de Voz: ${tone || "Urgente e Atrativo com Emojis"}
- Detalhes/Destaques: ${keyFeatures || "Melhor custo-benefício do mercado!"}
${customPromptSection}

Requisitos da Cópia:
1. Use formatação legível para Telegram e WhatsApp (negrito com *, tachado com ~).
2. Inclua emojis relevantes e atraentes sem poluir excessivamente.
3. Obedeça rigorosamente às Instruções Específicas do Usuário para a CTA e ao tom de voz.
4. Respeite as palavras obrigatórias e evite estritamente as palavras proibidas pelo usuário.
5. Adicione a chamada para ação (CTA) personalizada no estilo solicitado.
6. Mantenha espaço reservado para [LINK_AFILIADO].
7. Crie também 3 hashtags estratégicas ao final.

Responda APENAS com a cópia final pronta para disparo.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const generatedText = response.text || "Erro ao gerar cópia.";
    return res.json({ copy: generatedText, source: "gemini-2.5-flash" });
  } catch (error: any) {
    console.error("Erro na rota /api/ai/generate-copy:", error);
    return res.status(500).json({ error: error.message || "Falha na geração de cópia com IA" });
  }
});

// Dynamic Fallback CTA Generator with NLP Intent Parser
function buildDynamicFallbackCta(params: any): string {
  const { tone = '', ctaInstructions = '', mustUseWords = '', forbiddenWords = '', forceUppercaseCta = false } = params;

  const emojis = ['🔥', '🚨', '🧡', '⚡', '🎁', '✨', '🛍️', '👉', '🛒', '📢', '💎', '🚀'];
  const e1 = emojis[Math.floor(Math.random() * emojis.length)];

  let generatedPhrase = '';
  const textLower = (ctaInstructions + ' ' + tone + ' ' + mustUseWords).toLowerCase();

  // Extract explicit quotes if user typed e.g. "Corre gente!" or 'Garantia VIP'
  const quotesMatch = ctaInstructions.match(/['"“]([^'"”]+)['"”]/g);
  let extractedQuote = '';
  if (quotesMatch && quotesMatch.length > 0) {
    extractedQuote = quotesMatch[Math.floor(Math.random() * quotesMatch.length)].replace(/['"“]/g, '').trim();
  }

  if (extractedQuote) {
    generatedPhrase = `${extractedQuote.toUpperCase()}! GARANTA O SEU NO LINK`;
  } else if (textLower.includes('frete') || textLower.includes('grátis') || textLower.includes('gratis')) {
    const freteCtas = [
      'APROVEITE O FRETE GRÁTIS E COMPRE NO LINK:',
      'GARANTA COM FRETE GRÁTIS DISPONÍVEL NO LINK:',
      'COMPRE AGORA COM FRETE GRÁTIS NO LINK ABAIXO:'
    ];
    generatedPhrase = freteCtas[Math.floor(Math.random() * freteCtas.length)];
  } else if (textLower.includes('cupom') || textLower.includes('desconto')) {
    const cupomCtas = [
      'RESGATE SEU CUPOM DE DESCONTO EXCLUSIVO NO LINK:',
      'USE O CUPOM E COMPRE COM MAIOR DESCONTO NO LINK:',
      'APLIQUE O DESCONTO E GARANTA O SEU NO LINK ABAIXO:'
    ];
    generatedPhrase = cupomCtas[Math.floor(Math.random() * cupomCtas.length)];
  } else if (textLower.includes('estoque') || textLower.includes('acabe') || textLower.includes('urgente')) {
    const urgenteCtas = [
      'CORRE ANTES QUE ACABE O ESTOQUE NO LINK:',
      'ÚLTIMAS UNIDADES NESSE PREÇO NO LINK ABAIXO:',
      'GARANTA O SEU ANTES QUE ESGOTE NO LINK:'
    ];
    generatedPhrase = urgenteCtas[Math.floor(Math.random() * urgenteCtas.length)];
  } else if (textLower.includes('amigável') || textLower.includes('amigavel') || textLower.includes('gente')) {
    const amigavelCtas = [
      'OBA GEEENTE! CORRE PRA GARANTIR O SEU NO LINK:',
      'GALERA, OLHA ESSE ACHADINHO SENSACIONAL NO LINK:',
      'DICA DA HORA PRA VOCÊS! RESGATE NO LINK ABAIXO:'
    ];
    generatedPhrase = amigavelCtas[Math.floor(Math.random() * amigavelCtas.length)];
  } else if (textLower.includes('pix')) {
    const pixCtas = [
      'GARANTA MAIS DESCONTO NO PIX ACESSANDO O LINK:',
      'APROVEITE O DESCONTO EXCLUSIVO NO PIX NO LINK ABAIXO:'
    ];
    generatedPhrase = pixCtas[Math.floor(Math.random() * pixCtas.length)];
  } else if (ctaInstructions && ctaInstructions.trim().length > 0) {
    // Transform user's instructions into the main CTA text
    let cleanText = ctaInstructions.trim();
    if (!cleanText.toLowerCase().includes('link')) {
      cleanText = `${cleanText} no link abaixo:`;
    }
    generatedPhrase = cleanText;
  } else {
    const generalCtas = [
      'CORRE GALERA! COMPRE COM MAIOR DESCONTO NO LINK:',
      'RESGATE O SEU DESCONTO EXCLUSIVO ACESSANDO O LINK:',
      'GARANTA A SUA UNIDADE COM PREÇO ESPECIAL NO LINK:',
      'CLIQUE AQUI E COMPRE COM MELHOR PREÇO DO ANO NO LINK:'
    ];
    generatedPhrase = generalCtas[Math.floor(Math.random() * generalCtas.length)];
  }

  // Inject mustUseWords if specified
  if (mustUseWords && mustUseWords.trim().length > 0) {
    const wordList = mustUseWords.split(',').map((w: string) => w.trim()).filter(Boolean);
    if (wordList.length > 0) {
      const extraWord = wordList[Math.floor(Math.random() * wordList.length)];
      if (!generatedPhrase.toLowerCase().includes(extraWord.toLowerCase())) {
        generatedPhrase = `${extraWord.toUpperCase()}! ${generatedPhrase}`;
      }
    }
  }

  let fullResult = `${e1} ${generatedPhrase}`;

  // Filter forbiddenWords
  if (forbiddenWords && forbiddenWords.trim().length > 0) {
    const forbiddenList = forbiddenWords.split(',').map((w: string) => w.trim().toLowerCase()).filter(Boolean);
    forbiddenList.forEach((fw: string) => {
      if (fw) {
        const reg = new RegExp(fw, 'gi');
        fullResult = fullResult.replace(reg, '');
      }
    });
  }

  if (!fullResult.toLowerCase().includes('link')) {
    fullResult = `${fullResult.trim()} no link abaixo:`;
  }

  return forceUppercaseCta ? fullResult.toUpperCase() : fullResult;
}

// AI Dynamic CTA Generator API
app.post("/api/ai/generate-cta", async (req, res) => {
  try {
    const { tone, ctaInstructions, mustUseWords, forbiddenWords, forceUppercaseCta } = req.body;

    const ai = getGenAI();
    if (!ai) {
      const fallbackCta = buildDynamicFallbackCta(req.body);
      return res.json({ cta: fallbackCta });
    }

    const prompt = `Você é um Copywriter Especialista em Marketing de Afiliados no Brasil.
Sua ÚNICA TAREFA é transformar as INSTRUÇÕES DO USUÁRIO em uma Chamada para Ação (CTA) curta (1 linha) para Telegram/WhatsApp.

INSTRUÇÕES PRIMÁRIAS DO USUÁRIO (OBEDECER RIGOROSAMENTE ACIMA DE TUDO):
"${ctaInstructions || "Crie uma chamada persuasiva chamando para o link"}"

PARÂMETROS DE ESTILO:
- Tom de Voz / Personalidade: ${tone || "Descontraído"}
- Palavras OBRIGATÓRIAS a incluir: ${mustUseWords || "Nenhuma"}
- Palavras PROIBIDAS (NÃO USAR): ${forbiddenWords || "Nenhuma"}

REGRAS OBRIGATÓRIAS:
1. O texto da CTA DEVE refletir diretamente o pedido das Instruções Primárias do Usuário acima.
2. Escreva APENAS 1 linha de CTA (máximo 15 palavras) terminando com indicação para o link (ex: "no link:" ou "no link abaixo:").
3. NUNCA repita a mesma frase. Seja criativo e variado em cada chamada.
${forceUppercaseCta ? "4. OBRIGATÓRIO: A CTA DEVE ESTAR TOTALMENTE EM CAIXA ALTA (LETRAS MAIÚSCULAS)." : ""}
5. Responda APENAS com o texto da CTA final, sem aspas, explicações ou introduções.`;

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
