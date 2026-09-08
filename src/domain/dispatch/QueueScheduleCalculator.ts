import type { QueueMode, QueueSettings } from './types';

export interface SchedulableQueueItem { id: string; position: number; manualRequestedAt?: string | null }
export interface QueueScheduleEntry { itemId: string; position: number; nextExecutionAt: string | null }
type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; isoDay: number };
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function parseTime(value: string) { const match = timePattern.exec(value); if (!match) throw new Error('QUEUE_TIME_INVALID'); return { hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3] ?? 0) }; }
function localParts(date: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const days: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second), isoDay: days[parts.weekday] };
}
function localToUtc(parts: Omit<LocalParts, 'isoDay'>, timeZone: string) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second); let guess = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) { const represented = localParts(new Date(guess), timeZone); const representedMs = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute, represented.second); guess += desired - representedMs; }
  return new Date(guess);
}
function dayAtOffset(base: LocalParts, offset: number) { const date = new Date(Date.UTC(base.year, base.month - 1, base.day + offset)); return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), isoDay: ((base.isoDay - 1 + offset) % 7) + 1 }; }

export function validateQueueSettings(settings: QueueSettings): QueueSettings {
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: settings.timezone }).format(); } catch { throw new Error('QUEUE_TIMEZONE_INVALID'); }
  if (!(['continuous', 'fixed_slots', 'manual'] satisfies QueueMode[]).includes(settings.mode)) throw new Error('QUEUE_MODE_INVALID');
  if (!Number.isInteger(settings.intervalBetweenItemsSeconds) || settings.intervalBetweenItemsSeconds < 1 || settings.intervalBetweenItemsSeconds > 86_400) throw new Error('QUEUE_INTERVAL_INVALID');
  const start = parseTime(settings.allowedStartTime); const end = parseTime(settings.allowedEndTime);
  if (start.hour * 3600 + start.minute * 60 + start.second >= end.hour * 3600 + end.minute * 60 + end.second) throw new Error('QUEUE_WINDOW_INVALID');
  const days = [...new Set(settings.allowedDays)].sort(); if (!days.length || days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error('QUEUE_DAYS_INVALID');
  const slots = [...new Set(settings.fixedSlots.map((slot) => { const time = parseTime(slot); return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`; }))].sort();
  if (settings.mode === 'fixed_slots' && !slots.length) throw new Error('QUEUE_SLOTS_REQUIRED');
  if (slots.some((slot) => slot < settings.allowedStartTime.slice(0, 5) || slot > settings.allowedEndTime.slice(0, 5))) throw new Error('QUEUE_SLOT_OUTSIDE_WINDOW');
  return { ...settings, allowedDays: days, fixedSlots: slots };
}

export class QueueScheduleCalculator {
  nextEligible(cursor: Date, raw: QueueSettings): Date {
    const settings = validateQueueSettings(raw); const base = localParts(cursor, settings.timezone); const start = parseTime(settings.allowedStartTime); const end = parseTime(settings.allowedEndTime);
    for (let offset = 0; offset < 370; offset += 1) {
      const day = dayAtOffset(base, offset); if (!settings.allowedDays.includes(day.isoDay)) continue;
      if (settings.mode === 'continuous') {
        const windowStart = localToUtc({ ...day, hour: start.hour, minute: start.minute, second: start.second }, settings.timezone); const windowEnd = localToUtc({ ...day, hour: end.hour, minute: end.minute, second: end.second }, settings.timezone);
        if (cursor <= windowEnd) return cursor > windowStart ? cursor : windowStart;
      } else for (const time of settings.fixedSlots.map(parseTime)) { const candidate = localToUtc({ ...day, hour: time.hour, minute: time.minute, second: time.second }, settings.timezone); if (candidate >= cursor) return candidate; }
    }
    throw new Error('QUEUE_SCHEDULE_UNAVAILABLE');
  }
  calculate(input: { settings: QueueSettings; items: SchedulableQueueItem[]; now: Date; lastItemCompletedAt?: string | null }): QueueScheduleEntry[] {
    const settings = validateQueueSettings(input.settings); const items = [...input.items].sort((a, b) => a.position - b.position);
    if (settings.mode === 'manual') return items.map((item) => ({ itemId: item.id, position: item.position, nextExecutionAt: item.manualRequestedAt ? new Date(Math.max(input.now.getTime(), new Date(item.manualRequestedAt).getTime())).toISOString() : null }));
    const intervalMs = settings.intervalBetweenItemsSeconds * 1000; let cursor = new Date(Math.max(input.now.getTime(), input.lastItemCompletedAt ? new Date(input.lastItemCompletedAt).getTime() + intervalMs : input.now.getTime()));
    return items.map((item) => { const execution = this.nextEligible(cursor, settings); cursor = new Date(execution.getTime() + intervalMs); return { itemId: item.id, position: item.position, nextExecutionAt: execution.toISOString() }; });
  }
}
