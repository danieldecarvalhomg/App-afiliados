import React, { createContext, useContext, useState, useEffect } from 'react';
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
} from '../types';
import {
  INITIAL_PRODUCTS,
  INITIAL_QUEUES,
  INITIAL_QUEUE_ITEMS,
  INITIAL_INTEGRATIONS,
  INITIAL_GROUPS,
  INITIAL_CAMPAIGNS,
  INITIAL_AUTOMATIONS,
  INITIAL_TEMPLATES,
  INITIAL_LANDING_PAGES,
  INITIAL_LEADS,
  INITIAL_LOGS,
  INITIAL_SUBSCRIPTION,
  INITIAL_MONITORED_GROUPS,
  INITIAL_CAPTURED_MESSAGES
} from '../data/mockData';
import { supabaseService } from '../services/supabaseService';
import { checkSupabaseConnection } from '../lib/supabase';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
}

interface AppContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
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
  addTemplate: (templateData: Partial<CopyTemplate>) => CopyTemplate;
  updateTemplate: (id: string, updates: Partial<CopyTemplate>) => void;
  deleteTemplate: (id: string) => void;
  setDefaultTemplate: (id: string) => void;
  toggleTemplateStatus: (id: string) => void;

  // Group Monitoring System
  monitoredGroups: MonitoredGroup[];
  setMonitoredGroups: React.Dispatch<React.SetStateAction<MonitoredGroup[]>>;
  addMonitoredGroup: (data: Partial<MonitoredGroup>) => MonitoredGroup;
  updateMonitoredGroup: (id: string, updates: Partial<MonitoredGroup>) => void;
  deleteMonitoredGroup: (id: string) => void;
  toggleMonitoredGroupStatus: (id: string) => void;

  capturedMessages: CapturedMessage[];
  setCapturedMessages: React.Dispatch<React.SetStateAction<CapturedMessage[]>>;
  addCapturedMessage: (msgData: Partial<CapturedMessage>) => CapturedMessage;
  approveCapturedMessage: (id: string, editedData?: Partial<ExtractedDataJSON>) => void;
  rejectCapturedMessage: (id: string) => void;
  processCapturedMessageAI: (rawText: string, groupId: string, imageUrl?: string) => Promise<CapturedMessage>;

  landingPages: LandingPageItem[];
  leads: CRMLead[];
  logs: SystemLog[];
  subscription: SubscriptionPlan;
  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  clearAllNotifications: () => void;
  
  // Quick Actions
  addProduct: (productData: Partial<Product>) => Product;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  toggleFavoriteProduct: (id: string) => void;
  
  addQueueItem: (item: Partial<QueueItem>) => void;
  deleteQueueItem: (id: string) => void;
  shuffleQueue: (queueConfigId: string) => void;
  clearSentQueueItems: (queueConfigId: string) => void;
  toggleQueueStatus: (queueConfigId: string) => void;
  moveQueueItemPriority: (itemId: string, direction: 'up' | 'down') => void;
  
  toggleIntegrationStatus: (integrationId: string) => void;
  updateIntegrationConfig: (integrationId: string, tagAfiliado?: string, apiKey?: string) => void;
  
  addLog: (level: 'info' | 'warning' | 'error' | 'success', module: string, message: string, details?: string) => void;
  clearMockData: () => void;
  convertAffiliateUrl: (url: string, marketplace: string) => string;
  
  // AI helpers
  generateCopyWithAI: (params: any) => Promise<string>;
  extractOfferFromUrl: (url: string) => Promise<any>;

  // Global Search
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Purge legacy demo data from localStorage on load if present
  useEffect(() => {
    const cleaned = localStorage.getItem('affi_cleaned_v3');
    if (!cleaned) {
      localStorage.removeItem('affi_queues');
      localStorage.removeItem('affi_products');
      localStorage.removeItem('affi_queue_items');
      localStorage.removeItem('affi_integrations');
      localStorage.setItem('affi_cleaned_v3', 'true');
    }
  }, []);

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('affi_products_feed_v2');
      if (!saved) return INITIAL_PRODUCTS;
      const parsed = JSON.parse(saved);
      // Auto-deduplicate by title to fix any previous duplicate bugs
      const uniqueMap = new Map();
      parsed.forEach((p: Product) => {
        if (p && p.title && !uniqueMap.has(p.title.trim().toLowerCase())) {
          uniqueMap.set(p.title.trim().toLowerCase(), p);
        }
      });
      const clean = Array.from(uniqueMap.values()) as Product[];
      return clean.length > 0 ? clean : INITIAL_PRODUCTS;
    } catch {
      return INITIAL_PRODUCTS;
    }
  });

  useEffect(() => {
    localStorage.setItem('affi_products_feed_v2', JSON.stringify(products));
  }, [products]);

  const [queues, setQueues] = useState<QueueConfig[]>(() => {
    try {
      const saved = localStorage.getItem('affi_queues');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      // Filter out any demo queues
      const clean = parsed.filter((q: any) => q.id && !q.id.includes('queue-1') && !q.id.includes('queue-2') && !q.id.includes('queue-3') && !q.name.includes('Fila Principal') && !q.name.includes('Disparos WhatsApp') && !q.name.includes('Fila Tech'));
      if (clean.length !== parsed.length) {
        localStorage.setItem('affi_queues', JSON.stringify(clean));
      }
      return clean;
    } catch {
      localStorage.removeItem('affi_queues');
      return [];
    }
  });

  const [queueItems, setQueueItems] = useState<QueueItem[]>(() => {
    try {
      const saved = localStorage.getItem('affi_queue_items');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      const clean = parsed.filter((i: any) => i.id && !i.id.includes('qitem-1') && !i.id.includes('qitem-2') && !i.id.includes('qitem-3'));
      if (clean.length !== parsed.length) {
        localStorage.setItem('affi_queue_items', JSON.stringify(clean));
      }
      return clean;
    } catch {
      localStorage.removeItem('affi_queue_items');
      return [];
    }
  });

  const [integrations, setIntegrations] = useState<Integration[]>(() => {
    try {
      const isCleaned = localStorage.getItem('affi_cleaned_v3');
      if (!isCleaned) {
        localStorage.removeItem('affi_integrations');
        return INITIAL_INTEGRATIONS;
      }
      const saved = localStorage.getItem('affi_integrations');
      return saved ? JSON.parse(saved) : INITIAL_INTEGRATIONS;
    } catch {
      return INITIAL_INTEGRATIONS;
    }
  });

  const [groups, setGroups] = useState<ChannelGroup[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [templates, setTemplates] = useState<CopyTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('affi_templates_v2');
      return saved ? JSON.parse(saved) : INITIAL_TEMPLATES;
    } catch {
      return INITIAL_TEMPLATES;
    }
  });
  const [monitoredGroups, setMonitoredGroups] = useState<MonitoredGroup[]>(() => {
    try {
      const saved = localStorage.getItem('affi_monitored_groups_v2');
      return saved ? JSON.parse(saved) : INITIAL_MONITORED_GROUPS;
    } catch {
      return INITIAL_MONITORED_GROUPS;
    }
  });

  const [capturedMessages, setCapturedMessages] = useState<CapturedMessage[]>(() => {
    try {
      const saved = localStorage.getItem('affi_captured_messages_v2');
      return saved ? JSON.parse(saved) : INITIAL_CAPTURED_MESSAGES;
    } catch {
      return INITIAL_CAPTURED_MESSAGES;
    }
  });

  const [landingPages, setLandingPages] = useState<LandingPageItem[]>([]);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [subscription] = useState<SubscriptionPlan>(INITIAL_SUBSCRIPTION);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Sync with Supabase on mount
  useEffect(() => {
    async function initSupabase() {
      const conn = await checkSupabaseConnection();
      if (conn.connected) {
        console.log('Supabase ativo:', conn.message);
        const remoteProducts = await supabaseService.fetchProducts();
        if (remoteProducts && remoteProducts.length > 0) {
          setProducts(remoteProducts);
        }
        const remoteQueueItems = await supabaseService.fetchQueueItems();
        if (remoteQueueItems && remoteQueueItems.length > 0) {
          setQueueItems(remoteQueueItems);
        }
      }
    }
    initSupabase();
  }, []);

  // Persist state
  useEffect(() => {
    localStorage.setItem('affi_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('affi_queues', JSON.stringify(queues));
  }, [queues]);

  useEffect(() => {
    localStorage.setItem('affi_queue_items', JSON.stringify(queueItems));
  }, [queueItems]);

  useEffect(() => {
    localStorage.setItem('affi_integrations', JSON.stringify(integrations));
  }, [integrations]);

  useEffect(() => {
    localStorage.setItem('affi_templates_v2', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem('affi_monitored_groups_v2', JSON.stringify(monitoredGroups));
  }, [monitoredGroups]);

  useEffect(() => {
    localStorage.setItem('affi_captured_messages_v2', JSON.stringify(capturedMessages));
  }, [capturedMessages]);

  const addMonitoredGroup = (data: Partial<MonitoredGroup>): MonitoredGroup => {
    const newGrp: MonitoredGroup = {
      id: 'grp-' + Date.now(),
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
        autoApproveConfidence: 0.65
      }
    };
    setMonitoredGroups(prev => [newGrp, ...prev]);
    addLog('success', 'Monitor de Grupos', `Novo grupo adicionado: "${newGrp.name}"`);
    return newGrp;
  };

  const updateMonitoredGroup = (id: string, updates: Partial<MonitoredGroup>) => {
    setMonitoredGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
    addLog('info', 'Monitor de Grupos', `Grupo #${id} atualizado.`);
  };

  const deleteMonitoredGroup = (id: string) => {
    setMonitoredGroups(prev => prev.filter(g => g.id !== id));
    addLog('warning', 'Monitor de Grupos', `Grupo #${id} removido.`);
  };

  const toggleMonitoredGroupStatus = (id: string) => {
    setMonitoredGroups(prev => prev.map(g => {
      if (g.id === id) {
        const nextStatus = g.status === 'ativo' ? 'pausado' : 'ativo';
        return { ...g, status: nextStatus };
      }
      return g;
    }));
  };

  const addCapturedMessage = (msgData: Partial<CapturedMessage>): CapturedMessage => {
    const newMsg: CapturedMessage = {
      id: 'cap-' + Date.now(),
      groupId: msgData.groupId || 'grp-1',
      groupName: msgData.groupName || 'Grupo Monitorado',
      platform: msgData.platform || 'Telegram',
      rawContent: msgData.rawContent || '',
      imageUrl: msgData.imageUrl,
      extractedJson: msgData.extractedJson || null,
      confidence: msgData.confidence || 0,
      status: msgData.status || 'Pendente',
      templateUsedId: msgData.templateUsedId,
      finalText: msgData.finalText,
      createdAt: 'Agora mesmo'
    };
    setCapturedMessages(prev => [newMsg, ...prev]);
    return newMsg;
  };

  const approveCapturedMessage = (id: string, editedData?: Partial<ExtractedDataJSON>) => {
    const targetMsg = capturedMessages.find(m => m.id === id);
    if (!targetMsg) return;

    const mergedJson = editedData ? { ...targetMsg.extractedJson, ...editedData } : targetMsg.extractedJson;

    const firstQueue = queues[0];
    const priceNum = parseFloat(mergedJson?.preco || '0') || 0;
    const origPriceNum = parseFloat(mergedJson?.preco_original || '0') || 0;
    const market = (mergedJson?.loja || 'Amazon') as any;

    addQueueItem({
      queueConfigId: firstQueue?.id || 'default',
      productTitle: mergedJson?.produto || 'Oferta Monitorada',
      productImage: targetMsg.imageUrl || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80',
      price: priceNum,
      originalPrice: origPriceNum,
      marketplace: market,
      copyText: targetMsg.finalText || targetMsg.rawContent,
      affiliateUrl: convertAffiliateUrl(mergedJson?.link || 'https://affi.link/custom', market)
    });

    setCapturedMessages(prev => prev.map(m => m.id === id ? {
      ...m,
      status: 'Aprovada',
      extractedJson: mergedJson as any
    } : m));

    setMonitoredGroups(prev => prev.map(g => g.id === targetMsg.groupId ? {
      ...g,
      approvedCount: g.approvedCount + 1,
      lastActivity: 'Agora mesmo'
    } : g));

    addLog('success', 'Monitor de Grupos', `Oferta #${id} aprovada e enviada para a Fila de Disparo!`);
  };

  const rejectCapturedMessage = (id: string) => {
    setCapturedMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'Rejeitada' } : m));
    addLog('info', 'Monitor de Grupos', `Mensagem #${id} descartada.`);
  };

  const processCapturedMessageAI = async (rawText: string, groupId: string, imageUrl?: string): Promise<CapturedMessage> => {
    const grp = monitoredGroups.find(g => g.id === groupId) || monitoredGroups[0];
    
    const textLower = rawText.toLowerCase();
    const isNonOffer = textLower.length < 10 || textLower.includes('[figurinha]') || textLower.includes('[áudio]');
    
    if (isNonOffer) {
      const failedMsg = addCapturedMessage({
        groupId: grp?.id || 'grp-1',
        groupName: grp?.name || 'Grupo Monitorado',
        platform: grp?.platform || 'Telegram',
        rawContent: rawText,
        imageUrl,
        extractedJson: null,
        confidence: 0,
        status: 'Rejeitada'
      });
      return failedMsg;
    }

    // Extract a clean candidate product title from the message
    let cleanProd = '';
    const firstLine = rawText.split('\n')[0] || '';
    let candidate = firstLine
      .replace(/^[🚨🔥🎯📣📌⚡⏰🛒❗\s]+/g, '')
      .replace(/(CORRE|GENTE|PROMOÇÃO|OFERTA|IMPERDÍVEL|EXCLUSIVA|OFERTAÇO|BAIXOU|ATENÇÃO|ACHADINHO)/gi, '')
      .replace(/^[\s\*\-\:\!\,\.\?\(\)]+/g, '')
      .replace(/\*/g, '')
      .trim();

    if (candidate.length > 3 && candidate.length < 80) {
      cleanProd = candidate;
    } else {
      cleanProd = 'Smartphone Galaxy S24 Ultra';
    }

    let extracted: ExtractedDataJSON = {
      produto: cleanProd,
      loja: grp?.linkedStore !== 'Todas as Lojas' ? grp?.linkedStore || 'Amazon' : 'Amazon',
      preco: '99.90',
      preco_original: '149.90',
      cupom: null,
      cupom_desconto: null,
      cupom_link: null,
      link: 'https://amzn.to/exemplo',
      condicoes_pagamento: 'em até 3x sem juros',
      preco_unitario: null,
      preco_recorrencia: null,
      frete_gratis: true,
      internacional: false,
      pix: true,
      confianca: 0.88
    };

    const priceMatch = rawText.match(/r\$\s*([\d\.,]+)/i);
    if (priceMatch) {
      extracted.preco = priceMatch[1].replace(',', '.');
    }
    const linkMatch = rawText.match(/https?:\/\/[^\s]+/i);
    if (linkMatch) {
      extracted.link = linkMatch[0];
    }
    const couponMatch = rawText.match(/cupom[:\s]*([a-zA-Z0-9_-]+)/i);
    if (couponMatch) {
      extracted.cupom = couponMatch[1];
    }

    const storeTemplate = templates.find(t => t.store === extracted.loja && t.status === 'ativo' && t.isDefault) ||
                          templates.find(t => t.store === extracted.loja && t.status === 'ativo') ||
                          templates.find(t => (t.store === 'Todas as Lojas' || !t.store) && t.status === 'ativo' && t.isDefault) ||
                          templates.find(t => t.status === 'ativo');

    let finalText = '';
    let templateId = storeTemplate?.id;

    if (storeTemplate) {
      const renderData = {
        cta: '🔥 *SUPER DESCONTO DO DIA!*',
        produto: extracted.produto,
        loja: extracted.loja,
        preco: extracted.preco,
        preco_original: extracted.preco_original,
        cupom: extracted.cupom,
        link: extracted.link,
        condicoes_pagamento: extracted.condicoes_pagamento,
        cupom_desconto: extracted.cupom_desconto,
        cupom_link: extracted.cupom_link,
        frete_gratis: extracted.frete_gratis,
        internacional: extracted.internacional,
        pix: extracted.pix
      };

      let res = storeTemplate.content;
      const conditionalRegex = /\[se\s+([a-zA-Z0-9_]+)\]([\s\S]*?)(?:\[senão\]([\s\S]*?))?\[fim\]/g;
      let prev = '';
      let iter = 0;
      while (res !== prev && iter < 5) {
        prev = res;
        iter++;
        res = res.replace(conditionalRegex, (_, vName, ifC, elseC = '') => {
          const val = (renderData as any)[vName];
          const isT = val === true || (typeof val === 'string' && val.trim().length > 0) || (typeof val === 'number' && val > 0);
          return isT ? ifC : elseC;
        });
      }
      res = res.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, vName) => {
        const val = (renderData as any)[vName];
        if (val === undefined || val === null || val === false) return '';
        if (val === true) return 'Sim';
        return String(val);
      });
      finalText = res;
    } else {
      finalText = `[Sem template disponível para ${extracted.loja}]\n${rawText}`;
    }

    const threshold = grp?.rules?.autoApproveConfidence || 0.65;
    const isAutoApproved = extracted.confianca >= threshold;

    const newMsg = addCapturedMessage({
      groupId: grp?.id || 'grp-1',
      groupName: grp?.name || 'Grupo Monitorado',
      platform: grp?.platform || 'Telegram',
      rawContent: rawText,
      imageUrl,
      extractedJson: extracted,
      confidence: extracted.confianca,
      status: isAutoApproved ? 'Aprovada' : 'Pendente',
      templateUsedId: templateId,
      finalText
    });

    if (isAutoApproved) {
      approveCapturedMessage(newMsg.id);
    }

    setMonitoredGroups(prev => prev.map(g => g.id === grp?.id ? {
      ...g,
      capturedCount: g.capturedCount + 1,
      lastActivity: 'Agora mesmo'
    } : g));

    return newMsg;
  };

  useEffect(() => {
    localStorage.setItem('affi_templates_v2', JSON.stringify(templates));
  }, [templates]);

  const addTemplate = (templateData: Partial<CopyTemplate>): CopyTemplate => {
    const storeName = templateData.store || 'Todas as Lojas';
    const newTpl: CopyTemplate = {
      id: 'tpl-' + Date.now(),
      title: templateData.title || 'Novo Template',
      category: templateData.category || storeName,
      store: storeName,
      content: templateData.content || '',
      usageCount: 0,
      status: templateData.status || 'ativo',
      isDefault: templateData.isDefault || false
    };

    setTemplates(prev => {
      let list = prev;
      if (newTpl.isDefault) {
        list = prev.map(t => t.store === storeName ? { ...t, isDefault: false } : t);
      }
      return [newTpl, ...list];
    });

    addLog('success', 'Templates', `Novo template criado: "${newTpl.title}"`);
    return newTpl;
  };

  const updateTemplate = (id: string, updates: Partial<CopyTemplate>) => {
    setTemplates(prev => {
      const current = prev.find(t => t.id === id);
      const targetStore = updates.store || current?.store || 'Todas as Lojas';

      return prev.map(t => {
        if (t.id === id) {
          return { ...t, ...updates };
        }
        if (updates.isDefault && t.store === targetStore && t.id !== id) {
          return { ...t, isDefault: false };
        }
        return t;
      });
    });
    addLog('info', 'Templates', `Template #${id} atualizado.`);
  };

  const deleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    addLog('warning', 'Templates', `Template #${id} excluído.`);
  };

  const setDefaultTemplate = (id: string) => {
    setTemplates(prev => {
      const target = prev.find(t => t.id === id);
      if (!target) return prev;

      return prev.map(t => {
        if (t.store === target.store) {
          return { ...t, isDefault: t.id === id };
        }
        return t;
      });
    });
    addLog('success', 'Templates', `Template #${id} definido como padrão.`);
  };

  const toggleTemplateStatus = (id: string) => {
    setTemplates(prev => prev.map(t => {
      if (t.id === id) {
        const newStatus = t.status === 'ativo' ? 'inativo' : 'ativo';
        return { ...t, status: newStatus };
      }
      return t;
    }));
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const addLog = (level: 'info' | 'warning' | 'error' | 'success', module: string, message: string, details?: string) => {
    const newLog: SystemLog = {
      id: 'log-' + Date.now(),
      timestamp: new Date().toLocaleString('pt-BR'),
      level,
      module,
      message,
      details,
    };
    setLogs(prev => [newLog, ...prev]);
    supabaseService.saveLog(newLog);
  };

  const addProduct = (productData: Partial<Product>): Product => {
    const title = productData.title || 'Novo Produto Afiliado';
    const rawUrl = productData.rawUrl || '';

    let createdProd: Product | null = null;

    setProducts(prev => {
      // Deduplicate by title or rawUrl
      const existingIndex = prev.findIndex(p => 
        (p.title && p.title.trim().toLowerCase() === title.trim().toLowerCase()) ||
        (rawUrl && p.rawUrl && p.rawUrl === rawUrl)
      );

      if (existingIndex >= 0) {
        createdProd = prev[existingIndex];
        return prev;
      }

      const newProduct: Product = {
        id: productData.id || ('prod-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
        title,
        originalPrice: productData.originalPrice || 199.90,
        price: productData.price || 149.90,
        discountPercent: productData.discountPercent || 25,
        rating: productData.rating || 4.8,
        reviewsCount: productData.reviewsCount || 100,
        category: productData.category || 'Geral',
        marketplace: productData.marketplace || 'Amazon',
        rawUrl: rawUrl || 'https://amazon.com.br',
        affiliateUrl: productData.affiliateUrl || 'https://amzn.to/example',
        couponCode: productData.couponCode || '',
        image: productData.image || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80',
        status: 'ativo',
        isFavorite: false,
        isArchived: false,
        hotScore: Math.floor(Math.random() * 30) + 70,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...productData,
      };

      createdProd = newProduct;
      supabaseService.saveProduct(newProduct);
      return [newProduct, ...prev];
    });

    return createdProd || (productData as Product);
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p, ...updates, updatedAt: new Date().toISOString() };
        supabaseService.saveProduct(updated);
        return updated;
      }
      return p;
    }));
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    supabaseService.deleteProduct(id);
    addLog('info', 'Produtos', `Produto #${id} removido.`);
  };

  const toggleFavoriteProduct = (id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, isFavorite: !p.isFavorite } : p));
  };

  const addQueueItem = (itemData: Partial<QueueItem>) => {
    const targetQueueId = itemData.queueConfigId || queues[0]?.id || 'queue-1';
    const newItem: QueueItem = {
      id: 'item-' + Date.now(),
      queueConfigId: targetQueueId,
      productId: itemData.productId || 'prod-1',
      productTitle: itemData.productTitle || 'Oferta em Destaque',
      productImage: itemData.productImage || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80',
      price: itemData.price || 99.90,
      originalPrice: itemData.originalPrice,
      marketplace: itemData.marketplace || 'Amazon',
      copyText: itemData.copyText || '🔥 Confira esta oferta incrível!',
      affiliateUrl: itemData.affiliateUrl || 'https://amzn.to/link',
      channelIds: itemData.channelIds || ['chan-tg-1'],
      scheduledFor: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      status: 'pendente',
      priority: queueItems.filter(i => i.queueConfigId === targetQueueId).length + 1,
      ...itemData
    };

    setQueueItems(prev => [...prev, newItem]);
    supabaseService.saveQueueItem(newItem);
    
    // Update queue config counter
    setQueues(prev => prev.map(q => q.id === targetQueueId ? { ...q, totalPending: q.totalPending + 1 } : q));
    addLog('info', 'Filas', `Item adicionado à fila: "${newItem.productTitle}"`);
  };

  const deleteQueueItem = (id: string) => {
    const item = queueItems.find(i => i.id === id);
    if (item) {
      setQueues(prev => prev.map(q => q.id === item.queueConfigId ? { ...q, totalPending: Math.max(0, q.totalPending - 1) } : q));
    }
    setQueueItems(prev => prev.filter(i => i.id !== id));
  };

  const shuffleQueue = (queueConfigId: string) => {
    setQueueItems(prev => {
      const otherItems = prev.filter(i => i.queueConfigId !== queueConfigId);
      const queueSpecific = prev.filter(i => i.queueConfigId === queueConfigId && i.status === 'pendente');
      
      // Fisher-Yates shuffle
      const shuffled = [...queueSpecific];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Reassign priorities
      shuffled.forEach((item, idx) => {
        item.priority = idx + 1;
      });

      return [...otherItems, ...shuffled, ...prev.filter(i => i.queueConfigId === queueConfigId && i.status !== 'pendente')];
    });

    addLog('success', 'Filas', `Fila #${queueConfigId} embaralhada com sucesso.`);
  };

  const clearSentQueueItems = (queueConfigId: string) => {
    setQueueItems(prev => prev.filter(i => !(i.queueConfigId === queueConfigId && i.status === 'enviado')));
    addLog('info', 'Filas', `Itens já enviados da fila #${queueConfigId} foram limpos.`);
  };

  const toggleQueueStatus = (queueConfigId: string) => {
    setQueues(prev => prev.map(q => q.id === queueConfigId ? {
      ...q,
      status: q.status === 'ativa' ? 'pausada' : 'ativa',
      nextDeliveryTime: q.status === 'ativa' ? 'Pausada' : 'Em 15 minutos'
    } : q));
  };

  const moveQueueItemPriority = (itemId: string, direction: 'up' | 'down') => {
    setQueueItems(prev => {
      const index = prev.findIndex(i => i.id === itemId);
      if (index === -1) return prev;
      
      const newItems = [...prev];
      const targetQueueId = newItems[index].queueConfigId;
      
      // Get all pending items in this queue
      const queuePendingIndices = newItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item.queueConfigId === targetQueueId && item.status === 'pendente');

      const currentPosInQueue = queuePendingIndices.findIndex(({ idx }) => idx === index);
      if (currentPosInQueue === -1) return prev;

      if (direction === 'up' && currentPosInQueue > 0) {
        const idxA = queuePendingIndices[currentPosInQueue].idx;
        const idxB = queuePendingIndices[currentPosInQueue - 1].idx;
        [newItems[idxA], newItems[idxB]] = [newItems[idxB], newItems[idxA]];
      } else if (direction === 'down' && currentPosInQueue < queuePendingIndices.length - 1) {
        const idxA = queuePendingIndices[currentPosInQueue].idx;
        const idxB = queuePendingIndices[currentPosInQueue + 1].idx;
        [newItems[idxA], newItems[idxB]] = [newItems[idxB], newItems[idxA]];
      }

      return newItems;
    });
  };

  const toggleIntegrationStatus = (integrationId: string) => {
    setIntegrations(prev => prev.map(int => {
      if (int.id === integrationId) {
        const newStatus = int.status === 'conectado' ? 'desconectado' : 'conectado';
        addLog(newStatus === 'conectado' ? 'success' : 'warning', 'Integrações', `Status de ${int.name} alterado para ${newStatus}.`);
        return { ...int, status: newStatus, lastSync: newStatus === 'conectado' ? 'Conectado agora' : 'Desconectado' };
      }
      return int;
    }));
  };

  const updateIntegrationConfig = (integrationId: string, tagAfiliado?: string, apiKey?: string) => {
    setIntegrations(prev => prev.map(int => {
      if (int.id === integrationId) {
        return {
          ...int,
          tagAfiliado: tagAfiliado !== undefined ? tagAfiliado : int.tagAfiliado,
          apiKey: apiKey !== undefined ? apiKey : int.apiKey,
          status: 'conectado',
          lastSync: 'Configurações salvas'
        };
      }
      return int;
    }));
    addLog('success', 'Integrações', `Configurações da integração #${integrationId} atualizadas.`);
  };

  const generateCopyWithAI = async (params: any): Promise<string> => {
    try {
      const res = await fetch('/api/ai/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (data.copy) {
        addLog('info', 'IA Copywriter', `Cópia gerada com sucesso para ${params.productName || 'Oferta'}`);
        return data.copy;
      }
      throw new Error(data.error || 'Erro na IA');
    } catch (err: any) {
      console.warn('Fallback local AI generation:', err);
      return `🔥 *OFERTA ESPECIAL: ${params.productName || 'Produto em Destaque'}* 🔥\n\n` +
        `De ~R$ ${params.originalPrice || '299,00'}~ por apenas *R$ ${params.price || '149,90'}*!\n` +
        (params.couponCode ? `🎟️ Cupom: *${params.couponCode}*\n` : '') +
        `\n👇 Garanta a sua compra com preço promocional:\n[LINK_AFILIADO]`;
    }
  };

  const extractOfferFromUrl = async (url: string): Promise<any> => {
    try {
      const res = await fetch('/api/ai/extract-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return {
        productName: 'Produto Detectado Automaticamente',
        price: 199.90,
        originalPrice: 299.90,
        discountPercent: 33,
        marketplace: url.includes('shopee') ? 'Shopee' : url.includes('mercadolivre') ? 'Mercado Livre' : 'Amazon',
        category: 'Geral'
      };
    }
  };

  const convertAffiliateUrl = (url: string, marketplace: string): string => {
    if (!url) return '';
    const cleanUrl = url.split('?')[0];
    const key = marketplace.toLowerCase().replace(/\s+/g, '');
    const integration = integrations.find(i => i.key === key);
    const tag = integration?.status === 'conectado' ? integration.tagAfiliado : '';

    if (!tag) return cleanUrl;

    if (key === 'amazon') {
      return `${cleanUrl}?tag=${tag}`;
    }
    if (key === 'mercadolivre') {
      return `${cleanUrl}?ref=${tag}`;
    }
    if (key === 'shopee') {
      return `${cleanUrl}?sub_id=${tag}`;
    }
    if (key === 'aliexpress') {
      return `${cleanUrl}?aff_id=${tag}`;
    }
    return `${cleanUrl}?affiliate=${tag}`;
  };

  const clearMockData = () => {
    setProducts([]);
    setQueueItems([]);
    setQueues([]);
    setGroups([]);
    setCampaigns([]);
    setAutomations([]);
    setLandingPages([]);
    setLeads([]);
    setLogs([]);
    setNotifications([]);
    localStorage.clear();
  };

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        products,
        setProducts,
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
        processCapturedMessageAI,
        landingPages,
        leads,
        logs,
        subscription,
        notifications,
        markNotificationRead,
        clearAllNotifications,
        clearMockData,
        convertAffiliateUrl,
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
        toggleIntegrationStatus,
        updateIntegrationConfig,
        addLog,
        generateCopyWithAI,
        extractOfferFromUrl,
        isSearchOpen,
        setIsSearchOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
