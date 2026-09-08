import { describe, expect, it, vi } from 'vitest';
import { ok } from '../../domain/errors';
import type { WhatsAppProvider } from '../../domain/whatsapp/WhatsAppProvider';
import type { WhatsAppConnection } from '../../domain/whatsapp/types';
import { WhatsAppConnectionManager } from './WhatsAppConnectionManager';

const connection: WhatsAppConnection = {
  id: 'connection-a',
  userId: 'user-a',
  label: 'Ofertas',
  phone: null,
  displayName: null,
  status: 'connected',
  connectedAt: null,
  lastSeenAt: null,
  groupsCount: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function setup(providerOverrides: Partial<WhatsAppProvider> = {}) {
  const provider: WhatsAppProvider = {
    connect: vi.fn(async () => ok(undefined)),
    disconnect: vi.fn(async () => ok(undefined)),
    destroy: vi.fn(async () => undefined),
    getConnectionStatus: vi.fn(() => 'connected' as const),
    getGroups: vi.fn(async () => ok([])),
    inspectGroupSend: vi.fn(async (externalGroupId: string) => ({
      success: true as const,
      capability: {
        externalGroupId,
        name: 'Ofertas',
        participantsCount: 2,
        announce: false,
        selfIsAdmin: false,
      },
    })),
    sendGroupMessage: vi.fn(async () => ({ success: true as const, externalMessageId: 'REAL-ID' })),
    ...providerOverrides,
  };
  const repository = {
    getEncryptedSession: vi.fn(async () => null),
    getConnection: vi.fn(async () => null),
    updateConnection: vi.fn(async () => undefined),
  };
  const manager = new WhatsAppConnectionManager(repository as any, (() => provider) as any);
  return { manager, provider };
}

describe('WhatsAppConnectionManager dispatch', () => {
  it('roteia envio somente ao provider da connection informada', async () => {
    const { manager, provider } = setup();
    await manager.connect(connection);
    const result = await manager.sendGroupMessage({
      connectionId: connection.id,
      externalGroupId: '120363000000000000@g.us',
      payload: { type: 'text', text: 'Oferta' },
    });
    expect(result).toEqual({ success: true, externalMessageId: 'REAL-ID' });
    expect(provider.sendGroupMessage).toHaveBeenCalledWith({
      externalGroupId: '120363000000000000@g.us',
      payload: { type: 'text', text: 'Oferta' },
      idempotencyKey: undefined,
    });
  });

  it('classifica provider ainda não restaurado como transitório', async () => {
    const { manager } = setup();
    await expect(manager.sendGroupMessage({
      connectionId: 'missing',
      externalGroupId: '120363000000000000@g.us',
      payload: { type: 'text', text: 'Oferta' },
    })).resolves.toEqual({
      success: false,
      errorCode: 'WHATSAPP_SESSION_NOT_READY',
      classification: 'transient',
    });
  });

  it('restaura uma conexão persistida quando o provider não está em memória', async () => {
    const { manager, provider } = setup();
    const repository = (manager as any).repository;
    repository.getConnection.mockResolvedValue(connection);

    const result = await manager.sendGroupMessage({
      connectionId: connection.id,
      externalGroupId: '120363000000000000@g.us',
      payload: { type: 'text', text: 'Oferta' },
    });

    expect(result).toEqual({ success: true, externalMessageId: 'REAL-ID' });
    expect(provider.connect).toHaveBeenCalledOnce();
  });

  it('serializa restaurações concorrentes da mesma conexão', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const provider: WhatsAppProvider = {
      connect: vi.fn(async () => { await pending; return ok(undefined); }),
      disconnect: vi.fn(async () => ok(undefined)),
      destroy: vi.fn(async () => undefined),
      getConnectionStatus: vi.fn(() => 'connected' as const),
      getGroups: vi.fn(async () => ok([])),
    };
    const factory = vi.fn(() => provider);
    const repository = {
      getEncryptedSession: vi.fn(async () => null),
      updateConnection: vi.fn(async () => undefined),
    };
    const manager = new WhatsAppConnectionManager(repository as any, factory as any);

    const first = manager.restore(connection);
    const second = manager.restore(connection);
    await vi.waitFor(() => expect(provider.connect).toHaveBeenCalledOnce());
    release();
    await Promise.all([first, second]);

    expect(factory).toHaveBeenCalledOnce();
    expect(provider.connect).toHaveBeenCalledOnce();
  });

  it('preserva compatibilidade com provider fake sem método de envio', async () => {
    const { manager } = setup({ sendGroupMessage: undefined });
    await manager.connect(connection);
    await expect(manager.sendGroupMessage({
      connectionId: connection.id,
      externalGroupId: '120363000000000000@g.us',
      payload: { type: 'text', text: 'Oferta' },
    })).resolves.toEqual({
      success: false,
      errorCode: 'WHATSAPP_SEND_UNSUPPORTED',
      classification: 'permanent',
    });
  });

  it('trata throw não normalizado do provider como uncertain', async () => {
    const { manager } = setup({
      sendGroupMessage: vi.fn(async () => { throw new Error('socket caiu após relay'); }),
    });
    await manager.connect(connection);
    await expect(manager.sendGroupMessage({
      connectionId: connection.id,
      externalGroupId: '120363000000000000@g.us',
      payload: { type: 'text', text: 'Oferta' },
    })).resolves.toEqual({
      success: false,
      errorCode: 'WHATSAPP_SEND_RESULT_UNKNOWN',
      classification: 'uncertain',
    });
  });
});
