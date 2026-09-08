/**
 * AfiliHub — Domínio WhatsApp: Tipos
 *
 * Define os tipos centrais do domínio WhatsApp.
 * Contratos compartilhados pelo backend e frontend da integração multi-conexão.
 */

// ─── Status de Conexão ────────────────────────────────────────────────────────

/**
 * Estados possíveis de uma conexão WhatsApp.
 *
 * - disconnected:  nenhuma conta conectada
 * - qr_required:   QR Code gerado, aguardando scan
 * - connecting:    conexão em andamento
 * - connected:     conta conectada e operacional
 * - reconnecting:  reconectando após queda
 * - logged_out:    usuário deslogou no dispositivo
 * - error:         erro de conexão não recuperável sem ação do usuário
 */
export type WhatsAppConnectionStatus =
  | "disconnected"
  | "qr_required"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "logged_out"
  | "error";

// ─── Eventos ─────────────────────────────────────────────────────────────────

/**
 * Eventos emitidos pelo sistema WhatsApp.
 * Serão utilizados futuramente para observabilidade e automações.
 */
export type WhatsAppEvent = "qr.updated" | "connection.updated";

// ─── Entidades ────────────────────────────────────────────────────────────────

export interface WhatsAppConnection {
  id: string;
  userId: string;
  label: string;
  phone: string | null;
  displayName: string | null;
  status: WhatsAppConnectionStatus;
  connectedAt: string | null;
  lastSeenAt: string | null;
  groupsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppGroup {
  id: string;
  userId: string;
  connectionId: string;
  externalGroupId: string;
  name: string;
  participantsCount: number;
  syncStatus: "active" | "unavailable";
  lastSyncedAt: string | null;
  connectionLabel?: string;
}

export interface WhatsAppProviderGroup {
  externalGroupId: string;
  name: string;
  participantsCount: number;
}

// ─── Transporte de saída ─────────────────────────────────────────────────────

/** Payload normalizado. Buffers e tipos do SDK ficam restritos ao provider. */
export type WhatsAppOutboundPayload =
  | {
      type: "text";
      text: string;
      affiliateUrl?: string | null;
      previewSourceUrl?: string | null;
      previewDescription?: string | null;
      productTitle?: string | null;
      watermark?: import("../dispatch/types").DispatchWatermarkSettings;
    }
  | {
      type: "image";
      image: Uint8Array;
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      caption: string;
    };

/**
 * `uncertain` significa que o provider pode ter transmitido a mensagem, mas
 * não conseguiu confirmar o resultado. Esse estado nunca deve gerar retry
 * automático.
 */
export type WhatsAppDispatchFailureClassification =
  "transient" | "permanent" | "uncertain";

export interface WhatsAppDispatchFailure {
  success: false;
  errorCode: string;
  classification: WhatsAppDispatchFailureClassification;
}

export interface WhatsAppGroupSendCapability {
  externalGroupId: string;
  name: string;
  participantsCount: number;
  announce: boolean;
  selfIsAdmin: boolean;
}

export type WhatsAppGroupSendPreflightResult =
  | { success: true; capability: WhatsAppGroupSendCapability }
  | WhatsAppDispatchFailure;

export interface WhatsAppGroupSendInput {
  externalGroupId: string;
  payload: WhatsAppOutboundPayload;
  /** Chave estável opcional; a implementação nunca a trata como confirmação. */
  idempotencyKey?: string;
}

export type WhatsAppGroupSendResult =
  { success: true; externalMessageId: string } | WhatsAppDispatchFailure;

export interface WhatsAppRealtimeEvent {
  type: WhatsAppEvent;
  connectionId: string;
  data: {
    qr?: string;
    status?: WhatsAppConnectionStatus;
    phone?: string | null;
    displayName?: string | null;
  };
}
