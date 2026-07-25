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

// Dynamic Fallback CTA Generator with Strict Personality Engine
function buildDynamicFallbackCta(params: any): string {
  const { tone = '', ctaInstructions = '', mustUseWords = '', forbiddenWords = '', forceUppercaseCta = false } = params;

  // Tone-specific Emojis & CTAs
  let emojis = ['🔥', '🚨', '⚡', '⚠️'];
  let ctaPool = [
    'CORRE ANTES QUE ACABE O ESTOQUE NO LINK:',
    'ÚLTIMAS UNIDADES NESSE PREÇO NO LINK ABAIXO:',
    'ALERTA DE PREÇO BAIXO! GARANTA O SEU NO LINK:',
    'ESTOQUE QUASE ESGOTADO! COMPRE NO LINK OFICIAL:'
  ];

  if (tone.includes('Amigável')) {
    emojis = ['🧡', '✨', '🥰', '🎁'];
    ctaPool = [
      'OBA GEEENTE! OLHA ESSE ACHADINHO SENSACIONAL NO LINK:',
      'GALERA, DICA DA HORA PRA VOCÊS! RESGATE NO LINK ABAIXO:',
      'ACHADINHO INCRÍVEL DEMAIS! COMPRE NO LINK OFICIAL:',
      'CORRE PRA GARANTIR O SEU COM DESCONTO NO LINK:'
    ];
  } else if (tone.includes('Direto')) {
    emojis = ['💰', '🛒', '👉', '🎯'];
    ctaPool = [
      'PREÇO DE CUSTO! COMPRE AGORA ACESSANDO O LINK:',
      'DESCONTO EXCLUSIVO APLICADO! GARANTA NO LINK:',
      'MENOR PREÇO GARANTIDO DO DIA NO LINK ABAIXO:',
      'CLIQUE AQUI E COMPRE PELO MENOR PREÇO NO LINK:'
    ];
  } else if (tone.includes('Consultivo')) {
    emojis = ['⭐', '🛡️', '💎', '📌'];
    ctaPool = [
      'REVIEW TECH: EXCELENTE CUSTO-BENEFÍCIO NO LINK:',
      'PRODUTO COM GARANTIA E MELHOR PREÇO NO LINK ABAIXO:',
      'QUALIDADE COMPROVADA! GARANTA O SEU NO LINK:',
      'VALE CADA CENTAVO! CONFIRA A OFERTA NO LINK:'
    ];
  } else if (tone.includes('Divertido')) {
    emojis = ['🔥', '🎉', '🤪', '🚀'];
    ctaPool = [
      'PREÇO TÃO BAIXO QUE PARECE MEME! CORRE NO LINK:',
      'SURREAL DE BARATO! GARANTA O SEU ANTES QUE SUMA NO LINK:',
      'FOCO NO DESCONTÃO! COMPRE AGORA MESMO NO LINK ABAIXO:',
      'CHORA CONCORRÊNCIA! OFERTAÇO DISPONÍVEL NO LINK:'
    ];
  }

  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  let pickedCta = ctaPool[Math.floor(Math.random() * ctaPool.length)];

  // If custom ctaInstructions were typed and are not default, combine with tone
  const isDefaultInst = ctaInstructions === 'Crie uma CTA atrativa com emojis e foco no link de afiliado oficial';
  if (ctaInstructions && ctaInstructions.trim().length > 0 && !isDefaultInst) {
    let cleanInst = ctaInstructions.trim();
    if (!cleanInst.toLowerCase().includes('link')) {
      cleanInst = `${cleanInst} no link abaixo:`;
    }
    pickedCta = `${cleanInst}`;
  }

  // Inject mustUseWords if specified
  if (mustUseWords && mustUseWords.trim().length > 0) {
    const wordList = mustUseWords.split(',').map((w: string) => w.trim()).filter(Boolean);
    if (wordList.length > 0) {
      const extraWord = wordList[Math.floor(Math.random() * wordList.length)];
      if (!pickedCta.toLowerCase().includes(extraWord.toLowerCase())) {
        pickedCta = `${extraWord.toUpperCase()}! ${pickedCta}`;
      }
    }
  }

  let fullResult = `${randomEmoji} ${pickedCta}`;

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

    const isDefaultInst = !ctaInstructions || ctaInstructions === 'Crie uma CTA atrativa com emojis e foco no link de afiliado oficial';

    const prompt = `Você é um Copywriter Especialista em Marketing de Afiliados no Brasil.
Sua ÚNICA TAREFA é sintetizar uma Chamada para Ação (CTA) curta (1 linha) para Telegram/WhatsApp.

PERSONALIDADE & TOM DE VOZ SELECIONADO PELO USUÁRIO (OBRIGATÓRIO ADOTAR ESTE ESTILO DE ESCRITA):
- ${tone || "Amigável & Descontraído"}

${!isDefaultInst ? `INSTRUÇÕES ADICIONAIS DO USUÁRIO PARA A CTA: "${ctaInstructions}"` : ""}
PALAVRAS OBRIGATÓRIAS A INCLUIR: ${mustUseWords || "Nenhuma"}
PALAVRAS PROIBIDAS (NÃO USAR): ${forbiddenWords || "Nenhuma"}

DIRETRIZES RIGOROSAS:
1. A CTA DEVE refletir 100% a personalidade selecionada (${tone}).
2. Se a personalidade for "Urgente", use tom de alerta e estoque baixo (ex: "🚨 CORRE ANTES QUE ACABE O ESTOQUE!").
3. Se a personalidade for "Amigável", use tom afetuoso (ex: "🧡 OBA GEEENTE! OLHA ESSE ACHADINHO!").
4. Se a personalidade for "Direto", seja objetivo e focado no preço (ex: "💰 PREÇO DE CUSTO! COMPRE NO LINK:").
5. Se a personalidade for "Consultivo", use tom técnico/review (ex: "⭐ CUSTO-BENEFÍCIO COMPROVADO NO LINK:").
6. Se a personalidade for "Divertido", use humor e memes (ex: "🔥 PREÇO TÃO BAIXO QUE PARECE MEME!").
7. Escreva APENAS 1 linha de CTA (máximo 15 palavras) terminando com indicação para o link (ex: "no link:" ou "no link abaixo:").
${forceUppercaseCta ? "8. OBRIGATÓRIO: A CTA DEVE ESTAR TOTALMENTE EM CAIXA ALTA (LETRAS MAIÚSCULAS)." : ""}
9. Responda APENAS com o texto final da CTA, sem aspas nem explicações adicionais.`;

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
