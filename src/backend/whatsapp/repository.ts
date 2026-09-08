import type {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
  WhatsAppGroup,
  WhatsAppProviderGroup,
} from '../../domain/whatsapp/types';

export interface ConnectionUpdate {
  status?: WhatsAppConnectionStatus;
  phone?: string | null;
  displayName?: string | null;
  connectedAt?: string | null;
  lastSeenAt?: string | null;
}

export interface WhatsAppRepository {
  countConnections(userId: string): Promise<number>;
  createConnection(userId: string, label: string): Promise<WhatsAppConnection>;
  listConnections(userId: string): Promise<WhatsAppConnection[]>;
  getConnection(id: string): Promise<WhatsAppConnection | null>;
  updateConnection(id: string, update: ConnectionUpdate): Promise<void>;
  deleteConnection(id: string): Promise<void>;
  listRestorableConnections(): Promise<WhatsAppConnection[]>;

  getEncryptedSession(connectionId: string): Promise<string | null>;
  saveEncryptedSession(connectionId: string, encryptedState: string): Promise<void>;
  deleteSession(connectionId: string): Promise<void>;

  listGroups(userId: string, connectionId?: string): Promise<WhatsAppGroup[]>;
  syncGroups(
    userId: string,
    connectionId: string,
    groups: WhatsAppProviderGroup[],
  ): Promise<WhatsAppGroup[]>;

  recordDeliveryReceipt(input: {
    userId: string;
    connectionId: string;
    externalGroupId: string;
    externalMessageId: string;
    deliveredAt: string | null;
    readAt: string | null;
  }): Promise<boolean>;
  markReceiptTrackingStarted(userId: string, connectionId: string): Promise<boolean>;

  recordEvent(userId: string, eventType: string, connectionId: string, data?: Record<string, unknown>): Promise<void>;
  recordLog(userId: string, message: string, level?: 'info' | 'warning' | 'error' | 'success'): Promise<void>;
}
