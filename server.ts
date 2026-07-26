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
    const { productName, price, originalPrice, couponCode, marketplace, tone, keyFeatures, destinationChannel } = req.body;
    
    const ai = getGenAI();
    if (!ai) {
      // Fallback response if GEMINI_API_KEY is not set
      const fallbackCopy = `🔥 *OFERTA IMPERDÍVEL: ${productName || "Produto em Destaque"}* 🔥\n\n` +
        `De ~R$ ${originalPrice || "299,00"}~ por apenas *R$ ${price || "149,90"}*!\n` +
        (couponCode ? `🎟️ Cupom Exclusivo: *${couponCode}*\n` : "") +
        `🛒 Garanta o seu antes que acabe o estoque!\n\n` +
        `👇 *Clique para Comprar no ${marketplace || "Marketplace"}:*\n[LINK_AFILIADO_AQUI]`;
      return res.json({ copy: fallbackCopy, source: "template_fallback" });
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

Requisitos da Cópia:
1. Use formatação legível para Telegram e WhatsApp (negrito com *, tachado com ~).
2. Inclua emojis relevantes e atraentes sem poluir excessivamente.
3. Adicione uma chamada para ação (CTA) chamativa para o link do afiliado.
4. Mantenha espaço reservado para [LINK_AFILIADO].
5. Crie também 3 hashtags estratégicas ao final.

Responda APENAS com a cópia final pronta para cópia/disparo.`;

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

// Gemini & OpenAI API Key Validation API
app.post("/api/ai/validate-key", async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ valid: false, error: "Chave de API não informada." });
    }

    const trimmedKey = apiKey.trim();

    // If key starts with sk-, validate with OpenAI
    if (trimmedKey.startsWith("sk-")) {
      const testRes = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { "Authorization": `Bearer ${trimmedKey}` }
      });
      if (testRes.status === 200) {
        return res.json({ valid: true, provider: "openai" });
      } else {
        return res.status(testRes.status).json({ valid: false, error: "Chave da OpenAI inválida ou sem saldo." });
      }
    }

    // Default: Validate with Google Gemini API
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`, {
      method: "GET"
    });

    if (geminiRes.status === 200) {
      return res.json({ valid: true, provider: "gemini" });
    } else if (geminiRes.status === 400 || geminiRes.status === 403) {
      return res.status(400).json({ valid: false, error: "Chave da Gemini API incorreta ou inválida. Obtenha uma chave grátis no Google AI Studio (aistudio.google.com)." });
    } else {
      const errText = await geminiRes.text();
      return res.status(geminiRes.status).json({ valid: false, error: `Erro na Gemini API (${geminiRes.status}): ${errText.slice(0, 100)}` });
    }
  } catch (error: any) {
    return res.status(500).json({ valid: false, error: `Falha de conexão: ${error.message}` });
  }
});

// AI Chatbot Training API (Gemini & OpenAI integration)
app.post("/api/ai/chat-training", async (req, res) => {
  try {
    const { userMessage, currentProfile, history, userApiKey } = req.body;
    if (!userMessage) {
      return res.status(400).json({ error: "Mensagem é obrigatória" });
    }

    const apiKey = userApiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

    // 1. Try Gemini API if Gemini key or userApiKey (non sk-) is present or server GEMINI_API_KEY
    if (apiKey && (!apiKey.startsWith("sk-") || !process.env.OPENAI_API_KEY)) {
      const systemPrompt = `Você é uma Inteligência Artificial 100% LIMPA de regras pré-definidas ou clichês preexistentes.
Seu papel é aprender e seguir ESTRITAMENTE o que o usuário pedir para as chamadas para ação (CTAs) de afiliados.

PERFIL DE PREFERÊNCIAS ATUAL DO USUÁRIO:
${JSON.stringify(currentProfile || {}, null, 2)}

REGRAS ABSOLUTAS:
1. NUNCA adicione frases clichês pré-definidas (como 'CORRE!', 'SÓ AGORA!', 'ÚLTIMA CHANCE!', 'Estoque acabando') A MENOS QUE o usuário tenha solicitado explicitamente.
2. Siga 100% o estilo, palavras e instruções fornecidas pelo usuário na mensagem ("${userMessage}").
3. Se o usuário forneceu qualquer instrução de como quer seus textos, salve essa instrução no objeto "updatedProfile".
4. Retorne APENAS um objeto JSON no formato:
{
  "reply": "Texto de resposta conversacional confirmando exatamente o que aprendeu (*negrito*, _itálico_)",
  "updatedProfile": null ou objeto com os campos alterados,
  "generatedCtas": null ou array de 3 CTAs fraseados baseados EXCLUSIVAMENTE nas regras do usuário se solicitado
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7
          }
        })
      });

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const parsed = JSON.parse(rawText);
        return res.json({
          source: "gemini-2.5-flash",
          reply: parsed.reply || "Entendido! Atualizei suas preferências.",
          updatedProfile: parsed.updatedProfile || null,
          generatedCtas: parsed.generatedCtas || null
        });
      }
    }

    // 2. Try OpenAI if key starts with sk-
    if (apiKey && apiKey.startsWith("sk-")) {
      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Você é um especialista em Copywriting." },
            { role: "user", content: userMessage }
          ],
          response_format: { type: "json_object" }
        })
      });
      if (openAiRes.ok) {
        const data = await openAiRes.json();
        const jsonContent = JSON.parse(data.choices[0]?.message?.content || "{}");
        return res.json({
          source: "openai-gpt-4o-mini",
          reply: jsonContent.reply || "Entendido! Atualizei seu perfil.",
          updatedProfile: jsonContent.updatedProfile || null,
          generatedCtas: jsonContent.generatedCtas || null
        });
      }
    }

    // 2. Try Gemini 2.5 Flash if GEMINI_API_KEY is available
    const ai = getGenAI();
    if (ai) {
      const prompt = `Você é um Assistente de Copywriting especialista em Marketing de Afiliados.
Perfil Atual do Usuário: ${JSON.stringify(currentProfile || {})}
Mensagem do Usuário: "${userMessage}"

Analise a mensagem, responda em tom consultivo e extraia qualquer preferência alterada.
Retorne um JSON estrito no formato:
{
  "reply": "Resposta em markdown",
  "updatedProfile": null ou objeto com os campos alterados,
  "generatedCtas": null ou array de 3 CTAs curtos se solicitado
}
Retorne APENAS o JSON válido sem blocos de código ao redor.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      let rawText = response.text || "{}";
      rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(rawText);
      return res.json({
        source: "gemini-2.5-flash",
        reply: parsed.reply || "Entendido! Atualizei seu perfil.",
        updatedProfile: parsed.updatedProfile || null,
        generatedCtas: parsed.generatedCtas || null
      });
    }

    // 3. Fallback when no API key is available
    return res.json({
      source: "fallback",
      reply: null,
      updatedProfile: null
    });
  } catch (error: any) {
    console.error("Erro no chat training API:", error);
    return res.json({ source: "fallback", reply: null, updatedProfile: null });
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
