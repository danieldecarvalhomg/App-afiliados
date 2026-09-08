import type { ActiveMonitorOrigin, CaptureFilters, CapturePage, GroupMonitor, PersistCaptureInput, PersistCaptureResult } from './types';
import type { ReviewSettingsRepository } from './ReviewSettingsRepository';

export interface MonitoringRepository extends ReviewSettingsRepository {
  listMonitors(userId: string): Promise<GroupMonitor[]>;
  getMonitor(userId: string, monitorId: string): Promise<GroupMonitor | null>;
  createMonitor(userId: string, groupId: string, reviewRequired: boolean): Promise<GroupMonitor>;
  updateMonitor(userId: string, monitorId: string, update: { enabled?: boolean; reviewRequired?: boolean }): Promise<GroupMonitor | null>;
  deleteMonitor(userId: string, monitorId: string): Promise<boolean>;
  userOwnsGroup(userId: string, groupId: string): Promise<boolean>;
  findActiveMonitor(userId: string, connectionId: string, externalGroupId: string): Promise<ActiveMonitorOrigin | null>;
  persistCapture(input: PersistCaptureInput): Promise<PersistCaptureResult>;
  listCaptures(userId: string, filters: CaptureFilters): Promise<CapturePage>;
  clearCaptureHistory(userId: string): Promise<number>;
  reviewCapture(userId: string, captureId: string, decision: 'approved' | 'rejected'): Promise<boolean>;
  recordEvent(userId: string, eventType: string, payload: Record<string, unknown>): Promise<void>;
  recordLog(userId: string, message: string, level?: 'info' | 'warning' | 'error' | 'success'): Promise<void>;
}
