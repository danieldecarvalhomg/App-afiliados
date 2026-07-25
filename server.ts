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

// AI Dynamic CTA Generator API
app.post("/api/ai/generate-cta", async (req, res) => {
  try {
    const { tone, ctaInstructions, mustUseWords, forbiddenWords, forceUppercaseCta } = req.body;

    const ai = getGenAI();
    if (!ai) {
      const fallbackCtas = [
        "👉 RESGATE O SEU DESCONTO EXCLUSIVO NO LINK ABAIXO:",
        "🔥 CORRE GALERA! GARANTA O SEU ANTES QUE ACABE O ESTOQUE NO LINK:",
        "🛍️ CLIQUE AQUI E COMPRE COM MENOR PREÇO DO ANO:",
        "⚡ DESCONTO ESPECIAL LIBERADO! ACESSE AGORA NO LINK:"
      ];
      const picked = fallbackCtas[Math.floor(Math.random() * fallbackCtas.length)];
      return res.json({ cta: forceUppercaseCta ? picked.toUpperCase() : picked });
    }

    const prompt = `Você é um Copywriter Especialista em Marketing de Afiliados no Brasil.
Crie APENAS uma Chamada para Ação (CTA) em 1 linha curta e impactante para Telegram/WhatsApp.

Orientações de Treinamento:
- Tom de Voz/Personalidade: ${tone || "Amigável & Descontraído"}
- Instruções Específicas para a CTA: ${ctaInstructions || "Crie uma CTA atrativa com emojis e foco no link de afiliado."}
- Palavras/Expressões Recomendadas: ${mustUseWords || "Nenhuma"}
- Palavras/Expressões Proibidas (NÃO USAR): ${forbiddenWords || "Nenhuma"}

Requisitos:
- Escreva APENAS a linha de texto da CTA (máximo 15 palavras).
- Deve terminar indicando o link (ex: "no link abaixo:" ou "no link:").
${forceUppercaseCta ? "- OBRIGATÓRIO: ESCREVA A CTA TOTALMENTE EM CAIXA ALTA / LETRAS MAIÚSCULAS." : ""}
- Responda APENAS com o texto da CTA pronta, sem aspas nem explicações adicionais.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let generatedText = (response.text || "").trim().replace(/^["']|["']$/g, '');
    if (forceUppercaseCta) {
      generatedText = generatedText.toUpperCase();
    }

    return res.json({ cta: generatedText });
  } catch (error: any) {
    console.error("Erro na rota /api/ai/generate-cta:", error);
    return res.status(500).json({ error: error.message || "Falha ao gerar CTA" });
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
