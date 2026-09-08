import React from 'react';
import { useApp } from '../context/AppContext';
import { BrandLogo } from './BrandLogo';
import {
  LayoutDashboard,
  ShoppingBag,
  ListOrdered,
  Megaphone,
  Wand2,
  Globe,
  Boxes,
  Users,
  BarChart3,
  Bookmark,
  Building2,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Zap,
  Bot,
  MessageSquareText,
  User
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: string | number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, isSidebarCollapsed, setIsSidebarCollapsed, productCount, queueItems, subscription } = useApp();

  const pendingQueueCount = queueItems.filter(i => i.status === 'pendente').length;
  const planUsage = Math.round(Math.max(
    subscription.disparosLimit ? subscription.disparosUsed / subscription.disparosLimit : 0,
    subscription.iaGenerationsLimit ? subscription.iaGenerationsUsed / subscription.iaGenerationsLimit : 0,
    subscription.affiliateConversionsLimit ? subscription.affiliateConversionsUsed / subscription.affiliateConversionsLimit : 0,
    subscription.radarRefreshesLimit ? subscription.radarRefreshesUsed / subscription.radarRefreshesLimit : 0,
  ) * 100);

  const sections: NavSection[] = [
    {
      title: 'VISÃO GERAL',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'produtos', label: 'Produtos', icon: ShoppingBag, badge: productCount ?? undefined },
        { id: 'filas', label: 'Filas', icon: ListOrdered, badge: pendingQueueCount > 0 ? pendingQueueCount : undefined },
      ]
    },
    {
      title: 'CRIAÇÃO',
      items: [
        { id: 'cta-studio', label: 'Treinador de IA', icon: Bot },
        { id: 'ia', label: 'Templates', icon: Wand2 },
        { id: 'mensagens', label: 'Mensagens', icon: MessageSquareText },
      ]
    },
    {
      title: 'AUTOMAÇÃO',
      items: [
        { id: 'campanhas', label: 'Campanhas', icon: Megaphone },
        { id: 'automacoes', label: 'Automações', icon: Zap },
        { id: 'monitoramento', label: 'Monitor de Grupos', icon: Bot },
        { id: 'landing-pages', label: 'Landing Pages', icon: Globe },
      ]
    },
    {
      title: 'CONEXÕES',
      items: [
        { id: 'integracoes', label: 'Integrações', icon: Boxes },
        { id: 'crm', label: 'Contatos', icon: Users },
      ]
    },
    {
      title: 'RELATÓRIOS',
      items: [
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
        { id: 'biblioteca', label: 'Biblioteca', icon: Bookmark },
      ]
    },
    {
      title: 'CONTA',
      items: [
        { id: 'perfil', label: 'Perfil', icon: User },
        { id: 'equipe', label: 'Assinatura', icon: Building2 },
        { id: 'ajuda', label: 'Ajuda', icon: HelpCircle },
      ]
    }
  ];

  return (
    <aside
      className={`fixed top-0 left-0 z-45 h-screen transition-all duration-300 ease-in-out flex flex-col bg-[#FFFFFF] border-r border-[#E8E9ED] lg:translate-x-0 ${
        isSidebarCollapsed ? 'w-20 -translate-x-full lg:translate-x-0' : 'w-64 translate-x-0'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-[#E8E9ED]">
        <BrandLogo
          showName={!isSidebarCollapsed}
          markClassName="h-9 w-9"
          wordmarkClassName="text-[1.05rem]"
          className="min-w-0"
        />

        <button
          onClick={() => setIsSidebarCollapsed(prev => !prev)}
          className="p-1.5 rounded-lg text-[#6B6F7B] hover:text-[#0F172A] hover:bg-[#F4F4F6] transition-colors"
          title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {sections.map((section, idx) => (
          <div key={idx} className="space-y-0.5">
            {!isSidebarCollapsed && (
              <h3 className="px-3 text-[10px] font-semibold tracking-widest text-[#9CA3AF] uppercase mb-2">
                {section.title}
              </h3>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    data-view={item.id === 'ia' ? 'ai-studio' : item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 group relative ${
                      isActive
                        ? 'bg-[#FFF0F4] text-[#FF2D7D] border border-[#FFE0EA] font-semibold'
                        : 'text-[#6B6F7B] hover:text-[#0F172A] hover:bg-[#F4F4F6] border border-transparent'
                    }`}
                    title={isSidebarCollapsed ? item.label : undefined}
                  >
                    {/* Active indicator bar */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[#FF2D7D] rounded-full" />
                    )}
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#FF2D7D]' : 'text-[#6B6F7B] group-hover:text-[#0F172A]'}`} />
                    {!isSidebarCollapsed && (
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    )}
                    {!isSidebarCollapsed && item.badge !== undefined && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-md border ${
                        isActive
                          ? 'bg-[#FFE5EC] text-[#FF2D7D] border-[#FFD0DE]'
                          : 'bg-[#F4F4F6] text-[#6B6F7B] border-[#E8E9ED]'
                      }`}>
                        {item.badge}
                      </span>
                    )}

                    {/* Collapsed badge dot */}
                    {isSidebarCollapsed && item.badge !== undefined && (
                      <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#FF2D7D]"></span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Plan Widget */}
      {!isSidebarCollapsed && (
        <div className="p-3 m-3 rounded-xl bg-[#F8FAFC] border border-[#E8E9ED]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-[#0F172A]">Plano {subscription.name}</span>
          </div>
          <p className="text-[10px] text-[#6B6F7B] mb-2">{planUsage}% do maior limite utilizado</p>
          <div className="w-full h-1 bg-[#E8E9ED] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#FF2D7D] via-[#FF6B6B] to-[#FF9F43] rounded-full" style={{ width: `${Math.min(100, planUsage)}%` }}></div>
          </div>
        </div>
      )}
    </aside>
  );
};
