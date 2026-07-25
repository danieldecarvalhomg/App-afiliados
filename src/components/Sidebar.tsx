import React from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  ShoppingBag,
  ListOrdered,
  Megaphone,
  Wand2,
  Globe,
  Boxes,
  Send,
  Users,
  BarChart3,
  Bookmark,
  Building2,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Zap,
  Flame,
  Bot,
  Brain,
  User
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: string | number;
  badgeColor?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, isSidebarCollapsed, setIsSidebarCollapsed, products, queueItems, notifications } = useApp();

  const unreadNotifsCount = notifications.filter(n => !n.read).length;
  const pendingQueueCount = queueItems.filter(i => i.status === 'pendente').length;
  const brokenLinksCount = products.filter(p => p.status === 'link_quebrado').length;

  const sections: NavSection[] = [
    {
      title: 'VISÃO GERAL',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'produtos', label: 'Produtos & Ofertas', icon: ShoppingBag, badge: products.length },
        {
          id: 'filas',
          label: 'Filas & Agendamentos',
          icon: ListOrdered,
          badge: pendingQueueCount > 0 ? pendingQueueCount : undefined,
          badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        },
      ]
    },
    {
      title: 'AUTOMAÇÃO & IA',
      items: [
        { id: 'campanhas', label: 'Campanhas', icon: Megaphone },
        { id: 'automacoes', label: 'Automações & Regras', icon: Zap },
        { id: 'ia', label: 'Gerador IA & Templates', icon: Wand2, badge: 'PRO', badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' },
        { id: 'monitoramento', label: 'Monitor de Grupos IA', icon: Bot, badge: 'NOVO', badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
        { id: 'ai-training', label: 'Treinar minha IA', icon: Brain, badge: 'BETA', badgeColor: 'bg-violet-500/20 text-violet-300 border border-violet-500/30' },
        { id: 'landing-pages', label: 'Landing Pages', icon: Globe },
      ]
    },
    {
      title: 'CANAIS & CONEXÕES',
      items: [
        { id: 'integracoes', label: 'Integrações', icon: Boxes, badge: brokenLinksCount > 0 ? `${brokenLinksCount} !` : undefined, badgeColor: 'bg-rose-500/20 text-rose-400 border border-rose-500/30' },
        { id: 'grupos', label: 'Grupos & Canais', icon: Send },
        { id: 'crm', label: 'CRM & Contatos', icon: Users },
      ]
    },
    {
      title: 'ANALÍTICO & BIBLIOTECA',
      items: [
        { id: 'analytics', label: 'Analytics & Relatórios', icon: BarChart3 },
        { id: 'biblioteca', label: 'Biblioteca & Coleções', icon: Bookmark },
      ]
    },
    {
      title: 'GESTÃO & SUPORTE',
      items: [
        { id: 'perfil', label: 'Meu Perfil', icon: User },
        { id: 'equipe', label: 'Equipe & Assinatura', icon: Building2 },
        { id: 'ajuda', label: 'Central de Ajuda', icon: HelpCircle },
      ]
    }
  ];

  return (
    <aside
      className={`fixed top-0 left-0 z-45 h-screen transition-all duration-300 ease-in-out flex flex-col bg-[#0a0a0b]/95 lg:bg-[#0a0a0b]/80 backdrop-blur-xl border-r border-white/5 shadow-2xl lg:translate-x-0 ${
        isSidebarCollapsed ? 'w-20 -translate-x-full lg:translate-x-0' : 'w-64 translate-x-0'
      }`}
    >
      {/* App Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-emerald-500 shadow-md shadow-indigo-500/20 shrink-0 font-bold text-white text-sm">
            A
          </div>
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-1">
              <span className="text-base font-bold tracking-tight text-white italic">AFFILIUX</span>
              <span className="text-[10px] font-semibold not-italic text-slate-400 bg-white/10 px-1.5 py-0.5 rounded border border-white/5">PRO</span>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsSidebarCollapsed(prev => !prev)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5 scrollbar-thin scrollbar-thumb-white/10">
        {sections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {!isSidebarCollapsed && (
              <h3 className="px-3 text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-2">
                {section.title}
              </h3>
            )}
            <div className="space-y-1">
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group relative ${
                      isActive
                        ? 'bg-white/5 text-white border border-white/5 shadow-sm font-semibold'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                    title={isSidebarCollapsed ? item.label : undefined}
                  >
                    <Icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-105 ${isActive ? 'text-indigo-400' : 'opacity-60 group-hover:opacity-100'}`} />
                    {!isSidebarCollapsed && (
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    )}
                    {!isSidebarCollapsed && item.badge !== undefined && (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full shrink-0 ${
                          item.badgeColor || 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {/* Collapsed view indicator dot */}
                    {isSidebarCollapsed && item.badge !== undefined && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#050506]"></span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Plan Status Widget */}
      {!isSidebarCollapsed && (
        <div className="p-3 m-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-indigo-400">Plano Pro Afiliados</span>
            <Flame className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <p className="text-[10px] text-slate-400 mb-2">0% do limite mensal utilizado</p>
          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: '0%' }}></div>
          </div>
        </div>
      )}
    </aside>
  );
};
