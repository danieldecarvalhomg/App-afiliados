/**
 * AfiliHub — Padrão de resultado estruturado.
 *
 * Toda operação de serviço deve retornar AppResult<T>:
 *   - AppSuccess<T>: operação bem-sucedida com dados tipados
 *   - AppError:      operação falhou com código e mensagem legível
 *
 * Não use exceções para controle de fluxo de negócio.
 * Use AppError com um código semântico.
 */

export interface AppError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface AppSuccess<T> {
  success: true;
  data: T;
}

export type AppResult<T> = AppSuccess<T> | AppError;

// ─── Helpers ────────────────────────────────────────────────────────────────

export function ok<T>(data: T): AppSuccess<T> {
  return { success: true, data };
}

export function fail(code: string, message: string): AppError {
  return { success: false, error: { code, message } };
}

// ─── Erros padrão do domínio ─────────────────────────────────────────────────

/**
 * Usado por qualquer funcionalidade que ainda não foi implementada.
 * Preferível a retornar dados falsos ou simular sucesso.
 */
export const NOT_IMPLEMENTED: AppError = fail(
  'NOT_IMPLEMENTED',
  'Esta funcionalidade ainda não está disponível.'
);

export const UNAUTHORIZED: AppError = fail(
  'UNAUTHORIZED',
  'Usuário não autenticado.'
);

export const FORBIDDEN: AppError = fail(
  'FORBIDDEN',
  'Você não tem permissão para realizar esta ação.'
);

export const NOT_FOUND: AppError = fail(
  'NOT_FOUND',
  'Recurso não encontrado.'
);

export const VALIDATION_ERROR = (message: string): AppError =>
  fail('VALIDATION_ERROR', message);

export const SERVICE_UNAVAILABLE = (service: string): AppError =>
  fail('SERVICE_UNAVAILABLE', `O serviço ${service} não está disponível no momento.`);

// ─── WhatsApp ───────────────────────────────────────────────────────────────

export const WHATSAPP_ERRORS = {
  CONNECTION_LIMIT_REACHED: () => fail(
    'WHATSAPP_CONNECTION_LIMIT_REACHED',
    'Você atingiu o limite de 5 conexões WhatsApp.',
  ),
  CONNECTION_NOT_FOUND: () => fail(
    'WHATSAPP_CONNECTION_NOT_FOUND',
    'Conexão WhatsApp não encontrada.',
  ),
  CONNECTION_FORBIDDEN: () => fail(
    'WHATSAPP_CONNECTION_FORBIDDEN',
    'Você não tem permissão para acessar esta conexão WhatsApp.',
  ),
  ALREADY_CONNECTED: () => fail(
    'WHATSAPP_ALREADY_CONNECTED',
    'Este WhatsApp já está conectado.',
  ),
  NOT_CONNECTED: () => fail(
    'WHATSAPP_NOT_CONNECTED',
    'Este WhatsApp não está conectado.',
  ),
  QR_FAILED: () => fail(
    'WHATSAPP_QR_FAILED',
    'Não foi possível gerar o QR Code do WhatsApp.',
  ),
  SESSION_RESTORE_FAILED: () => fail(
    'WHATSAPP_SESSION_RESTORE_FAILED',
    'Não foi possível restaurar a sessão do WhatsApp.',
  ),
  GROUP_SYNC_FAILED: () => fail(
    'WHATSAPP_GROUP_SYNC_FAILED',
    'Não foi possível sincronizar os grupos do WhatsApp.',
  ),
  LOGGED_OUT: () => fail(
    'WHATSAPP_LOGGED_OUT',
    'A sessão do WhatsApp foi encerrada. Conecte novamente pelo QR Code.',
  ),
} as const;
