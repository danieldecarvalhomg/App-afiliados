import React, { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react';
import {
  Product,
  QueueConfig,
  QueueItem,
  Campaign,
  AutomationRule,
  Integration,
  ChannelGroup,
  CRMLead,
  CopyTemplate,
  LandingPageItem,
  SystemLog,
  SubscriptionPlan,
  MonitoredGroup,
  CapturedMessage,
  ExtractedDataJSON,
  ProductCollection,
} from '../types';
import { supabaseService } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import { readJsonResponse } from '../services/apiResponse';
import { productsApi } from '../services/productsApi';
import { onProductCatalogChanged } from '../services/productCatalogEvents';

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
}

interface AppContextType {
  // Auth
  currentUser: any | null;

  // UI
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;

  // Dados
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  productCount: number | null;
  refreshProductCount: () => Promise<void>;
  queues: QueueConfig[];
  setQueues: React.Dispatch<React.SetStateAction<QueueConfig[]>>;
  queueItems: QueueItem[];
  setQueueItems: React.Dispatch<React.SetStateAction<QueueItem[]>>;
  integrations: Integration[];
  setIntegrations: React.Dispatch<React.SetStateAction<Integration[]>>;
  groups: ChannelGroup[];
  setGroups: React.Dispatch<React.SetStateAction<ChannelGroup[]>>;
  campaigns: Campaign[];
  automations: AutomationRule[];
  templates: CopyTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<CopyTemplate[]>>;
  monitoredGroups: MonitoredGroup[];
  setMonitoredGroups: React.Dispatch<React.SetStateAction<MonitoredGroup[]>>;
  capturedMessages: CapturedMessage[];
  setCapturedMessages: React.Dispatch<React.SetStateAction<CapturedMessage[]>>;
  landingPages: LandingPageItem[];
  leads: CRMLead[];
  productCollections: ProductCollection[];
  logs: SystemLog[];
  subscription: SubscriptionPlan;
  refreshSubscription: () => Promise<void>;
  notifications: NotificationItem[];

  // Operações de Templates
  addTemplate: (templateData: Partial<CopyTemplate>) => CopyTemplate;
  updateTemplate: (id: string, updates: Partial<CopyTemplate>) => void;
  deleteTemplate: (id: string) => void;
  setDefaultTemplate: (id: string) => void;
  toggleTemplateStatus: (id: string) => void;

  // Operações de Grupos Monitorados
  addMonitoredGroup: (data: Partial<MonitoredGroup>) => MonitoredGroup;
  updateMonitoredGroup: (id: string, updates: Partial<MonitoredGroup>) => void;
  deleteMonitoredGroup: (id: string) => void;
  toggleMonitoredGroupStatus: (id: string) => void;

  // Operações de Mensagens Capturadas
  addCapturedMessage: (msgData: Partial<CapturedMessage>) => CapturedMessage;
  approveCapturedMessage: (id: string, editedData?: Partial<ExtractedDataJSON>) => void;
  rejectCapturedMessage: (id: string) => void;

  // Operações de CRM
  addLead: (lead: Omit<CRMLead, 'id'>) => Promise<boolean>;
  updateLead: (id: string, updates: Partial<CRMLead>) => Promise<boolean>;
  deleteLead: (id: string) => Promise<boolean>;

  // Operações da Biblioteca
  addProductCollection: (name: string) => Promise<boolean>;
  deleteProductCollection: (id: string) => Promise<boolean>;
  toggleProductInCollection: (collectionId: string, productId: string) => Promise<boolean>;

  // Operações de Produtos
  addProduct: (productData: Partial<Product>) => Product;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  toggleFavoriteProduct: (id: string) => void;

  // Operações de Fila
  addQueueItem: (item: Partial<QueueItem>) => void;
  deleteQueueItem: (id: string) => void;
  shuffleQueue: (queueConfigId: string) => void;
  clearSentQueueItems: (queueConfigId: string) => void;
  toggleQueueStatus: (queueConfigId: string) => void;
  moveQueueItemPriority: (itemId: string, direction: 'up' | 'down') => void;

  // Operações de Integrações
  updateIntegrationConfig: (integrationId: string, tagAfiliado?: string) => void;

  // Notificações
  markNotificationRead: (id: string) => void;
  clearAllNotifications: () => void;

  // Logs (destinados à UI)
  addLog: (level: 'info' | 'warning' | 'error' | 'success', module: string, message: string, details?: string) => void;

  // IA (via API do servidor — sem fallback fake)
  generateCopyWithAI: (params: any) => Promise<string>;
  extractOfferFromUrl: (url: string) => Promise<any>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Estado honesto enquanto não existe uma assinatura persistida para o usuário.
const DEFAULT_SUBSCRIPTION: SubscriptionPlan = {
  planCode: 'free',
  name: 'Sem assinatura',
  priceMonthly: 0,
  status: 'pendente',
  renewalDate: '',
  disparosLimit: 0,
  disparosUsed: 0,
  canaisLimit: 0,
  canaisUsed: 0,
  iaGenerationsLimit: 0,
  iaGenerationsUsed: 0,
  iaGenerationsPerProductLimit: 0,
  affiliateConversionsLimit: 0,
  affiliateConversionsUsed: 0,
  monitoredGroupsLimit: 0,
  monitoredGroupsUsed: 0,
  radarRefreshesLimit: 0,
  radarRefreshesUsed: 0,
  accountUsersLimit: 1,
  landingPagesLimit: 0,
  billingMode: 'preview',
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [queues, setQueues] = useState<QueueConfig[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [groups, setGroups] = useState<ChannelGroup[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [templates, setTemplates] = useState<CopyTemplate[]>([]);
  const [monitoredGroups, setMonitoredGroups] = useState<MonitoredGroup[]>([]);
  const [capturedMessages, setCapturedMessages] = useState<CapturedMessage[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPageItem[]>([]);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [productCollections, setProductCollections] = useState<ProductCollection[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionPlan>(DEFAULT_SUBSCRIPTION);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // ─── Auth & carregamento de dados ───────────────────────────────────────────

  const clearAllData = () => {
    setProducts([]);
    setProductCount(null);
    setQueues([]);
    setQueueItems([]);
    setIntegrations([]);
    setGroups([]);
    setCampaigns([]);
    setAutomations([]);
    setTemplates([]);
    setMonitoredGroups([]);
    setCapturedMessages([]);
    setLandingPages([]);
    setLeads([]);
    setProductCollections([]);
    setLogs([]);
    setSubscription(DEFAULT_SUBSCRIPTION);
  };

  const loadAllData = async (_userId: string) => {
    try {
      const [
        fetchedProducts,
        fetchedQueues,
        fetchedQueueItems,
        fetchedIntegrations,
        fetchedTemplates,
        fetchedMonitoredGroups,
        fetchedCapturedMessages,
        fetchedLandingPages,
        fetchedLeads,
        fetchedLogs,
        fetchedGroups,
        fetchedCampaigns,
        fetchedAutomations,
        fetchedSubscription,
        fetchedProductCollections,
      ] = await Promise.all([
        supabaseService.fetchProducts(),
        supabaseService.fetchQueueConfigs(),
        supabaseService.fetchQueueItems(),
        supabaseService.fetchIntegrations(),
        supabaseService.fetchTemplates(),
        supabaseService.fetchMonitoredGroups(),
        supabaseService.fetchCapturedMessages(),
        supabaseService.fetchLandingPages(),
        supabaseService.fetchLeads(),
        supabaseService.fetchLogs(),
        supabaseService.fetchGroups(),
        supabaseService.fetchCampaigns(),
        supabaseService.fetchAutomations(),
        supabaseService.fetchSubscription(),
        supabaseService.fetchProductCollections(),
      ]);

      setProducts(fetchedProducts || []);
      setQueues(fetchedQueues || []);
      setQueueItems(fetchedQueueItems || []);
      setIntegrations(fetchedIntegrations || []);
      setTemplates(fetchedTemplates || []);
      setMonitoredGroups(fetchedMonitoredGroups || []);
      setCapturedMessages(fetchedCapturedMessages || []);
      setLandingPages(fetchedLandingPages || []);
      setLeads(fetchedLeads || []);
      setLogs(fetchedLogs || []);
      setGroups(fetchedGroups);
      setCampaigns(fetchedCampaigns);
      setAutomations(fetchedAutomations);
      setSubscription(fetchedSubscription || DEFAULT_SUBSCRIPTION);
      setProductCollections(fetchedProductCollections);
    } catch (error) {
      console.error('[AfiliHub:AppContext] Falha ao carregar dados:', error);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !session.user.email_confirmed_at) {
        void supabase.auth.signOut({ scope: 'local' });
        setCurrentUser(null);
        clearAllData();
      } else if (session) {
        setCurrentUser(session.user);
        loadAllData(session.user.id);
      } else {
        setCurrentUser(null);
        clearAllData();
      }
    });

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !session.user.email_confirmed_at) {
        void supabase.auth.signOut({ scope: 'local' });
        setCurrentUser(null);
        clearAllData();
      } else if (session) {
        setCurrentUser(session.user);
        loadAllData(session.user.id);
      } else {
        setCurrentUser(null);
        clearAllData();
      }
    });

    return () => authSub.unsubscribe();
  }, []);

  const refreshProductCount = useCallback(async (): Promise<void> => {
    if (!currentUser) {
      setProductCount(null);
      return;
    }
    try {
      setProductCount((await productsApi.list()).length);
    } catch (error) {
      console.error('[AfiliHub:AppContext] Falha ao carregar contador de produtos:', error);
      setProductCount(null);
    }
  }, [currentUser]);

  const refreshSubscription = useCallback(async (): Promise<void> => {
    if (!currentUser) {
      setSubscription(DEFAULT_SUBSCRIPTION);
      return;
    }
    const value = await supabaseService.fetchSubscription();
    setSubscription(value ?? DEFAULT_SUBSCRIPTION);
  }, [currentUser]);

  const productCountLiveRef = useRef(false);

  useEffect(() => {
    if (!currentUser) return;
    void refreshProductCount();
    const unsubscribe = onProductCatalogChanged(() => void refreshProductCount());
    const refreshOnFocus = () => void refreshProductCount();
    window.addEventListener('focus', refreshOnFocus);
    const channel = supabase.channel(`product-count:${currentUser.id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'products', filter:`user_id=eq.${currentUser.id}` }, () => void refreshProductCount())
      .subscribe((status) => { productCountLiveRef.current = status === 'SUBSCRIBED'; });
    const interval = window.setInterval(() => { if (!productCountLiveRef.current) void refreshProductCount(); }, 60_000);
    return () => {
      unsubscribe();
      productCountLiveRef.current = false;
      void supabase.removeChannel(channel);
      window.removeEventListener('focus', refreshOnFocus);
      window.clearInterval(interval);
    };
  }, [currentUser, refreshProductCount]);

  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase.channel(`subscription-usage:${currentUser.id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'subscriptions', filter:`user_id=eq.${currentUser.id}` }, () => void refreshSubscription())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUser, refreshSubscription]);

  const persist = async (operation: () => Promise<boolean>, label: string): Promise<boolean> => {
    try {
      const saved = await operation();
      if (!saved) throw new Error('PERSISTENCE_REJECTED');
      return true;
    } catch (error) {
      console.error(`[AfiliHub:AppContext] Falha ao ${label}.`, error);
      setNotifications(prev => [{
        id: crypto.randomUUID(),
        title: 'Alteração não salva',
        message: `Não foi possível ${label}. Os dados foram recarregados.`,
        time: 'Agora',
        type: 'error',
        read: false,
      }, ...prev]);
      if (currentUser?.id) await loadAllData(currentUser.id);
      return false;
    }
  };

  // ─── Logs (UI) ───────────────────────────────────────────────────────────────

  const addLog = (
    level: 'info' | 'warning' | 'error' | 'success',
    module: string,
    message: string,
    details?: string
  ) => {
    const newLog: SystemLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleString('pt-BR'),
      level,
      module,
      message,
      details,
    };
    setLogs(prev => [newLog, ...prev]);
    void (async () => {
      const saved = await supabaseService.saveLog(newLog);
      if (!saved) console.error('[AfiliHub:AppContext] Não foi possível persistir o log da interface.');
    })();
  };

  // ─── Templates ───────────────────────────────────────────────────────────────

  const addTemplate = (templateData: Partial<CopyTemplate>): CopyTemplate => {
    const storeName = templateData.store || 'Todas as Lojas';
    const newTpl: CopyTemplate = {
      id: crypto.randomUUID(),
      title: templateData.title || 'Novo Template',
      category: templateData.category || storeName,
      store: storeName,
      content: templateData.content || '',
      usageCount: 0,
      status: templateData.status || 'ativo',
      isDefault: templateData.isDefault || false,
    };

    setTemplates(prev => {
      let list = prev;
      if (newTpl.isDefault) {
        list = prev.map(t => {
          if (t.store === storeName) {
            const updated = { ...t, isDefault: false };
            void persist(() => supabaseService.saveTemplate(updated), 'atualizar o template padrão');
            return updated;
          }
          return t;
        });
      }
      return [newTpl, ...list];
    });

    void persist(() => supabaseService.saveTemplate(newTpl), 'criar o template');
    addLog('success', 'Templates', `Novo template criado: "${newTpl.title}"`);
    return newTpl;
  };

  const updateTemplate = (id: string, updates: Partial<CopyTemplate>) => {
    setTemplates(prev => {
      const current = prev.find(t => t.id === id);
      const targetStore = updates.store || current?.store || 'Todas as Lojas';

      return prev.map(t => {
        if (t.id === id) {
          const updated = { ...t, ...updates };
          void persist(() => supabaseService.saveTemplate(updated), 'atualizar o template');
          return updated;
        }
        if (updates.isDefault && t.store === targetStore && t.id !== id) {
          const updated = { ...t, isDefault: false };
          void persist(() => supabaseService.saveTemplate(updated), 'atualizar o template padrão');
          return updated;
        }
        return t;
      });
    });
    addLog('info', 'Templates', `Template atualizado.`);
  };

  const deleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    void persist(() => supabaseService.deleteTemplate(id), 'excluir o template');
    addLog('warning', 'Templates', `Template excluído.`);
  };

  const setDefaultTemplate = (id: string) => {
    setTemplates(prev => {
      const target = prev.find(t => t.id === id);
      if (!target) return prev;

      return prev.map(t => {
        if (t.store === target.store) {
          const updated = { ...t, isDefault: t.id === id };
          void persist(() => supabaseService.saveTemplate(updated), 'definir o template padrão');
          return updated;
        }
        return t;
      });
    });
    addLog('success', 'Templates', `Template definido como padrão.`);
  };

  const toggleTemplateStatus = (id: string) => {
    setTemplates(prev => prev.map(t => {
      if (t.id === id) {
        const updated = { ...t, status: t.status === 'ativo' ? 'inativo' as const : 'ativo' as const };
        void persist(() => supabaseService.saveTemplate(updated), 'alterar o status do template');
        return updated;
      }
      return t;
    }));
  };

  // ─── Grupos Monitorados ───────────────────────────────────────────────────────

  const addMonitoredGroup = (data: Partial<MonitoredGroup>): MonitoredGroup => {
    const newGrp: MonitoredGroup = {
      id: crypto.randomUUID(),
      name: data.name || 'Novo Grupo Monitorado',
      platform: data.platform || 'Telegram',
      externalIdOrUrl: data.externalIdOrUrl || '',
      linkedStore: data.linkedStore || 'Todas as Lojas',
      status: 'ativo',
      capturedCount: 0,
      approvedCount: 0,
      lastActivity: 'Agora mesmo',
      rules: data.rules || {
        mandatoryKeywords: [],
        forbiddenKeywords: [],
        enableOCR: true,
        maxPerHour: 30,
        dedupHours: 12,
        reviewRequired: true,
      },
    };
    setMonitoredGroups(prev => [newGrp, ...prev]);
    void persist(() => supabaseService.saveMonitoredGroup(newGrp), 'adicionar o grupo monitorado');
    addLog('success', 'Monitor de Grupos', `Novo grupo adicionado: "${newGrp.name}"`);
    return newGrp;
  };

  const updateMonitoredGroup = (id: string, updates: Partial<MonitoredGroup>) => {
    setMonitoredGroups(prev => prev.map(g => {
      if (g.id === id) {
        const updated = { ...g, ...updates };
        void persist(() => supabaseService.saveMonitoredGroup(updated), 'atualizar o grupo monitorado');
        return updated;
      }
      return g;
    }));
    addLog('info', 'Monitor de Grupos', `Grupo atualizado.`);
  };

  const deleteMonitoredGroup = (id: string) => {
    setMonitoredGroups(prev => prev.filter(g => g.id !== id));
    void persist(() => supabaseService.deleteMonitoredGroup(id), 'remover o grupo monitorado');
    addLog('warning', 'Monitor de Grupos', `Grupo removido.`);
  };

  const toggleMonitoredGroupStatus = (id: string) => {
    setMonitoredGroups(prev => prev.map(g => {
      if (g.id === id) {
        const nextStatus = g.status === 'ativo' ? 'pausado' : 'ativo';
        const updated = { ...g, status: nextStatus } as MonitoredGroup;
        void persist(() => supabaseService.saveMonitoredGroup(updated), 'alterar o status do grupo monitorado');
        return updated;
      }
      return g;
    }));
  };

  // ─── Mensagens Capturadas ─────────────────────────────────────────────────────
  // processCapturedMessageAI removido: pertence ao MonitorService (Bloco futuro).
  // Mensagens ficam como dados brutos até implementação real.

  const addCapturedMessage = (msgData: Partial<CapturedMessage>): CapturedMessage => {
    const newMsg: CapturedMessage = {
      id: crypto.randomUUID(),
      groupId: msgData.groupId || '',
      groupName: msgData.groupName || 'Grupo Monitorado',
      platform: msgData.platform || 'Telegram',
      rawContent: msgData.rawContent || '',
      imageUrl: msgData.imageUrl,
      extractedJson: msgData.extractedJson || null,
      confidence: msgData.confidence || 0,
      status: msgData.status || 'Pendente',
      templateUsedId: msgData.templateUsedId,
      finalText: msgData.finalText,
      createdAt: new Date().toISOString(),
    };
    setCapturedMessages(prev => [newMsg, ...prev]);
    return newMsg;
  };

  const approveCapturedMessage = (id: string, editedData?: Partial<ExtractedDataJSON>) => {
    const targetMsg = capturedMessages.find(m => m.id === id);
    if (!targetMsg) return;

    const mergedJson = editedData
      ? { ...targetMsg.extractedJson, ...editedData }
      : targetMsg.extractedJson;

    const firstQueue = queues[0];
    const priceNum = parseFloat(mergedJson?.preco || '0') || 0;
    const origPriceNum = parseFloat(mergedJson?.preco_original || '0') || 0;
    const market = (mergedJson?.loja || 'Amazon') as any;

    addQueueItem({
      queueConfigId: firstQueue?.id || '',
      productTitle: mergedJson?.produto || 'Oferta Monitorada',
      productImage: targetMsg.imageUrl,
      price: priceNum,
      originalPrice: origPriceNum,
      marketplace: market,
      copyText: targetMsg.finalText || targetMsg.rawContent,
      affiliateUrl: mergedJson?.link || '',
    });

    setCapturedMessages(prev => prev.map(m =>
      m.id === id ? { ...m, status: 'Aprovada' as const, extractedJson: mergedJson as any } : m
    ));

    setMonitoredGroups(prev => prev.map(g => {
      if (g.id === targetMsg.groupId) {
        const updated = { ...g, approvedCount: g.approvedCount + 1, lastActivity: 'Agora mesmo' };
      void persist(() => supabaseService.saveMonitoredGroup(updated), 'atualizar as métricas do grupo');
        return updated;
      }
      return g;
    }));

    addLog('success', 'Monitor de Grupos', `Oferta aprovada e enviada para a fila de disparo.`);
  };

  const rejectCapturedMessage = (id: string) => {
    setCapturedMessages(prev => prev.map(m =>
      m.id === id ? { ...m, status: 'Rejeitada' as const } : m
    ));
    addLog('info', 'Monitor de Grupos', `Mensagem descartada.`);
  };

  // ─── CRM ─────────────────────────────────────────────────────────────────────

  const addLead = async (lead: Omit<CRMLead, 'id'>): Promise<boolean> => {
    const created: CRMLead = { ...lead, id: crypto.randomUUID() };
    setLeads(prev => [created, ...prev]);
    const saved = await persist(() => supabaseService.saveLead(created), 'criar o lead');
    if (saved) addLog('success', 'CRM', `Novo lead cadastrado: "${created.name}" (${created.platform})`);
    return saved;
  };

  const updateLead = async (id: string, updates: Partial<CRMLead>): Promise<boolean> => {
    const current = leads.find(lead => lead.id === id);
    if (!current) return false;
    const updated = { ...current, ...updates, id };
    setLeads(prev => prev.map(lead => lead.id === id ? updated : lead));
    return persist(() => supabaseService.saveLead(updated), 'atualizar o lead');
  };

  const deleteLead = async (id: string): Promise<boolean> => {
    setLeads(prev => prev.filter(lead => lead.id !== id));
    const deleted = await persist(() => supabaseService.deleteLead(id), 'excluir o lead');
    if (deleted) addLog('info', 'CRM', `Lead removido da lista.`);
    return deleted;
  };

  // ─── Biblioteca ───────────────────────────────────────────────────────────────

  const addProductCollection = async (name: string): Promise<boolean> => {
    const normalized = name.trim();
    if (!normalized) return false;
    const collection: ProductCollection = {
      id: crypto.randomUUID(),
      name: normalized,
      productIds: [],
      createdAt: new Date().toISOString(),
    };
    setProductCollections(prev => [collection, ...prev]);
    const saved = await persist(
      () => supabaseService.saveProductCollection(collection),
      'criar a coleção',
    );
    if (saved) addLog('success', 'Biblioteca', `Nova coleção criada: "${collection.name}"`);
    return saved;
  };

  const deleteProductCollection = async (id: string): Promise<boolean> => {
    setProductCollections(prev => prev.filter(collection => collection.id !== id));
    return persist(() => supabaseService.deleteProductCollection(id), 'excluir a coleção');
  };

  const toggleProductInCollection = async (collectionId: string, productId: string): Promise<boolean> => {
    const collection = productCollections.find(item => item.id === collectionId);
    if (!collection) return false;
    const selected = !collection.productIds.includes(productId);
    setProductCollections(prev => prev.map(item => item.id === collectionId
      ? {
          ...item,
          productIds: selected
            ? [...item.productIds, productId]
            : item.productIds.filter(id => id !== productId),
        }
      : item));
    return persist(
      () => supabaseService.setProductCollectionProduct(collectionId, productId, selected),
      selected ? 'adicionar o produto à coleção' : 'remover o produto da coleção',
    );
  };

  // ─── Produtos ─────────────────────────────────────────────────────────────────

  const addProduct = (productData: Partial<Product>): Product => {
    const newProduct: Product = {
      id: crypto.randomUUID(),
      title: productData.title || 'Novo Produto Afiliado',
      originalPrice: productData.originalPrice || 0,
      price: productData.price || 0,
      discountPercent: productData.discountPercent || 0,
      rating: productData.rating || 5.0,
      reviewsCount: productData.reviewsCount || 0,
      category: productData.category || 'Geral',
      marketplace: productData.marketplace || 'Amazon',
      rawUrl: productData.rawUrl || '',
      affiliateUrl: productData.affiliateUrl || '',
      couponCode: productData.couponCode || '',
      image: productData.image || '',
      status: 'ativo',
      isFavorite: false,
      isArchived: false,
      hotScore: productData.hotScore ?? 80,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceType: productData.sourceType || 'manual', sourceReferenceId: productData.sourceReferenceId ?? null,
      sourceUrl: productData.sourceUrl || productData.rawUrl || '', couponDescription: productData.couponDescription || '', couponLink: productData.couponLink || '',
      freeShipping: productData.freeShipping ?? null, affiliateStatus: productData.affiliateStatus || (productData.rawUrl ? 'pending' : 'pending_url'),
      affiliateConversionId: productData.affiliateConversionId ?? null, observations: productData.observations || '',
    };

    setProducts(prev => [newProduct, ...prev]);
    void persist(() => supabaseService.saveProduct(newProduct), 'adicionar o produto');
    addLog('success', 'Produtos', `Novo produto adicionado: "${newProduct.title}"`);
    return newProduct;
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p, ...updates, updatedAt: new Date().toISOString() };
        void persist(() => supabaseService.saveProduct(updated), 'atualizar o produto');
        return updated;
      }
      return p;
    }));
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    void persist(() => supabaseService.deleteProduct(id), 'remover o produto');
    addLog('info', 'Produtos', `Produto removido.`);
  };

  const toggleFavoriteProduct = (id: string) => {
    setProducts(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p, isFavorite: !p.isFavorite };
        void persist(() => supabaseService.saveProduct(updated), 'favoritar o produto');
        return updated;
      }
      return p;
    }));
  };

  // ─── Fila ─────────────────────────────────────────────────────────────────────

  const addQueueItem = (itemData: Partial<QueueItem>) => {
    const targetQueueId = itemData.queueConfigId || queues[0]?.id || '';
    const newItem: QueueItem = {
      id: crypto.randomUUID(),
      queueConfigId: targetQueueId,
      productId: itemData.productId || '',
      productTitle: itemData.productTitle || 'Oferta em Destaque',
      productImage: itemData.productImage || '',
      price: itemData.price || 0,
      originalPrice: itemData.originalPrice,
      marketplace: itemData.marketplace || 'Amazon',
      copyText: itemData.copyText || '',
      affiliateUrl: itemData.affiliateUrl || '',
      channelIds: itemData.channelIds || [],
      scheduledFor: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      status: 'pendente',
      priority: queueItems.filter(i => i.queueConfigId === targetQueueId).length + 1,
      ...itemData,
    };

    setQueueItems(prev => [...prev, newItem]);
    void persist(() => supabaseService.saveQueueItem(newItem), 'adicionar o item à fila');

    setQueues(prev => prev.map(q => {
      if (q.id === targetQueueId) {
        const updated = { ...q, totalPending: q.totalPending + 1 };
        void persist(() => supabaseService.saveQueueConfig(updated), 'atualizar os totais da fila');
        return updated;
      }
      return q;
    }));
    addLog('info', 'Filas', `Item adicionado à fila: "${newItem.productTitle}"`);
  };

  const deleteQueueItem = (id: string) => {
    const item = queueItems.find(i => i.id === id);
    if (item) {
      setQueues(prev => prev.map(q => {
        if (q.id === item.queueConfigId) {
          const updated = { ...q, totalPending: Math.max(0, q.totalPending - 1) };
          void persist(() => supabaseService.saveQueueConfig(updated), 'atualizar os totais da fila');
          return updated;
        }
        return q;
      }));
    }
    setQueueItems(prev => prev.filter(i => i.id !== id));
    void persist(() => supabaseService.deleteQueueItem(id), 'remover o item da fila');
  };

  const shuffleQueue = (queueConfigId: string) => {
    setQueueItems(prev => {
      const others = prev.filter(i => i.queueConfigId !== queueConfigId);
      const pending = prev.filter(i => i.queueConfigId === queueConfigId && i.status === 'pendente');
      const rest = prev.filter(i => i.queueConfigId === queueConfigId && i.status !== 'pendente');

      const shuffled = [...pending];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      shuffled.forEach((item, idx) => {
        item.priority = idx + 1;
        void persist(() => supabaseService.saveQueueItem(item), 'reordenar a fila');
      });

      return [...others, ...shuffled, ...rest];
    });
    addLog('success', 'Filas', `Fila embaralhada com sucesso.`);
  };

  const clearSentQueueItems = (queueConfigId: string) => {
    setQueueItems(prev => {
      const toDelete = prev.filter(i => i.queueConfigId === queueConfigId && i.status === 'enviado');
      void persist(async () => (await Promise.all(toDelete.map(i => supabaseService.deleteQueueItem(i.id)))).every(Boolean), 'limpar os itens enviados');
      return prev.filter(i => !(i.queueConfigId === queueConfigId && i.status === 'enviado'));
    });
    addLog('info', 'Filas', `Itens enviados removidos da fila.`);
  };

  const toggleQueueStatus = (queueConfigId: string) => {
    setQueues(prev => prev.map(q => {
      if (q.id === queueConfigId) {
        const updated = {
          ...q,
          status: (q.status === 'ativa' ? 'pausada' : 'ativa') as 'ativa' | 'pausada',
          nextDeliveryTime: q.status === 'ativa' ? 'Pausada' : 'Em 15 minutos',
        };
        void persist(() => supabaseService.saveQueueConfig(updated), 'alterar o status da fila');
        return updated;
      }
      return q;
    }));
  };

  const moveQueueItemPriority = (itemId: string, direction: 'up' | 'down') => {
    setQueueItems(prev => {
      const index = prev.findIndex(i => i.id === itemId);
      if (index === -1) return prev;

      const newItems = [...prev];
      const targetQueueId = newItems[index].queueConfigId;

      const queuePendingIndices = newItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item.queueConfigId === targetQueueId && item.status === 'pendente');

      const currentPos = queuePendingIndices.findIndex(({ idx }) => idx === index);
      if (currentPos === -1) return prev;

      if (direction === 'up' && currentPos > 0) {
        const idxA = queuePendingIndices[currentPos].idx;
        const idxB = queuePendingIndices[currentPos - 1].idx;
        [newItems[idxA], newItems[idxB]] = [newItems[idxB], newItems[idxA]];
      } else if (direction === 'down' && currentPos < queuePendingIndices.length - 1) {
        const idxA = queuePendingIndices[currentPos].idx;
        const idxB = queuePendingIndices[currentPos + 1].idx;
        [newItems[idxA], newItems[idxB]] = [newItems[idxB], newItems[idxA]];
      }

      void persist(async () => (await Promise.all(newItems.map(i => supabaseService.saveQueueItem(i)))).every(Boolean), 'alterar a prioridade da fila');
      return newItems;
    });
  };

  // ─── Integrações ──────────────────────────────────────────────────────────────
  // Salvar configuração NÃO significa conectar.
  // configurationStatus = 'configured', connectionStatus permanece 'disconnected'.

  const updateIntegrationConfig = (integrationId: string, tagAfiliado?: string) => {
    setIntegrations(prev => prev.map(int => {
      if (int.id === integrationId) {
        const updated = {
          ...int,
          tagAfiliado: tagAfiliado !== undefined ? tagAfiliado : int.tagAfiliado,
          configurationStatus: 'configured' as const,
          // connectionStatus permanece 'disconnected' — conexão real vem do backend
          lastSync: 'Configuração salva',
        };
        void persist(() => supabaseService.saveIntegration(updated), 'salvar a configuração da integração');
        return updated;
      }
      return int;
    }));
    addLog('success', 'Integrações', `Configuração salva. Conexão real disponível em bloco futuro.`);
  };

  // ─── Notificações ─────────────────────────────────────────────────────────────

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  // ─── IA (via API servidor) ────────────────────────────────────────────────────
  // Sem fallback fake: se a API falhar, a Promise rejeita com erro real.

  const generateCopyWithAI = async (params: any): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Faça login para usar a IA.');
    const res = await fetch('/api/ai/generate-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(params),
    });
    const data = await readJsonResponse<{ success: boolean; data?: { copy?: string }; error?: { message?: string } }>(res);
    if (data.success && data.data?.copy) {
      addLog('info', 'IA Copywriter', `Cópia gerada para "${params.productName || 'Oferta'}"`);
      return data.data.copy;
    }
    const errorMessage = data.error?.message || 'Erro ao gerar cópia com IA';
    throw new Error(errorMessage);
  };

  const extractOfferFromUrl = async (url: string): Promise<any> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Faça login para usar a IA.');
    const res = await fetch('/api/ai/extract-offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ url }),
    });
    const data = await readJsonResponse<{ success: boolean; data?: any; error?: { message?: string } }>(res);
    if (data.success) {
      return data.data;
    }
    const errorMessage = data.error?.message || 'Erro ao extrair oferta da URL';
    throw new Error(errorMessage);
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        activeTab,
        setActiveTab,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        isSearchOpen,
        setIsSearchOpen,
        products,
        setProducts,
        productCount,
        refreshProductCount,
        queues,
        setQueues,
        queueItems,
        setQueueItems,
        integrations,
        setIntegrations,
        groups,
        setGroups,
        campaigns,
        automations,
        templates,
        setTemplates,
        addTemplate,
        updateTemplate,
        deleteTemplate,
        setDefaultTemplate,
        toggleTemplateStatus,
        monitoredGroups,
        setMonitoredGroups,
        addMonitoredGroup,
        updateMonitoredGroup,
        deleteMonitoredGroup,
        toggleMonitoredGroupStatus,
        capturedMessages,
        setCapturedMessages,
        addCapturedMessage,
        approveCapturedMessage,
        rejectCapturedMessage,
        addLead,
        updateLead,
        deleteLead,
        productCollections,
        addProductCollection,
        deleteProductCollection,
        toggleProductInCollection,
        landingPages,
        leads,
        logs,
        subscription,
        refreshSubscription,
        notifications,
        markNotificationRead,
        clearAllNotifications,
        addProduct,
        updateProduct,
        deleteProduct,
        toggleFavoriteProduct,
        addQueueItem,
        deleteQueueItem,
        shuffleQueue,
        clearSentQueueItems,
        toggleQueueStatus,
        moveQueueItemPriority,
        updateIntegrationConfig,
        addLog,
        generateCopyWithAI,
        extractOfferFromUrl,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp deve ser usado dentro de AppProvider');
  }
  return context;
};
