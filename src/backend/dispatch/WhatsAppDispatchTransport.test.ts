import { describe, expect, it, vi } from 'vitest';
import { WhatsAppDispatchTransport } from './WhatsAppDispatchTransport';

const connection = { id: 'connection-a', userId: 'user-a' };
const group = {
  id: 'group-a',
  userId: 'user-a',
  connectionId: 'connection-a',
  externalGroupId: '120363000000000000@g.us',
  syncStatus: 'active',
};

const png = () => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
  bytes[19] = 2;
  bytes[23] = 2;
  return bytes;
};

function setup(overrides: { connection?: any; groups?: any[]; result?: any } = {}) {
  const directory = {
    getConnection: vi.fn().mockResolvedValue(overrides.connection === undefined ? connection : overrides.connection),
    listGroups: vi.fn().mockResolvedValue(overrides.groups ?? [group]),
  };
  const manager = {
    sendGroupMessage: vi.fn().mockResolvedValue(overrides.result ?? {
      success: true,
      externalMessageId: 'REAL-ID',
    }),
  };
  return {
    directory,
    manager,
    transport: new WhatsAppDispatchTransport(directory as any, manager as any),
  };
}

describe('WhatsAppDispatchTransport', () => {
  it('valida ownership e encaminha texto sem alteração', async () => {
    const { transport, manager } = setup();
    const text = '*Oferta*\n_Link afiliado_';

    const result = await transport.send({
      userId: 'user-a',
      connectionId: 'connection-a',
      externalGroupId: group.externalGroupId,
      idempotencyKey: 'delivery-text-1',
      payload: { type: 'text', text },
    });

    expect(result).toEqual({ success: true, externalMessageId: 'REAL-ID' });
    expect(manager.sendGroupMessage).toHaveBeenCalledWith({
      connectionId: 'connection-a',
      externalGroupId: group.externalGroupId,
      idempotencyKey: 'delivery-text-1',
      payload: { type: 'text', text },
    });
  });

  it('rejeita conexão de outro usuário antes do provider', async () => {
    const { transport, manager } = setup({ connection: { ...connection, userId: 'user-b' } });
    const result = await transport.send({
      userId: 'user-a', connectionId: 'connection-a', externalGroupId: group.externalGroupId,
      idempotencyKey: 'delivery-forbidden-1',
      payload: { type: 'text', text: 'Oferta' },
    });
    expect(result).toMatchObject({ success: false, errorCode: 'WHATSAPP_CONNECTION_FORBIDDEN', transient: false });
    expect(manager.sendGroupMessage).not.toHaveBeenCalled();
  });

  it('rejeita grupo indisponível antes do provider', async () => {
    const { transport, manager } = setup({ groups: [{ ...group, syncStatus: 'unavailable' }] });
    const result = await transport.send({
      userId: 'user-a', connectionId: 'connection-a', externalGroupId: group.externalGroupId,
      idempotencyKey: 'delivery-unavailable-1',
      payload: { type: 'text', text: 'Oferta' },
    });
    expect(result).toMatchObject({ success: false, errorCode: 'WHATSAPP_GROUP_UNAVAILABLE', transient: false });
    expect(manager.sendGroupMessage).not.toHaveBeenCalled();
  });

  it('revalida imagem e preserva caption no payload normalizado', async () => {
    const { transport, manager } = setup();
    const image = png();
    const result = await transport.send({
      userId: 'user-a', connectionId: 'connection-a', externalGroupId: group.externalGroupId,
      idempotencyKey: 'delivery-image-1',
      payload: { type: 'image', image, mimeType: 'image/png', caption: '*Oferta com foto*' },
    });
    expect(result.success).toBe(true);
    expect(manager.sendGroupMessage).toHaveBeenCalledWith(expect.objectContaining({
      payload: { type: 'image', image, mimeType: 'image/png', caption: '*Oferta com foto*' },
    }));
  });

  it('propaga classificação uncertain sem convertê-la em retry', async () => {
    const { transport } = setup({
      result: { success: false, errorCode: 'WHATSAPP_SEND_UNCERTAIN', classification: 'uncertain' },
    });
    const result = await transport.send({
      userId: 'user-a', connectionId: 'connection-a', externalGroupId: group.externalGroupId,
      idempotencyKey: 'delivery-uncertain-1',
      payload: { type: 'text', text: 'Oferta' },
    });
    expect(result).toEqual({
      success: false,
      errorCode: 'WHATSAPP_SEND_UNCERTAIN',
      transient: false,
      uncertain: true,
    });
  });
});
