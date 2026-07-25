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
3. Respeite as palavras obrigatórias e evite estritamente as palavras proibidas pelo usuário.
4. Adicione a chamada para ação (CTA) personalizada no estilo solicitado.
5. Mantenha espaço reservado para [LINK_AFILIADO].
6. Crie também 3 hashtags estratégicas ao final.

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

// Dynamic Fallback CTA Generator
function buildDynamicFallbackCta(params: any): string {
  const { tone = '', ctaInstructions = '', mustUseWords = '', forbiddenWords = '', forceUppercaseCta = false } = params;

  const emojis = ['🔥', '🚨', '🧡', '⚡', '🎁', '✨', '🛍️', '👉', '🛒', '📢', '💎'];
  const e1 = emojis[Math.floor(Math.random() * emojis.length)];

  let intros = [
    'OBA GEEENTE! ACHADINHO SENSACIONAL NO AR',
    'CORRE GALERA! MENOR PREÇO DO ANO GARANTIDO',
    'DESCONTO EXCLUSIVO LIBERADO AGORA',
    'OFERTA IMPERDÍVEL DETECTADA COM SUCESSO',
    'ESTOQUE LIMITADO! GARANTA O SEU JÁ',
    'OPORTUNIDADE ÚNICA DISPONÍVEL NO LINK',
    'PREÇO SURREAL DE BARATO PRA VOCÊ'
  ];

  if (tone.includes('Amigável')) {
    intros = ['OBA GEEENTE! ACHADINHO SENSACIONAL', 'GALERA! OLHA ESSE DESCONTO INCRÍVEL', 'DICA DA HORA PRA VOCÊS'];
  } else if (tone.includes('Urgente')) {
    intros = ['CORRE ANTES QUE ACABE O ESTOQUE', 'ÚLTIMAS UNIDADES NESSE PREÇO', 'ALERTA DE PREÇO BAIXO DEMAIS'];
  } else if (tone.includes('Direto')) {
    intros = ['DESCONTO APLICADO NO LINK', 'MENOR PREÇO GARANTIDO DO DIA', 'COMPRE COM DESCONTO AQUI'];
  } else if (tone.includes('Divertido')) {
    intros = ['CORRE ANTES QUE O ESTOQUE SUMA', 'PREÇO TÃO BAIXO QUE PARECE MEME', 'ACHADINHO SURREAL DO DIA'];
  }

  const pickedIntro = intros[Math.floor(Math.random() * intros.length)];

  const endings = [
    'CLIQUE AQUI E GARANTA O SEU NO LINK:',
    'ACESSE AGORA NO LINK OFICIAL ABAIXO:',
    'RESGATE O SEU DESCONTO EXCLUSIVO NO LINK:',
    'GARANTA A SUA UNIDADE NO LINK ABAIXO:',
    'APROVEITE A PROMOÇÃO NO LINK OFICIAL:'
  ];
  const pickedEnding = endings[Math.floor(Math.random() * endings.length)];

  let customWords = '';
  if (mustUseWords && mustUseWords.trim().length > 0) {
    const wordList = mustUseWords.split(',').map((w: string) => w.trim()).filter(Boolean);
    if (wordList.length > 0) {
      customWords = wordList[Math.floor(Math.random() * wordList.length)];
    }
  }

  let resultCta = '';
  if (customWords) {
    resultCta = `${e1} ${customWords.toUpperCase()}! ${pickedEnding}`;
  } else if (ctaInstructions && ctaInstructions.trim().length > 0) {
    const cleanInst = ctaInstructions.replace(/[^\w\sà-úÀ-Ú]/gi, '').trim();
    const parts = cleanInst.split(/\s+/).filter(Boolean);
    const shortPhrase = parts.slice(0, 4).join(' ');
    resultCta = `${e1} ${shortPhrase.toUpperCase()}! ${pickedEnding}`;
  } else {
    resultCta = `${e1} ${pickedIntro}! ${pickedEnding}`;
  }

  if (forbiddenWords && forbiddenWords.trim().length > 0) {
    const forbiddenList = forbiddenWords.split(',').map((w: string) => w.trim().toLowerCase()).filter(Boolean);
    forbiddenList.forEach((fw: string) => {
      if (fw) {
        const reg = new RegExp(fw, 'gi');
        resultCta = resultCta.replace(reg, '');
      }
    });
  }

  return forceUppercaseCta ? resultCta.toUpperCase() : resultCta;
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

    const prompt = `Você é um Copywriter de elite em Marketing de Afiliados no Brasil.
Sintetize UMA NOVA E ÚNICA Chamada para Ação (CTA) em 1 linha curta e impactante para Telegram/WhatsApp.

Parâmetros de Treinamento:
- Personalidade/Tom de Voz: ${tone || "Amigável & Descontraído"}
- Instruções Específicas do Usuário para a CTA: "${ctaInstructions || "Crie uma CTA atrativa com emojis e foco no link oficial"}"
- Palavras/Expressões OBRIGATÓRIAS a incluir: ${mustUseWords || "Nenhuma"}
- Palavras/Expressões PROIBIDAS (NÃO USAR DE FORMA ALGUMA): ${forbiddenWords || "Nenhuma"}

Regras Estritas:
1. NUNCA repita a mesma CTA. Crie algo totalmente novo, dinâmico e variado.
2. Respeite fielmente as instruções fornecidas pelo usuário.
3. Mantenha em no máximo 12 a 15 palavras.
4. Deve terminar indicando o link (ex: "no link abaixo:" ou "no link:").
${forceUppercaseCta ? "5. OBRIGATÓRIO: A CTA DEVE ESTAR TOTALMENTE EM CAIXA ALTA / LETRAS MAIÚSCULAS." : ""}
6. Responda APENAS com o texto da CTA pronta, sem aspas nem explicações adicionais.`;

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
