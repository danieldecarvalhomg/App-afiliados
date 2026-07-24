import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Search,
  Bell,
  Plus,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  User,
  Zap,
  Globe,
  Menu
} from 'lucide-react';

interface TopbarProps {
  onOpenWelcome?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onOpenWelcome }) => {
  const {
    activeTab,
    setActiveTab,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    setIsSearchOpen,
    notifications,
    markNotificationRead,
    clearAllNotifications,
    subscription,
    queues
  } = useApp();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;
  const activeQueuesCount = queues.filter(q => q.status === 'ativa').length;

  const userName = localStorage.getItem('user_profile_name') || 'Afiliado Pro';
  const userInitials = userName
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'AF';

  const userAvatar = localStorage.getItem('user_profile_avatar') || '';

  const tabTitles: Record<string, string> = {
    dashboard: 'Dashboard Executivo',
    produtos: 'Gestão de Produtos & Ofertas',
    filas: 'Filas de Postagem & Agendamento',
    campanhas: 'Campanhas de Disparo',
    automacoes: 'Automações & Regras de Gatilho',
    ia: 'Gerador de Cópia com IA & Templates',
    'landing-pages': 'Landing Pages & Bio Links',
    integracoes: 'Integrações de Marketplaces & Redes',
    grupos: 'Gestão de Grupos & Canais',
    crm: 'CRM de Afiliados & Contatos',
    analytics: 'Analytics & Relatórios de Conversão',
    biblioteca: 'Biblioteca & Coleções de Ofertas',
    perfil: 'Meu Perfil de Afiliado',
    equipe: 'Gestão da Equipe & Assinatura',
    ajuda: 'Central de Ajuda & Documentação',
  };

  return (
    <header
      className={`fixed top-0 right-0 z-30 h-16 transition-all duration-300 ease-in-out bg-[#050506]/50 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4 sm:px-8 left-0 lg:${
        isSidebarCollapsed ? 'left-20' : 'left-64'
      }`}
    >
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Mobile menu trigger */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors lg:hidden shrink-0"
          title="Toggle Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="text-xs text-slate-500 flex items-center gap-1.5 sm:gap-2">
          <span>Home</span>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <span className="text-slate-300 capitalize">{activeTab.replace('-', ' ')}</span>
        </div>
        <div className="h-6 w-[1px] bg-white/5 hidden sm:block"></div>
        <span className="hidden md:inline-block text-xs text-slate-400 font-medium">
          {tabTitles[activeTab] || 'Visão Geral'}
        </span>
      </div>

      {/* Action Controls & Right Utilities */}
      <div className="flex items-center gap-4">

        {/* Active Engine Status Pill */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>{activeQueuesCount} Filas Ativas</span>
        </div>

        {/* Global Search Launcher Button */}
        <button
          onClick={() => setIsSearchOpen(true)}
          className="relative flex items-center gap-2 bg-white/5 border border-white/5 rounded-full py-1.5 pl-9 pr-4 text-xs w-48 sm:w-64 text-slate-400 hover:text-white hover:border-indigo-500/30 transition-all text-left"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <span className="truncate">Pesquisa global (⌘K)</span>
        </button>

        {/* AI Quick Generator Shortcut Button */}
        <button
          onClick={() => setActiveTab('ia')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
          <span>Criar IA</span>
        </button>

        {/* Notifications Dropdown Menu */}
        <div className="relative">
          <button
            onClick={() => setIsNotifOpen(prev => !prev)}
            className="relative p-2 text-slate-400 hover:text-white transition-colors"
            title="Notificações e Alertas"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-[#050506]"></span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl bg-[#0a0a0b] border border-white/10 shadow-2xl z-50 overflow-hidden backdrop-blur-xl">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white">Central de Alertas</span>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/20 text-indigo-400">
                      {unreadCount} novos
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearAllNotifications}
                    className="text-[11px] text-slate-400 hover:text-indigo-400 transition-colors"
                  >
                    Limpar
                  </button>
                  <button
                    onClick={() => setIsNotifOpen(false)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Nenhum alerta no momento.
                  </div>
                ) : (
                  notifications.map(item => (
                    <div
                      key={item.id}
                      onClick={() => markNotificationRead(item.id)}
                      className={`p-3.5 text-xs transition-colors cursor-pointer hover:bg-white/5 flex gap-3 ${
                        !item.read ? 'bg-indigo-500/10' : ''
                      }`}
                    >
                      <div className="shrink-0 mt-0.5">
                        {item.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                        {item.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {item.type === 'info' && <Zap className="w-4 h-4 text-indigo-400" />}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-200">{item.title}</span>
                          <span className="text-[10px] text-slate-500">{item.time}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{item.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar */}
        <div
          onClick={() => setActiveTab('perfil')}
          className="flex items-center gap-3 cursor-pointer group"
          title="Ver Meu Perfil"
        >
          <div className="h-8 w-8 rounded-full overflow-hidden border border-white/10 flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-bold text-xs shadow-md shrink-0">
            {userAvatar ? (
              <img src={userAvatar} className="h-full w-full object-cover" alt="Profile" />
            ) : (
              userInitials
            )}
          </div>
          <div className="hidden lg:flex flex-col">
            <span className="text-xs font-semibold text-slate-200 group-hover:text-indigo-400 transition-colors">
              {userName}
            </span>
            <span className="text-[10px] text-slate-500">Affiliate Pro</span>
          </div>
        </div>
      </div>
    </header>
  );
};
