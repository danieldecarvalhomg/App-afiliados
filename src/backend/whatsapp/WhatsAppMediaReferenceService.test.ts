import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingWhatsAppMessage } from '../../domain/monitoring/types';
import type {
  WhatsAppMediaReferenceRecord,
  WhatsAppMediaReferenceRepository,
} from '../../domain/whatsapp/mediaReferences';
import { decryptProtectedPayload } from './sessionCrypto';
import { WhatsAppCaptureMediaCoordinator } from './WhatsAppCaptureMediaCoordinator';
import { WhatsAppMediaReferenceService } from './WhatsAppMediaReferenceService';

type StoredReference = WhatsAppMediaReferenceRecord & { nextAttemptAt: string };

class MemoryMediaReferenceRepository implements WhatsAppMediaReferenceRepository {
  rows: StoredReference[] = [];
  private nextId = 1;

  async upsert(input: Parameters<WhatsAppMediaReferenceRepository['upsert']>[0]) {
    const current = this.rows.find((row) => row.userId === input.userId
      && row.connectionId === input.connectionId
      && row.externalGroupId === input.externalGroupId
      && row.externalMessageId === input.externalMessageId
      && row.mediaType === input.mediaType);
    if (current) {
      if (current.status !== 'downloaded') {
        current.encryptedPayload = input.encryptedPayload;
        current.status = 'pending';
      }
      return current.id;
    }
    const row: StoredReference = {
      id: `reference-${this.nextId++}`,
      ...input,
      status: 'pending',
      attemptCount: 0,
      workerId: null,
      nextAttemptAt: new Date(0).toISOString(),
    };
    this.rows.push(row);
    return row.id;
  }

  async claimForCapture(input: Parameters<WhatsAppMediaReferenceRepository['claimForCapture']>[0]) {
    const now = Date.now();
    if (this.rows.some((candidate) => candidate.userId === input.userId
      && candidate.capturedMessageId === input.capturedMessageId
      && candidate.status === 'claimed' && candidate.workerId !== null)) return null;
    const row = this.rows.find((candidate) => candidate.userId === input.userId
      && candidate.capturedMessageId === input.capturedMessageId
      && candidate.encryptedPayload
      && candidate.attemptCount < 3
      && new Date(candidate.expiresAt).getTime() > now
      && ((candidate.status === 'pending' && new Date(candidate.nextAttemptAt).getTime() <= now)
        || (candidate.status === 'claimed' && candidate.workerId === null)));
    if (!row) return null;
    row.status = 'claimed';
    row.workerId = input.workerId;
    row.attemptCount += 1;
    return { ...row };
  }

  async markDownloaded(reference: WhatsAppMediaReferenceRecord) {
    for (const row of this.rows.filter((candidate) => candidate.userId === reference.userId
      && candidate.capturedMessageId === reference.capturedMessageId
      && (candidate.status === 'pending' || candidate.status === 'claimed'))) {
      row.status = 'downloaded'; row.encryptedPayload = null; row.workerId = null;
    }
  }

  async markFailure(reference: WhatsAppMediaReferenceRecord, input: Parameters<WhatsAppMediaReferenceRepository['markFailure']>[1]) {
    const row = this.rows.find((candidate) => candidate.id === reference.id && candidate.workerId === reference.workerId);
    if (!row) return;
    row.status = input.status;
    row.nextAttemptAt = input.retryAt ?? new Date(0).toISOString();
    row.workerId = null;
    if (input.status !== 'pending') row.encryptedPayload = null;
  }

  async cleanup() {
    let changed = 0;
    for (const row of this.rows) {
      if ((row.status === 'pending' || row.status === 'claimed') && new Date(row.expiresAt).getTime() <= Date.now()) {
        row.status = 'expired'; row.encryptedPayload = null; row.workerId = null; changed += 1;
      }
    }
    return changed;
  }

  async hasPending(userId: string, capturedMessageId: string) {
    return this.rows.some((row) => row.userId === userId && row.capturedMessageId === capturedMessageId
      && (row.status === 'pending' || row.status === 'claimed') && new Date(row.expiresAt).getTime() > Date.now());
  }
}

const mediaKey = Buffer.alloc(32, 19).toString('base64');
const message = (connectionId = 'connection-a'): IncomingWhatsAppMessage => ({
  connectionId,
  externalMessageId: 'message-1',
  externalGroupId: 'group@g.us',
  fromMe: false,
  type: 'image',
  text: 'Oferta real',
  links: [],
  media: { available: true, mimeType: 'image/jpeg' },
  mediaRecoveryReference: { mediaType: 'image', mediaKeyBase64: mediaKey, directPath: '/v/t62/path', url: null },
  sentAt: new Date().toISOString(),
});

beforeEach(() => {
  process.env.WHATSAPP_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('WhatsAppMediaReferenceService', () => {
  it('persiste somente a referência mínima cifrada e não baixa antes da promoção', async () => {
    const repository = new MemoryMediaReferenceRepository();
    const downloader = { downloadReference: vi.fn() };
    const service = new WhatsAppMediaReferenceService(repository, downloader as any);
    await service.register('user-a', 'capture-1', message());
    expect(downloader.downloadReference).not.toHaveBeenCalled();
    expect(repository.rows).toHaveLength(1);
    expect(repository.rows[0].encryptedPayload).not.toContain(mediaKey);
    expect(JSON.parse(decryptProtectedPayload(repository.rows[0].encryptedPayload!))).toEqual({
      mediaType: 'image', mediaKeyBase64: mediaKey, directPath: '/v/t62/path', url: null,
    });
    expect(decryptProtectedPayload(repository.rows[0].encryptedPayload!)).not.toMatch(/auth|signal|proto|session/i);
  });

  it('é idempotente por mensagem e preserva fontes de duas conexões', async () => {
    const repository = new MemoryMediaReferenceRepository();
    const service = new WhatsAppMediaReferenceService(repository, { downloadReference: vi.fn() } as any);
    await service.register('user-a', 'capture-1', message('connection-a'));
    await service.register('user-a', 'capture-1', message('connection-a'));
    await service.register('user-a', 'capture-1', message('connection-b'));
    expect(repository.rows).toHaveLength(2);
    expect(repository.rows.map((row) => row.connectionId)).toEqual(['connection-a', 'connection-b']);
  });

  it('ignora texto, conversa privada e fromMe', async () => {
    const repository = new MemoryMediaReferenceRepository();
    const service = new WhatsAppMediaReferenceService(repository, { downloadReference: vi.fn() } as any);
    await service.register('user-a', 'capture-1', { ...message(), type: 'text', mediaRecoveryReference: undefined });
    await service.register('user-a', 'capture-1', { ...message(), externalGroupId: 'person@s.whatsapp.net' });
    await service.register('user-a', 'capture-1', { ...message(), fromMe: true });
    expect(repository.rows).toHaveLength(0);
  });

  it('recupera após uma nova instância, conclui o download e destrói o payload', async () => {
    const repository = new MemoryMediaReferenceRepository();
    await new WhatsAppMediaReferenceService(repository, { downloadReference: vi.fn() } as any)
      .register('user-a', 'capture-1', message());
    const downloader = { downloadReference: vi.fn().mockResolvedValue({ success: true, bytes: new Uint8Array([1, 2]), mimeType: null }) };
    const afterRestart = new WhatsAppMediaReferenceService(repository, downloader);
    await expect(afterRestart.download({ userId: 'user-a', sourceReferenceId: 'capture-1', connectionId: 'connection-a', externalGroupId: 'group@g.us', externalMessageId: 'message-1' }))
      .resolves.toEqual({ bytes: new Uint8Array([1, 2]), mimeType: 'image/jpeg' });
    expect(repository.rows[0]).toMatchObject({ status: 'downloaded', encryptedPayload: null });
  });

  it('um download concluído encerra e destrói payloads de todas as fontes irmãs', async () => {
    const repository = new MemoryMediaReferenceRepository();
    const service = new WhatsAppMediaReferenceService(repository, { downloadReference: vi.fn() } as any);
    await service.register('user-a', 'capture-1', message('connection-a'));
    await service.register('user-a', 'capture-1', message('connection-b'));
    const restarted = new WhatsAppMediaReferenceService(repository, {
      downloadReference: vi.fn().mockResolvedValue({ success: true, bytes: new Uint8Array([7]), mimeType: 'image/jpeg' }),
    });
    await restarted.download({ userId: 'user-a', sourceReferenceId: 'capture-1', connectionId: '', externalGroupId: '', externalMessageId: '' });
    expect(repository.rows).toHaveLength(2);
    expect(repository.rows.every((row) => row.status === 'downloaded' && row.encryptedPayload === null)).toBe(true);
  });

  it('faz fallback apenas entre fontes legítimas da mesma captura', async () => {
    const repository = new MemoryMediaReferenceRepository();
    const service = new WhatsAppMediaReferenceService(repository, { downloadReference: vi.fn() } as any);
    await service.register('user-a', 'capture-1', message('connection-a'));
    await service.register('user-a', 'capture-1', message('connection-b'));
    const downloader = { downloadReference: vi.fn()
      .mockResolvedValueOnce({ success: false, errorCode: 'WHATSAPP_MEDIA_UNAVAILABLE', transient: false })
      .mockResolvedValueOnce({ success: true, bytes: new Uint8Array([9]), mimeType: 'image/jpeg' }) };
    const restarted = new WhatsAppMediaReferenceService(repository, downloader);
    await expect(restarted.download({ userId: 'user-a', sourceReferenceId: 'capture-1', connectionId: 'ignored', externalGroupId: 'ignored', externalMessageId: 'ignored' }))
      .resolves.toMatchObject({ bytes: new Uint8Array([9]) });
    expect(downloader.downloadReference.mock.calls.map(([input]) => input.connectionId)).toEqual(['connection-a', 'connection-b']);
  });

  it('isola usuário, claim concorrente e falha transitória sem loop infinito', async () => {
    const repository = new MemoryMediaReferenceRepository();
    const downloader = { downloadReference: vi.fn().mockResolvedValue({ success: false, errorCode: 'WHATSAPP_MEDIA_BAD_MAC', transient: true }) };
    const service = new WhatsAppMediaReferenceService(repository, downloader);
    await service.register('user-a', 'capture-1', message());
    await expect(service.download({ userId: 'user-b', sourceReferenceId: 'capture-1', connectionId: '', externalGroupId: '', externalMessageId: '' })).resolves.toBeNull();
    const [first, second] = await Promise.all([
      service.download({ userId: 'user-a', sourceReferenceId: 'capture-1', connectionId: '', externalGroupId: '', externalMessageId: '' }),
      service.download({ userId: 'user-a', sourceReferenceId: 'capture-1', connectionId: '', externalGroupId: '', externalMessageId: '' }),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(2);
    expect(downloader.downloadReference).toHaveBeenCalledTimes(1);
    repository.rows[0].nextAttemptAt = new Date(0).toISOString();
    await service.download({ userId: 'user-a', sourceReferenceId: 'capture-1', connectionId: '', externalGroupId: '', externalMessageId: '' });
    repository.rows[0].nextAttemptAt = new Date(0).toISOString();
    await service.download({ userId: 'user-a', sourceReferenceId: 'capture-1', connectionId: '', externalGroupId: '', externalMessageId: '' });
    expect(repository.rows[0]).toMatchObject({ status: 'failed', attemptCount: 3, encryptedPayload: null });
  });

  it('expira referências sem deixá-las eternamente pendentes', async () => {
    const repository = new MemoryMediaReferenceRepository();
    const service = new WhatsAppMediaReferenceService(repository, { downloadReference: vi.fn() } as any, -1);
    await service.register('user-a', 'capture-1', message());
    expect(await service.cleanup()).toBe(1);
    expect(repository.rows[0]).toMatchObject({ status: 'expired', encryptedPayload: null });
  });
});

describe('WhatsAppCaptureMediaCoordinator', () => {
  it('preserva a captura quando a persistência secundária falha e não vaza o payload no log', async () => {
    const monitoring = { processIncomingMessage: vi.fn().mockResolvedValue({ outcome: 'captured', capturedMessageId: 'capture-1' }) };
    const references = { register: vi.fn().mockRejectedValue(new Error('DB_TEMPORARILY_UNAVAILABLE')) };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const coordinator = new WhatsAppCaptureMediaCoordinator(monitoring as any, references as any);
    await expect(coordinator.handle('user-a', message())).resolves.toEqual({ outcome: 'captured', capturedMessageId: 'capture-1' });
    expect(JSON.stringify(warning.mock.calls)).not.toContain(mediaKey);
    warning.mockRestore();
  });
});
