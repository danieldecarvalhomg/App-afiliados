import type { CampaignStatus, QueueMode } from './types';

export interface QueueCandidate {
  queueId: string; itemId: string; connectionId: string; position: number; mode: QueueMode;
  queueStatus: CampaignStatus; startedAt: string | null; lastDispatchedAt: string | null;
  nextExecutionAt: string | null; manualRequestedAt: string | null;
}

/** Política pura espelhada pelo claim atômico no banco. */
export function chooseNextQueueItem(candidates: QueueCandidate[], connectionId: string, now: Date, processingItemId?: string | null): QueueCandidate | null {
  const scoped = candidates.filter((candidate) => candidate.connectionId === connectionId);
  if (processingItemId) return scoped.find((candidate) => candidate.itemId === processingItemId) ?? null;
  const eligible = scoped.filter((candidate) => candidate.queueStatus === 'active' && candidate.nextExecutionAt && new Date(candidate.nextExecutionAt) <= now && (candidate.mode !== 'manual' || Boolean(candidate.manualRequestedAt)));
  eligible.sort((a, b) => {
    const fairnessA = a.lastDispatchedAt ? new Date(a.lastDispatchedAt).getTime() : -Infinity;
    const fairnessB = b.lastDispatchedAt ? new Date(b.lastDispatchedAt).getTime() : -Infinity;
    return fairnessA - fairnessB || a.position - b.position || a.itemId.localeCompare(b.itemId);
  });
  return eligible[0] ?? null;
}
