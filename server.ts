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

// Dynamic Fallback CTA Generator with Strict Directive Fulfiller
function buildDynamicFallbackCta(params: any): string {
  const { tone = '', ctaInstructions = '', mustUseWords = '', forbiddenWords = '', forceUppercaseCta = false } = params;

  let emojis = ['🔥', '🚨', '⚡', '🧡', '🎁', '✨', '🛍️', '👉', '🛒'];
  if (tone.includes('Amigável')) emojis = ['🧡', '✨', '🥰', '🎁'];
  else if (tone.includes('Direto')) emojis = ['💰', '🛒', '👉', '🎯'];
  else if (tone.includes('Consultivo')) emojis = ['⭐', '🛡️', '💎', '📌'];
  else if (tone.includes('Divertido')) emojis = ['🔥', '🎉', '🤪', '🚀'];
  else if (tone.includes('Urgente')) emojis = ['🚨', '⚠️', '⚡', '🔥'];

  const e1 = emojis[Math.floor(Math.random() * emojis.length)];
  let generatedCta = '';

  const isDefaultInst = !ctaInstructions || ctaInstructions === 'Crie uma CTA atrativa com emojis e foco no link de afiliado oficial';

  if (!isDefaultInst && ctaInstructions.trim().length > 0) {
    let text = ctaInstructions.trim();

    // Clean command prefixes (e.g. "escreva que...", "faça um texto...", "diga que...")
    text = text.replace(/^(escreva|faça|faca|crie|diga|avisa|avise|manda|peça|peca|quero|foca|foco|use)\s+(que|uma|um|em|para|sobre)?\s+/gi, '');
    text = text.replace(/^(um|uma|texto|chamada|cta|mensagem|post)\s+(para|sobre|com|de)?\s+/gi, '');

    // Capitalize first letter
    text = text.charAt(0).toUpperCase() + text.slice(1);

    // If text doesn't indicate link, append proper link CTA suffix
    if (!text.toLowerCase().includes('link')) {
      const suffixes = [
        'GARANTA O SEU NO LINK ABAIXO:',
        'COMPRE AGORA MESMO NO LINK:',
        'ACESSE A OFERTA NO LINK OFICIAL:',
        'RESGATE O SEU NO LINK ABAIXO:'
      ];
      const suff = suffixes[Math.floor(Math.random() * suffixes.length)];
      text = `${text}! ${suff}`;
    }

    generatedCta = `${e1} ${text}`;
  } else {
    // Tone fallback pool
    let pool = [
      'CORRE ANTES QUE ACABE O ESTOQUE NO LINK:',
      'ÚLTIMAS UNIDADES NESSE PREÇO NO LINK ABAIXO:',
      'DESCONTO EXCLUSIVO LIBERADO AGORA NO LINK:'
    ];

    if (tone.includes('Amigável')) {
      pool = [
        'OBA GEEENTE! OLHA ESSE ACHADINHO SENSACIONAL NO LINK:',
        'GALERA, DICA DA HORA PRA VOCÊS! RESGATE NO LINK ABAIXO:',
        'ACHADINHO INCRÍVEL DEMAIS! COMPRE NO LINK OFICIAL:'
      ];
    } else if (tone.includes('Direto')) {
      pool = [
        'PREÇO DE CUSTO! COMPRE AGORA ACESSANDO O LINK:',
        'DESCONTO EXCLUSIVO APLICADO! GARANTA NO LINK:',
        'MENOR PREÇO GARANTIDO DO DIA NO LINK ABAIXO:'
      ];
    } else if (tone.includes('Consultivo')) {
      pool = [
        'REVIEW TECH: EXCELENTE CUSTO-BENEFÍCIO NO LINK:',
        'PRODUTO COM GARANTIA E MELHOR PREÇO NO LINK ABAIXO:'
      ];
    } else if (tone.includes('Divertido')) {
      pool = [
        'PREÇO TÃO BAIXO QUE PARECE MEME! CORRE NO LINK:',
        'SURREAL DE BARATO! GARANTA O SEU NO LINK ABAIXO:'
      ];
    }

    generatedCta = `${e1} ${pool[Math.floor(Math.random() * pool.length)]}`;
  }

  // Inject mustUseWords if specified
  if (mustUseWords && mustUseWords.trim().length > 0) {
    const wordList = mustUseWords.split(',').map((w: string) => w.trim()).filter(Boolean);
    if (wordList.length > 0) {
      const extraWord = wordList[Math.floor(Math.random() * wordList.length)];
      if (!generatedCta.toLowerCase().includes(extraWord.toLowerCase())) {
        generatedCta = `${extraWord.toUpperCase()}! ${generatedCta}`;
      }
    }
  }

  // Filter forbiddenWords
  if (forbiddenWords && forbiddenWords.trim().length > 0) {
    const forbiddenList = forbiddenWords.split(',').map((w: string) => w.trim().toLowerCase()).filter(Boolean);
    forbiddenList.forEach((fw: string) => {
      if (fw) {
        const reg = new RegExp(fw, 'gi');
        generatedCta = generatedCta.replace(reg, '');
      }
    });
  }

  return forceUppercaseCta ? generatedCta.toUpperCase() : generatedCta;
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
O usuário digitou as seguintes INSTRUÇÕES DE COMANDO para você sintetizar uma Chamada para Ação (CTA) curta (1 linha) para Telegram/WhatsApp:
"${!isDefaultInst ? ctaInstructions : "Crie uma chamada atraente e persuasiva com indicação para o link"}"

SUA TAREFA:
Execute a ordem do usuário e escreva A CHAMADA PARA AÇÃO (CTA) FINAL em 1 linha.
NÃO repita os comandos "Escreva que...", "Faça...", "Crie...", "Avisa que...". Em vez disso, EXECUTE o pedido e crie a frase da CTA em si!

Exemplos de Aplicação Correta:
- Se o usuário pediu: "Avisa que o frete é grátis", você escreve: "🚚 FRETE GRÁTIS LIBERADO! GARANTA O SEU NO LINK ABAIXO:"
- Se o usuário pediu: "Diga que o estoque está no fim", você escreve: "🚨 ATENÇÃO: ESTOQUE NO FIM! COMPRE AGORA NO LINK:"
- Se o usuário pediu: "Coloque que é cupom de R$ 50", você escreve: "🎟️ APLIQUE O CUPOM DE R$ 50 OFF NO LINK OFICIAL:"

PERSONALIDADE & TOM DE VOZ: ${tone || "Amigável & Descontraído"}
PALAVRAS OBRIGATÓRIAS A INCLUIR: ${mustUseWords || "Nenhuma"}
PALAVRAS PROIBIDAS (NÃO USAR): ${forbiddenWords || "Nenhuma"}

REGRAS RIGOROSAS:
1. Respeite 100% o pedido das Instruções do Usuário e aplique a personalidade (${tone}).
2. Mantenha em no máximo 12 a 15 palavras terminando com chamada para o link (ex: "no link:" ou "no link abaixo:").
${forceUppercaseCta ? "3. OBRIGATÓRIO: A CTA DEVE ESTAR TOTALMENTE EM CAIXA ALTA (LETRAS MAIÚSCULAS)." : ""}
4. Responda APENAS com o texto final da CTA, sem aspas nem explicações adicionais.`;

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
