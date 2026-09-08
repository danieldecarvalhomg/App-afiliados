import { createHash } from 'node:crypto';
import type { AppResult } from '../errors';
import { fail, ok, VALIDATION_ERROR } from '../errors';
import type { MonitoringRepository } from './MonitoringRepository';
import type {
  ProductReviewCondition,
  ProductReviewConditionField,
  ProductReviewRule,
  ProductReviewSettings,
} from './ReviewSettingsRepository';
import type { CaptureFilters, CapturePage, GroupMonitor, IncomingWhatsAppMessage, ProcessIncomingResult } from './types';

const URL_PATTERN = /https?:\/\/[^\s<>"'`\]\[{}()]+[^\s<>"'`\]\[{}().,!?;:]/giu;
export function extractUrls(text: string): string[] { return [...new Set(text.match(URL_PATTERN) ?? [])]; }
export function fingerprintMessage(message: IncomingWhatsAppMessage): string {
  return createHash('sha256').update(JSON.stringify({
    group: message.externalGroupId, sender: message.senderExternalId ?? '', type: message.type,
    text: message.text ?? '', media: message.media ?? null, sentAt: message.sentAt,
  })).digest('hex');
}

const REVIEW_FIELDS = new Set<ProductReviewConditionField>([
  'marketplace', 'confidence', 'discount_percent', 'coupon_exists', 'free_shipping',
]);
const MARKETPLACES = new Set(['shopee', 'amazon', 'mercado_livre', 'magalu', 'aliexpress', 'other', 'unknown']);

function reviewRules(raw: unknown): ProductReviewRule[] | null {
  if (!Array.isArray(raw) || raw.length > 20) return null;
  const rules: ProductReviewRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const value = item as Record<string, unknown>;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (!id || id.length > 100 || !name || name.length > 80 || typeof value.enabled !== 'boolean'
      || !['all', 'any'].includes(String(value.conditionMode)) || !Array.isArray(value.conditions)
      || value.conditions.length < 1 || value.conditions.length > 10) return null;
    const conditions: ProductReviewCondition[] = [];
    for (const rawCondition of value.conditions) {
      if (!rawCondition || typeof rawCondition !== 'object') return null;
      const condition = rawCondition as Record<string, unknown>;
      const conditionId = typeof condition.id === 'string' ? condition.id.trim() : '';
      const field = condition.field as ProductReviewConditionField;
      if (!conditionId || conditionId.length > 100 || !REVIEW_FIELDS.has(field)) return null;
      if (field === 'marketplace') {
        if (condition.operator !== 'equals' || !MARKETPLACES.has(String(condition.value))) return null;
      } else if (field === 'confidence') {
        if (condition.operator !== 'greater_or_equal' || typeof condition.value !== 'number'
          || condition.value < 0 || condition.value > 1) return null;
      } else if (field === 'discount_percent') {
        if (condition.operator !== 'greater_or_equal' || typeof condition.value !== 'number'
          || condition.value < 0 || condition.value > 100) return null;
      } else if (condition.operator !== 'equals' || typeof condition.value !== 'boolean') return null;
      conditions.push({
        id: conditionId,
        field,
        operator: condition.operator as ProductReviewCondition['operator'],
        value: condition.value as ProductReviewCondition['value'],
      });
    }
    rules.push({ id, name, enabled: value.enabled, conditionMode: value.conditionMode as 'all' | 'any', conditions });
  }
  return rules;
}

export class MonitoringService {
  constructor(private readonly repository: MonitoringRepository) {}

  async getReviewSettings(userId: string): Promise<AppResult<ProductReviewSettings>> {
    try {
      return ok(await this.repository.getReviewSettings(userId));
    } catch (error) { return this.persistenceError(error); }
  }

  async updateReviewSettings(userId: string, raw: unknown): Promise<AppResult<ProductReviewSettings>> {
    const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    if (typeof body.reviewRequired !== 'boolean') return VALIDATION_ERROR('Informe se a revisão global deve ficar ligada ou desligada.');
    const autoApprovalRules = reviewRules(body.autoApprovalRules);
    if (!autoApprovalRules) return VALIDATION_ERROR('Revise as condições de aprovação automática informadas.');
    try {
      const settings = await this.repository.setReviewSettings(userId, { reviewRequired: body.reviewRequired, autoApprovalRules });
      await this.safeEvent(userId, 'monitor.review_settings.updated', {
        reviewRequired: body.reviewRequired,
        autoApprovalRuleCount: autoApprovalRules.length,
      });
      await this.safeLog(userId, body.reviewRequired
        ? `Revisão global ativada: ${autoApprovalRules.length} regra(s) de aprovação automática configurada(s).`
        : 'Revisão global desativada: promoções podem ser cadastradas pelas automações ativas.',
        body.reviewRequired ? 'success' : 'warning');
      return ok(settings);
    } catch (error) { return this.persistenceError(error); }
  }

  async processIncomingMessage(userId: string, incoming: IncomingWhatsAppMessage): Promise<ProcessIncomingResult> {
    await this.safeEvent(userId, 'whatsapp.message.received', {
      connectionId: incoming.connectionId, externalGroupId: incoming.externalGroupId,
      externalMessageId: incoming.externalMessageId, messageType: incoming.type,
    });
    if (incoming.fromMe) return { outcome: 'ignored', reason: 'from_me' };
    if (!incoming.externalGroupId.endsWith('@g.us')) return { outcome: 'ignored', reason: 'not_group' };
    const origin = await this.repository.findActiveMonitor(userId, incoming.connectionId, incoming.externalGroupId);
    if (!origin) return { outcome: 'ignored', reason: 'not_monitored' };

    const text = incoming.text ?? incoming.media?.caption ?? '';
    const message: IncomingWhatsAppMessage = {
      ...incoming, text, links: extractUrls(text),
      media: incoming.media ? { ...incoming.media, caption: incoming.media.caption ?? (text || undefined) } : undefined,
    };
    const receivedAt = new Date().toISOString();
    const result = await this.repository.persistCapture({
      userId, message, groupId: origin.monitor.groupId, monitorId: origin.monitor.id,
      fingerprint: fingerprintMessage(message), receivedAt,
    });
    const outcome = result.duplicate ? 'duplicate' : 'captured';
    await this.safeEvent(userId, result.duplicate ? 'monitor.message.duplicate' : 'monitor.message.captured', {
      capturedMessageId: result.capturedMessageId, connectionId: incoming.connectionId,
      groupId: origin.monitor.groupId, monitorId: origin.monitor.id, sourceCreated: result.sourceCreated,
    });
    return { outcome, ...result };
  }

  async listMonitors(userId: string): Promise<AppResult<GroupMonitor[]>> {
    try { return ok(await this.repository.listMonitors(userId)); } catch (error) { return this.persistenceError(error); }
  }

  async createMonitor(userId: string, groupIdValue: unknown, _reviewValue?: unknown): Promise<AppResult<GroupMonitor>> {
    const groupId = typeof groupIdValue === 'string' ? groupIdValue.trim() : '';
    if (!groupId) return VALIDATION_ERROR('Selecione um grupo real do WhatsApp.');
    try {
      if (!await this.repository.userOwnsGroup(userId, groupId)) return fail('MONITOR_GROUP_FORBIDDEN', 'Grupo não encontrado para este usuário.');
      // O modo de revisão é global. O terceiro argumento legado é ignorado para
      // impedir que um grupo novo escape da chave de segurança da conta.
      const monitor = await this.repository.createMonitor(userId, groupId, await this.repository.getReviewRequired(userId));
      await this.safeEvent(userId, 'monitor.created', { monitorId: monitor.id, groupId });
      await this.safeLog(userId, `Monitoramento ativado para "${monitor.groupName}".`, 'success');
      return ok(monitor);
    } catch (error) { return this.persistenceError(error); }
  }

  async updateMonitor(userId: string, monitorId: string, raw: unknown): Promise<AppResult<GroupMonitor>> {
    const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const update: { enabled?: boolean; reviewRequired?: boolean } = {};
    if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
    if (typeof body.reviewRequired === 'boolean') update.reviewRequired = body.reviewRequired;
    if (Object.keys(update).length === 0) return VALIDATION_ERROR('Nenhuma alteração válida informada.');
    try {
      const before = await this.repository.getMonitor(userId, monitorId);
      if (!before) return fail('MONITOR_NOT_FOUND', 'Monitor não encontrado.');
      const monitor = await this.repository.updateMonitor(userId, monitorId, update);
      if (!monitor) return fail('MONITOR_NOT_FOUND', 'Monitor não encontrado.');
      if (update.enabled !== undefined && update.enabled !== before.enabled) {
        await this.safeEvent(userId, update.enabled ? 'monitor.enabled' : 'monitor.disabled', { monitorId, groupId: monitor.groupId });
        await this.safeLog(userId, update.enabled
          ? `Monitoramento ativado para "${monitor.groupName}".`
          : `Monitoramento pausado para "${monitor.groupName}".`, update.enabled ? 'success' : 'info');
      }
      return ok(monitor);
    } catch (error) { return this.persistenceError(error); }
  }

  async deleteMonitor(userId: string, monitorId: string): Promise<AppResult<void>> {
    try {
      const monitor = await this.repository.getMonitor(userId, monitorId);
      if (!monitor) return fail('MONITOR_NOT_FOUND', 'Monitor não encontrado.');
      if (!await this.repository.deleteMonitor(userId, monitorId)) return fail('MONITOR_NOT_FOUND', 'Monitor não encontrado.');
      await this.safeEvent(userId, 'monitor.removed', { monitorId, groupId: monitor.groupId });
      await this.safeLog(userId, `Monitoramento removido de "${monitor.groupName}".`, 'warning');
      return ok(undefined);
    } catch (error) { return this.persistenceError(error); }
  }

  async listCaptures(userId: string, filters: CaptureFilters): Promise<AppResult<CapturePage>> {
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 50));
    try { return ok(await this.repository.listCaptures(userId, { ...filters, limit })); }
    catch (error) { return this.persistenceError(error); }
  }

  async clearCaptureHistory(userId: string): Promise<AppResult<{ deletedCount: number }>> {
    try {
      const deletedCount = await this.repository.clearCaptureHistory(userId);
      await this.safeEvent(userId, 'monitor.capture_history.cleared', { deletedCount });
      await this.safeLog(userId, `Histórico geral de capturas limpo (${deletedCount} registro(s)).`, 'warning');
      return ok({ deletedCount });
    } catch (error) { return this.persistenceError(error); }
  }

  private async safeEvent(userId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    try { await this.repository.recordEvent(userId, eventType, payload); }
    catch (error) { console.error(`[AfiliHub:Monitoring] Falha ao registrar ${eventType}.`, error); }
  }
  private async safeLog(userId: string, message: string, level: 'info' | 'warning' | 'error' | 'success'): Promise<void> {
    try { await this.repository.recordLog(userId, message, level); }
    catch (error) { console.error('[AfiliHub:Monitoring] Falha ao registrar system_log.', error); }
  }
  private persistenceError(error: unknown): AppResult<never> {
    console.error('[AfiliHub:Monitoring] Erro de persistência.', error);
    return fail('MONITORING_PERSISTENCE_ERROR', 'Não foi possível acessar os dados de monitoramento.');
  }
}
