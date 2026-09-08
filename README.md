<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/75243d9f-359d-4992-ad50-ee68295de2c2

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase e Gemini

O backend carrega `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` e `GEMINI_API_KEY` exclusivamente do ambiente do
servidor. O frontend usa somente `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` para autenticação.

Os modelos podem ser separados por pipeline:

- `PROMOTION_AI_MODEL`: detecção de promoções do Monitor;
- `CTA_MODEL`: Trainer, Templates e Product Media;
- `GEMINI_MODEL`: fallback global.

`CTA_AI_TIMEOUT_MS` controla o timeout do Trainer (10–60 segundos, padrão de
40 segundos).

A prontidão das integrações pode ser verificada em
`GET /api/integrations/health`. O endpoint informa quando o projeto Supabase
está acessível, quando a migration do CTA está aplicada e qual modelo Gemini
está ativo, sem expor credenciais.
