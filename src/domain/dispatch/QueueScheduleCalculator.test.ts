import { describe, expect, it } from 'vitest';
import { chooseNextQueueItem, type QueueCandidate } from './QueueCoordinator';
import { QueueScheduleCalculator, validateQueueSettings } from './QueueScheduleCalculator';
import type { QueueSettings } from './types';

const base: QueueSettings = { mode: 'continuous', intervalBetweenItemsSeconds: 300, timezone: 'America/Sao_Paulo', allowedStartTime: '08:00', allowedEndTime: '18:00', allowedDays: [1, 2, 3, 4, 5], fixedSlots: [] };

describe('QueueScheduleCalculator', () => {
  const calculator = new QueueScheduleCalculator();
  it('mantém execução dentro da janela e pula o fim de semana no timezone da fila', () => {
    expect(calculator.nextEligible(new Date('2026-08-28T22:00:00.000Z'), base).toISOString()).toBe('2026-08-31T11:00:00.000Z');
  });
  it('seleciona o próximo slot fixo sem inventar catch-up', () => {
    const settings = { ...base, mode: 'fixed_slots' as const, fixedSlots: ['09:00', '12:30', '17:00'] };
    expect(calculator.nextEligible(new Date('2026-08-26T14:00:00.000Z'), settings).toISOString()).toBe('2026-08-26T15:30:00.000Z');
  });
  it('aplica intervalo entre itens e recalcula a partir do agora após atraso', () => {
    const values = calculator.calculate({ settings: base, items: [{ id: 'a', position: 1 }, { id: 'b', position: 2 }], now: new Date('2026-08-26T15:00:00.000Z'), lastItemCompletedAt: '2026-08-20T10:00:00.000Z' });
    expect(values.map((value) => value.nextExecutionAt)).toEqual(['2026-08-26T15:00:00.000Z', '2026-08-26T15:05:00.000Z']);
  });
  it('não agenda automaticamente fila manual e libera apenas item solicitado', () => {
    const values = calculator.calculate({ settings: { ...base, mode: 'manual' }, items: [{ id: 'a', position: 1 }, { id: 'b', position: 2, manualRequestedAt: '2026-08-26T14:00:00.000Z' }], now: new Date('2026-08-26T15:00:00.000Z') });
    expect(values).toEqual([{ itemId: 'a', position: 1, nextExecutionAt: null }, { itemId: 'b', position: 2, nextExecutionAt: '2026-08-26T15:00:00.000Z' }]);
  });
  it('rejeita janela, dias e slots inválidos', () => {
    expect(() => validateQueueSettings({ ...base, allowedStartTime: '18:00', allowedEndTime: '08:00' })).toThrow('QUEUE_WINDOW_INVALID');
    expect(() => validateQueueSettings({ ...base, allowedDays: [] })).toThrow('QUEUE_DAYS_INVALID');
    expect(() => validateQueueSettings({ ...base, mode: 'fixed_slots', fixedSlots: [] })).toThrow('QUEUE_SLOTS_REQUIRED');
  });
});

describe('coordenação justa por conexão', () => {
  const candidate = (overrides: Partial<QueueCandidate>): QueueCandidate => ({ queueId: 'q1', itemId: 'i1', connectionId: 'c1', position: 1, mode: 'continuous', queueStatus: 'active', startedAt: null, lastDispatchedAt: null, nextExecutionAt: '2026-08-26T12:00:00.000Z', manualRequestedAt: null, ...overrides });
  it('mantém a conexão reservada até o item atual terminar todos os grupos', () => {
    const values = [candidate({ queueId: 'q1', itemId: 'i1', startedAt: '2026-08-26T12:00:00.000Z' }), candidate({ queueId: 'q2', itemId: 'i2' })];
    expect(chooseNextQueueItem(values, 'c1', new Date('2026-08-26T13:00:00.000Z'), 'i1')?.itemId).toBe('i1');
  });
  it('alterna no nível de item escolhendo a fila há mais tempo sem despacho', () => {
    const values = [candidate({ queueId: 'q1', itemId: 'i1', lastDispatchedAt: '2026-08-26T12:40:00.000Z' }), candidate({ queueId: 'q2', itemId: 'i2', lastDispatchedAt: '2026-08-26T12:10:00.000Z' })];
    expect(chooseNextQueueItem(values, 'c1', new Date('2026-08-26T13:00:00.000Z'))?.queueId).toBe('q2');
  });
  it('não usa fila de outra conexão nem fila pausada', () => {
    const values = [candidate({ queueStatus: 'paused' }), candidate({ queueId: 'q2', itemId: 'i2', connectionId: 'c2' })];
    expect(chooseNextQueueItem(values, 'c1', new Date('2026-08-26T13:00:00.000Z'))).toBeNull();
  });
});
