import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Search,
  Bell,
  Plus,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  X,
  Zap,
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
    queues,
    currentUser
  } = useApp();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;
  const activeQueuesCount = queues.filter(q => q.status === 'ativa').length;

  const userName = currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || 'Usuário';
  const userInitials = userName
    .split(' ')
    .filter(Boolean)
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  const userAvatar = currentUser?.user_metadata?.avatar_url || '';

  const tabTitles: Record<string, string> = {
    dashboard: 'Dashboard',
    produtos: 'Produtos',
    filas: 'Filas',
    campanhas: 'Campanhas',
    automacoes: 'Automações',
    ia: 'Templates',
    mensagens: 'Mensagens',
    'cta-studio': 'Treinador de IA',
    'landing-pages': 'Landing Pages',
    integracoes: 'Integrações',
    grupos: 'Canais',
    crm: 'Contatos',
    analytics: 'Analytics',
    biblioteca: 'Biblioteca',
    perfil: 'Perfil',
    equipe: 'Assinatura',
    ajuda: 'Ajuda',
    monitoramento: 'Monitor de Grupos',
  };

  return (
    <header
      className={`fixed top-0 right-0 z-30 h-16 transition-all duration-300 ease-in-out bg-[#F8FAFC] border-b border-[#E8E9ED] flex items-center justify-between px-4 sm:px-8 left-0 lg:${
        isSidebarCollapsed ? 'left-20' : 'left-64'
      }`}
    >
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-4">
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#0F172A] hover:bg-[#F4F4F6] transition-colors lg:hidden shrink-0"
          title="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="text-xs text-[#9CA3AF] flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="hidden sm:inline">Home</span>
          <ChevronRight className="w-3 h-3 text-[#D4D4D8]" />
          <span className="text-[#6B6F7B] capitalize truncate">{tabTitles[activeTab] || activeTab.replace('-', ' ')}</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">

        {/* Queue status */}
        {activeQueuesCount > 0 && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FFFFFF] border border-[#E8E9ED] text-[#6B6F7B] text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></span>
            <span>{activeQueuesCount} {activeQueuesCount === 1 ? 'fila ativa' : 'filas ativas'}</span>
          </div>
        )}

        {/* Search */}
        <button
          onClick={() => setIsSearchOpen(true)}
          className="relative hidden sm:flex items-center gap-2 bg-[#FFFFFF] border border-[#E8E9ED] rounded-lg py-1.5 pl-9 pr-4 text-xs w-48 sm:w-56 text-[#9CA3AF] hover:text-[#6B6F7B] hover:border-[#D4D4D8] transition-all text-left"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <span className="truncate">Buscar... (⌘K)</span>
        </button>
        <button
          onClick={() => setIsSearchOpen(true)}
          className="flex sm:hidden items-center justify-center rounded-lg border border-[#E8E9ED] bg-[#FFFFFF] p-2 text-[#6B6F7B]"
          aria-label="Buscar"
        >
          <Search className="h-4 w-4" />
        </button>

        {/* New item button */}
        <button
          onClick={() => setActiveTab('produtos')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#FF2D7D] via-[#FF6B6B] to-[#FF9F43] hover:opacity-90 text-white text-xs font-semibold transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Novo</span>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setIsNotifOpen(prev => !prev)}
            className="relative p-2 text-[#9CA3AF] hover:text-[#0F172A] transition-colors"
            title="Notificações"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#EF4444] rounded-full ring-2 ring-[#F8FAFC]"></span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-3 w-80 sm:w-96 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED] shadow-2xl z-50 overflow-hidden">
              <div className="p-4 border-b border-[#E8E9ED] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#0F172A]">Notificações</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-[#F4F4F6] text-[#6B6F7B] border border-[#E8E9ED]">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearAllNotifications}
                    className="text-[11px] text-[#9CA3AF] hover:text-[#0F172A] transition-colors"
                  >
                    Limpar
                  </button>
                  <button
                    onClick={() => setIsNotifOpen(false)}
                    className="p-1 text-[#9CA3AF] hover:text-[#0F172A]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-[#E8E9ED]">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#9CA3AF]">
                    Nenhuma notificação.
                  </div>
                ) : (
                  notifications.map(item => (
                    <div
                      key={item.id}
                      onClick={() => markNotificationRead(item.id)}
                      className={`p-3.5 text-xs transition-colors cursor-pointer hover:bg-[#F4F4F6] flex gap-3 ${
                        !item.read ? 'bg-[#F4F4F6]' : ''
                      }`}
                    >
                      <div className="shrink-0 mt-0.5">
                        {item.type === 'warning' && <AlertTriangle className="w-4 h-4 text-[#EAB308]" />}
                        {item.type === 'success' && <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />}
                        {item.type === 'info' && <Zap className="w-4 h-4 text-[#6B6F7B]" />}
                        {item.type === 'error' && <AlertTriangle className="w-4 h-4 text-[#EF4444]" />}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[#0F172A]">{item.title}</span>
                          <span className="text-[10px] text-[#9CA3AF]">{item.time}</span>
                        </div>
                        <p className="text-[11px] text-[#6B6F7B] leading-relaxed">{item.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div
          onClick={() => setActiveTab('perfil')}
          className="flex items-center gap-3 cursor-pointer group"
          title="Perfil"
        >
          <div className="h-8 w-8 rounded-lg overflow-hidden border border-[#E8E9ED] flex items-center justify-center bg-[#F4F4F6] text-[#6B6F7B] font-medium text-xs shrink-0">
            {userAvatar ? (
              <img src={userAvatar} className="h-full w-full object-cover" alt="Profile" />
            ) : (
              userInitials
            )}
          </div>
          <div className="hidden lg:flex flex-col">
            <span className="text-xs font-medium text-[#0F172A] group-hover:text-[#FF2D7D] transition-colors">
              {userName}
            </span>
            <span className="text-[10px] text-[#9CA3AF]">Pro</span>
          </div>
        </div>
      </div>
    </header>
  );
};
