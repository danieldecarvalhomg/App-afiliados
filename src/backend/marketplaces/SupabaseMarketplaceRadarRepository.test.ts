import { describe, expect, it, vi } from 'vitest';
import { SupabaseMarketplaceRadarRepository } from './SupabaseMarketplaceRadarRepository';

function query(result: unknown) {
  const chain: any = {
    select: vi.fn(() => chain), in: vi.fn(() => chain), eq: vi.fn(() => chain), not: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)),
  };
  return chain;
}

describe('SupabaseMarketplaceRadarRepository.listDueAccounts', () => {
  it('agenda somente contas com credenciais da API do catálogo', async () => {
    const db = { from: vi.fn(() => query({ data: [
      { user_id: 'user-shopee', platform: 'shopee', encrypted_credentials: { value: 'encrypted' } },
      { user_id: 'user-ml', platform: 'mercado_livre', encrypted_credentials: null },
    ], error: null })) };
    const result = await new SupabaseMarketplaceRadarRepository(db as any).listDueAccounts();
    expect(result).toEqual([
      { userId: 'user-shopee', marketplace: 'shopee' },
    ]);
  });
});
