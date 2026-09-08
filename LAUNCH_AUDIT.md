# Auditoria de testes e lançamento — AfiliHub

Data: 31/08/2026

## Resultado técnico

- Testes: 63 arquivos, 393 testes aprovados.
- TypeScript: sem erros.
- Dependências: 0 vulnerabilidades conhecidas no `npm audit` (produção e desenvolvimento).
- Build de produção: aprovado. Há alerta não bloqueante de bundle principal acima de 500 kB.
- Carga local do endpoint `/api/health`: 2.000 requisições, concorrência 50, 100% HTTP 200, 1.541 req/s, p95 58,2 ms e p99 106,5 ms.
- Produção isolada: `/api/health`, termos, privacidade e sitemap retornaram HTTP 200; CSP aplicada.

O teste de carga mede apenas a camada HTTP leve, sem banco, Gemini ou WhatsApp. Um teste ponta a ponta de produção deve ser feito depois do deploy, com conta de teste e limites baixos.

## Implementado sem custo

- Termos de Uso, Política de Privacidade e Política de Reembolso em páginas públicas.
- Aceite obrigatório e versionado no cadastro.
- Migration `consent_events` com RLS e registro do aceite no banco.
- Banner granular de cookies, registro da preferência e controle para mudar a escolha no Perfil.
- Google Analytics e Meta Pixel condicionais ao consentimento e aos IDs de ambiente.
- Exclusão de conta disponível pelo usuário e limpeza adicional de workspace órfão.
- Sitemap e robots.txt gerados com a origem configurada em `APP_URL`.
- Script de backup Postgres com checksum e retenção de 30 dias.
- Script de carga reutilizável.
- Mensagem de boas-vindas, sequência de emails, roteiro de vídeo e plano de presença pública.
- Guia de SPF, DKIM, DMARC, aliases e `noreply@`.
- Ajuste do bind de produção para `0.0.0.0` quando `HOST` não for informado.

## Recomendação de menor custo

| Demanda | Começo recomendado | Custo base |
|---|---|---:|
| Domínio | Registro.br, `.com.br` | R$ 40/ano no varejo oficial |
| Aplicação | Railway Hobby; configuração já existe | US$ 5/mês incluídos em uso |
| Banco/Auth/Storage | Supabase Free + backup externo | US$ 0 até os limites |
| IA | Gemini 3.5 Flash-Lite Free; limitar uso por conta | US$ 0 no início |
| Recebimento de email | Cloudflare Email Routing | US$ 0 |
| Email transacional | Resend Free | US$ 0 até 3.000/mês e 100/dia |
| Caixa postal real | Zoho Mail Lite, se encaminhamento não bastar | cerca de US$ 1–1,25/usuário/mês anual |
| Backup externo | Cloudflare R2 Standard | US$ 0 até 10 GB-mês |
| Analytics/pixels | GA4 + Meta Pixel | US$ 0 |
| Cobrança recorrente + NFS-e | Asaas | sem mensalidade; taxas por uso |
| NFS-e manual inicial | Portal Nacional, conforme enquadramento/município | gratuito |

### Alternativas de hospedagem

- Railway Hobby: melhor relação entre custo e operação para este app, porque há processos longos, SSE, WhatsApp e workers.
- Fly.io 1 GB: cerca de US$ 5,92/mês, mais trabalho operacional.
- Hetzner CX23: € 5,49/mês sem IPv4; IPv4 acrescenta € 0,50/mês. É VPS e exige firewall, proxy TLS, atualização, monitoramento e backup por conta própria.
- Supabase Pro: US$ 25/mês quando banco de produção precisar de backup diário gerenciado, 8 GB e não poder pausar.

## Bloqueadores antes de abrir ao público

1. Escolher e registrar o domínio; atualizar `APP_URL`, CORS e os emails dos documentos.
2. Preencher razão social/nome empresarial, CPF/CNPJ, endereço e responsável por privacidade nas minutas; revisão jurídica/contábil.
3. Aplicar a migration `20260831030000_legal_consent_events.sql` no Supabase.
4. Configurar domínio, caixa/encaminhamentos, Resend/Supabase SMTP e validar SPF, DKIM e DMARC.
5. Escolher Asaas ou outro gateway e implementar o fluxo real de assinatura, webhook idempotente, cancelamento e reembolso. A tela atual de assinatura não cobra.
6. Definir o enquadramento empresarial e fiscal com contador; automatizar NFS-e só depois.
7. Implantar backup agendado fora do mesmo provedor e realizar teste de restauração.
8. Fazer piloto fechado com 5–10 usuários. A conexão atual usa WhatsApp Web não oficial e pode contrariar regras de automação/disparo; avaliar migração à API oficial antes de escala pública.
9. Se qualquer `.env` já tiver sido compartilhado ou enviado a repositório, rotacionar todas as chaves privadas antes do deploy.

## Fontes de preço e conformidade

- https://registro.br/
- https://railway.com/pricing
- https://supabase.com/pricing
- https://ai.google.dev/gemini-api/docs/pricing
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/email-service/
- https://resend.com/pricing
- https://www.asaas.com/precos-e-taxas
- https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica
- https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf
- https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
