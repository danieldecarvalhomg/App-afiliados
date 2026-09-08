# Auditoria com comandos reais — Treinador de IA

Continuação de 05–06/09/2026. Migração aplicada no Supabase pelo navegador. Código corrigido e compilado no projeto local.

## Ambiente e evidências

- Supabase real: projeto `wsqpdsnytvtimxcbizwk` (`affiliux`). Migração `20260905150000_cta_trainer_audit.sql`, executada em transação e registrada em `supabase_migrations.schema_migrations`. Consulta posterior pelo navegador confirmou versão e nome.
- Conta exclusiva de auditoria, com dois produtos fictícios e plano em modo `preview`. O servidor de auditoria monta o componente real `CtaStudioView`, autenticação, endpoints, regras de franquia, repositório Supabase e Gemini reais. Não inicia workers de envio.
- Modelo configurado: `gemini-3.5-flash-lite`. Credenciais de teste ficam somente no arquivo local ignorado `.env.cta-audit`.
- Evidência da migração: `.runtime/cta-audit-real/migration-browser.png`.

## Falhas encontradas e correções

1. Pedir para guardar um exemplo podia retornar “salvei” sem persistir. A interpretação agora distingue aprendizagem explícita de pedido temporário.
2. O formato admitia só um exemplo por mensagem. Passou a aceitar, validar e salvar vários exemplos, preservando texto e sentimento, com deduplicação no mesmo comando.
3. Confirmações curtas e perguntas sobre memória não recebiam o histórico nem a memória ativa. Esses contextos agora são fornecidos, e mudanças de opinião podem arquivar memórias antigas conflitantes, com IDs limitados aos registros ativos do usuário.
4. A mudança de tamanho podia manter “curto” na descrição textual do perfil. A interpretação consolida também a descrição, preservando as outras preferências.
5. Exceções eram classificadas como condições; comandos mistos podiam compartilhar um único escopo. Regras agora podem ter escopos independentes, mantendo o perfil global separado das condições e exceções.
6. Operador legado `equals` não era reconhecido. A elegibilidade aceita os aliases existentes, e a geração e validação determinística respeitam a categoria/marketplace da regra.
7. Proibições podiam receber tipos não reconhecidos. O schema distingue regras de estilo, comportamento a evitar, palavra proibida e palavra obrigatória; expressões literais são preservadas para validação.
8. A geração descartava regras após a 12ª e memórias após a 8ª. Agora recebe todos os itens já selecionados como relevantes pelo repositório.
9. Um comando de 99 mil caracteres perdeu uma restrição do meio. Comandos acima de 16 mil caracteres passam por leitura de todas as seções, seguida de interpretação global com conferência das extrações.
10. Exemplos isolados ao final de uma fonte de 120 mil caracteres podiam ser descartados como temporários. A extração preserva os exemplos explicitamente rotulados para treinamento, salvo limitação temporária explícita.
11. Gemini respondeu HTTP 503 por alta demanda. Há até duas novas tentativas para falhas transitórias, dentro do orçamento total de tempo; indisponibilidade persistente retorna uma mensagem específica. HTTP 429 continua sendo respeitado.
12. Quantidades máximas em arrays tornaram a gramática do Gemini complexa demais, causando HTTP 400. Os limites continuam validados pelo servidor, sem expandir a gramática enviada ao modelo.
13. Respostas do chat tinham contraste baixo, e mensagens enormes expandiam excessivamente o painel. Texto ficou mais legível; conversa tem altura limitada, rolagem e preservação de quebras de linha.
14. Na geração real, o modelo inferiu funcionalidades ausentes dos dados e ignorou a instrução de fazer uma pergunta quando não houvesse descrição. Os prompts de geração e reparo reforçam o uso exclusivo de dados confirmados, e a seleção rejeita respostas declarativas para essa condição explícita. Essa validação cobre o padrão de instrução auditado, sem pretender interpretar deterministicamente toda linguagem natural.
15. CTAs de teste não passavam pela validação determinística de regras antes de serem exibidos. Agora palavras proibidas e demais regras aplicáveis são verificadas também nessa etapa, inclusive em candidatos armazenados; a versão do cache foi atualizada.
16. Avaliar ou remover um exemplo não atualizava a versão do perfil exibida. A interface recarrega exemplos e perfil após essas ações.
17. Avaliar um CTA invalidava o histórico recente de testes por mudar a versão do perfil, permitindo repetir o texto em “Gerar outro”. O histórico agora é mantido entre versões do mesmo perfil e separado por usuário, produto e época da memória.
18. Um manual repetitivo de 120 mil caracteres gerou dezenas de cenários numerados equivalentes. A reconciliação agora orienta o provedor a tratar a numeração como rótulo e aplica deduplicação determinística, preservando a versão mais completa e exemplos explicitamente rotulados.
19. Referências apareciam simultaneamente nos grupos “Geral” e “Exemplos e referências”. O agrupamento da memória agora mostra cada referência somente no grupo correto.

## Resultados

- `npm test`: **536 testes em 72 arquivos passaram**, incluindo testes de SQL em PostgreSQL/PGlite, validação, propriedade de dados, rollback e regressões das correções.
- `npm run typecheck`: passou.
- `npm run build`: frontend e backend compilados. Permanece aviso de tamanho do bundle de frontend.
- Comandos reais: **25 cenários**, cobrindo saudação, preferências permanentes, condições, exceções, consulta de memória, pedido temporário, mudança de opinião, proibições, exemplos positivos/negativos, lotes de dois e cinco exemplos, feedback parcial, pergunta sem aprendizagem, ambiguidade, confirmação explícita/curta, pedido de Templates, erros de digitação, citação negativa e comandos de **12.000, 45.000 e 99.000 caracteres**.
- Importação real: **120.101 caracteres em 11 seções**, com exemplos positivos e negativos preservados; fonte original conferida integralmente no banco e revisão aplicada.
- Os resultados finais dos comandos comuns estão em `commands-final.jsonl`; os três comandos longos foram repetidos com sucesso em `commands-long-final.jsonl`. Uma asserção inicial desses três casos procurava a preferência somente na memória semântica; foi corrigida para considerar também o perfil persistido, onde a preferência estava corretamente salva.
- Geração real: três CTAs distintos para cada um dos dois produtos passaram pela verificação de formato, ausência de termos proibidos e pergunta solicitada pelo manual. Salvar/remover feedback e cinco pedidos inválidos também passaram, com conferência da versão persistida. Evidência: `generation-final.json`.
- O navegador encontrou timeouts, excesso de demanda e uma falha genérica do Gemini durante chamadas reais. Em todos esses casos a interface mostrou a mensagem apropriada, preservou o texto e permitiu repetir. A repetição da geração de três opções e a repetição da análise extensa funcionaram. Os eventos estão registrados em `http.jsonl`.
- Navegador real: comando de 99.000 caracteres, seleção de três opções, feedback positivo/negativo, troca de produto, cancelamento da exclusão e persistência após recarregar a página. A importação de 120.101 caracteres foi revisada e reaplicada com **23 memórias únicas**, oito cenários distintos, um exemplo positivo e um negativo; a fonte foi comparada integralmente com o banco. Evidências: `training-browser-review-clean.txt`, `training-browser-persistence.json` e `trainer-browser-final.png`.
- Resultados consolidados dos 25 comandos e da importação: `commands-results-summary.json`, com 26 cenários e nenhuma falha final.
- `graphify update .`: concluído após as alterações, com 3.448 nós e 7.980 relações.

## Reexecução

```powershell
npx tsx scripts/serve-cta-audit.ts
```

Em outro terminal:

```powershell
$env:CTA_AUDIT_RUN='nova-execucao'
npx tsx scripts/test-cta-real-commands.ts
npx tsx scripts/test-cta-real-generation.ts
```

Os scripts usam a conta de auditoria e modificam somente os dados de teste dessa conta. Realizam chamadas ao provedor configurado e estão sujeitos às suas quotas. A bateria de comandos respeita intervalo mínimo de cinco segundos por cenário; um treinamento longo realiza várias chamadas de interpretação.

## Limites

Não existe uma bateria finita que cubra todo comando possível em linguagem natural. Os cenários verificam efeitos persistidos e resultados concretos; respostas futuras continuam sujeitas à variação e disponibilidade do modelo. As alterações do aplicativo estão locais, sem deploy em hospedagem. O painel do Supabase também exibe um aviso de quota da organização com possível restrição a partir de 02/10/2026; isso não impediu a migração nem os testes desta execução.
