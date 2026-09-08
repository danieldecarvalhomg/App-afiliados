-- Corrige políticas de contas/equipe que usavam colunas não qualificadas.
-- Sem a qualificação, account_id = account_id era avaliado na subconsulta,
-- sem relacionar a permissão à linha-alvo.
DROP POLICY IF EXISTS "Owners podem editar conta" ON public.accounts;
CREATE POLICY "Owners podem editar conta" ON public.accounts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.account_members am
      WHERE am.account_id = public.accounts.id
        AND am.user_id = auth.uid()
        AND am.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "Owners gerenciam membros" ON public.account_members;
CREATE POLICY "Owners gerenciam membros" ON public.account_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_members am
      WHERE am.account_id = public.account_members.account_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.account_members am
      WHERE am.account_id = public.account_members.account_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'admin')
    )
  );
