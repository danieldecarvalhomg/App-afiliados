import type { AppResult } from '../errors';
import { fail, ok } from '../errors';
import type { AffiliateRepository } from './AffiliateRepository';
import type { AffiliateAccountSummary, AffiliateProviderCredentials, ConfigurableAffiliatePlatform } from './types';

type Validator = (credentials: AffiliateProviderCredentials) => Promise<void>;
type Validators = Partial<Record<ConfigurableAffiliatePlatform, Validator>>;

const providers: Record<ConfigurableAffiliatePlatform, string> = {
  shopee: 'shopee_open_api',
  amazon: 'amazon_creators_api',
  mercado_livre: 'mercado_livre_api',
};
const names: Record<ConfigurableAffiliatePlatform, string> = {
  shopee: 'Shopee', amazon: 'Amazon', mercado_livre: 'Mercado Livre',
};

export class AffiliateAccountService {
  constructor(private readonly repository: AffiliateRepository,
    private readonly protectCredentials?: (credentials: AffiliateProviderCredentials) => Record<string, unknown>,
    private readonly validators: Validators = {}) {}

  async list(userId: string): Promise<AppResult<AffiliateAccountSummary[]>> {
    try { return ok(await this.repository.listAccountSummaries(userId)); }
    catch { return fail('AFFILIATE_PERSISTENCE_ERROR', 'Não foi possível carregar as configurações.'); }
  }

  configureShopee(userId: string, appId: unknown, secret: unknown) {
    return this.configure(userId, 'shopee', { appId, secret });
  }
  configureAmazon(userId: string, appId: unknown, secret: unknown, partnerTag: unknown) {
    return this.configure(userId, 'amazon', { appId, secret, partnerTag });
  }
  async configureMercadoLivre(userId: string, appId: unknown, secret: unknown, accessToken: unknown, refreshToken?: unknown) {
    const existing = await this.repository.getAccountCredentials(userId, 'mercado_livre').catch(() => null);
    return this.configure(userId, 'mercado_livre', { ...existing, appId, secret, accessToken, refreshToken });
  }

  async syncMercadoLivreSession(userId: string, sessionCookie: unknown, trackingTag: unknown): Promise<AppResult<void>> {
    if (!this.protectCredentials) return fail('AFFILIATE_ENCRYPTION_NOT_CONFIGURED', 'A criptografia de credenciais afiliadas não está configurada no backend.');
    const cookie = typeof sessionCookie === 'string' ? sessionCookie.trim() : '';
    const tag = typeof trackingTag === 'string' ? trackingTag.trim() : '';
    if (cookie.length < 20 || cookie.length > 32_768 || /[\r\n]/u.test(cookie) || !tag || tag.length > 80) {
      return fail('VALIDATION_ERROR', 'A sessão ou a etiqueta do Mercado Livre é inválida.');
    }
    const existing = await this.repository.getAccountCredentials(userId, 'mercado_livre').catch(() => null);
    const credentials: AffiliateProviderCredentials = {
      ...existing,
      appId: existing?.appId ?? 'mercado-livre-session',
      secret: existing?.secret ?? 'mercado-livre-session-v1',
      sessionCookie: cookie,
      trackingTag: tag,
      sessionSyncedAt: new Date().toISOString(),
    };
    const validator = this.validators.mercado_livre;
    if (!validator) return fail('AFFILIATE_VALIDATION_NOT_CONFIGURED', 'Validação do Mercado Livre indisponível.');
    try {
      await validator(credentials);
      await this.repository.upsertAccount(userId, 'mercado_livre', 'mercado_livre_unofficial_v1', this.protectCredentials(credentials));
      await this.repository.setValidationStatus(userId, 'mercado_livre', 'valid');
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const invalid = /AUTH_REQUIRED|UNAUTHORIZED|INVALID_CREDENTIAL|401|403/u.test(message);
      return fail(invalid ? 'MERCADO_LIVRE_SESSION_INVALID' : 'MERCADO_LIVRE_SESSION_SYNC_FAILED',
        invalid ? 'A sessão do Mercado Livre expirou. Entre novamente no Chrome conectado.' : 'Não foi possível validar a sessão do Mercado Livre agora.');
    }
  }

  private async configure(userId: string, platform: ConfigurableAffiliatePlatform, raw: Record<string, unknown>): Promise<AppResult<void>> {
    if (!this.protectCredentials) return fail('AFFILIATE_ENCRYPTION_NOT_CONFIGURED', 'A criptografia de credenciais afiliadas não está configurada no backend.');
    const appId = typeof raw.appId === 'string' ? raw.appId.trim() : '';
    const secret = typeof raw.secret === 'string' ? raw.secret.trim() : '';
    const partnerTag = typeof raw.partnerTag === 'string' ? raw.partnerTag.trim() : '';
    const accessToken = typeof raw.accessToken === 'string' ? raw.accessToken.trim() : '';
    const refreshToken = typeof raw.refreshToken === 'string' ? raw.refreshToken.trim() : '';
    const sessionCookie = typeof raw.sessionCookie === 'string' ? raw.sessionCookie.trim() : '';
    const trackingTag = typeof raw.trackingTag === 'string' ? raw.trackingTag.trim() : '';
    const sessionSyncedAt = typeof raw.sessionSyncedAt === 'string' ? raw.sessionSyncedAt.trim() : '';
    if (!appId || secret.length < 8 || (platform === 'amazon' && !partnerTag) || (platform === 'mercado_livre' && !accessToken)) {
      return fail('VALIDATION_ERROR', platform === 'amazon'
        ? 'Credential ID, Credential Secret e Partner Tag da Amazon são obrigatórios.'
        : platform === 'mercado_livre'
          ? 'App ID, Secret e Access Token do Mercado Livre são obrigatórios.'
          : 'App ID e Secret da Shopee são obrigatórios.');
    }
    const credentials: AffiliateProviderCredentials = { appId, secret };
    if (partnerTag) credentials.partnerTag = partnerTag;
    if (accessToken) credentials.accessToken = accessToken;
    if (refreshToken) credentials.refreshToken = refreshToken;
    if (sessionCookie) credentials.sessionCookie = sessionCookie;
    if (trackingTag) credentials.trackingTag = trackingTag;
    if (sessionSyncedAt) credentials.sessionSyncedAt = sessionSyncedAt;
    try {
      const provider = platform === 'mercado_livre' && credentials.sessionCookie && credentials.trackingTag
        ? 'mercado_livre_unofficial_v1' : providers[platform];
      await this.repository.upsertAccount(userId, platform, provider, this.protectCredentials(credentials));
      const validator = this.validators[platform];
      if (!validator) return fail('AFFILIATE_VALIDATION_NOT_CONFIGURED', `Validação da ${names[platform]} indisponível.`);
      try {
        await validator(credentials);
        await this.repository.setValidationStatus(userId, platform, 'valid');
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const invalid = /UNAUTHORIZED|INVALID_CREDENTIAL|401|403/i.test(message);
        const code = `${platform.toUpperCase()}_${invalid ? 'CREDENTIALS_INVALID' : 'VALIDATION_ERROR'}`;
        await this.repository.setValidationStatus(userId, platform, invalid ? 'invalid' : 'error', code);
        return fail(code, invalid ? `Credenciais ${names[platform]} inválidas.` : `Não foi possível validar a conta ${names[platform]} agora.`);
      }
      return ok(undefined);
    } catch { return fail('AFFILIATE_PERSISTENCE_ERROR', 'Não foi possível salvar a configuração.'); }
  }
}
