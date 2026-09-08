# AfiliHub — Integrações

## Supabase + Gemini

O backend usa o Supabase service role apenas no servidor para repositories,
workers e migrations. O token do usuário chega pelo header `Authorization:
Bearer <access_token>` e é validado pelo Supabase Auth antes de qualquer
operação por usuário.

O Gemini é chamado somente pelo backend através de `@google/genai`; a chave
`GEMINI_API_KEY` nunca é enviada ao browser. Use `CTA_MODEL` para CTA/Media e
`PROMOTION_AI_MODEL` para a análise de promoções do Monitor. O timeout do
Trainer pode ser ajustado com `CTA_AI_TIMEOUT_MS` (10–60 segundos; padrão 40).

Para verificar a integração sem expor dados, consulte `GET
/api/integrations/health`. O endpoint diferencia credenciais ausentes,
indisponibilidade do Supabase e migration do CTA ainda não aplicada.

Este documento descreve os pontos de integração do AfiliHub.

## WhatsApp Web — QR multi-conexão

O Bloco 2 usa `@whiskeysockets/baileys` 6.7.24. Esta é uma integração **não
oficial**, baseada no protocolo do WhatsApp Web, e não a Meta Cloud API. Mudanças
do WhatsApp podem exigir atualizações do provider.

- Até 5 conexões por usuário, com limite transacional no backend/banco.
- Um provider e uma sessão por `connection_id`.
- QR e status via SSE autenticado; QR nunca é persistido.
- Estado de autenticação criptografado com AES-256-GCM em
  `whatsapp_auth_sessions`, acessível somente pela service role.
- Grupos normalizados em `whatsapp_groups`, únicos por
  `(connection_id, external_group_id)`.

Rotas autenticadas:

```text
GET    /api/whatsapp/connections
POST   /api/whatsapp/connections
GET    /api/whatsapp/connections/:id
DELETE /api/whatsapp/connections/:id
POST   /api/whatsapp/connections/:id/connect
POST   /api/whatsapp/connections/:id/disconnect
GET    /api/whatsapp/connections/:id/status
GET    /api/whatsapp/connections/:id/groups
POST   /api/whatsapp/connections/:id/groups/sync
GET    /api/whatsapp/events
```

## Outgoing Webhooks (n8n)

The system emits events to an external workflow automation tool like n8n via a centralized Webhook URL.

**Endpoint**: Configured via `VITE_N8N_WEBHOOK_URL`
**Method**: POST

### Supported Events (`N8nEvent`)
- `PRODUCT_CREATED`
- `QUEUE_ITEM_ADDED`
- `OFFER_APPROVED`
- `OFFER_REJECTED`
- `DISPATCH_SENT`
- `DISPATCH_FAILED`

### Payload Format

```json
{
  "event": "PRODUCT_CREATED",
  "timestamp": "2026-08-10T10:13:25.000Z",
  "userId": "uuid-here",
  "data": {
    "productId": "prod_123",
    "title": "Example Product",
    "price": 99.90
  }
}
```

## Affiliate Link Services

The system supports converting raw product URLs into affiliate URLs using specific URL parameters or API methods per marketplace.

### Supported Marketplaces & Parameters
| Marketplace | Parameter |
| --- | --- |
| Amazon | `tag` |
| Shopee | `custom_id` |
| Mercado Livre | `campaign_id` |
| AliExpress | `aff_short_key` |
| Magalu | `parceiro` |
| Hotmart | `ref` |
| Kiwify | `af` |
| Braip | `ref` |

The `affiliateLinkService.ts` module handles adding these parameters, falling back to environment variables (`VITE_AMAZON_TAG`, etc.) if specific configuration is not provided.
