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

// Smart Rule & Directive Interpreter Engine for CTAs
function buildDynamicFallbackCta(params: any): string {
  const { tone = '', ctaInstructions = '', mustUseWords = '', forbiddenWords = '', forceUppercaseCta = false } = params;

  const rawInst = (ctaInstructions || '').trim();
  const instLower = rawInst.toLowerCase();

  // 1. Emoji Selection & Position Interpreter
  let emojiPos: 'start' | 'end' = 'start';
  if (instLower.includes('no final') || instLower.includes('no fim') || instLower.includes('ao final') || instLower.includes('ao fim')) {
    emojiPos = 'end';
  }

  let selectedEmoji = '🔥';
  if (instLower.includes('raio') || instLower.includes('trovão')) selectedEmoji = '⚡';
  else if (instLower.includes('fogo') || instLower.includes('chama')) selectedEmoji = '🔥';
  else if (instLower.includes('sirene') || instLower.includes('alerta') || instLower.includes('urgente')) selectedEmoji = '🚨';
  else if (instLower.includes('coração') || instLower.includes('coracao') || instLower.includes('amor')) selectedEmoji = '🧡';
  else if (instLower.includes('presente') || instLower.includes('gift')) selectedEmoji = '🎁';
  else if (tone.includes('Amigável')) selectedEmoji = '🧡';
  else if (tone.includes('Direto')) selectedEmoji = '💰';
  else if (tone.includes('Consultivo')) selectedEmoji = '⭐';
  else if (tone.includes('Divertido')) selectedEmoji = '🚀';

  // 2. Topic & Intent Interpreter
  let phrase = '';

  // Check for explicit quotes like "10gg" or 'VIP20'
  const quoteMatches = rawInst.match(/['"“]([^'"”]+)['"”]/g);
  let extractedQuote = '';
  if (quoteMatches && quoteMatches.length > 0) {
    extractedQuote = quoteMatches[Math.floor(Math.random() * quoteMatches.length)].replace(/['"“]/g, '').trim();
  }

  if (extractedQuote && (instLower.includes('cupom') || instLower.includes('desconto') || instLower.includes('código'))) {
    phrase = `APLIQUE O CUPOM ${extractedQuote.toUpperCase()} E GARANTA SEU DESCONTO NO LINK OFICIAL:`;
  } else if (instLower.includes('cupom') || instLower.includes('desconto')) {
    phrase = `RESGATE SEU CUPOM DE DESCONTO EXCLUSIVO NO LINK ABAIXO:`;
  } else if (instLower.includes('frete') || instLower.includes('grátis') || instLower.includes('gratis')) {
    phrase = `GARANTA A SUA UNIDADE COM FRETE GRÁTIS NO LINK ABAIXO:`;
  } else if (instLower.includes('pix')) {
    phrase = `APROVEITE O DESCONTO EXCLUSIVO NO PIX ACESSANDO O LINK:`;
  } else if (instLower.includes('estoque') || instLower.includes('acabe') || instLower.includes('urgente')) {
    phrase = `CORRE ANTES QUE ACABE O ESTOQUE NO LINK ABAIXO:`;
  } else if (tone.includes('Amigável')) {
    phrase = `OBA GEEENTE! OLHA ESSE ACHADINHO SENSACIONAL NO LINK ABAIXO:`;
  } else if (tone.includes('Direto')) {
    phrase = `PREÇO DE CUSTO! COMPRE AGORA MESMO NO LINK OFICIAL:`;
  } else if (tone.includes('Consultivo')) {
    phrase = `REVIEW TECH: EXCELENTE CUSTO-BENEFÍCIO NO LINK ABAIXO:`;
  } else if (tone.includes('Divertido')) {
    phrase = `PREÇO TÃO BAIXO QUE PARECE MEME! COMPRE NO LINK ABAIXO:`;
  } else {
    phrase = `DESCONTO EXCLUSIVO LIBERADO! GARANTA O SEU NO LINK ABAIXO:`;
  }

  // 3. Assemble Emoji Position
  let fullCta = emojiPos === 'end' ? `${phrase} ${selectedEmoji}` : `${selectedEmoji} ${phrase}`;

  // 4. Inject Must-Use Words
  if (mustUseWords && mustUseWords.trim().length > 0) {
    const wordList = mustUseWords.split(',').map((w: string) => w.trim()).filter(Boolean);
    if (wordList.length > 0) {
      const extraWord = wordList[Math.floor(Math.random() * wordList.length)];
      if (!fullCta.toLowerCase().includes(extraWord.toLowerCase())) {
        fullCta = emojiPos === 'end' ? `${extraWord.toUpperCase()}! ${fullCta}` : `${selectedEmoji} ${extraWord.toUpperCase()}! ${phrase}`;
      }
    }
  }

  // 5. Filter Forbidden Words
  if (forbiddenWords && forbiddenWords.trim().length > 0) {
    const forbiddenList = forbiddenWords.split(',').map((w: string) => w.trim().toLowerCase()).filter(Boolean);
    forbiddenList.forEach((fw: string) => {
      if (fw) {
        const reg = new RegExp(fw, 'gi');
        fullCta = fullCta.replace(reg, '');
      }
    });
  }

  return forceUppercaseCta ? fullCta.toUpperCase() : fullCta;
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

    const cleanInst = (ctaInstructions || '').trim();

    const prompt = `Você é um Copywriter de Inteligência Artificial Especialista em Marketing de Afiliados no Brasil.

REGRAS CRÍTICAS DE INTERPRETAÇÃO DE COMANDOS:
O usuário forneceu instruções de estilo, regras ou formatação:
"${cleanInst || "Crie uma CTA atrativa com foco no link oficial"}"

DIRETRIZES DE INTERPRETAÇÃO:
1. INTERPRETE O SIGNIFICADO DAS REGRAS ACIMA. NÃO repita os comandos de instrução ("coloque emoji no final", "faça um texto", "diga que...").
2. Se o usuário pediu "emoji no final", COLOQUE O EMOJI NO FINAL DA FRASE GERADA.
3. Se o usuário pediu para mencionar um cupom ou código (ex: "10gg"), crie uma frase persuasiva citando o cupom 10gg.
4. Se o usuário pediu frete grátis, Pix ou urgência, CRIE UMA CTA ORIGINAL FOCADA NESSE BENEFÍCIO.

PARÂMETROS DE ESTILO:
- Tom de Voz / Personalidade: ${tone || "Amigável & Descontraído"}
- Palavras Obrigatórias: ${mustUseWords || "Nenhuma"}
- Palavras Proibidas: ${forbiddenWords || "Nenhuma"}

REQUISITOS DA SAÍDA:
- Escreva APENAS 1 frase de CTA (máximo 15 palavras) terminando com chamada para o link (ex: "no link:" ou "no link abaixo:").
${forceUppercaseCta ? "- OBRIGATÓRIO: ESCREVA A CTA TOTALMENTE EM CAIXA ALTA (LETRAS MAIÚSCULAS)." : ""}
- Responda APENAS com o texto final da CTA, sem aspas nem explicações adicionais.`;

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
