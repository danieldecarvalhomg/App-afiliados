import { describe, expect, it } from 'vitest';
import type { MonitoringRepository } from '../../domain/monitoring/MonitoringRepository';
import { MonitoringService } from '../../domain/monitoring/MonitorService';
import type {
  ActiveMonitorOrigin, CaptureFilters, CapturePage, GroupMonitor, IncomingWhatsAppMessage,
  PersistCaptureInput, PersistCaptureResult,
} from '../../domain/monitoring/types';
import type { ProductReviewRule, ProductReviewSettings } from '../../domain/monitoring/ReviewSettingsRepository';

class MemoryMonitoringRepository implements MonitoringRepository {
  async reviewCapture() { return true; }
  reviewRequired = true;
  autoApprovalRules: ProductReviewRule[] = [];
  monitors: GroupMonitor[] = [];
  ownedGroups = new Set(['user-a:group-a', 'user-a:group-b', 'user-b:group-private']);
  messages = new Map<string, { id: string; fingerprint: string; externalId: string }>();
  sources = new Set<string>();
  events: string[] = [];
  lastInput: PersistCaptureInput | null = null;
  next = 1;

  async listMonitors(userId: string) { return this.monitors.filter((item) => item.userId === userId); }
  async getReviewRequired() { return this.reviewRequired; }
  async setReviewRequired(_userId: string, required: boolean) { this.reviewRequired = required; return true; }
  async getReviewSettings(): Promise<ProductReviewSettings> { return { reviewRequired: this.reviewRequired, autoApprovalRules: this.autoApprovalRules }; }
  async setReviewSettings(_userId: string, settings: ProductReviewSettings) {
    this.reviewRequired = settings.reviewRequired; this.autoApprovalRules = settings.autoApprovalRules; return settings;
  }
  async getMonitor(userId: string, monitorId: string) { return this.monitors.find((item) => item.userId === userId && item.id === monitorId) ?? null; }
  async createMonitor(userId: string, groupId: string, reviewRequired: boolean) {
    const existing = this.monitors.find((item) => item.userId === userId && item.groupId === groupId);
    if (existing) { existing.enabled = true; existing.reviewRequired = reviewRequired; return existing; }
    const suffix = groupId === 'group-b' ? 'b' : groupId === 'group-private' ? 'private' : 'a';
    const now = new Date().toISOString();
    const monitor: GroupMonitor = {
      id: `monitor-${this.next++}`, userId, groupId, enabled: true, reviewRequired,
      lastActivityAt: null, createdAt: now, updatedAt: now, groupName: `Grupo ${suffix}`,
      externalGroupId: 'shared@g.us', connectionId: `connection-${suffix}`,
      connectionLabel: `WhatsApp ${suffix}`,
    };
    this.monitors.push(monitor); return monitor;
  }
  async updateMonitor(userId: string, monitorId: string, update: { enabled?: boolean; reviewRequired?: boolean }) {
    const monitor = await this.getMonitor(userId, monitorId); if (!monitor) return null;
    Object.assign(monitor, update); return monitor;
  }
  async deleteMonitor(userId: string, monitorId: string) {
    const index = this.monitors.findIndex((item) => item.userId === userId && item.id === monitorId);
    if (index < 0) return false; this.monitors.splice(index, 1); return true;
  }
  async userOwnsGroup(userId: string, groupId: string) { return this.ownedGroups.has(`${userId}:${groupId}`); }
  async findActiveMonitor(userId: string, connectionId: string, externalGroupId: string): Promise<ActiveMonitorOrigin | null> {
    const monitor = this.monitors.find((item) => item.userId === userId && item.connectionId === connectionId
      && item.externalGroupId === externalGroupId && item.enabled);
    return monitor ? { monitor } : null;
  }
  async persistCapture(input: PersistCaptureInput): Promise<PersistCaptureResult> {
    this.lastInput = input;
    const primary = `${input.userId}:${input.message.externalGroupId}:${input.message.externalMessageId}`;
    let canonical = this.messages.get(primary)
      ?? [...this.messages.values()].find((item) => item.fingerprint === input.fingerprint);
    const duplicate = Boolean(canonical);
    if (!canonical) {
      canonical = { id: `capture-${this.next++}`, fingerprint: input.fingerprint, externalId: input.message.externalMessageId };
      this.messages.set(primary, canonical);
    }
    const sourceKey = `${canonical.id}:${input.message.connectionId}:${input.groupId}:${input.monitorId}`;
    const sourceCreated = !this.sources.has(sourceKey); this.sources.add(sourceKey);
    return { capturedMessageId: canonical.id, duplicate, sourceCreated };
  }
  async listCaptures(_userId: string, _filters: CaptureFilters): Promise<CapturePage> { return { items: [], nextCursor: null }; }
  async clearCaptureHistory(userId: string) {
    const owned = [...this.messages.entries()].filter(([key]) => key.startsWith(`${userId}:`));
    for (const [key] of owned) this.messages.delete(key);
    return owned.length;
  }
  async recordEvent(_userId: string, eventType: string) { this.events.push(eventType); }
  async recordLog() {}
}

function message(update: Partial<IncomingWhatsAppMessage> = {}): IncomingWhatsAppMessage {
  return {
    connectionId: 'connection-a', externalMessageId: 'message-1', externalGroupId: 'shared@g.us',
    senderExternalId: 'participant@s.whatsapp.net', fromMe: false, type: 'text',
    text: 'Oferta https://example.com/item?x=1', links: [], sentAt: '2026-08-20T12:00:00.000Z', ...update,
  };
}

async function activeSetup() {
  const repository = new MemoryMonitoringRepository(); const service = new MonitoringService(repository);
  const created = await service.createMonitor('user-a', 'group-a', true);
  if (!('data' in created)) throw new Error('setup failed');
  return { repository, service, monitor: created.data };
}

describe('filtros do pipeline', () => {
  it('altera a revisão global para todos os monitores', async () => {
    const repository = new MemoryMonitoringRepository(); const service = new MonitoringService(repository);
    expect(await service.getReviewSettings('user-a')).toMatchObject({ success: true, data: { reviewRequired: true } });
    const shopeeRule = {
      id: 'rule-shopee', name: 'Aprovar Shopee', enabled: true, conditionMode: 'all',
      conditions: [{ id: 'condition-marketplace', field: 'marketplace', operator: 'equals', value: 'shopee' }],
    };
    expect(await service.updateReviewSettings('user-a', { reviewRequired: true, autoApprovalRules: [shopeeRule] }))
      .toMatchObject({ success: true, data: { reviewRequired: true, autoApprovalRules: [{ id: 'rule-shopee' }] } });
    expect(await service.getReviewSettings('user-a')).toMatchObject({
      success: true, data: { reviewRequired: true, autoApprovalRules: [{ id: 'rule-shopee' }] },
    });
  });

  it('rejeita condições inválidas sem alterar o revisor', async () => {
    const repository = new MemoryMonitoringRepository(); const service = new MonitoringService(repository);
    const result = await service.updateReviewSettings('user-a', {
      reviewRequired: true,
      autoApprovalRules: [{ id: 'bad', name: 'Inválida', enabled: true, conditionMode: 'all', conditions: [] }],
    });
    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(repository.autoApprovalRules).toEqual([]);
  });

  it('ignora grupo sem monitor', async () => {
    const repository = new MemoryMonitoringRepository(); const service = new MonitoringService(repository);
    expect(await service.processIncomingMessage('user-a', message())).toMatchObject({ outcome: 'ignored', reason: 'not_monitored' });
    expect(repository.messages.size).toBe(0);
  });
  it('ignora monitor pausado e volta a capturar ao reativar', async () => {
    const { repository, service, monitor } = await activeSetup();
    await service.updateMonitor('user-a', monitor.id, { enabled: false });
    expect((await service.processIncomingMessage('user-a', message())).outcome).toBe('ignored');
    await service.updateMonitor('user-a', monitor.id, { enabled: true });
    expect((await service.processIncomingMessage('user-a', message())).outcome).toBe('captured');
    expect(repository.messages.size).toBe(1);
  });
  it('ignora fromMe', async () => {
    const { repository, service } = await activeSetup();
    expect(await service.processIncomingMessage('user-a', message({ fromMe: true }))).toMatchObject({ reason: 'from_me' });
    expect(repository.messages.size).toBe(0);
  });
});

describe('normalização e deduplicação', () => {
  it('captura texto e extrai URLs exatamente como recebidas', async () => {
    const { repository, service } = await activeSetup();
    const result = await service.processIncomingMessage('user-a', message({ text: 'Veja https://a.example/x?y=1 e https://b.example/z.' }));
    expect(result.outcome).toBe('captured');
    expect(repository.lastInput?.message.links).toEqual(['https://a.example/x?y=1', 'https://b.example/z']);
  });
  it('preserva caption de imagem como texto normalizado', async () => {
    const { repository, service } = await activeSetup();
    const result = await service.processIncomingMessage('user-a', message({
      type: 'image', text: undefined, media: { caption: 'Legenda https://example.com/img', mimeType: 'image/jpeg', available: true },
    }));
    expect(result.outcome).toBe('captured');
    expect(repository.lastInput?.message.text).toBe('Legenda https://example.com/img');
    expect(repository.lastInput?.message.media).toMatchObject({ mimeType: 'image/jpeg', available: true });
  });
  it('não cria nova mensagem para duplicata na mesma conexão', async () => {
    const { repository, service } = await activeSetup();
    expect((await service.processIncomingMessage('user-a', message())).outcome).toBe('captured');
    expect((await service.processIncomingMessage('user-a', message())).outcome).toBe('duplicate');
    expect(repository.messages.size).toBe(1); expect(repository.sources.size).toBe(1);
  });
  it('mantém uma captura e duas sources para a mesma mensagem via A+B', async () => {
    const { repository, service } = await activeSetup();
    await service.createMonitor('user-a', 'group-b', true);
    await service.processIncomingMessage('user-a', message());
    await service.processIncomingMessage('user-a', message({ connectionId: 'connection-b' }));
    expect(repository.messages.size).toBe(1); expect(repository.sources.size).toBe(2);
  });
});

describe('limpeza do histórico', () => {
  it('limpa apenas as capturas do usuário solicitado', async () => {
    const repository = new MemoryMonitoringRepository(); const service = new MonitoringService(repository);
    await service.createMonitor('user-a', 'group-a', true);
    await service.processIncomingMessage('user-a', message());
    await service.createMonitor('user-b', 'group-private', true);
    await service.processIncomingMessage('user-b', message({ connectionId: 'connection-private', text: 'Oferta diferente https://example.com/other' }));
    const result = await service.clearCaptureHistory('user-a');
    expect(result).toMatchObject({ success: true, data: { deletedCount: 1 } });
    expect(repository.messages.size).toBe(1);
  });
});

describe('ownership', () => {
  it('usuário A não cria monitor no grupo de B nem altera o monitor de B', async () => {
    const repository = new MemoryMonitoringRepository(); const service = new MonitoringService(repository);
    const forbidden = await service.createMonitor('user-a', 'group-private', true);
    expect(forbidden.success).toBe(false);
    const monitorB = await repository.createMonitor('user-b', 'group-private', true);
    const update = await service.updateMonitor('user-a', monitorB.id, { enabled: false });
    expect(update.success).toBe(false); expect(monitorB.enabled).toBe(true);
  });
});
