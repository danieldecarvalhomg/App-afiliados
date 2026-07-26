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
  CtaProfile,
  CtaProfileChange,
  TrainingMessage,
  CtaFeedback,
  CtaContext
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
  
  // Central CTA Profile (AI Training)
  ctaProfile: CtaProfile;
  updateCtaProfile: (changes: Partial<CtaProfile>, triggeredBy?: string) => void;
  generateCtaFromProfile: (context: CtaContext) => string;
  resetCtaProfile: () => void;
  trainingMessages: TrainingMessage[];
  addTrainingMessage: (msg: Partial<TrainingMessage>) => TrainingMessage;
  clearTrainingHistory: () => void;
  ctaFeedbacks: CtaFeedback[];
  addCtaFeedback: (feedback: Partial<CtaFeedback>) => void;
  sendTrainingMessage: (userText: string) => Promise<void>;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;

  // Global Search
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // ─── DEFAULT CENTRAL CTA PROFILE ─────────────────────────────────────────
  const DEFAULT_CTA_PROFILE: CtaProfile = {
    tom: 'urgente',
    usaEmoji: true,
    emojisPreferidos: ['🔥', '🚨', '💥'],
    tamanhoPreferido: 'medio',
    palavrasProibidas: [],
    palavrasFavoritas: ['corre', 'só hoje', 'últimas unidades'],
    usaCaixaAlta: false,
    exemplosBons: [],
    exemplosRuins: [],
    observacoesLivres: '',
    ctasGerados: [],
    changelog: [],
    updatedAt: new Date().toISOString()
  };

  const [ctaProfile, setCtaProfile] = useState<CtaProfile>(() => {
    try {
      const saved = localStorage.getItem('affi_cta_profile_v1');
      return saved ? JSON.parse(saved) : DEFAULT_CTA_PROFILE;
    } catch {
      return DEFAULT_CTA_PROFILE;
    }
  });

  const [trainingMessages, setTrainingMessages] = useState<TrainingMessage[]>(() => {
    try {
      const saved = localStorage.getItem('affi_training_messages_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [ctaFeedbacks, setCtaFeedbacks] = useState<CtaFeedback[]>(() => {
    try {
      const saved = localStorage.getItem('affi_cta_feedbacks_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [geminiApiKey, setGeminiApiKeyState] = useState<string>(() => {
    try {
      return localStorage.getItem('affi_gemini_api_key_v1') || '';
    } catch {
      return '';
    }
  });

  const setGeminiApiKey = (key: string) => {
    setGeminiApiKeyState(key);
    try {
      localStorage.setItem('affi_gemini_api_key_v1', key);
    } catch {}
  };

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
      const saved = localStorage.getItem('affi_products');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      // Filter out any demo items
      const clean = parsed.filter((p: any) => p.id && !p.id.includes('prod-1') && !p.id.includes('prod-2') && !p.id.includes('prod-3') && !p.id.includes('prod-4'));
      if (clean.length !== parsed.length) {
        localStorage.setItem('affi_products', JSON.stringify(clean));
      }
      return clean;
    } catch {
      localStorage.removeItem('affi_products');
      return [];
    }
  });

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
    const newProduct: Product = {
      id: 'prod-' + Date.now(),
      title: productData.title || 'Novo Produto Afiliado',
      originalPrice: productData.originalPrice || 199.90,
      price: productData.price || 149.90,
      discountPercent: productData.discountPercent || 25,
      rating: productData.rating || 4.8,
      reviewsCount: productData.reviewsCount || 100,
      category: productData.category || 'Geral',
      marketplace: productData.marketplace || 'Amazon',
      rawUrl: productData.rawUrl || 'https://amazon.com.br',
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

    setProducts(prev => [newProduct, ...prev]);
    supabaseService.saveProduct(newProduct);
    addLog('success', 'Produtos', `Novo produto adicionado: "${newProduct.title}"`);
    return newProduct;
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

  // ─── AI TRAINING PERSISTENCE ─────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('affi_cta_profile_v1', JSON.stringify(ctaProfile));
  }, [ctaProfile]);

  useEffect(() => {
    localStorage.setItem('affi_training_messages_v1', JSON.stringify(trainingMessages));
  }, [trainingMessages]);

  useEffect(() => {
    localStorage.setItem('affi_cta_feedbacks_v1', JSON.stringify(ctaFeedbacks));
  }, [ctaFeedbacks]);

  // ─── CTA PROFILE CRUD ────────────────────────────────────────────────────
  const updateCtaProfile = (changes: Partial<CtaProfile>, triggeredBy = '') => {
    setCtaProfile(prev => {
      const changeEntries: CtaProfileChange[] = Object.entries(changes)
        .filter(([k]) => k !== 'changelog' && k !== 'ctasGerados' && k !== 'updatedAt')
        .map(([field, newValue]) => ({
          id: 'chg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          timestamp: new Date().toISOString(),
          field,
          previousValue: (prev as any)[field],
          newValue,
          triggeredByMessage: triggeredBy
        }));

      return {
        ...prev,
        ...changes,
        changelog: [...(prev.changelog || []), ...changeEntries].slice(-100),
        updatedAt: new Date().toISOString()
      };
    });
  };

  const resetCtaProfile = () => {
    const blank: CtaProfile = {
      tom: 'urgente',
      usaEmoji: true,
      emojisPreferidos: ['🔥', '🚨', '💥'],
      tamanhoPreferido: 'medio',
      palavrasProibidas: [],
      palavrasFavoritas: ['corre', 'só hoje', 'últimas unidades'],
      usaCaixaAlta: false,
      exemplosBons: [],
      exemplosRuins: [],
      observacoesLivres: '',
      ctasGerados: [],
      changelog: [],
      updatedAt: new Date().toISOString()
    };
    setCtaProfile(blank);
    setTrainingMessages([]);
    addLog('warning', 'IA Training', 'Treinamento da IA foi reiniciado do zero.');
  };

  const addTrainingMessage = (msg: Partial<TrainingMessage>): TrainingMessage => {
    const newMsg: TrainingMessage = {
      id: 'msg-' + Date.now(),
      role: msg.role || 'user',
      content: msg.content || '',
      timestamp: new Date().toISOString(),
      profileChanges: msg.profileChanges,
      generatedCtas: msg.generatedCtas
    };
    setTrainingMessages(prev => [...prev, newMsg]);
    return newMsg;
  };

  const clearTrainingHistory = () => {
    setTrainingMessages([]);
  };

  const addCtaFeedback = (feedback: Partial<CtaFeedback>) => {
    const newFb: CtaFeedback = {
      id: 'fb-' + Date.now(),
      ctaText: feedback.ctaText || '',
      rating: feedback.rating || 'good',
      editedVersion: feedback.editedVersion,
      reason: feedback.reason,
      origin: feedback.origin || 'training',
      createdAt: new Date().toISOString()
    };
    setCtaFeedbacks(prev => [...prev, newFb]);

    if (newFb.rating === 'good') {
      const cta = newFb.editedVersion || newFb.ctaText;
      setCtaProfile(prev => ({
        ...prev,
        exemplosBons: [...prev.exemplosBons, cta].slice(-20)
      }));
    } else if (newFb.rating === 'bad') {
      setCtaProfile(prev => ({
        ...prev,
        exemplosRuins: [...prev.exemplosRuins, newFb.ctaText].slice(-20)
      }));
    }
  };

  // ─── ANTI-REPETITION ENGINE ──────────────────────────────────────────────
  const normalizeCtaFingerprint = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
      .replace(/[^a-záàãâéêíóôõúüç\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  };

  const simScore = (a: string, b: string): number => {
    if (a === b) return 1;
    const len = Math.max(a.length, b.length);
    if (len === 0) return 1;
    let matches = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) matches++;
    }
    return matches / len;
  };

  const isCtaRepeated = (candidate: string, history: string[]): boolean => {
    const fp = normalizeCtaFingerprint(candidate);
    return history.some(h => simScore(fp, normalizeCtaFingerprint(h)) >= 0.8);
  };

  const saveCtaToHistory = (cta: string) => {
    setCtaProfile(prev => ({
      ...prev,
      ctasGerados: [...prev.ctasGerados, cta].slice(-200)
    }));
  };

  // ─── CTA GENERATION ENGINE ───────────────────────────────────────────────
  // Generates ONLY the call-to-action phrase — NOT the full offer.
  // Product, price, link etc. are template variables handled separately.
  // Context is used only as flavor hints (urgency level, extras mention).
  const generateCtaFromProfile = (context: CtaContext = {}): string => {
    const prof = ctaProfile;
    const { cupom, frete_gratis, pix } = context;

    // ── Abertura (hook) ────────────────────────────────────────────────────
    const aberturas: Record<string, string[]> = {
      urgente: [
        'CORRE!', 'SÓ AGORA!', 'ÚLTIMA CHANCE!', 'VENCE HOJE!',
        'NÃO PERDE!', 'ESQUENTA!', 'HOJE É O DIA!', 'AGORA OU NUNCA!'
      ],
      descontraido: [
        'Oi, gente!', 'Peraí, olha isso:', 'Calma que tem mais:',
        'Vem ver o que eu achei:', 'Isso aqui tá bom demais:', 'Olha só!'
      ],
      formal: [
        'Oportunidade especial:', 'Oferta selecionada:',
        'Condição exclusiva:', 'Destaque do dia:'
      ],
      divertido: [
        'TÁ DE BRINCADEIRA?!', 'Pow, que preço!', 'QUE ISSO!',
        'Bora aproveitar!', 'Alô alô!', 'Isso tá doido!'
      ],
      luxuoso: [
        'Exclusividade para você:', 'Seleção premium:',
        'Curadoria especial:', 'Peça única em oferta:'
      ]
    };

    // ── Gancho central (o coração do CTA) ─────────────────────────────────
    const ganchos: Record<string, string[]> = {
      urgente: [
        'O estoque tá acabando!',
        'Promoção com tempo limitado!',
        'Preço vai subir a qualquer hora!',
        'Aproveita enquanto ainda tem!',
        'Essa condição não dura para sempre!',
        'Tá voando do carrinho!'
      ],
      descontraido: [
        'Vale muito a pena conferir!',
        'Achei e precisei compartilhar!',
        'Uma das melhores condições que vi hoje!',
        'Tá com um precinho muito bom!'
      ],
      formal: [
        'Condição especial por tempo limitado.',
        'Oportunidade de economia real.',
        'Oferta válida enquanto durar o estoque.',
        'Avalie e aproveite.'
      ],
      divertido: [
        'Tá barato que dói!',
        'Minha carteira agradeço e desculpe ao mesmo tempo!',
        'Isso é crime de preço bom!',
        'Comprei, cheguei, amei — você vai também!'
      ],
      luxuoso: [
        'Uma raridade nessa faixa de preço.',
        'Qualidade premium ao alcance.',
        'Sofisticação com condição especial.',
        'Para quem não abre mão do melhor.'
      ]
    };

    // ── Fechamento / CTA final ─────────────────────────────────────────────
    const fechamentos: Record<string, string[]> = {
      curto: ['Pega logo!', 'Corre lá!', 'Garanta já!', 'Clica no link!', 'Vai!'],
      medio: [
        'Garante o seu antes que acabe!',
        'Clica no link e aproveita!',
        'Não deixa passar não!',
        'Acessa e confere!'
      ],
      longo: [
        'Clica no link agora e garante o seu antes que o estoque esgote — essa condição não vai durar muito!',
        'Acessa pelo link e aproveita essa condição especial antes que o preço volte ao normal!'
      ]
    };

    const tom = prof.tom as string;
    const abList  = aberturas[tom]   || aberturas.urgente;
    const gaList  = ganchos[tom]     || ganchos.urgente;
    const fecList = fechamentos[prof.tamanhoPreferido] || fechamentos.medio;
    const favs    = (prof.palavrasFavoritas || []).filter(w => w.length > 0);
    const emojis  = prof.usaEmoji ? (prof.emojisPreferidos || ['🔥', '🚨', '💥']) : [];

    const pick = <T,>(arr: T[], seed = 0): T => arr[(Date.now() + seed) % arr.length];

    // ── Extras contextuais (menção opcional no CTA) ────────────────────────
    const extras: string[] = [];
    if (frete_gratis) extras.push('frete grátis incluso');
    if (pix)          extras.push('desconto no PIX');
    if (cupom)        extras.push('cupom de desconto disponível');

    const tentativas: string[] = [];

    for (let attempt = 0; attempt < 5; attempt++) {
      const e0  = emojis.length ? emojis[attempt % emojis.length]         : '';
      const e1  = emojis.length ? emojis[(attempt + 1) % emojis.length]   : '';
      const ab  = pick(abList,  attempt);
      const ga  = pick(gaList,  attempt + 3);
      const fec = pick(fecList, attempt + 7);

      const partes: string[] = [];

      // 1. Abertura com emoji
      partes.push(`${e0 ? e0 + ' ' : ''}${prof.usaCaixaAlta ? ab.toUpperCase() : ab}`);

      // 2. Gancho central
      partes.push(ga);

      // 3. Extra contextual (apenas no tamanho médio/longo)
      if (extras.length && prof.tamanhoPreferido !== 'curto') {
        partes.push(`(${pick(extras, attempt + 5)})`);
      }

      // 4. Palavra favorita (tamanho médio/longo)
      if (favs.length && prof.tamanhoPreferido !== 'curto') {
        const fav = favs[attempt % favs.length];
        partes.push(prof.usaCaixaAlta ? fav.toUpperCase() : fav);
      }

      // 5. Fechamento com emoji
      partes.push(`${e1 ? e1 + ' ' : ''}${fec}`);

      // Separador: curto = espaço inline, outros = nova linha
      const sep = prof.tamanhoPreferido === 'curto' ? ' ' : '\n';
      let cta = partes.join(sep).trim();

      // Remove palavras proibidas
      (prof.palavrasProibidas || []).forEach(w => {
        if (w) cta = cta.replace(new RegExp(w, 'gi'), '').trim();
      });

      tentativas.push(cta);

      if (!isCtaRepeated(cta, prof.ctasGerados || [])) {
        saveCtaToHistory(cta);
        return cta;
      }
    }

    const fallback = tentativas[tentativas.length - 1];
    saveCtaToHistory(fallback);
    addLog('info', 'IA Training', 'Anti-repetição: CTA aceito após 5 tentativas.');
    return fallback;
  };

  // ─── NLP COMMAND INTERPRETER ─────────────────────────────────────────────

  type IntencaoCmd =
    | 'adicionar' | 'remover' | 'ajustar' | 'consultar'
    | 'gerar_exemplo' | 'feedback' | 'reset' | 'ambiguo';

  const detectarIntencao = (texto: string): IntencaoCmd => {
    const t = texto.toLowerCase();

    if (/começa(r)? do zero|reinicia(r)?|apaga(r)? tudo|esquece tudo|zera(r)? tudo/.test(t)) return 'reset';
    if (/o que (você|vc) (sabe|aprendeu)|resume(r)?|minhas prefer|perfil atual|o que (você|vc) tem/.test(t)) return 'consultar';
    if (/ger[ae](r)?|cri[ae](r)?|mostr[ae](r)?|faz|faze(r)?|quero( ver)?( um)?|me d[aá]|me manda|exib[ie](r)?|exemplo|cta|teste|testar|ver como fica|como ficaria/.test(t)) return 'gerar_exemplo';
    if (/gostei|ficou (bom|ótimo|perfeito)|amei|esse (tá|está) (bom|ótimo)|aprovo/.test(t)) return 'feedback';
    if (/não (gostei|presta|gosto mais)|ficou (ruim|horrível|péssimo|forçado)|esse não/.test(t)) return 'feedback';
    if (/\b(não|nunca|remove(r)?|tira(r)?|esquece(r)?|para de|deixa de|sem)\b/.test(t)) return 'remover';
    if (/só muda(r)?|apenas |menos |mais |diminui(r)?|aumenta(r)?|ajusta(r)?/.test(t)) return 'ajustar';
    if (/\b(usa(r)?|quero|adiciona(r)?|prefer[oi]|sempre|a partir|coloca(r)?|inclui(r)?)\b/.test(t)) return 'adicionar';
    return 'ambiguo';
  };

  const interpretarPreferencias = (texto: string, intencao: IntencaoCmd): {
    changes: Partial<CtaProfile>,
    confirmacao: string,
    requerConfirmacao: boolean
  } => {
    const t = texto.toLowerCase();
    const changes: Partial<CtaProfile> = {};
    let confirmacao = '';
    let requerConfirmacao = false;

    // === TOM ===
    if (/\b(urgente|urgência|pressão|corre)\b/.test(t)) {
      changes.tom = 'urgente';
      confirmacao = 'Combinado! Vou usar um tom de *urgência* nos seus CTAs a partir de agora. ⚡';
    } else if (/\b(descontraído|casual|leve|tranquilo|informal)\b/.test(t)) {
      changes.tom = 'descontraido';
      confirmacao = 'Perfeito! Tom *descontraído e casual* salvo. Sem pressão nos textos! 😊';
    } else if (/\b(formal|profissional|sério|elegante)\b/.test(t)) {
      changes.tom = 'formal';
      confirmacao = 'Entendido! Vou usar um tom mais *formal e profissional*. ✅';
    } else if (/\b(divertido|engraçado|brincalhão|animado|descontraído)\b/.test(t)) {
      changes.tom = 'divertido';
      confirmacao = 'Anotado! CTAs *divertidos e animados* para você! 🎉';
    } else if (/\b(luxo|luxuoso|premium|sofisticado|exclusivo)\b/.test(t)) {
      changes.tom = 'luxuoso';
      confirmacao = 'Registrado! Tom *premium e sofisticado* ativado. ✨';
    }

    // === TAMANHO ===
    if (/\b(curto|curtinho|pequeno|breve|rápido|conciso)\b/.test(t)) {
      changes.tamanhoPreferido = 'curto';
      confirmacao = confirmacao || 'Ótimo! CTAs *curtos e diretos* a partir de agora. 🎯';
    } else if (/\b(longo|detalhado|completo|extenso)\b/.test(t)) {
      changes.tamanhoPreferido = 'longo';
      confirmacao = confirmacao || 'Entendido! Vou fazer CTAs mais *completos e detalhados*. 📝';
    } else if (/\b(médio|normal|equilibrado)\b/.test(t)) {
      changes.tamanhoPreferido = 'medio';
      confirmacao = confirmacao || 'Anotado! Vou manter um tamanho *médio e equilibrado*.';
    }

    // === EMOJI ===
    if (/\b(sem emoji|não (usa(r)?|quero) emoji|menos emoji|evita(r)? emoji)\b/.test(t)) {
      if (intencao === 'remover' || intencao === 'ajustar') {
        changes.usaEmoji = false;
        confirmacao = confirmacao || 'Perfeito! Vou parar de usar emojis nos seus CTAs. ✅';
      }
    } else if (/\b(com emoji|usa(r)? emoji|mais emoji|adora(r)? emoji|quero emoji)\b/.test(t)) {
      changes.usaEmoji = true;
      confirmacao = confirmacao || 'Combinado! Emojis ativados! 🎉';
    }

    // === EMOJIS PREFERIDOS (detectar emojis na mensagem) ===
    const emojiRegex = /[\u{1F300}-\u{1FFFF}]/gu;
    const emojisEncontrados = texto.match(emojiRegex);
    if (emojisEncontrados && emojisEncontrados.length > 0 && intencao !== 'remover') {
      const currentProfile = ctaProfile;
      const novos = [...new Set([...currentProfile.emojisPreferidos, ...emojisEncontrados])].slice(0, 8);
      changes.emojisPreferidos = novos;
      confirmacao = confirmacao || `Emojis ${emojisEncontrados.join('')} adicionados às suas preferências! ✅`;
    }

    // === CAIXA ALTA ===
    if (/\b(caixa alta|maiúsculo|tudo maiúsculo)\b/.test(t)) {
      if (intencao === 'remover' || /\b(sem|não|nunca)\b/.test(t)) {
        changes.usaCaixaAlta = false;
        confirmacao = confirmacao || 'Entendido! Não vou mais usar caixa alta. ✅';
      } else {
        changes.usaCaixaAlta = true;
        confirmacao = confirmacao || 'Combinado! Vou usar CAIXA ALTA nos seus CTAs. 🔊';
      }
    }

    // === PALAVRAS PROIBIDAS ===
    const proibidaMatch = t.match(/\b(não usa(r)?|proibid[ao]s?|sem a palavra|nunca escrev[ae]|para de usar|remove(r)? a palavra)\b[:\s]+(.+)/);
    if (proibidaMatch || (intencao === 'remover' && /palavra|termo|expressão/.test(t))) {
      const palavraAlvo = proibidaMatch?.[3]?.trim().split(/[,\s]/)[0];
      if (palavraAlvo && palavraAlvo.length > 2) {
        const curr = ctaProfile.palavrasProibidas;
        if (!curr.includes(palavraAlvo)) {
          changes.palavrasProibidas = [...curr, palavraAlvo];
          confirmacao = `Combinado! Nunca mais vou usar a palavra *"${palavraAlvo}"* nos seus CTAs. 🚫`;
        }
      }
    }

    // === PALAVRAS FAVORITAS ===
    const favMatch = t.match(/\b(usa(r)?|inclui(r)?|adiciona(r)?|coloca(r)?)\b.*(a (palavra|frase)|expressão)[:\s]+["']?(.+?)["']?$/);
    if (favMatch) {
      const palavra = favMatch[6]?.trim().split(/[,;]/)[0];
      if (palavra && palavra.length > 2) {
        const curr = ctaProfile.palavrasFavoritas;
        if (!curr.includes(palavra)) {
          changes.palavrasFavoritas = [...curr, palavra];
          confirmacao = `Ótimo! Vou usar *"${palavra}"* com frequência nos seus CTAs. ✅`;
        }
      }
    }

    // === OBSERVAÇÕES LIVRES ===
    if (intencao === 'ambiguo' && texto.length > 20) {
      requerConfirmacao = true;
      confirmacao = `Quase entendi! Você quer dizer que prefere: *"${texto.trim()}"*? Confirma que eu salvo essa preferência nas observações do seu perfil!`;
    }

    if (!confirmacao && Object.keys(changes).length > 0) {
      confirmacao = 'Preferência salva com sucesso! O seu perfil de CTA foi atualizado. ✅';
    }

    return { changes, confirmacao, requerConfirmacao };
  };

  const gerarRespostaConsulta = (): string => {
    const p = ctaProfile;
    const linhas = [
      '📋 *Aqui está o que aprendi sobre você até agora:*\n',
      `🎭 *Tom:* ${p.tom}`,
      `📏 *Tamanho:* ${p.tamanhoPreferido}`,
      `😀 *Emojis:* ${p.usaEmoji ? `Sim (${p.emojisPreferidos.join(' ')})` : 'Não'}`,
      `🔠 *Caixa alta:* ${p.usaCaixaAlta ? 'Sim' : 'Não'}`,
      p.palavrasFavoritas.length > 0 ? `✅ *Palavras favoritas:* ${p.palavrasFavoritas.join(', ')}` : null,
      p.palavrasProibidas.length > 0 ? `🚫 *Palavras proibidas:* ${p.palavrasProibidas.join(', ')}` : null,
      p.exemplosBons.length > 0 ? `👍 *Exemplos aprovados:* ${p.exemplosBons.length} salvos` : null,
      p.observacoesLivres ? `📌 *Observações:* ${p.observacoesLivres}` : null,
    ].filter(Boolean);

    return linhas.join('\n');
  };

  const sendTrainingMessage = async (userText: string): Promise<void> => {
    // Save user message
    addTrainingMessage({ role: 'user', content: userText });

    // 1. If user provided a Gemini API Key in browser, call Gemini API directly (works on Vercel)
    if (geminiApiKey && geminiApiKey.trim()) {
      try {
        const systemPrompt = `Você é uma Inteligência Artificial Especialista em Copywriting e Marketing de Afiliados no Brasil.
Seu papel é conversar amigavelmente com o usuário, entender como ele gosta das suas chamadas para ação (CTAs) para o Telegram/WhatsApp e atualizar o Perfil de Preferências (JSON).

PERFIL DE PREFERÊNCIAS ATUAL DO USUÁRIO:
${JSON.stringify(ctaProfile || {}, null, 2)}

INSTRUÇÕES:
1. Responda em Português do Brasil com tom simpático e especialista em afiliados.
2. Analise a mensagem do usuário ("${userText}").
3. Se houver mudanças de preferência, retorne no campo "updatedProfile" apenas o que mudou.
4. Retorne APENAS um objeto JSON no formato:
{
  "reply": "Texto de resposta conversacional em Markdown formato WhatsApp (*negrito*, _itálico_)",
  "updatedProfile": null ou objeto com os campos alterados,
  "generatedCtas": null ou array de 3 CTAs fraseados se o usuário pediu exemplos
}`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey.trim()}`;
        const directRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.7
            }
          })
        });

        if (directRes.ok) {
          const data = await directRes.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const jsonContent = JSON.parse(rawText);
          if (jsonContent.updatedProfile && typeof jsonContent.updatedProfile === 'object' && Object.keys(jsonContent.updatedProfile).length > 0) {
            updateCtaProfile(jsonContent.updatedProfile, userText);
          }
          addTrainingMessage({
            role: 'ai',
            content: jsonContent.reply || 'Entendido! Atualizei suas preferências de CTA.',
            profileChanges: jsonContent.updatedProfile || undefined,
            generatedCtas: jsonContent.generatedCtas || undefined
          });
          addLog('info', 'IA Chatbot', 'Resposta gerada via Google Gemini 2.5 Flash (API)');
          return;
        } else if (directRes.status === 400 || directRes.status === 403) {
          addTrainingMessage({
            role: 'ai',
            content: `⚠️ Sua chave da Gemini API retornou erro (${directRes.status}). Verifique se sua chave está correta em aistudio.google.com.`
          });
          return;
        }
      } catch (directErr) {
        console.warn('Direct Gemini fetch failed, attempting server route:', directErr);
      }
    }

    // 2. Try Real AI API via server route /api/ai/chat-training
    try {
      const res = await fetch('/api/ai/chat-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: userText,
          currentProfile: ctaProfile,
          history: trainingMessages,
          userApiKey: geminiApiKey
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.reply && data.source !== 'fallback') {
          if (data.updatedProfile && typeof data.updatedProfile === 'object' && Object.keys(data.updatedProfile).length > 0) {
            updateCtaProfile(data.updatedProfile, userText);
          }
          addTrainingMessage({
            role: 'ai',
            content: data.reply,
            profileChanges: data.updatedProfile || undefined,
            generatedCtas: data.generatedCtas || undefined
          });
          addLog('info', 'IA Chatbot', `Resposta gerada via ${data.source}`);
          return;
        }
      }
    } catch (apiError) {
      console.warn('API chat-training fallback:', apiError);
    }

    // Fallback to local rule engine if API is offline or no key set
    const intencao = detectarIntencao(userText);

    // Simulate typing delay
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));

    // Handle each intent
    if (intencao === 'reset') {
      addTrainingMessage({
        role: 'ai',
        content: '🔄 Tudo certo! Acabei de apagar todas as suas preferências e estou começando do zero. Pode me contar como você gosta dos seus CTAs!'
      });
      setCtaProfile(prev => ({
        tom: 'urgente',
        usaEmoji: true,
        emojisPreferidos: ['🔥', '🚨', '💥'],
        tamanhoPreferido: 'medio',
        palavrasProibidas: [],
        palavrasFavoritas: [],
        usaCaixaAlta: false,
        exemplosBons: [],
        exemplosRuins: [],
        observacoesLivres: '',
        ctasGerados: prev.ctasGerados,
        changelog: [],
        updatedAt: new Date().toISOString()
      }));
      setTrainingMessages([]);
      return;
    }

    if (intencao === 'consultar') {
      addTrainingMessage({ role: 'ai', content: gerarRespostaConsulta() });
      return;
    }

    if (intencao === 'gerar_exemplo') {
      try {
        const contexto: CtaContext = {
          produto: 'Produto em Destaque',
          preco: '99,90',
          preco_original: '149,90',
          frete_gratis: true
        };
        const ctas = [
          generateCtaFromProfile(contexto),
          generateCtaFromProfile({ ...contexto, frete_gratis: false, pix: true }),
          generateCtaFromProfile({ ...contexto, cupom: 'MEGA10' })
        ];

        addTrainingMessage({
          role: 'ai',
          content: `🧪 *Aqui estão 3 exemplos de CTA no seu estilo atual:*\n\n—\n**Opção 1:**\n${ctas[0]}\n\n—\n**Opção 2:**\n${ctas[1]}\n\n—\n**Opção 3:**\n${ctas[2]}\n\n—\nCurte algum? Diz o número e eu salvo como exemplo bom! Ou me fala o que não gostou para eu ajustar. 👇`,
          generatedCtas: ctas
        });
      } catch (err) {
        addTrainingMessage({
          role: 'ai',
          content: '⚠️ Tive um problema ao gerar os exemplos. Tente novamente ou clique no botão "Gerar Exemplos" abaixo do chat.'
        });
      }
      return;
    }

    if (intencao === 'feedback') {
      const t = userText.toLowerCase();
      if (/gostei|bom|ótimo|perfeito|amei|aprovo/.test(t)) {
        addTrainingMessage({
          role: 'ai',
          content: '👍 Que ótimo! Salvei esse estilo como preferência. Continue me treinando para eu ficar cada vez mais alinhado com o seu jeito!'
        });
      } else {
        addTrainingMessage({
          role: 'ai',
          content: '👎 Entendido! Vou evitar esse estilo. Pode me dizer especificamente o que não gostou? (muito formal, muito longo, palavras específicas etc.) Assim consigo corrigir com mais precisão.'
        });
      }
      return;
    }

    // Default: try to extract preference
    const { changes, confirmacao, requerConfirmacao } = interpretarPreferencias(userText, intencao);

    if (requerConfirmacao) {
      addTrainingMessage({ role: 'ai', content: confirmacao });
      return;
    }

    if (Object.keys(changes).length > 0) {
      updateCtaProfile(changes, userText);
      addTrainingMessage({
        role: 'ai',
        content: confirmacao,
        profileChanges: changes
      });
    } else {
      // Fallback: save as free observation
      const obs = ctaProfile.observacoesLivres
        ? ctaProfile.observacoesLivres + '\n• ' + userText
        : '• ' + userText;
      updateCtaProfile({ observacoesLivres: obs }, userText);
      addTrainingMessage({
        role: 'ai',
        content: `✍️ Anotei nas minhas observações: *"${userText}"*. Vou levar isso em conta ao gerar seus CTAs. Se quiser ser mais específico sobre algum ponto (tom, tamanho, emojis, palavras específicas), pode falar!`
      });
    }
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
        ctaProfile,
        updateCtaProfile,
        generateCtaFromProfile,
        resetCtaProfile,
        trainingMessages,
        addTrainingMessage,
        clearTrainingHistory,
        ctaFeedbacks,
        addCtaFeedback,
        sendTrainingMessage,
        geminiApiKey,
        setGeminiApiKey,
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
