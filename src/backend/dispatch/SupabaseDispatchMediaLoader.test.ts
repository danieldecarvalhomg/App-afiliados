import { describe, expect, it, vi } from 'vitest';
import { SupabaseDispatchMediaLoader } from './SupabaseDispatchMediaLoader';

const png = () => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
  bytes[19] = 2;
  bytes[23] = 2;
  return bytes;
};

function setup(row: any, readResult: any = { bytes: png(), mimeType: 'image/png' }) {
  const filters: Record<string, unknown> = {};
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => { filters[key] = value; return query; }),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  };
  const db = { from: vi.fn(() => query) };
  const storage = { read: vi.fn().mockResolvedValue(readResult) };
  return {
    filters,
    storage,
    loader: new SupabaseDispatchMediaLoader(db as any, storage as any),
  };
}

describe('SupabaseDispatchMediaLoader', () => {
  it('resolve asset owned/completed e lê diretamente do storage privado', async () => {
    const { loader, storage, filters } = setup({
      id: 'asset-a', user_id: 'user-a', analysis_status: 'completed',
      storage_path: 'user-a/product-a/hash.png', mime_type: 'image/png',
    });
    const result = await loader.load('user-a', 'asset-a');
    expect(result.mimeType).toBe('image/png');
    expect(filters).toEqual({ id: 'asset-a', user_id: 'user-a' });
    expect(storage.read).toHaveBeenCalledWith('user-a/product-a/hash.png');
  });

  it('não revela nem lê asset ausente/cross-user', async () => {
    const { loader, storage } = setup({
      id: 'asset-b', user_id: 'user-b', analysis_status: 'completed',
      storage_path: 'user-b/product-b/hash.png', mime_type: 'image/png',
    });
    await expect(loader.load('user-a', 'asset-b')).rejects.toThrow('MEDIA_ASSET_NOT_FOUND');
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('rejeita asset ainda não validado ou sem storage_path', async () => {
    const { loader, storage } = setup({
      id: 'asset-a', user_id: 'user-a', analysis_status: 'pending', storage_path: null, mime_type: null,
    });
    await expect(loader.load('user-a', 'asset-a')).rejects.toThrow('MEDIA_INVALID');
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('impede storage_path que escape do prefixo do owner', async () => {
    const { loader, storage } = setup({
      id: 'asset-a', user_id: 'user-a', analysis_status: 'completed',
      storage_path: 'user-b/product-b/hash.png', mime_type: 'image/png',
    });
    await expect(loader.load('user-a', 'asset-a')).rejects.toThrow('MEDIA_INVALID');
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('classifica indisponibilidade do storage como transitória', async () => {
    const { loader } = setup({
      id: 'asset-a', user_id: 'user-a', analysis_status: 'completed',
      storage_path: 'user-a/product-a/hash.png', mime_type: 'image/png',
    });
    (loader as any).storage.read.mockRejectedValue(new Error('storage unavailable'));
    await expect(loader.load('user-a', 'asset-a')).rejects.toThrow('MEDIA_STORAGE_TEMPORARILY_UNAVAILABLE');
  });
});
