# AfiliHub — Relatório do Analytics operacional

Data da auditoria: 2026-09-07  
Timezone de referência: `America/Sao_Paulo`

## 1. Status e arquitetura encontrada

O Analytics usa as fontes operacionais existentes; não foi criada uma segunda fonte para mensagens, envios ou links. Antes das alterações, a arquitetura real encontrada foi:

- Monitor: `captured_messages` é a mensagem canônica e `captured_message_sources` preserva conexão, grupo e monitor.
- Promotion Intelligence: `promotion_analyses` e `captured_messages.processing_status` registram o resultado real.
- Product/Affiliate: `products.affiliate_conversion_id` liga o Product a `affiliate_conversions`; `AffiliateLinkService` permanece o único conversor de links.
- Preparação: `automation_prepared_snapshots` preserva Product, execution, template/version e `cta_generation_id`.
- Queue/Dispatch: `queue_items` contém o snapshot imutável e `queue_deliveries` é a fonte por grupo/conexão.
- Automations: `automation_executions` referencia snapshot e queue item e tem chave de idempotência operacional.
- Eventos: `system_events` e jobs internos já registravam fatos operacionais; eles foram reutilizados, sem duplicá-los em uma event store analítica.
- Analytics anterior: parcial, agregava no backend, mas inferia parte do envio e não cobria Monitor, timezone, filtros dimensionais, receipts, capabilities e reports financeiros.

Dados observados na auditoria inicial: 47 capturas/fontes, 47 análises, 98 Products, 19 snapshots, 64 executions, 54 queue items, 59 deliveries (56 `sent`), 121 conversions afiliadas (88 `converted`), 414 deals e 4 discovery runs. O banco ainda não possuía receipts, clicks ou orders persistidos.

Status atual: **IMPLEMENTADO, migrado e com sync financeiro real validado; ainda não CONCLUÍDO**. As três migrations foram aplicadas ao projeto hospedado `wsqpdsnytvtimxcbizwk` e registradas em `supabase_migrations.schema_migrations`. O primeiro sync real da Shopee persistiu 16 pedidos oficiais. Ainda é necessário observar receipts delivered/read reais e executar o E2E autenticado completo antes de declarar o bloco CONCLUÍDO.

## 2. Dados reais e definições

| Métrica | Fonte/fórmula | Disponibilidade |
|---|---|---|
| Capturadas | `captured_messages.received_at` | real |
| Promoções | `processing_status = promotion_detected` | real |
| Ignoradas/revisão | `processing_status = ignored/needs_review` | real |
| Preparadas | snapshot atual ou queue item realmente criado, deduplicado | real |
| Enviadas | delivery distinta com `status = sent` e `sent_at` | real |
| Falhas | outcome terminal `failed/uncertain`; retry terminado em `sent` não conta | real |
| Taxa de sucesso | `sent / (sent + falhas terminais)` | calculável com outcomes |
| Entregues | `queue_deliveries.delivered_at`, preenchido por receipt Baileys | schema ativo; aguardando receipt real |
| Lidas | `queue_deliveries.read_at`, preenchido por receipt Baileys | schema ativo; aguardando receipt real |
| Links gerados | conversion distinta `converted` por `converted_at` | real |
| Cliques totais | fonte oficial/import ou tracking permitido | indisponível hoje |
| CTR | `clicks / messages_sent` | indisponível sem clicks totais |
| Pedidos | `marketplace_orders`, reports oficiais | Shopee real: 16 pedidos persistidos |
| Valor vendido | soma dos itens de orders ativos | Shopee real |
| Conversão | `orders / clicks` | indisponível sem clicks totais |
| Comissão estimada | soma de `itemTotalCommission` completa por order; fallback futuro `sale_value × taxa confiável` | Shopee real: disponível nos 16 pedidos |
| Comissão confirmada | valor final de report validado/pago | indisponível hoje |

Ausência de valor em reports retorna `null`; nunca passa pela coerção `Number(null) = 0`. Se um order não possui itens com preço confiável, ele não é materializado como venda de R$ 0. Se apenas parte das comissões de itens existir, a comissão do pedido permanece indisponível.

Timestamps são UTC. Os limites e agrupamentos usam `profiles.timezone`; Hoje/7d/30d/90d/Personalizado são convertidos para o intervalo UTC correspondente ao calendário civil do usuário.

## 3. WhatsApp: sent, delivered e read

O Baileys instalado expõe `message-receipt.update` para mensagens de grupo. O adapter agora escuta receipts apenas de mensagens outbound (`fromMe`) e grupos `@g.us`, resolve a delivery pelo `external_message_id` real e persiste:

- `delivered_at`: primeiro `receiptTimestamp` real;
- `read_at`: primeiro `readTimestamp` real;
- read também prova entrega; quando o receipt de entrega não veio, o timestamp real de read preenche delivery;
- nenhum JID/participante é persistido.

Em grupo, a semântica é deliberadamente **"ao menos um participante entregou/leu"**, não "todos os membros". A taxa de entrega usa apenas deliveries enviadas apó `whatsapp_connections.receipt_tracking_started_at`; histórico anterior permanece desconhecido. `read_rate = deliveries com ao menos um read receipt / deliveries com ao menos um delivery receipt`.

RPCs service-role-only:

- `mark_whatsapp_receipt_tracking_started(user_id, connection_id)`;
- `record_whatsapp_delivery_receipt(user_id, connection_id, external_group_id, external_message_id, delivered_at, read_at)`.

Ambas validam owner/conexão/grupo/delivery. Repetir receipt mantém o timestamp real mais antigo e não aumenta contagem.

## 4. Marketplaces e Capability Model

`MARKETPLACE_ANALYTICS_CAPABILITIES` é a fonte única. A capability financeira efetiva só é habilitada para a UI depois de `last_success_at` ou de existir um order real, evitando mostrar zero antes do primeiro sync confiável.

| Capability | Shopee | Mercado Livre | Amazon |
|---|---:|---:|---:|
| links/products/messages/groups | sim | sim | sim |
| clicks totais/únicos | não | não | não |
| orders/last sales | sim, report oficial | não | não |
| sales value | sim, itens do order | não | não |
| commission estimated | sim, report de conversão | não | não |
| commission confirmed | não | não | não |
| conversion rate | não, falta click total | não | não |
| cancellations | sim | não | não |
| refunds separados | não | não | não |
| sync health | sim | sim | sim |

### Shopee

A Open API configurada foi consultada em modo read-only e aceitou o contrato `conversionReport`. Uma janela real de 90 dias retornou uma conversão `PENDING`, estruturalmente contendo `conversionId`, `purchaseTime`, `clickTime`, `totalCommission`, `utmContent`, orders e items com preço, quantidade e comissão. O script de auditoria não imprime IDs, valores ou credenciais.

Foi implementado um sync paginado (até 500 por página, cursor `scrollId`) a cada seis horas. A chave `(user_id, marketplace, external_order_id)` torna o upsert idempotente. Status:

- `UNPAID/PENDING` → `PENDING`;
- `COMPLETED` → `CONFIRMED` para o pedido, sem promover comissão para confirmada;
- `CANCELLED` → `CANCELLED`, preservado no histórico e excluído de pedidos ativos, valor e comissão.

`totalCommission` existe no nível da conversão e pode cobrir vários orders; por isso a implementação soma somente `itemTotalCommission` completo do próprio order, evitando dupla contagem.

Após a migration, o sync hospedado processou uma conta com sucesso e persistiu 16 pedidos: 9 `PENDING`, 6 `CONFIRMED` e 1 `CANCELLED`. Todos os 16 possuem valor de venda e comissão estimada provenientes dos itens oficiais. Nenhum possui comissão confirmada, portanto essa métrica permanece indisponível — não é exibida como R$ 0. Duas outras contas configuradas falharam de forma isolada e mantiveram `sync_status = FAILED`, sem derrubar a conta sincronizada nem o restante do Analytics.

### Mercado Livre

A integração real gera links via sessão remota/Companion e faz discovery. Não há contrato de orders/sales/commission conectado. A alternativa segura é importar/automatizar os relatórios e etiquetas oficiais. Redirect automático Promofy não foi implementado porque pode contrariar a política do programa e quebrar a atribuição oficial.

### Amazon

A Creators API cobre catálogo e geração de link/partner tag. A alternativa é ingerir relatóios oficiais com tracking IDs. Não existe hoje uma fonte de orders/sales/commission conectada ao Promofy.

## 5. Click tracking e alternativas

Links Shopee novos recebem um sub-ID pseudônimo e determinístico derivado do `affiliate_conversion_id`. O report devolve esse valor em `utmContent`, permitindo atribuir order ao Product sem PII. Links históricos sem sub-ID podem permanecer não atribuídos.

`clickTime` do `conversionReport` prova o clique que originou aquela conversão, mas não representa todos os cliques. Portanto ele pode ser preservado como `attributed_click_at`, mas não alimenta "Cliques totais", "Cliques únicos" ou CTR.

Alternativas aceitas para habilitar cliques totais:

1. conector/import de click report oficial Shopee associado a sub-ID;
2. import/conector das métricas e etiquetas oficiais do Mercado Livre;
3. import/conector dos reports e tracking IDs da Amazon;
4. redirect Promofy somente para marketplace cujo contrato permita, mantendo a URL afiliada e seus parâmetros; sem fingerprinting.

Nenhum click é criado por refresh do Analytics. Enquanto uma dessas fontes não estiver ligada, a UI mostra Indisponível.

## 6. Orders, comissões e atribuição

As novas facts financeiras são `marketplace_orders`, `marketplace_order_items` e `marketplace_analytics_sync_states`. Elas são a representação normalizada do report oficial, não projeções decorativas.

Campos de atribuição suportados: `affiliate_conversion_id`, `product_id`, `prepared_message_id`, `queue_item_id`, `delivery_id`, `group_id`, `automation_id`, `template_id`, `template_version`, `cta_generation_id` e `tracking_sub_id`.

A cadeia atual funciona assim:

`Marketplace → Affiliate Conversion/Product → Prepared Snapshot → Queue → Delivery → Group → Affiliate Link/sub-ID → attributed click → Order → estimated commission`.

O sync Shopee resolve hoje sub-ID → `affiliate_conversion_id` → Product. Os 16 pedidos históricos sincronizados não trouxeram sub-ID correlacionável e, corretamente, ficaram sem Product/Group/Delivery/Automation atribuídos. Os campos posteriores para Prepared/Queue/Delivery/Group/Automation/Template/CTA existem, mas só podem ser preenchidos quando o identificador oficial provar a cadeia específica. Ausência permanece `null`/"Não atribuída"; nenhum grupo é escolhido por proximidade temporal.

Comissão estimada e confirmada são colunas separadas. Confirmada continua `null` até a ingestão de um `validatedReport`/billing oficial. Cancelados e refunds futuros não entram nos totais ativos; o registro histórico continua visível com seu status.

## 7. API, UI, freshness e isolamento

API autenticada: `GET /api/analytics/overview`.

Parâmetros: `preset`, `from`, `to`, `marketplace`, `connectionId`, `groupId`, `automationId`, `productId`, `templateId`, `generationMode`.

- A UI preserva o design system e as tabs existentes.
- Cards e tabelas consomem `available` e capabilities; unsupported não vira zero.
- A série temporal usa apenas fatos e respeita timezone/período.
- Últimas vendas mostra apenas orders reais, status real e atribuição disponível.
- `last_sync_at`, `last_success_at`, `sync_status` e `last_error_code` diferenciam sem dados, desatualizado e falha.
- Falha da Shopee é isolada e não derruba WhatsApp/Mercado Livre/Amazon.
- O browser recebe agregados, não milhares de registros brutos.
- Queries service-role sempre aplicam `user_id`; o agregador filtra owner novamente.

## 8. Migrations, índices, RLS e idempotência

Migrations:

- `20260907010000_analytics_operational_indexes.sql`: índices dimensionais/temporais nas fontes existentes;
- `20260907020000_whatsapp_delivery_receipts.sql`: timestamps, início do tracking e RPCs de receipt;
- `20260907030000_marketplace_orders.sql`: orders/items/sync states, índices, triggers e RLS.

Índices financeiros: `(user_id, purchased_at)`, `(user_id, marketplace, purchased_at)`, `(user_id, product_id, purchased_at)` e items por order. Receipts possuem índices parciais por owner/timestamp.

RLS permite somente SELECT do próprio owner para as facts financeiras; INSERT/UPDATE/DELETE são revogados de `anon` e `authenticated`. Triggers validam ownership de conversion, Product, Prepared Snapshot, Queue, Delivery, Group, Automation, Template, CTA e items mesmo com service role.

Validação no banco hospedado:

- as 3 policies RLS estão ativas e as tabelas retornam 0 linhas para cliente anônimo;
- um probe autenticado com usuário B contra linhas do usuário A retornou 0 linhas em orders, items e sync states;
- uma tentativa service-role controlada de ligar order do usuário A a Product do usuário B foi rejeitada por `OWNER_MISMATCH` e não persistiu registro;
- as três tabelas e os dois RPCs de receipt aparecem no schema REST do PostgREST.

Idempotência:

- delivery: uma linha por `(queue_item_id, whatsapp_group_id)`; receipts atualizam timestamps sem criar eventos;
- order: unique `(user_id, marketplace, external_order_id)`;
- order item: unique `(order_id, external_item_id)`;
- captura, queue, automation e affiliate conversion reutilizam suas chaves existentes;
- cancelamento atualiza o mesmo order; não cria nova venda;
- não há rollup diário: o volume atual não justifica outra fonte de verdade.

## 9. Testes e validação

Resultado local final:

- testes automatizados: 572/572 PASS, 76 arquivos;
- Analytics/receipts/Shopee direcionados: 46/46 PASS;
- typecheck: PASS;
- lint: PASS (`tsc --noEmit`, script atual do projeto);
- build frontend/backend: PASS;
- audit Shopee real read-only, 90 dias: HTTP 200, contrato aceito, 1 conversão `PENDING` observada estruturalmente;
- migrations hospedadas: 3/3 aplicadas, 11 objetos estruturais validados e 3/3 versões registradas no histórico;
- sync Shopee real: 1 conta sincronizada, 16 pedidos persistidos (9 pendentes, 6 confirmados, 1 cancelado); duas falhas de conta ficaram isoladas;
- RLS hospedado: anon sem linhas; probe cross-user 0 linhas nas 3 facts; mismatch service-role bloqueado;
- nenhuma compra real foi realizada.

Cobertura adicionada: 10 capturas/8 promoções/6 envios, failures e retry, filtros, breakdowns, owner isolation, receipts prospectivos, capabilities, order Shopee, unknown ≠ zero, estimated ≠ confirmed, cancelamento, paginação e sub-ID.

## 10. Critérios de aceitação

Legenda: PASS = comprovado; FAIL = aplicável e pendente; N/A = capability não fornecida pela fonte atual, com UI explicitamente indisponível.

| Bloco | Status | Evidência/justificativa |
|---|---|---|
| A. Visão geral | PASS | auth, filtros, períodos e timezone testados; sem mocks |
| B. Mensagens capturadas | PASS | Monitor/status/período reais |
| C. Envio | PASS | delivery real, terminal failures e retry consistente |
| D. Entrega | FAIL | migration aplicada e contrato testado; falta observar receipt real no ambiente hospedado |
| E. Leitura | FAIL | migration aplicada e contrato testado; falta observar read receipt real |
| F. Cliques | N/A | click total oficial ainda não ingerido; `clickTime` convertido não é total |
| G. Redirect tracking | N/A | não habilitado sem compatibilidade contratual; ML desaconselha redirect automático |
| H. Grupos | PASS | apenas deliveries atribuíveis; orders sem prova permanecem não atribuídos |
| I. Conexões | PASS | filtro e isolamento por connection |
| J. Capability Model | PASS | fonte única e effective capability por sync real |
| K. Shopee | PASS | contrato oficial auditado; 16 pedidos reais persistidos; apenas capabilities comprovadas habilitadas |
| L. Mercado Livre | PASS | somente facts reais existentes; orders/commission N/A |
| M. Últimas vendas | PASS | 16 facts reais disponíveis, com status e ordenação cobertos |
| N. Comissão estimada | PASS | 16 orders com `itemTotalCommission` completo; separada da confirmada |
| O. Comissão confirmada | N/A | requer validated/billing report ainda não conectado |
| P. Conversão | N/A | orders existem na Shopee, clicks totais não |
| Q. Atribuição | PASS | IDs e sub-ID reais; dimensão sem evidência permanece null/Não atribuída |
| R. Automações | PASS | capture/match/prepared/sent/failed por facts reais |
| S. Templates | PASS | ID/versão congelados |
| T. CTA | PASS | referência preservada; Trainer não é alterado |
| U. Gráficos | PASS | fatos reais, filtros/timezone, sem demo |
| V. Empty state | PASS | zero conhecido separado de unsupported/sync error |
| W. Freshness | PASS | state por provider e isolamento de falhas |
| X. Idempotência | PASS | receipts/orders/items/cancelamentos testados por contrato |
| Y. RLS | PASS | policies ativas; anon vazio; probe cross-user 0 linhas; mismatch service-role bloqueado |
| Z. Performance | PASS | backend, paginação, sem N+1 no endpoint, índices revisados |
| AA. Testes automatizados | PASS | 572 PASS; confirmed/refund/click total são N/A pela capability atual |
| AB. E2E | FAIL | migration e sync hospedados passaram; falta observar receipt e concluir cadeia autenticada na UI |
| AC. Regressão | PASS | suíte integral passou; módulos estáveis preservados |
| AD. Qualidade | PASS | tests/typecheck/lint/build |

Critérios críticos em FAIL: D, E e AB. Por isso este relatório **não declara o bloco CONCLUÍDO**.

## 11. Limitações e próximas ativações

1. Reiniciar/deployar o backend atualizado e observar receipts reais; histórico anterior nunca será retroativamente inventado.
2. Executar o E2E autenticado na UI contra o banco migrado, incluindo um receipt real quando a conexão o fornecer.
3. Investigar as duas contas Shopee com `sync_status = FAILED`; o erro continua isolado e não contamina a conta sincronizada.
4. Obter `validationId`/billing e implementar `validatedReport` antes de habilitar comissão confirmada.
5. Ingerir click reports oficiais para habilitar clicks totais, únicos, CTR e conversão.
6. Conectar reports oficiais Mercado Livre/Amazon antes de habilitar orders/sales/commission nesses providers.

Nenhum número decorativo foi adicionado. O que ainda não possui fonte continua Indisponível.
