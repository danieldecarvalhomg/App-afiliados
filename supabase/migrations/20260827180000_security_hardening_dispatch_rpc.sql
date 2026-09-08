-- RPCs de fila/campanha são chamadas exclusivamente pelo backend com service_role.
-- Elas recebem p_user_id e não devem ser expostas a clientes autenticados.
REVOKE ALL ON FUNCTION public.set_dispatch_campaign_status(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_dispatch_queue_paused(UUID, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_dispatch_queue_item(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_dispatch_queue_item(UUID, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_dispatch_campaign_status(UUID, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_dispatch_queue_paused(UUID, UUID, BOOLEAN)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_dispatch_queue_item(UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_dispatch_queue_item(UUID, UUID, BOOLEAN)
  TO service_role;
