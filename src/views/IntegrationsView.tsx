import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  CircleDot,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MessageSquare,
  MessagesSquare,
  Plus,
  RefreshCw,
  Settings,
  Store,
  Smartphone,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { Integration } from "../types";
import type {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
} from "../domain/whatsapp/types";
import { integrationsNavigation, whatsappApi } from "../services/whatsappApi";
import type { AffiliateAccountSummary, ConfigurableAffiliatePlatform } from "../domain/affiliate/types";
import { productsApi } from "../services/productsApi";
import { mercadoLivreAffiliateApi, type MercadoLivreAffiliateStatus } from "../services/mercadoLivreAffiliateApi";
import { isMobileDevice } from "../lib/device";

type IntegrationSection = "marketplaces" | "messages";

const statusMeta: Record<
  WhatsAppConnectionStatus,
  { label: string; color: string }
> = {
  disconnected: { label: "Não conectado", color: "text-[#6B6F7B]" },
  qr_required: { label: "Aguardando QR", color: "text-[#EAB308]" },
  connecting: { label: "Conectando", color: "text-[#3B82F6]" },
  connected: { label: "Conectado", color: "text-emerald-600" },
  reconnecting: { label: "Reconectando", color: "text-[#EAB308]" },
  logged_out: { label: "Sessão encerrada", color: "text-[#EF4444]" },
  error: { label: "Erro", color: "text-[#EF4444]" },
};

export const IntegrationsView: React.FC = () => {
  const { integrations, updateIntegrationConfig } = useApp();
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [configuring, setConfiguring] = useState<Integration | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [activeSection, setActiveSection] =
    useState<IntegrationSection>("marketplaces");
  const [affiliateAccounts, setAffiliateAccounts] = useState<
    AffiliateAccountSummary[]
  >([]);
  const [marketplaceConfigOpen, setMarketplaceConfigOpen] = useState<ConfigurableAffiliatePlatform | null>(null);
  const [marketplaceAppId, setMarketplaceAppId] = useState("");
  const [marketplaceSecret, setMarketplaceSecret] = useState("");
  const [amazonPartnerTag, setAmazonPartnerTag] = useState("");
  const [mercadoLivreAccessToken, setMercadoLivreAccessToken] = useState("");
  const [mercadoLivreRefreshToken, setMercadoLivreRefreshToken] = useState("");
  const [mercadoLivreOpen, setMercadoLivreOpen] = useState(false);
  const [mercadoLivreStatus, setMercadoLivreStatus] = useState<MercadoLivreAffiliateStatus | null>(null);
  const [companionPairing, setCompanionPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [mercadoLivreTestUrl, setMercadoLivreTestUrl] = useState("");
  const [mercadoLivreTestJob, setMercadoLivreTestJob] = useState<Awaited<ReturnType<typeof mercadoLivreAffiliateApi.test>> | null>(null);
  const [remoteLoginExpiresAt, setRemoteLoginExpiresAt] = useState<string | null>(null);
  const [remoteLoginUrl, setRemoteLoginUrl] = useState<string | null>(null);
  const [remoteLoginLinkCopied, setRemoteLoginLinkCopied] = useState(false);
  const isMobileExperience = useMemo(() => isMobileDevice(), []);
  const [navigationIntent] = useState(() => integrationsNavigation.consume());

  const selected = useMemo(
    () =>
      connections.find((connection) => connection.id === selectedId) ?? null,
    [connections, selectedId],
  );

  const loadConnections = useCallback(async () => {
    try {
      const [connectionData, accountData, mlStatus] = await Promise.all([
        whatsappApi.listConnections(),
        productsApi.listAccounts(),
        mercadoLivreAffiliateApi.status().catch(() => null),
      ]);
      setConnections(connectionData);
      setAffiliateAccounts(accountData);
      setMercadoLivreStatus(mlStatus);
      const pendingQr = connectionData.filter(
        (connection) => connection.status === "qr_required",
      );
      if (pendingQr.length > 0) {
        const values = await Promise.all(
          pendingQr.map(async (connection) => ({
            connectionId: connection.id,
            qr: (await whatsappApi.getQr(connection.id)).qr,
          })),
        );
        setQrCodes((current) =>
          values.reduce<Record<string, string>>(
            (next, item) => {
              if (item.qr) next[item.connectionId] = item.qr;
              return next;
            },
            { ...current },
          ),
        );
      }
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar conexões.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
    return whatsappApi.subscribe(
      (event) => {
        if (event.type === "qr.updated" && event.data.qr) {
          setQrCodes((current) => ({
            ...current,
            [event.connectionId]: event.data.qr!,
          }));
        }
        if (event.type === "connection.updated" && event.data.status) {
          setConnections((current) =>
            current.map((connection) =>
              connection.id === event.connectionId
                ? {
                    ...connection,
                    status: event.data.status!,
                    phone:
                      event.data.phone === undefined
                        ? connection.phone
                        : event.data.phone,
                    displayName:
                      event.data.displayName === undefined
                        ? connection.displayName
                        : event.data.displayName,
                  }
                : connection,
            ),
          );
          if (event.data.status === "connected") {
            setQrCodes((current) => {
              const next = { ...current };
              delete next[event.connectionId];
              return next;
            });
          }
        }
      },
      () =>
        setError(
          "A atualização em tempo real foi interrompida. Recarregue a página.",
        ),
    );
  }, [loadConnections]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "A operação falhou.",
      );
    } finally {
      setBusy(null);
    }
  };

  const createConnection = (event: React.FormEvent) => {
    event.preventDefault();
    void run("create", async () => {
      const created = await whatsappApi.createConnection(label);
      setConnections((current) => [...current, created]);
      setSelectedId(created.id);
      setCreateOpen(false);
      setLabel("");
    });
  };

  const connect = (connectionId: string) =>
    run(`connect:${connectionId}`, async () => {
      await whatsappApi.connect(connectionId);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const { qr } = await whatsappApi.getQr(connectionId);
        if (qr) {
          setQrCodes((current) => ({ ...current, [connectionId]: qr }));
          setConnections((current) =>
            current.map((connection) =>
              connection.id === connectionId
                ? { ...connection, status: "qr_required" }
                : connection,
            ),
          );
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    });

  const disconnect = (connectionId: string) =>
    run(`disconnect:${connectionId}`, async () => {
      await whatsappApi.disconnect(connectionId);
    });

  const syncGroups = (connectionId: string) =>
    run(`sync:${connectionId}`, async () => {
      const groups = await whatsappApi.syncGroups(connectionId);
      const groupsCount = groups.filter(
        (group) => group.syncStatus === "active",
      ).length;
      setConnections((current) =>
        current.map((connection) =>
          connection.id === connectionId
            ? { ...connection, groupsCount }
            : connection,
        ),
      );
    });

  const remove = (connection: WhatsAppConnection) => {
    if (
      !window.confirm(
        `Remover "${connection.label}" e apagar sua sessão técnica?`,
      )
    )
      return;
    void run(`remove:${connection.id}`, async () => {
      await whatsappApi.removeConnection(connection.id);
      setConnections((current) =>
        current.filter((item) => item.id !== connection.id),
      );
      setSelectedId(null);
      setQrCodes((current) => {
        const next = { ...current };
        delete next[connection.id];
        return next;
      });
    });
  };

  const saveGenericConfig = (event: React.FormEvent) => {
    event.preventDefault();
    if (!configuring) return;
    updateIntegrationConfig(configuring.id, tagInput);
    setConfiguring(null);
  };

  const connectedCount = connections.filter(
    (connection) => connection.status === "connected",
  ).length;
  const messageIntegrations = integrations.filter(
    (integration) =>
      integration.category === "social" &&
      integration.key.toLowerCase() !== "whatsapp",
  );
  const configureMarketplace = (event: React.FormEvent) => {
    event.preventDefault();
    const platform = marketplaceConfigOpen;
    if (!platform) return;
    void run(`configure:${platform}`, async () => {
      if (platform === "shopee") await productsApi.configureShopee(marketplaceAppId, marketplaceSecret);
      if (platform === "amazon") await productsApi.configureAmazon(marketplaceAppId, marketplaceSecret, amazonPartnerTag);
      if (platform === "mercado_livre") await productsApi.configureMercadoLivre(marketplaceAppId, marketplaceSecret, mercadoLivreAccessToken, mercadoLivreRefreshToken || undefined);
      setAffiliateAccounts(await productsApi.listAccounts());
      setMarketplaceAppId(""); setMarketplaceSecret(""); setAmazonPartnerTag(""); setMercadoLivreAccessToken(""); setMercadoLivreRefreshToken("");
      setMarketplaceConfigOpen(null);
    });
  };
  const marketplaceCards: Array<{ platform: ConfigurableAffiliatePlatform; name: string; description: string }> = [
    { platform: "shopee", name: "Shopee Afiliados", description: "Conversão oficial de links e Radar de Ofertas pela Open API." },
    { platform: "amazon", name: "Amazon Associados", description: "Conversão de links e catálogo pela Amazon Creators API para o Brasil." },
    { platform: "mercado_livre", name: "Mercado Livre", description: "Conversão automática na nuvem + Radar ao vivo com ofertas da Central de Afiliados." },
  ];
  const mercadoLivreCatalogConfigured = Boolean(affiliateAccounts.find((account) => account.platform === "mercado_livre")?.catalogApiConfigured);
  const accountStatus = (platform: ConfigurableAffiliatePlatform) => {
    if (platform === "mercado_livre") {
      if (mercadoLivreStatus?.remote.status === "READY") return "Pronto na nuvem";
      if (mercadoLivreStatus?.remote.status === "CONNECTING") return "Conclua o login";
      const companion = mercadoLivreStatus?.companion;
      if (!companion || companion.status === "REVOKED") return "Não conectado";
      if (companion.status === "OUTDATED") return "Atualização necessária";
      if (companion.status === "OFFLINE") return "Extensão offline";
      return ({ READY: "Pronto", NEEDS_LOGIN: "Login necessário", NEEDS_USER_ACTION: "Confirmação necessária", PORTAL_UNAVAILABLE: "Portal indisponível", PORTAL_CHANGED: "Portal alterado", UNKNOWN: "Extensão conectada" } as Record<string,string>)[companion.mercadoLivreStatus] ?? "Extensão conectada";
    }
    const status = affiliateAccounts.find((account) => account.platform === platform)?.configurationStatus ?? "not_configured";
    return ({ valid: "Validada", pending_validation: "Validando", invalid: "Credenciais inválidas", error: "Erro de validação", not_configured: "Não configurada" } as const)[status];
  };
  const reloadMercadoLivre = useCallback(async()=>{const status=await mercadoLivreAffiliateApi.status();setMercadoLivreStatus(status);if(status.companion?.status === "ONLINE" && status.companion.adapterVersion >= status.required.adapterVersion)setCompanionPairing(null);setAffiliateAccounts(await productsApi.listAccounts());},[]);
  const createCompanionPairing = () => void run('ml:pair', async()=>{
    setCompanionPairing(await mercadoLivreAffiliateApi.createPairing('Chrome'));
  });
  const testMercadoLivreGeneration = () => void run('ml:test', async()=>{
    const created = mercadoLivreStatus?.remote.status === 'READY'
      ? await mercadoLivreAffiliateApi.testRemote(mercadoLivreTestUrl.trim())
      : await mercadoLivreAffiliateApi.test(mercadoLivreTestUrl.trim());
    setMercadoLivreTestJob(created);
  });
  const beginRemoteLogin = () => {
    // iOS suspends the original page as soon as an about:blank tab opens, so the
    // async request never gets a chance to navigate that tab. Mobile uses the
    // current tab; desktop can safely reserve a separate one.
    const loginTab = isMobileExperience ? null : window.open('about:blank', '_blank');
    if (loginTab) loginTab.opener = null;
    void run('ml:remote-login', async()=>{
      let login: Awaited<ReturnType<typeof mercadoLivreAffiliateApi.beginRemoteLogin>>;
      try {
        login = await mercadoLivreAffiliateApi.beginRemoteLogin(isMobileExperience);
      } catch (error) {
        if (loginTab && !loginTab.closed) loginTab.close();
        throw error;
      }
      setRemoteLoginExpiresAt(login.expiresAt);
      setRemoteLoginUrl(login.liveUrl);
      setRemoteLoginLinkCopied(false);
      if (isMobileExperience) {
        window.location.assign(login.liveUrl);
        return;
      }
      if (loginTab && !loginTab.closed) {
        loginTab.location.href = login.liveUrl;
        loginTab.focus?.();
      }
      await reloadMercadoLivre();
    });
  };
  const verifyRemoteLogin = () => void run('ml:remote-verify', async()=>{
    const result = await mercadoLivreAffiliateApi.verifyRemoteLogin();
    if (!result.ready) throw new Error('O login ainda não foi concluído na janela segura.');
    setRemoteLoginExpiresAt(null);
    setRemoteLoginUrl(null);
    setRemoteLoginLinkCopied(false);
    await reloadMercadoLivre();
  });
  useEffect(()=>{if(!mercadoLivreOpen)return;const timer=window.setInterval(()=>void reloadMercadoLivre().catch(()=>undefined),5000);return()=>window.clearInterval(timer);},[mercadoLivreOpen,reloadMercadoLivre]);
  useEffect(()=>{
    if(!mercadoLivreOpen)return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMercadoLivreOpen(false);};
    window.addEventListener('keydown',closeOnEscape);
    return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener('keydown',closeOnEscape);};
  },[mercadoLivreOpen]);
  useEffect(()=>{
    if(!mercadoLivreTestJob || ['SUCCESS','FAILED','EXPIRED','NEEDS_USER_ACTION','CANCELLED'].includes(mercadoLivreTestJob.status)) return;
    const timer=window.setInterval(()=>void mercadoLivreAffiliateApi.job(mercadoLivreTestJob.id).then(setMercadoLivreTestJob).catch(()=>undefined),1500);
    return()=>window.clearInterval(timer);
  },[mercadoLivreTestJob]);

  useEffect(() => {
    if (!navigationIntent) return;
    if (navigationIntent.type === "create-whatsapp") {
      setActiveSection("messages");
      setCreateOpen(true);
      return;
    }
    if (navigationIntent.type === "whatsapp") {
      setActiveSection("messages");
      setSelectedId(navigationIntent.connectionId);
      return;
    }
    if (navigationIntent.type === "shopee") {
      setActiveSection("marketplaces");
      setMarketplaceConfigOpen("shopee");
      return;
    }
    const integration = integrations.find(
      (item) => item.id === navigationIntent.integrationId,
    );
    if (integration) {
      setActiveSection(
        integration.category === "marketplace" ? "marketplaces" : "messages",
      );
      setConfiguring(integration);
      setTagInput(integration.tagAfiliado || "");
    }
  }, [integrations, navigationIntent]);

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-medium text-[#0F172A] tracking-tight flex items-center gap-2.5">
          <Boxes className="w-6 h-6" /> Integrações &amp; Conexões
        </h1>
        <p className="text-sm text-[#6B6F7B] mt-1">
          Todas as conexões do AfiliHub, organizadas por finalidade.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-2">
        <button
          onClick={() => setActiveSection("marketplaces")}
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${activeSection === "marketplaces" ? "bg-[#EDEDED] text-[#0F172A]" : "text-[#6B6F7B] hover:bg-[#F4F4F6] hover:text-[#0F172A]"}`}
        >
          <Store className="h-5 w-5 shrink-0" />
          <span>
            <span className="block text-sm font-medium">Marketplaces</span>
            <span className="block text-[11px] opacity-70">
              Shopee, Amazon e programas de afiliados
            </span>
          </span>
        </button>
        <button
          onClick={() => setActiveSection("messages")}
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${activeSection === "messages" ? "bg-[#EDEDED] text-[#0F172A]" : "text-[#6B6F7B] hover:bg-[#F4F4F6] hover:text-[#0F172A]"}`}
        >
          <MessagesSquare className="h-5 w-5 shrink-0" />
          <span>
            <span className="block text-sm font-medium">
              WhatsApp &amp; Telegram
            </span>
            <span className="block text-[11px] opacity-70">
              Contas, bots e canais de distribuição
            </span>
          </span>
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 p-3.5 rounded-lg bg-[#F4F4F6] border border-red-200 text-red-600 text-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Fechar aviso">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeSection === "messages" && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-medium text-[#0F172A]">WhatsApp</h2>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-1">
                {connectedCount} conectada{connectedCount === 1 ? "" : "s"}{" "}
                agora · {connections.length} de 5 conexões
              </p>
              <p className="text-[11px] text-[#6B6F7B] mt-1">
                Integração não oficial baseada no WhatsApp Web.
              </p>
            </div>
            <button
              onClick={() => setCreateOpen(true)}
              disabled={connections.length >= 5}
              className="px-4 py-2 rounded-lg bg-[#EDEDED] text-[#0F172A] disabled:bg-[#E8E9ED] disabled:text-[#9CA3AF] text-sm font-medium flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {connections.length >= 5
                ? "Limite de conexões atingido"
                : "Conectar outro WhatsApp"}
            </button>
          </div>

          {loading ? (
            <div className="py-14 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#9CA3AF]" />
            </div>
          ) : connections.length === 0 ? (
            <button
              onClick={() => setCreateOpen(true)}
              className="w-full p-10 rounded-xl border border-dashed border-[#D4D4D8] bg-[#FFFFFF] text-center hover:border-[#6B6F7B] transition-colors"
            >
              <Smartphone className="w-8 h-8 text-[#9CA3AF] mx-auto mb-3" />
              <span className="block text-sm font-medium text-[#0F172A]">
                Conecte seu primeiro número
              </span>
              <span className="block text-xs text-[#9CA3AF] mt-1">
                Crie a conexão e leia o QR Code no WhatsApp.
              </span>
            </button>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {connections.map((connection) => {
                const meta = statusMeta[connection.status];
                return (
                  <button
                    key={connection.id}
                    onClick={() => setSelectedId(connection.id)}
                    className="p-5 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED] hover:border-[#D4D4D8] text-left transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-[#0F172A] truncate">
                          {connection.label}
                        </h3>
                        <p className="text-xs text-[#9CA3AF] mt-1 truncate">
                          {connection.phone || "Número ainda não identificado"}
                        </p>
                      </div>
                      <span
                        className={`text-xs flex items-center gap-1.5 shrink-0 ${meta.color}`}
                      >
                        <CircleDot className="w-3.5 h-3.5" /> {meta.label}
                      </span>
                    </div>
                    <div className="mt-5 pt-4 border-t border-[#E8E9ED] flex items-center justify-between text-xs">
                      <span className="text-[#9CA3AF]">
                        {connection.groupsCount} grupos ativos
                      </span>
                      <span className="text-[#6B6F7B]">Gerenciar →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeSection === "messages" && (
        <section className="space-y-4 pt-2">
          <div>
            <h2 className="text-lg font-medium text-[#0F172A]">Telegram</h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Bots e canais do Telegram ficam separados das contas WhatsApp.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {messageIntegrations.map((integration) => (
              <div
                key={integration.id}
                className="p-5 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED]"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-[#0F172A]">
                    {integration.name}
                  </h3>
                  <span className="text-xs text-[#9CA3AF]">
                    {integration.connectionStatus === "connected"
                      ? "Conectado"
                      : "Não conectado"}
                  </span>
                </div>
                <p className="text-xs text-[#9CA3AF] leading-relaxed mt-3 min-h-10">
                  {integration.description}
                </p>
                <button
                  onClick={() => {
                    setConfiguring(integration);
                    setTagInput(integration.tagAfiliado || "");
                  }}
                  className="w-full mt-4 py-2 rounded-lg border border-[#E8E9ED] text-sm text-[#0F172A] flex items-center justify-center gap-2"
                >
                  <Settings className="w-4 h-4" /> Configurar
                </button>
              </div>
            ))}
            {messageIntegrations.length === 0 && (
              <div className="p-5 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-[#0F172A]">
                    Telegram Bot
                  </h3>
                  <span className="text-xs text-[#9CA3AF]">
                    Ainda indisponível
                  </span>
                </div>
                <p className="text-xs text-[#9CA3AF] leading-relaxed mt-3">
                  A conexão real com a API do Telegram será disponibilizada aqui
                  quando o provider estiver implementado.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {activeSection === "marketplaces" && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-[#0F172A]">
              Contas de marketplace
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Configure credenciais e identificadores de afiliado em um único
              lugar.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {marketplaceCards.map((integration) => {
              const configured = integration.platform === "mercado_livre"
                ? Boolean(mercadoLivreStatus?.companion && mercadoLivreStatus.companion.status !== "REVOKED")
                : affiliateAccounts.some((account) => account.platform === integration.platform && account.configured);
              return (
              <div
                key={integration.platform}
                className="p-5 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED]"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-[#0F172A]">
                    {integration.name}
                  </h3>
                  <span className={`text-xs ${configured ? "text-emerald-600" : "text-[#9CA3AF]"}`}>
                    {accountStatus(integration.platform)}
                  </span>
                </div>
                <p className="text-xs text-[#9CA3AF] leading-relaxed mt-3 min-h-10">
                  {integration.description}
                </p>
                <button
                  onClick={() => {
                    if (integration.platform === "mercado_livre") setMercadoLivreOpen(true);
                    else setMarketplaceConfigOpen(integration.platform);
                  }}
                  className="w-full mt-4 py-2 rounded-lg border border-[#E8E9ED] text-sm text-[#0F172A] flex items-center justify-center gap-2"
                >
                  <Settings className="w-4 h-4" /> {integration.platform === "mercado_livre" ? configured ? "Gerenciar conexão" : "Conectar Mercado Livre" : configured ? "Atualizar credenciais" : "Configurar"}
                </button>
              </div>
            )})}
          </div>
        </section>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onMouseDown={() => setSelectedId(null)}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#FFFFFF] border border-[#E8E9ED] p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-xs text-[#9CA3AF] flex items-center gap-1 mb-3"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                </button>
                <h2 className="text-lg font-medium text-[#0F172A]">
                  {selected.label}
                </h2>
                <p
                  className={`text-xs mt-1 ${statusMeta[selected.status].color}`}
                >
                  {statusMeta[selected.status].label}
                </p>
              </div>
              <button onClick={() => setSelectedId(null)} aria-label="Fechar">
                <X className="w-5 h-5 text-[#9CA3AF]" />
              </button>
            </div>

            {selected.status === "logged_out" && (
              <div className="mt-5 p-3 rounded-lg bg-[#F4F4F6] border border-red-200 text-sm text-red-600">
                Sessão encerrada. Gere um novo QR Code para reconectar.
              </div>
            )}

            {qrCodes[selected.id] && selected.status === "qr_required" && (
              <div className="mt-6 p-6 rounded-xl bg-white flex flex-col items-center">
                <QRCodeSVG value={qrCodes[selected.id]} size={240} level="M" />
                <p className="text-[#F4F4F6] text-xs text-center mt-4">
                  WhatsApp → Dispositivos conectados → Conectar dispositivo
                </p>
              </div>
            )}

            {!qrCodes[selected.id] &&
              ["connecting", "reconnecting", "qr_required"].includes(
                selected.status,
              ) && (
                <div className="mt-6 p-8 rounded-xl bg-[#F8FAFC] border border-[#E8E9ED] flex flex-col items-center text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-[#6B6F7B]" />
                  <p className="text-sm text-[#6B6F7B] mt-3">
                    {selected.status === "qr_required"
                      ? "Atualizando QR Code…"
                      : "Estabelecendo conexão…"}
                  </p>
                </div>
              )}

            <dl className="mt-6 grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[#F4F4F6]">
                <dt className="text-[#9CA3AF]">Número</dt>
                <dd className="text-[#0F172A] mt-1">
                  {selected.phone || "Pendente"}
                </dd>
              </div>
              <div className="p-3 rounded-lg bg-[#F4F4F6]">
                <dt className="text-[#9CA3AF]">Grupos ativos</dt>
                <dd className="text-[#0F172A] mt-1">{selected.groupsCount}</dd>
              </div>
            </dl>

            <div className="mt-6 grid grid-cols-2 gap-2">
              {selected.status !== "connected" ? (
                <button
                  onClick={() => void connect(selected.id)}
                  disabled={
                    busy !== null ||
                    ["connecting", "reconnecting"].includes(
                      selected.status,
                    )
                  }
                  className="col-span-2 py-2.5 rounded-lg bg-[#EDEDED] text-[#0F172A] disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
                >
                  {busy === `connect:${selected.id}` && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {selected.status === "logged_out"
                    ? "Reconectar"
                    : selected.status === "qr_required"
                      ? "Gerar novo QR Code"
                      : "Conectar"}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => void syncGroups(selected.id)}
                    disabled={busy !== null}
                    className="py-2.5 rounded-lg border border-[#E8E9ED] text-sm text-[#0F172A] flex items-center justify-center gap-2"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${busy === `sync:${selected.id}` ? "animate-spin" : ""}`}
                    />{" "}
                    Sincronizar grupos
                  </button>
                  <button
                    onClick={() => void disconnect(selected.id)}
                    disabled={busy !== null}
                    className="py-2.5 rounded-lg border border-[#E8E9ED] text-sm text-[#0F172A] flex items-center justify-center gap-2"
                  >
                    <Unplug className="w-4 h-4" /> Desconectar
                  </button>
                </>
              )}
            </div>
            <button
              onClick={() => remove(selected)}
              disabled={busy !== null}
              className="w-full mt-3 py-2 text-xs text-[#EF4444] flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remover conexão e sessão
            </button>
          </div>
        </div>
      )}

      {createOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onMouseDown={() => setCreateOpen(false)}
        >
          <form
            onSubmit={createConnection}
            className="w-full max-w-md rounded-2xl bg-[#FFFFFF] border border-[#E8E9ED] p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-medium text-[#0F172A]">
              Nova conexão WhatsApp
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-1">
              O número será identificado depois da leitura do QR Code.
            </p>
            <label className="block text-xs text-[#6B6F7B] mt-6 mb-2">
              Apelido da conexão
            </label>
            <input
              autoFocus
              required
              maxLength={60}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Ex.: Principal"
              className="w-full px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-sm text-[#0F172A] focus:outline-none focus:border-[#6B6F7B]"
            />
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-sm text-[#6B6F7B]"
              >
                Cancelar
              </button>
              <button
                disabled={busy !== null}
                className="px-4 py-2 rounded-lg bg-[#EDEDED] text-[#0F172A] text-sm font-medium flex items-center gap-2"
              >
                {busy === "create" && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}{" "}
                Criar conexão
              </button>
            </div>
          </form>
        </div>
      )}

      {marketplaceConfigOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onMouseDown={() => setMarketplaceConfigOpen(null)}
        >
          <form
            onSubmit={configureMarketplace}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[#FFFFFF] border border-[#E8E9ED] p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-[#0F172A]">
                  Configurar {marketplaceConfigOpen === "shopee" ? "Shopee Afiliados" : marketplaceConfigOpen === "amazon" ? "Amazon Associados" : "Mercado Livre"}
                </h2>
                <p className="text-xs text-[#9CA3AF] mt-1">
                  As credenciais são cifradas no backend e os segredos nunca retornam ao navegador.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMarketplaceConfigOpen(null)}
                aria-label="Fechar"
              >
                <X className="w-5 h-5 text-[#9CA3AF]" />
              </button>
            </div>
            {marketplaceConfigOpen === "mercado_livre" && mercadoLivreCatalogConfigured && <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              O Mercado Livre já está conectado. Os campos abaixo ficam vazios porque os segredos nunca retornam ao navegador. Preencha-os somente se quiser substituir as credenciais atuais.
            </div>}
            <label className="block text-xs text-[#6B6F7B] mt-6 mb-2">
              {marketplaceConfigOpen === "amazon" ? "Credential ID" : "App ID"}
            </label>
            <input
              required
              value={marketplaceAppId}
              onChange={(event) => setMarketplaceAppId(event.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-sm text-[#0F172A]"
            />
            <label className="block text-xs text-[#6B6F7B] mt-4 mb-2">
              {marketplaceConfigOpen === "amazon" ? "Credential Secret" : "Secret"}
            </label>
            <input
              required
              type="password"
              value={marketplaceSecret}
              onChange={(event) => setMarketplaceSecret(event.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-sm text-[#0F172A]"
            />
            {marketplaceConfigOpen === "amazon" && <>
              <label className="block text-xs text-[#6B6F7B] mt-4 mb-2">Partner Tag do Brasil</label>
              <input required value={amazonPartnerTag} onChange={(event) => setAmazonPartnerTag(event.target.value)} placeholder="ex.: sua-loja-20" className="w-full px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-sm text-[#0F172A]" />
              <p className="mt-2 text-[11px] text-[#9CA3AF]">Use credenciais aprovadas da Creators API e uma Partner Tag válida para amazon.com.br.</p>
            </>}
            {marketplaceConfigOpen === "mercado_livre" && <>
              <label className="block text-xs text-[#6B6F7B] mt-4 mb-2">Access Token OAuth</label>
              <input required type="password" value={mercadoLivreAccessToken} onChange={(event) => setMercadoLivreAccessToken(event.target.value)} autoComplete="off" className="w-full px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-sm text-[#0F172A]" />
              <label className="block text-xs text-[#6B6F7B] mt-4 mb-2">Refresh Token (opcional)</label>
              <input type="password" value={mercadoLivreRefreshToken} onChange={(event) => setMercadoLivreRefreshToken(event.target.value)} autoComplete="off" className="w-full px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-sm text-[#0F172A]" />
              <p className="mt-2 text-[11px] leading-5 text-[#9CA3AF]">Essas credenciais são usadas somente para consultar itens e preços no Radar. A geração do link afiliado continua no Companion e não recebe sua senha.</p>
            </>}
            <button
              disabled={busy !== null}
              className="w-full mt-5 py-2.5 rounded-lg bg-[#EDEDED] text-[#0F172A] disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
            >
              {busy === `configure:${marketplaceConfigOpen}` && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {marketplaceConfigOpen === "mercado_livre" && mercadoLivreCatalogConfigured ? "Substituir credenciais" : "Salvar credenciais"}
            </button>
          </form>
        </div>
      )}

      {mercadoLivreOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-white p-0 sm:items-center sm:bg-black/40 sm:p-4" onMouseDown={() => setMercadoLivreOpen(false)}>
          <div className="h-[100dvh] w-full overflow-y-auto overscroll-contain bg-[#FFFFFF] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-0 sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-[#E8E9ED] sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-30 -mx-4 flex items-start justify-between gap-4 border-b border-[#E8E9ED] bg-white/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
              <div className="min-w-0"><h2 className="text-base font-medium leading-6 text-[#0F172A] sm:text-lg">Mercado Livre — Programa de Afiliados</h2><p className="mt-1 hidden text-xs text-[#9CA3AF] sm:block">O navegador remoto converte na nuvem mesmo com seu computador desligado. A extensão permanece como contingência.</p></div>
              <button type="button" onClick={() => setMercadoLivreOpen(false)} aria-label="Fechar integração do Mercado Livre" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F4F4F6] text-[#4B5563] transition-colors hover:bg-[#E8E9ED]"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-5 rounded-xl border border-[#E8E9ED] bg-[#F8FAFC] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">Fonte do Radar de Ofertas</p>
                  <p className="mt-1 text-xs leading-5 text-[#9CA3AF]">Status: {mercadoLivreCatalogConfigured ? "ativa" : "não configurada"}. O AfiliHub usa a Central de Afiliados conectada para buscar produtos, preços, descontos e comissões; o OAuth permanece salvo para validar a conta e consultar dados permitidos pela API.</p>
                </div>
                <button type="button" onClick={() => { setMercadoLivreOpen(false); setMarketplaceConfigOpen("mercado_livre"); }} className="shrink-0 rounded-lg border border-[#D4D4D8] px-3 py-2 text-xs text-[#0F172A]">{mercadoLivreCatalogConfigured ? "Substituir credenciais" : "Configurar credenciais"}</button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#E8E9ED] bg-[#F8FAFC] p-4"><p className="text-[11px] uppercase tracking-wide text-[#9CA3AF]">Motor na nuvem</p><p className={`mt-2 text-sm font-medium ${mercadoLivreStatus?.remote.status === "READY" ? "text-emerald-600" : mercadoLivreStatus?.remote.status === "ERROR" ? "text-[#EF4444]" : "text-[#EAB308]"}`}>{mercadoLivreStatus?.remote.status ?? "NOT_CONFIGURED"}</p><p className="mt-1 text-xs text-[#9CA3AF]">{mercadoLivreStatus?.remote.provider === "hyperbrowser" ? "Hyperbrowser" : mercadoLivreStatus?.remote.provider === "browserbase" ? "Browserbase" : mercadoLivreStatus?.remote.preferredProvider === "hyperbrowser" ? "Hyperbrowser disponível" : "Funciona sem Chrome aberto"}</p></div>
              <div className="rounded-xl border border-[#E8E9ED] bg-[#F8FAFC] p-4"><p className="text-[11px] uppercase tracking-wide text-[#9CA3AF]">Extensão AfiliHub</p><p className={`mt-2 text-sm font-medium ${mercadoLivreStatus?.companion?.status === "ONLINE" ? "text-emerald-600" : mercadoLivreStatus?.companion?.status === "OUTDATED" ? "text-[#EF4444]" : "text-[#EAB308]"}`}>{mercadoLivreStatus?.companion?.status === "OUTDATED" ? "ATUALIZAÇÃO NECESSÁRIA" : mercadoLivreStatus?.companion?.status ?? "NÃO CONECTADA"}</p><p className="mt-1 text-xs text-[#9CA3AF]">{mercadoLivreStatus?.companion ? `${mercadoLivreStatus.companion.name} · v${mercadoLivreStatus.companion.extensionVersion}${mercadoLivreStatus.companion.status === "OUTDATED" ? ` · requerida v${mercadoLivreStatus.required.extensionVersion}` : ""}` : "Instale e pareie uma vez"}</p></div>
              <div className="rounded-xl border border-[#E8E9ED] bg-[#F8FAFC] p-4"><p className="text-[11px] uppercase tracking-wide text-[#9CA3AF]">Sessão local (fallback)</p><p className={`mt-2 text-sm font-medium ${mercadoLivreStatus?.mercadoLivre.status === "READY" ? "text-emerald-600" : mercadoLivreStatus?.mercadoLivre.status === "PORTAL_CHANGED" ? "text-[#EF4444]" : "text-[#EAB308]"}`}>{mercadoLivreStatus?.mercadoLivre.status ?? "UNKNOWN"}</p><p className="mt-1 text-xs text-[#9CA3AF]">Usada só se a nuvem falhar</p></div>
              <div className="rounded-xl border border-[#E8E9ED] bg-[#F8FAFC] p-4"><p className="text-[11px] uppercase tracking-wide text-[#9CA3AF]">Status global</p><p className={`mt-2 text-sm font-medium ${mercadoLivreStatus?.global.status === "HEALTHY" ? "text-emerald-600" : mercadoLivreStatus?.global.status === "DOWN" ? "text-[#EF4444]" : "text-[#EAB308]"}`}>{mercadoLivreStatus?.global.status ?? "UNKNOWN"}</p><p className="mt-1 text-xs text-[#9CA3AF]">Adapter v{mercadoLivreStatus?.global.adapterVersion ?? 1} · {mercadoLivreStatus?.global.circuitState ?? "CLOSED"}</p></div>
            </div>

            {mercadoLivreStatus?.remote.configured && (mercadoLivreStatus.remote.status !== "READY" || (mercadoLivreStatus.remote.preferredProvider && mercadoLivreStatus.remote.provider !== mercadoLivreStatus.remote.preferredProvider)) && <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4">
              <p className="text-sm font-medium text-violet-950">{mercadoLivreStatus.remote.status === "READY" ? "Migrar para o provedor mais econômico" : "Conectar geração automática na nuvem"}</p>
              <p className="mt-1 text-xs leading-5 text-violet-800/80">{mercadoLivreStatus.remote.status === "READY" ? "O Hyperbrowser já está disponível no servidor. Conecte sua conta uma vez; o perfil atual do Browserbase será preservado como contingência." : "Abra a janela segura, entre no Mercado Livre e volte aqui para validar. Senha, 2FA e CAPTCHA são digitados diretamente no navegador remoto e não passam pelo AfiliHub."}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={beginRemoteLogin} disabled={busy !== null} className="rounded-lg bg-violet-100 px-4 py-2 text-sm font-medium text-violet-950 disabled:opacity-50">{busy === "ml:remote-login" ? "Abrindo…" : mercadoLivreStatus.remote.loginInProgress ? "Abrir nova sessão" : mercadoLivreStatus.remote.status === "READY" ? "Conectar Hyperbrowser" : "Conectar na nuvem"}</button>
                {(mercadoLivreStatus.remote.loginInProgress || remoteLoginExpiresAt) && <button type="button" onClick={verifyRemoteLogin} disabled={busy !== null} className="rounded-lg border border-violet-300 px-4 py-2 text-sm text-violet-950 disabled:opacity-50">{busy === "ml:remote-verify" ? "Validando…" : "Já entrei — validar"}</button>}
              </div>
              {isMobileExperience && remoteLoginUrl && <div className="mt-4 rounded-lg border border-violet-200 bg-white/80 p-3">
                <p className="text-sm font-medium text-violet-950">Login seguro pronto</p>
                <p className="mt-1 text-xs leading-5 text-violet-900/70">Se a aba não abriu automaticamente, toque no botão abaixo. Depois de entrar no Mercado Livre, volte para esta aba e toque em “Já entrei — validar”.</p>
                <div className="mt-3 flex flex-col gap-2 min-[380px]:flex-row">
                  <a href={remoteLoginUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white">Abrir login novamente</a>
                  <button type="button" onClick={() => void navigator.clipboard?.writeText(remoteLoginUrl).then(() => { setRemoteLoginLinkCopied(true); window.setTimeout(() => setRemoteLoginLinkCopied(false), 1800); })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-violet-200 px-4 py-2 text-sm text-violet-950"><Copy className="h-4 w-4" />{remoteLoginLinkCopied ? "Link copiado" : "Copiar link"}</button>
                </div>
                <p className="mt-2 text-[11px] text-violet-900/60">A sessão expira em {new Date(remoteLoginExpiresAt ?? Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</p>
              </div>}
            </div>}

            {!mercadoLivreStatus?.remote.configured && <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Motor remoto ainda não configurado no servidor. Adicione <code className="rounded bg-amber-950/50 px-1">HYPERBROWSER_API_KEY</code> (recomendado) ou <code className="rounded bg-amber-950/50 px-1">BROWSERBASE_API_KEY</code>; até lá, a extensão continua funcionando como fallback.</div>}

            {isMobileExperience && <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4">
              <div className="flex items-start gap-3">
                <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-sky-950">Login pelo iPhone ou Android</p>
                  <p className="mt-1 text-xs leading-5 text-sky-800">Toque em <strong>Conectar na nuvem</strong>. O login seguro abrirá nesta mesma tela com aparência de Android. Depois de entrar no Mercado Livre, use o botão de voltar do celular e toque em <strong>Já entrei — validar</strong>.</p>
                  <p className="mt-2 text-[11px] leading-5 text-sky-700">Senha, código de confirmação e CAPTCHA são informados diretamente no navegador remoto e não passam pelo AfiliHub.</p>
                </div>
              </div>
            </div>}

            {!mercadoLivreStatus?.companion && mercadoLivreStatus?.remote.status !== "READY" && <div className="mt-5 rounded-xl border border-[#E8E9ED] bg-[#F8FAFC] p-5"><p className="text-sm font-medium text-[#0F172A]">Configure o Browser Companion</p><ol className="mt-3 space-y-2 text-sm text-[#6B6F7B]"><li>1. Instale a extensão AfiliHub no Chrome/Chromium.</li><li>2. Gere um código e digite-o no popup da extensão.</li><li>3. Entre normalmente no Mercado Livre.</li><li>4. Execute uma geração de teste abaixo.</li></ol><div className="mt-4 flex flex-wrap gap-2"><a href="/browser-companion/install.html" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#D4D4D8] px-4 py-2 text-sm text-[#0F172A]"><Download className="h-4 w-4" /> Instalar extensão</a><button onClick={createCompanionPairing} disabled={busy !== null} className="rounded-lg bg-[#EDEDED] px-4 py-2 text-sm font-medium text-[#111] disabled:opacity-50">{busy === "ml:pair" ? "Gerando…" : "Conectar extensão"}</button></div></div>}

            {companionPairing && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs text-violet-700">Abra a extensão AfiliHub e informe este código de uso único:</p><div className="mt-2 flex items-center gap-3"><code className="text-xl font-semibold tracking-[0.18em] text-white">{companionPairing.code}</code><button onClick={()=>void navigator.clipboard.writeText(companionPairing.code)} aria-label="Copiar código" className="rounded-md border border-violet-400/30 p-2 text-violet-100"><Copy className="h-4 w-4" /></button></div><p className="mt-2 text-[11px] text-violet-300">Expira em {new Date(companionPairing.expiresAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}. O código não contém sua senha nem seu token principal.</p></div>}

            {mercadoLivreStatus?.companion?.status === "OFFLINE" && mercadoLivreStatus?.remote.status !== "READY" && <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Extensão offline. Abra o navegador com o Companion ativo. Nenhum link original será utilizado.</div>}
            {mercadoLivreStatus?.companion?.status === "OUTDATED" && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">Sua extensão está pareada, mas desatualizada (v{mercadoLivreStatus.companion.extensionVersion}). Atualize para v{mercadoLivreStatus.required.extensionVersion} e recarregue-a em <code className="rounded bg-red-950/50 px-1">chrome://extensions</code>. O pareamento atual será preservado; não é necessário reconectar.</div>}
            {mercadoLivreStatus?.mercadoLivre.status === "NEEDS_LOGIN" && <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Login necessário. Entre normalmente no Mercado Livre; a extensão detectará a sessão sem enviar credenciais ao AfiliHub.</div>}
            {mercadoLivreStatus?.mercadoLivre.status === "NEEDS_USER_ACTION" && <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-200">O Mercado Livre precisa confirmar seu acesso. Conclua CAPTCHA ou 2FA no navegador. O AfiliHub não tenta contornar a verificação.</div>}
            {mercadoLivreStatus?.mercadoLivre.status === "PORTAL_CHANGED" && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">Detectamos uma mudança no Gerador de Links. A integração foi protegida e nenhum link sem afiliação será usado.</div>}

            <dl className="mt-5 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><div><dt className="text-[#9CA3AF]">Último heartbeat</dt><dd className="mt-1 text-[#0F172A]">{mercadoLivreStatus?.companion?.lastSeenAt ? new Date(mercadoLivreStatus.companion.lastSeenAt).toLocaleString("pt-BR") : "—"}</dd></div><div><dt className="text-[#9CA3AF]">Gerações 24h</dt><dd className="mt-1 text-[#0F172A]">{mercadoLivreStatus?.metrics.generationCount ?? 0}</dd></div><div><dt className="text-[#9CA3AF]">Taxa de sucesso</dt><dd className="mt-1 text-[#0F172A]">{mercadoLivreStatus?.metrics.successRate ?? 0}%</dd></div><div><dt className="text-[#9CA3AF]">P95</dt><dd className="mt-1 text-[#0F172A]">{mercadoLivreStatus?.metrics.p95Latency ?? 0} ms</dd></div></dl>

            {(mercadoLivreStatus?.remote.status === "READY" || mercadoLivreStatus?.companion) && <div className="mt-6 rounded-xl border border-[#E8E9ED] bg-[#F8FAFC] p-4"><p className="text-sm font-medium text-[#0F172A]">Testar geração</p><p className="mt-1 text-xs text-[#9CA3AF]">Informe a URL direta de um produto MLB. O teste usa o motor remoto quando conectado e a extensão como fallback.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={mercadoLivreTestUrl} onChange={(event)=>setMercadoLivreTestUrl(event.target.value)} placeholder="https://produto.mercadolivre.com.br/MLB-..." className="min-w-0 flex-1 rounded-lg border border-[#E8E9ED] bg-[#FFFFFF] px-3 py-2 text-sm text-[#0F172A]"/><button onClick={testMercadoLivreGeneration} disabled={busy !== null || !mercadoLivreTestUrl.trim()} className="rounded-lg bg-[#EDEDED] px-4 py-2 text-sm font-medium text-[#111] disabled:opacity-50">{busy === "ml:test" ? "Gerando…" : "Testar geração"}</button></div>{mercadoLivreTestJob && <div className={`mt-3 rounded-lg border p-3 text-xs ${mercadoLivreTestJob.status === "SUCCESS" ? "border-green-500/30 bg-green-500/10 text-green-200" : ["FAILED","EXPIRED"].includes(mercadoLivreTestJob.status) ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}><p>Status: {mercadoLivreTestJob.status}{mercadoLivreTestJob.errorCode ? ` · ${mercadoLivreTestJob.errorCode}` : ""}</p>{mercadoLivreTestJob.resultUrl && <a href={mercadoLivreTestJob.resultUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all underline">{mercadoLivreTestJob.resultUrl}</a>}</div>}</div>}

            <div className="mt-6 flex flex-wrap gap-2"><a href="https://www.mercadolivre.com.br/afiliados" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#D4D4D8] px-4 py-2 text-sm text-[#0F172A]"><ExternalLink className="h-4 w-4" /> Abrir Mercado Livre</a>{mercadoLivreStatus?.companion?.status === "OUTDATED" ? <a href="/browser-companion/install.html" target="_blank" rel="noreferrer" className="rounded-lg bg-[#EDEDED] px-4 py-2 text-sm font-medium text-[#111]">Atualizar extensão</a> : mercadoLivreStatus?.companion && <button onClick={createCompanionPairing} disabled={busy !== null} className="rounded-lg border border-[#D4D4D8] px-4 py-2 text-sm text-[#0F172A]">Reconectar extensão</button>}{mercadoLivreStatus?.companion && <button onClick={()=>void run('ml:revoke',async()=>{await mercadoLivreAffiliateApi.revoke(mercadoLivreStatus.companion!.id);setCompanionPairing(null);await reloadMercadoLivre();})} disabled={busy !== null} className="rounded-lg px-4 py-2 text-sm text-[#EF4444]">Desconectar</button>}</div>
          </div>
        </div>,
        document.body,
      )}

      {configuring && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onMouseDown={() => setConfiguring(null)}
        >
          <form
            onSubmit={saveGenericConfig}
            className="w-full max-w-md rounded-2xl bg-[#FFFFFF] border border-[#E8E9ED] p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-medium text-[#0F172A]">
              Configurar {configuring.name}
            </h2>
            <label className="block text-xs text-[#6B6F7B] mt-6 mb-2">
              Tag de afiliado / ID
            </label>
            <input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-sm text-[#0F172A]"
            />
            <button className="w-full mt-5 py-2 rounded-lg bg-[#EDEDED] text-[#0F172A] text-sm font-medium">
              Salvar configuração
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
