# Email profissional e autenticação DNS

Configure somente depois de registrar o domínio e escolher o provedor. Não copie valores de exemplo como se fossem valores finais: DKIM e parte do SPF são fornecidos pelo serviço contratado.

## Estrutura mínima recomendada

- `suporte@SEU_DOMINIO`: caixa ou encaminhamento monitorado.
- `privacidade@SEU_DOMINIO`: encaminhar para o responsável por LGPD.
- `financeiro@SEU_DOMINIO`: cobrança, cancelamento e reembolso.
- `noreply@SEU_DOMINIO`: remetente transacional; use `Reply-To: suporte@SEU_DOMINIO`.
- `postmaster@SEU_DOMINIO`, `abuse@SEU_DOMINIO` e `dmarc@SEU_DOMINIO`: encaminhamentos técnicos monitorados.

## Opção de custo zero no início

1. Use Cloudflare DNS e Email Routing para encaminhar os endereços monitorados a uma caixa já existente.
2. Use Resend Free para até 3.000 emails transacionais por mês, com limite diário de 100.
3. Cadastre `noreply@` como remetente, mas não descarte respostas: configure `Reply-To` para `suporte@`.

## Registros

### SPF

Mantenha **um único** TXT SPF no domínio raiz. Use exatamente o include indicado pelo provedor de envio. Estrutura típica:

```text
Tipo: TXT
Nome: @
Valor: v=spf1 include:PROVEDOR_DE_ENVIO -all
```

Se houver mais de um remetente autorizado, consolide todos no mesmo registro. Não crie dois SPF.

### DKIM

Crie os CNAME/TXT fornecidos pelo provedor. O seletor e a chave são exclusivos da conta; não há valor genérico seguro.

### DMARC

Comece observando por 7–14 dias:

```text
Tipo: TXT
Nome: _dmarc
Valor: v=DMARC1; p=none; rua=mailto:dmarc@SEU_DOMINIO; adkim=s; aspf=s; pct=100
```

Depois de confirmar que Supabase Auth e o serviço transacional passam SPF ou DKIM com alinhamento, avance para `p=quarantine` e, por fim, `p=reject`.

## Teste antes do público

- enviar cadastro, confirmação, recuperação de senha, boas-vindas e reembolso;
- conferir SPF, DKIM e DMARC como `PASS` nos cabeçalhos recebidos;
- validar links, texto puro, descadastro quando aplicável e resposta para `suporte@`;
- testar Gmail, Outlook e um provedor brasileiro;
- nunca usar `noreply@` para mensagens que exigem resposta do usuário.
