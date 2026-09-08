import type { AppResult } from '../domain/errors';
import { fail, ok, VALIDATION_ERROR, WHATSAPP_ERRORS } from '../domain/errors';
import type { WhatsAppConnection, WhatsAppGroup } from '../domain/whatsapp/types';
import type { WhatsAppRepository } from '../backend/whatsapp/repository';
import { WhatsAppConnectionManager } from '../backend/whatsapp/WhatsAppConnectionManager';
import type { UsageQuotaService } from '../domain/usage/UsageQuotaService';

export const MAX_WHATSAPP_CONNECTIONS = 5;

export class WhatsAppService {
  constructor(
    private readonly repository: WhatsAppRepository,
    private readonly manager: WhatsAppConnectionManager,
    private readonly quota?: UsageQuotaService,
  ) {}

  async listUserConnections(userId: string): Promise<AppResult<WhatsAppConnection[]>> {
    try {
      const connections = await this.repository.listConnections(userId);
      return ok(
        connections.map((connection) => {
          const runtimeStatus = this.manager
            .get(connection.id)
            ?.getConnectionStatus();
          return runtimeStatus ? { ...connection, status: runtimeStatus } : connection;
        }),
      );
    } catch (error) {
      return this.persistenceError(error);
    }
  }

  async createUserConnection(userId: string, rawLabel: unknown): Promise<AppResult<WhatsAppConnection>> {
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
    if (!label) return VALIDATION_ERROR('Informe um apelido para a conexão.');
    if (label.length > 60) return VALIDATION_ERROR('O apelido deve ter no máximo 60 caracteres.');
    try {
      if (!this.quota && await this.repository.countConnections(userId) >= MAX_WHATSAPP_CONNECTIONS) {
        return WHATSAPP_ERRORS.CONNECTION_LIMIT_REACHED();
      }
      const connection = await this.repository.createConnection(userId, label);
      await this.repository.recordEvent(userId, 'whatsapp.connection.created', connection.id, { label });
      await this.repository.recordLog(userId, `Conexão WhatsApp "${label}" criada.`);
      return ok(connection);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('WHATSAPP_CONNECTION_LIMIT_REACHED') || message.includes('USAGE_LIMIT_CHANNEL')) {
        return WHATSAPP_ERRORS.CONNECTION_LIMIT_REACHED();
      }
      return this.persistenceError(error);
    }
  }

  async getUserConnection(userId: string, connectionId: string): Promise<AppResult<WhatsAppConnection>> {
    return this.getOwnedConnection(userId, connectionId);
  }

  async connectUserWhatsApp(userId: string, connectionId: string): Promise<AppResult<void>> {
    const owned = await this.getOwnedConnection(userId, connectionId);
    if ('error' in owned) return owned;
    const active = this.manager.get(connectionId);
    if (active?.getConnectionStatus() === 'connected') return WHATSAPP_ERRORS.ALREADY_CONNECTED();
    await this.repository.recordEvent(userId, 'whatsapp.connection.started', connectionId);
    return this.manager.connect(owned.data);
  }

  async disconnectUserWhatsApp(userId: string, connectionId: string): Promise<AppResult<void>> {
    const owned = await this.getOwnedConnection(userId, connectionId);
    if ('error' in owned) return owned;
    return this.manager.disconnect(connectionId);
  }

  async deleteUserConnection(userId: string, connectionId: string): Promise<AppResult<void>> {
    const owned = await this.getOwnedConnection(userId, connectionId);
    if ('error' in owned) return owned;
    try {
      await this.manager.remove(connectionId);
      await this.repository.deleteSession(connectionId);
      await this.repository.deleteConnection(connectionId);
      await this.repository.recordEvent(userId, 'whatsapp.connection.removed', connectionId, {
        label: owned.data.label,
      });
      await this.repository.recordLog(userId, `WhatsApp "${owned.data.label}" removido.`);
      return ok(undefined);
    } catch (error) {
      return this.persistenceError(error);
    }
  }

  async getUserConnectionStatus(
    userId: string,
    connectionId: string,
  ): Promise<AppResult<WhatsAppConnection>> {
    const owned = await this.getOwnedConnection(userId, connectionId);
    if ('error' in owned) return owned;
    const runtimeStatus = this.manager
      .get(connectionId)
      ?.getConnectionStatus();
    return ok(runtimeStatus ? { ...owned.data, status: runtimeStatus } : owned.data);
  }

  async getConnectionGroups(userId: string, connectionId: string): Promise<AppResult<WhatsAppGroup[]>> {
    const owned = await this.getOwnedConnection(userId, connectionId);
    if ('error' in owned) return owned;
    try {
      return ok(await this.repository.listGroups(userId, connectionId));
    } catch (error) {
      return this.persistenceError(error);
    }
  }

  async listUserGroups(userId: string): Promise<AppResult<WhatsAppGroup[]>> {
    try {
      return ok(await this.repository.listGroups(userId));
    } catch (error) {
      return this.persistenceError(error);
    }
  }

  async syncConnectionGroups(userId: string, connectionId: string): Promise<AppResult<WhatsAppGroup[]>> {
    const owned = await this.getOwnedConnection(userId, connectionId);
    if ('error' in owned) return owned;
    const providerGroups = await this.manager.getGroups(connectionId);
    if ('error' in providerGroups) return providerGroups;
    try {
      const groups = await this.repository.syncGroups(userId, connectionId, providerGroups.data);
      const activeCount = groups.filter((group) => group.syncStatus === 'active').length;
      await this.repository.recordEvent(userId, 'whatsapp.groups.synced', connectionId, { count: activeCount });
      await this.repository.recordLog(userId, `${activeCount} grupos sincronizados em "${owned.data.label}".`, 'success');
      return ok(groups);
    } catch (error) {
      console.error(`[AfiliHub:WhatsApp:${connectionId}] Persistência de grupos falhou.`, error);
      return WHATSAPP_ERRORS.GROUP_SYNC_FAILED();
    }
  }

  private async getOwnedConnection(
    userId: string,
    connectionId: string,
  ): Promise<AppResult<WhatsAppConnection>> {
    try {
      const connection = await this.repository.getConnection(connectionId);
      if (!connection) return WHATSAPP_ERRORS.CONNECTION_NOT_FOUND();
      if (connection.userId !== userId) return WHATSAPP_ERRORS.CONNECTION_FORBIDDEN();
      return ok(connection);
    } catch (error) {
      return this.persistenceError(error);
    }
  }

  private persistenceError(error: unknown): AppResult<never> {
    console.error('[AfiliHub:WhatsApp] Erro de persistência.', error);
    return fail('WHATSAPP_PERSISTENCE_ERROR', 'Não foi possível acessar os dados do WhatsApp.');
  }
}
