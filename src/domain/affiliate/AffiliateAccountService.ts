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
  configureMercadoLivre(userId: string, appId: unknown, secret: unknown, accessToken: unknown, refreshToken?: unknown) {
    return this.configure(userId, 'mercado_livre', { appId, secret, accessToken, refreshToken });
  }

  private async configure(userId: string, platform: ConfigurableAffiliatePlatform, raw: Record<string, unknown>): Promise<AppResult<void>> {
    if (!this.protectCredentials) return fail('AFFILIATE_ENCRYPTION_NOT_CONFIGURED', 'A criptografia de credenciais afiliadas não está configurada no backend.');
    const appId = typeof raw.appId === 'string' ? raw.appId.trim() : '';
    const secret = typeof raw.secret === 'string' ? raw.secret.trim() : '';
    const partnerTag = typeof raw.partnerTag === 'string' ? raw.partnerTag.trim() : '';
    const accessToken = typeof raw.accessToken === 'string' ? raw.accessToken.trim() : '';
    const refreshToken = typeof raw.refreshToken === 'string' ? raw.refreshToken.trim() : '';
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
    try {
      await this.repository.upsertAccount(userId, platform, providers[platform], this.protectCredentials(credentials));
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
