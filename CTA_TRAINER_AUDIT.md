# Auditoria do Treinador de IA

Data: 05/09/2026. Alterações realizadas no projeto local.

## Resultado verificado

| Verificação | Resultado |
| --- | --- |
| Suíte completa (`npm test`) | **519 testes em 71 arquivos passaram**; antes havia 423 testes em 66 arquivos |
| Interface real em Chromium/Edge (`npm run test:cta:ui`) | **10 cenários passaram**, sem erros JavaScript |
| Gemini configurado (`npm run test:cta:live`) | **3 cenários passaram** com entradas fictícias: instrução, importação/reconciliação e geração de três CTAs |
| PostgreSQL embutido (PGlite) | **10 testes SQL passaram**, incluídos nos 519 testes |
| TypeScript (`npm run typecheck`) | Passou |
| Frontend e backend (`npm run build`) | Passaram; permanece o aviso de tamanho do bundle de frontend |
| Dependências (`npm audit`) | **Zero vulnerabilidades conhecidas reportadas** |

Os testes novos reproduziram falhas antes das correções: 24 casos na primeira bateria do domínio e quatro casos contra as funções SQL antigas. Os resultados finais acima incluem as correções.

## Correções

| Problema encontrado | Comportamento corrigido |
| --- | --- |
| O schema enviado ao Gemini descrevia objetos de regras/perfil sem seus campos. Uma chamada real devolveu `ruleChanges: [{}, {}]`. | Schema explícito para perfil, regras, exemplos e feedback. O teste real de instrução passou. |
| Saídas malformadas da IA podiam gerar TypeError, registros inválidos ou alterações parciais durante a validação. | Validação antes de aplicar preferências; erros de domínio identificáveis; o objeto em cache não é modificado. |
| Exemplos/feedback inferidos eram registrados apesar de a confirmação estar pendente. | Aprendizagem persistente aguarda a confirmação; IDs de feedback ficam restritos ao contexto do usuário. |
| Preferências condicionais podiam alterar o perfil global; pedidos de estrutura podiam alterar estilo. | Condições/exceções ficam em regras e memória. Pedidos de estrutura são direcionados a Templates sem modificar o estilo. |
| Uma exceção podia arquivar uma regra geral de texto semelhante. | Resolução considera escopo e condições. |
| Coincidência de palavras podia tornar elegível memória de outro marketplace/categoria. | Condições factuais conhecidas são avaliadas explicitamente. Condições subjetivas continuam disponíveis à IA. |
| Análises inválidas consumiam franquia; acesso negado podia gravar conversa. | Validação da fonte e dos parâmetros ocorre antes da cobrança; autorização precede a gravação da conversa. |
| Importação aceitava tipos inválidos, prioridade decimal incompatível com INTEGER e truncava conteúdo de memória. | Rejeição explícita de saída inválida, prioridade inteira e limites verificados. Divisão preserva caracteres UTF-16 e foi testada com 1 milhão de caracteres. |
| Reconciliação podia resumir e perder exemplos explícitos. | Exemplos positivos, negativos e referências extraídos são preservados. O teste com Gemini verifica as duas polaridades. |
| CTAs de teste anteriores não participavam da próxima geração. | Histórico temporário limitado por usuário, produto, versão e época da memória; impede repetição direta e informa ângulos recentes. |
| Erros HTTP eram genéricos e mensagens internas podiam aparecer como código público. | Mapeamento de timeout, limite, entrada inválida e falha do provedor; códigos públicos restritos; logs não incluem mensagens internas arbitrárias. |
| Envio malsucedido apagava o rascunho; clique repetido podia gerar operações concorrentes. | Rascunho preservado, trava imediata por referência e controles de ações ocupadas. |
| Feedback não aparecia em “O que aprendi”, e a listagem de exemplos ficava limitada a 20. | Feedback visível e removível, atualização após avaliar, listagem de até 100 exemplos. |
| Troca de produto mantinha o CTA antigo; falha ao buscar produtos impedia carregar o treinador. | Troca limpa o resultado anterior; carregamento dos produtos é independente de perfil/conversa/memória. |
| Falha no refresh após aplicar treinamento mantinha a revisão disponível para reaplicação. | A revisão é encerrada após sucesso da aplicação, mesmo se a atualização visual falhar. |
| Duas requisições na primeira visita disputavam a criação do perfil. | Conflito de unicidade recupera o perfil existente sem sobrescrevê-lo. |
| Uma análise terminando após reset podia restaurar uma revisão antiga. | Sucesso/falha de análise só atualiza fontes ainda no estado `analyzing`. |
| SQL permitia duplicatas, memória one-off persistente e alterações de versão concorrentes. | Migração serializa mutações por perfil, deduplica no mesmo contexto e exclui itens temporários da memória ativa. |
| Remover memória mantinha regra determinística equivalente; alterações em exemplos não invalidavam cache/reuso. | Migração desativa a regra correspondente e invalida a versão do perfil nas mudanças de exemplos/regras. |
| Três alertas de dependência relacionados a `qs`, `body-parser` e `express`. | Override de `qs` para `^6.16.0`, lockfile atualizado e auditoria sem alertas. |

## Banco real: migração aplicada na continuação

Migração aplicada pelo SQL Editor do Supabase e confirmada em nova consulta pelo navegador em 06/09/2026:

`supabase/migrations/20260905150000_cta_trainer_audit.sql`

O projeto `wsqpdsnytvtimxcbizwk` registra a versão `20260905150000`, nome `cta_trainer_audit`. As funções e triggers estão aplicadas no banco real. A continuação usa conta exclusiva de auditoria, APIs reais e Gemini; detalhes e resultados adicionais estão em `CTA_TRAINER_REAL_AUDIT.md`. O código foi corrigido e compilado localmente; não foi feito deploy do aplicativo.

A migração mantém as RPCs administrativas restritas a `service_role`. Os testes verificam rollback, proprietário do perfil/fonte, reaplicação, deduplicação, reset, preservação de produto/template e negação ao papel `authenticated`.

## Escopo e limites

- A interface foi exercitada com o componente real e APIs controladas, em resoluções de desktop e celular. Não foram apagadas memórias reais nem enviados WhatsApps.
- O Gemini real recebeu somente um produto e instruções fictícios. Houve falhas intermediárias identificadas durante a auditoria; o último relatório registra os três cenários aprovados. Isso não garante disponibilidade contínua nem qualidade de toda resposta futura.
- Os testes SQL usam as tabelas/funções reais de memória com tabelas auxiliares mínimas. PGlite usa uma conexão; a serialização entre múltiplas conexões e o comportamento do Supabase hospedado ainda exigem validação no ambiente de implantação.
- A suíte cobre os casos encontrados e regressões relevantes; não constitui prova de ausência de todo erro possível.
- A pasta não possui repositório Git; não foi criado commit.

## Reexecução e evidências

```powershell
npm test
npm run typecheck
npm run build
npm run test:cta:ui
npm audit
```

O teste de navegador usa Edge/Chrome/Chromium instalado, com alternativa pelo ambiente `CTA_TEST_BROWSER`. O teste real `npm run test:cta:live` requer a chave Gemini configurada e realiza chamadas faturáveis à API; não grava no banco real.

Evidências locais:

- `.runtime/cta-audit/tests.log`
- `.runtime/cta-audit/ui-results.json`
- `.runtime/cta-audit/provider-results.json`
- `.runtime/cta-audit/dependency-audit.json`
- `.runtime/cta-audit/trainer-desktop.png`
- `.runtime/cta-audit/trainer-mobile.png`
- `.runtime/cta-audit/graphify-update.log`

Referências de dependências: [advisório de disponibilidade do qs](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), [advisório de parsing do qs](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx). O banco dos testes usa [PGlite](https://pglite.dev/docs/).
