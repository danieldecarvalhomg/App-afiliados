/**
 * AfiliHub — Logger Estruturado
 *
 * Substitui console.log espalhado pelo código.
 *
 * ─── Responsabilidades ────────────────────────────────────────────────────────
 *
 * logger → diagnóstico técnico, backend, runtime, erros internos
 *   Exemplo: "JWT verification failed", "Database query failed"
 *   Não é necessariamente exibido ao usuário.
 *
 * system_events → eventos de domínio para observabilidade futura
 *   Exemplo: message.received, offer.created, queue.created
 *
 * system_logs / addLog → logs para a interface do usuário
 *   Exemplo: "WhatsApp desconectado", "Campanha criada"
 *   Não devem conter stack traces ou detalhes internos sensíveis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

type LogLevel = 'info' | 'warn' | 'error' | 'success';

const isDev = import.meta.env.DEV ?? true;

function log(level: LogLevel, module: string, message: string, data?: unknown): void {
  if (!isDev && level === 'info') return; // silencia info em produção

  const prefix = `[AfiliHub:${module}]`;
  const timestamp = new Date().toISOString();

  switch (level) {
    case 'info':
      console.info(`${timestamp} ${prefix} ${message}`, data ?? '');
      break;
    case 'warn':
      console.warn(`${timestamp} ${prefix} ⚠ ${message}`, data ?? '');
      break;
    case 'error':
      console.error(`${timestamp} ${prefix} ✖ ${message}`, data ?? '');
      break;
    case 'success':
      console.log(`${timestamp} ${prefix} ✔ ${message}`, data ?? '');
      break;
  }
}

export const logger = {
  info:    (module: string, message: string, data?: unknown) => log('info',    module, message, data),
  warn:    (module: string, message: string, data?: unknown) => log('warn',    module, message, data),
  error:   (module: string, message: string, data?: unknown) => log('error',   module, message, data),
  success: (module: string, message: string, data?: unknown) => log('success', module, message, data),
};
