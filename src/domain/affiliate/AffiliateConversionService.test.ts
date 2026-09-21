import { describe, expect, it, vi } from 'vitest';
import type { AffiliateRepository, AffiliateAccountWithCredentials, ConversionCompletion } from './AffiliateRepository';
import type { AffiliateConversion, AffiliateConversionStatus, AffiliatePlatform } from './types';
import { AffiliateConversionService } from './AffiliateConversionService';
import { AffiliateLinkService } from './AffiliateLinkService';
import type { AffiliateLinkProvider } from './AffiliateLinkProvider';
import { MercadoLivreLinkRecoveryService } from '../../backend/affiliate/mercado-livre/MercadoLivreLinkRecoveryService';

const originalUrl = 'https://shopee.com.br/product/123';
function conversion(overrides: Partial<AffiliateConversion> = {}): AffiliateConversion {
  return { id: 'conversion-1', userId: 'user-a', sourceType: 'manual', sourceReferenceId: 'product-1',
    affiliateAccountId: null, originalUrl, resolvedUrl: null, detectedPlatform: null, convertedUrl: null,
    status: 'pending', errorCode: null, provider: null, workerId: '', attemptCount: 0, ...overrides };
}

class MemoryRepository {
  readonly rows: AffiliateConversion[];
  readonly accounts = new Map<string, AffiliateAccountWithCredentials>();
  readonly updates: ConversionCompletion[] = [];
  seedWhatsAppProducts = vi.fn(async () => 0);
  getConfiguredAccount = vi.fn(async (userId: string, platform: AffiliatePlatform) =>
    this.accounts.get(`${userId}:${platform}`) ?? null);
  getDeclaredMarketplace = vi.fn(async (): Promise<AffiliatePlatform | 'unknown' | null> => 'shopee');
  constructor(...rows: AffiliateConversion[]) { this.rows = rows; }
  async claimNext(workerId: string): Promise<AffiliateConversion | null> {
    const row = this.rows.find((item) => item.status === 'pending');
    if (!row) return null;
    row.status = 'resolving'; row.workerId = workerId; row.attemptCount += 1;
    return { ...row };
  }
  async updateClaim(input: ConversionCompletion): Promise<boolean> {
    const row = this.rows.find((item) => item.id === input.conversion.id);
    if (!row || row.workerId !== input.conversion.workerId) return false;
    row.status = input.status; row.resolvedUrl = input.resolvedUrl ?? row.resolvedUrl;
    row.detectedPlatform = input.detectedPlatform ?? row.detectedPlatform;
    if ('convertedUrl' in input) row.convertedUrl = input.convertedUrl ?? null;
    row.errorCode = input.errorCode ?? null; this.updates.push(input); return true;
  }
  async scheduleRetry(row: AffiliateConversion, errorCode: string): Promise<void> {
    const stored = this.rows.find((item) => item.id === row.id)!;
    stored.status = 'pending'; stored.errorCode = errorCode; stored.workerId = '';
  }
  recordEvent = vi.fn(async () => {});
}

function service(repository: MemoryRepository, provider: AffiliateLinkProvider, automations?: { publish: ReturnType<typeof vi.fn> }) {
  const resolver = { resolve: vi.fn(async (url: string) => ({ originalUrl: url, resolvedUrl: url,
    resolvedAt: new Date().toISOString(), redirectCount: 0 })) };
  return { service: new AffiliateConversionService(repository as unknown as AffiliateRepository,
    resolver as any, new AffiliateLinkService([provider]), undefined, undefined, automations), resolver };
}
function provider(result: { success: boolean; convertedUrl: string | null; errorCode?: string }): AffiliateLinkProvider {
  return { platform: 'shopee', providerName: 'shopee-test', convert: vi.fn(async () => ({ provider: 'shopee-test', ...result })) };
}

describe('AffiliateConversionService', () => {
  it('marca Shopee sem configuração com estado específico e converted_url nula', async () => {
    const repository = new MemoryRepository(conversion());
    const runtime = service(repository, provider({ success: true, convertedUrl: 'https://s.shopee.com.br/ok' }));
    await runtime.service.drain();
    expect(repository.rows[0]).toMatchObject({ status: 'affiliate_account_not_configured', convertedUrl: null });
  });

  it('falha do provider jamais transforma original_url em affiliate_url', async () => {
    const repository = new MemoryRepository(conversion());
    repository.accounts.set('user-a:shopee', { id: 'account-a', credentials: { appId: 'app', secret: 'secret' } });
    await service(repository, provider({ success: false, convertedUrl: originalUrl, errorCode: 'PROVIDER_ERROR' })).service.drain();
    expect(repository.rows[0]).toMatchObject({ status: 'conversion_failed', convertedUrl: null, errorCode: 'PROVIDER_ERROR' });
    expect(repository.rows[0].convertedUrl).not.toBe(originalUrl);
  });

  it('classifica link rejeitado pelo provider como inválido sem retry', async () => {
    const repository = new MemoryRepository(conversion());
    repository.accounts.set('user-a:shopee', { id: 'account-a', credentials: { appId: 'app', secret: 'secret' } });
    await service(repository, provider({ success: false, convertedUrl: null, errorCode: 'LINK_VALIDATION_FAILED' })).service.drain();
    expect(repository.rows[0]).toMatchObject({ status: 'invalid_url', convertedUrl: null, errorCode: 'LINK_VALIDATION_FAILED' });
  });

  it('não processa novamente uma conversão já converted', async () => {
    const repository = new MemoryRepository(conversion());
    repository.accounts.set('user-a:shopee', { id: 'account-a', credentials: { appId: 'app', secret: 'secret' } });
    const affiliateProvider = provider({ success: true, convertedUrl: 'https://s.shopee.com.br/ok' });
    const runtime = service(repository, affiliateProvider);
    expect(await runtime.service.drain()).toBe(1);
    expect(await runtime.service.drain()).toBe(0);
    expect(affiliateProvider.convert).toHaveBeenCalledTimes(1);
    expect(affiliateProvider.convert).toHaveBeenCalledWith(expect.objectContaining({ subIds: ['pconversion1'] }));
    expect(repository.rows[0]).toMatchObject({ status: 'converted', convertedUrl: 'https://s.shopee.com.br/ok' });
  });

  it('publica AFFILIATE_CONVERTED somente depois de persistir a conversão', async () => {
    const repository = new MemoryRepository(conversion());
    repository.accounts.set('user-a:shopee', { id: 'account-a', credentials: { appId: 'app', secret: 'secret' } });
    const automations = { publish: vi.fn(async () => {
      expect(repository.rows[0].status).toBe('converted');
    }) };
    await service(repository, provider({ success: true, convertedUrl: 'https://s.shopee.com.br/ok' }), automations).service.drain();
    expect(automations.publish).toHaveBeenCalledWith('user-a', 'AFFILIATE_CONVERTED', 'conversion-1:converted', {
      conversionId: 'conversion-1', platform: 'shopee',
    });
  });

  it('usuário A nunca usa a conta afiliada do usuário B', async () => {
    const repository = new MemoryRepository(conversion({ userId: 'user-a' }));
    repository.accounts.set('user-b:shopee', { id: 'account-b', credentials: { appId: 'b', secret: 'b-secret' } });
    const affiliateProvider = provider({ success: true, convertedUrl: 'https://s.shopee.com.br/b' });
    await service(repository, affiliateProvider).service.drain();
    expect(repository.getConfiguredAccount).toHaveBeenCalledWith('user-a', 'shopee');
    expect(affiliateProvider.convert).not.toHaveBeenCalled();
    expect(repository.rows[0].status).toBe('affiliate_account_not_configured');
  });

  it('registra inconsistência e usa o domínio resolvido como fonte de verdade', async () => {
    const repository = new MemoryRepository(conversion());
    repository.getDeclaredMarketplace.mockResolvedValue('amazon');
    repository.accounts.set('user-a:shopee', { id: 'account-a', credentials: { appId: 'app', secret: 'secret' } });
    await service(repository, provider({ success: true, convertedUrl: 'https://s.shopee.com.br/domain-truth' })).service.drain();
    expect(repository.recordEvent).toHaveBeenCalledWith('user-a', 'affiliate.platform_mismatch', expect.objectContaining({ declaredPlatform: 'amazon', detectedPlatform: 'shopee' }));
    expect(repository.rows[0].status).toBe('converted');
  });

  it('recupera backlog sem depender da chegada de nova mensagem', async () => {
    const repository = new MemoryRepository(conversion({ sourceType: 'whatsapp', sourceReferenceId: 'analysis-1' }));
    repository.accounts.set('user-a:shopee', { id: 'account-a', credentials: { appId: 'app', secret: 'secret' } });
    await service(repository, provider({ success: true, convertedUrl: 'https://s.shopee.com.br/wa' })).service.drain();
    expect(repository.seedWhatsAppProducts).toHaveBeenCalled();
    expect(repository.rows[0]).toMatchObject({ sourceType: 'whatsapp', status: 'converted' });
  });

  it('permite revalidar link inválido do Mercado Livre pelo recuperador social', async () => {
    const repository = new MemoryRepository(conversion({ status: 'invalid_url' }));
    (repository as any).getProduct = vi.fn(async () => ({
      affiliateStatus: 'invalid_url', marketplace: 'mercado_livre', sourceUrl: 'https://meli.la/13eXLrm',
      affiliateConversionId: 'conversion-1',
    }));
    (repository as any).resetConversion = vi.fn(async () => true);
    const runtime = service(repository, provider({ success: true, convertedUrl: 'https://s.shopee.com.br/unused' }));
    vi.spyOn(runtime.service, 'kick').mockImplementation(() => {});

    await expect(runtime.service.reprocess('user-a', 'product-1')).resolves.toMatchObject({ success: true });
    expect((repository as any).resetConversion).toHaveBeenCalledWith('user-a', 'conversion-1');
  });

  it('mantém bloqueado o retry de link inválido de outro marketplace', async () => {
    const repository = new MemoryRepository(conversion({ status: 'invalid_url' }));
    (repository as any).getProduct = vi.fn(async () => ({
      affiliateStatus: 'invalid_url', marketplace: 'shopee', sourceUrl: originalUrl,
      affiliateConversionId: 'conversion-1',
    }));
    const runtime = service(repository, provider({ success: true, convertedUrl: 'https://s.shopee.com.br/unused' }));

    await expect(runtime.service.reprocess('user-a', 'product-1')).resolves.toMatchObject({
      success: false, error: { code: 'AFFILIATE_REPROCESS_NOT_ALLOWED' },
    });
  });

  it('preserva link direto do Mercado Livre sem seguir redirecionamento de verificação', async () => {
    const productUrl = 'https://www.mercadolivre.com.br/produto/p/MLB12345678?wid=MLB87654321';
    const repository = new MemoryRepository(conversion({ originalUrl: productUrl }));
    repository.getDeclaredMarketplace.mockResolvedValue('mercado_livre');
    repository.accounts.set('user-a:mercado_livre', { id: 'account-ml', credentials: { appId: 'app', secret: 'secret' } });
    const mlProvider: AffiliateLinkProvider = {
      platform: 'mercado_livre', providerName: 'mercado-livre-test',
      convert: vi.fn(async () => ({ success: true, convertedUrl: 'https://meli.la/converted123', provider: 'mercado-livre-test' })),
    };
    const runtime = service(repository, mlProvider);
    runtime.resolver.resolve.mockResolvedValue({ originalUrl: productUrl,
      resolvedUrl: 'https://www.mercadolivre.com.br/gz/account-verification', resolvedAt: new Date().toISOString(), redirectCount: 1 });

    await runtime.service.drain();

    expect(runtime.resolver.resolve).not.toHaveBeenCalled();
    expect(mlProvider.convert).toHaveBeenCalledWith(expect.objectContaining({ url: productUrl }));
    expect(repository.rows[0]).toMatchObject({ status: 'converted', resolvedUrl: productUrl });
  });

  it('preserva URL universal MLBU do Radar sem cair no CAPTCHA do resolvedor', async () => {
    const productUrl = 'https://www.mercadolivre.com.br/lavadora/up/MLBU605239077';
    const repository = new MemoryRepository(conversion({ originalUrl: productUrl, sourceType: 'marketplace_radar' }));
    repository.getDeclaredMarketplace.mockResolvedValue('mercado_livre');
    repository.accounts.set('user-a:mercado_livre', { id: 'account-ml', credentials: { appId: 'app', secret: 'secret' } });
    const mlProvider: AffiliateLinkProvider = {
      platform: 'mercado_livre', providerName: 'mercado-livre-test',
      convert: vi.fn(async () => ({ success: true, convertedUrl: 'https://meli.la/converted123', provider: 'mercado-livre-test' })),
    };
    const runtime = service(repository, mlProvider);
    runtime.resolver.resolve.mockResolvedValue({ originalUrl: productUrl,
      resolvedUrl: 'https://www.mercadolivre.com.br/captcha/wall', resolvedAt: new Date().toISOString(), redirectCount: 1 });

    await runtime.service.drain();

    expect(runtime.resolver.resolve).not.toHaveBeenCalled();
    expect(mlProvider.convert).toHaveBeenCalledWith(expect.objectContaining({ url: productUrl }));
    expect(repository.rows[0]).toMatchObject({ status: 'converted', resolvedUrl: productUrl });
  });

  it('converte meli.la do monitor sem passar pelo resolvedor público', async () => {
    const shortUrl = 'https://meli.la/2FdaeDB';
    const repository = new MemoryRepository(conversion({ originalUrl: shortUrl, sourceType: 'whatsapp' }));
    repository.getDeclaredMarketplace.mockResolvedValue('mercado_livre');
    repository.accounts.set('user-a:mercado_livre', { id: 'account-ml', credentials: { appId: 'app', secret: 'secret' } });
    const mlProvider: AffiliateLinkProvider = {
      platform: 'mercado_livre', providerName: 'mercado-livre-test',
      convert: vi.fn(async () => ({ success: true, convertedUrl: 'https://meli.la/converted123', provider: 'mercado-livre-test' })),
    };
    const runtime = service(repository, mlProvider);

    await runtime.service.drain();

    expect(runtime.resolver.resolve).not.toHaveBeenCalled();
    expect(mlProvider.convert).toHaveBeenCalledWith(expect.objectContaining({ url: shortUrl }));
    expect(repository.rows[0]).toMatchObject({ status: 'converted', resolvedUrl: shortUrl });
  });

  it('permite tentar novamente quando a conversão ficou aguardando a extensão', async () => {
    const repository = new MemoryRepository(conversion({ status: 'awaiting_companion' }));
    (repository as any).getProduct = vi.fn(async () => ({
      affiliateStatus: 'awaiting_companion', marketplace: 'mercado_livre', sourceUrl: 'https://produto.mercadolivre.com.br/MLB-12345678',
      affiliateConversionId: 'conversion-1',
    }));
    (repository as any).resetConversion = vi.fn(async () => true);
    const runtime = service(repository, provider({ success: true, convertedUrl: 'https://s.shopee.com.br/unused' }));
    vi.spyOn(runtime.service, 'kick').mockImplementation(() => {});

    await expect(runtime.service.reprocess('user-a', 'product-1')).resolves.toMatchObject({ success: true });
    expect((repository as any).resetConversion).toHaveBeenCalledWith('user-a', 'conversion-1');
  });

  it('recupera a página social do Mercado Livre e converte o primeiro produto', async () => {
    const profileUrl = 'https://www.mercadolivre.com.br/social/danielguimaraes';
    const productUrl = 'https://www.mercadolivre.com.br/camisa-casual/up/MLBU3776074237?pdp_filters=item_id%3AMLB3776074237';
    const repository = new MemoryRepository(conversion({ originalUrl: profileUrl }));
    repository.getDeclaredMarketplace.mockResolvedValue('mercado_livre');
    repository.accounts.set('user-a:mercado_livre', { id: 'account-ml', credentials: { appId: 'app', secret: 'secret' } });
    const mlProvider: AffiliateLinkProvider = {
      platform: 'mercado_livre', providerName: 'mercado-livre-test',
      convert: vi.fn(async () => ({ success: true, convertedUrl: 'https://meli.la/converted123', provider: 'mercado-livre-test' })),
    };
    const resolver = {
      resolve: vi.fn(async (url: string) => ({ originalUrl: url, resolvedUrl: profileUrl, resolvedAt: new Date().toISOString(), redirectCount: 1 })),
      fetchDocument: vi.fn(async () => ({ status: 200, contentType: 'text/html', body: `<a href="${productUrl}">Ir para produto</a>` })),
    };
    const service = new AffiliateConversionService(repository as unknown as AffiliateRepository, resolver as any,
      new AffiliateLinkService([mlProvider]), new MercadoLivreLinkRecoveryService(resolver));

    await service.drain();

    expect(mlProvider.convert).toHaveBeenCalledWith(expect.objectContaining({ url: productUrl }));
    expect(repository.rows[0]).toMatchObject({ status: 'converted', resolvedUrl: productUrl });
    expect(repository.recordEvent).toHaveBeenCalledWith('user-a', 'affiliate.link_recovered', expect.objectContaining({
      profileUrl, productUrl, candidateCount: 1,
    }));
  });
});
