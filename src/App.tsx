/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { WelcomeAuthView } from './views/WelcomeAuthView';

import { DashboardView } from './views/DashboardView';
import { ProductsView } from './views/ProductsView';
import { QueuesView } from './views/QueuesView';
import { CampaignsAutomationsView } from './views/CampaignsAutomationsView';
import { AiStudioView } from './views/AiStudioView';
import { LandingPagesView } from './views/LandingPagesView';
import { IntegrationsView } from './views/IntegrationsView';
import { GroupsChannelsView } from './views/GroupsChannelsView';
import { CrmView } from './views/CrmView';
import { AnalyticsView } from './views/AnalyticsView';
import { LibraryView } from './views/LibraryView';
import { ProfileView } from './views/ProfileView';
import { TeamSubscriptionView } from './views/TeamSubscriptionView';
import { GroupMonitoringView } from './views/GroupMonitoringView';
import { HelpCenterView } from './views/HelpCenterView';
import { CtaStudioView } from './views/CtaStudioView';
import { MessagesView } from './views/MessagesView';
import { supabase } from './lib/supabase';
import { ConsentBanner } from './components/ConsentBanner';

const MainContent: React.FC = () => {
  const { activeTab, currentUser, isSidebarCollapsed, setIsSidebarCollapsed } = useApp();
  const [hasEntered, setHasEntered] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(() =>
    new URLSearchParams(window.location.search).get('auth') === 'reset',
  );

  // A sessão Supabase persiste no browser. Ao recarregar após um restart do
  // backend, o painel precisa voltar automaticamente sem exigir novo login.
  useEffect(() => {
    if (currentUser) setHasEntered(true);
  }, [currentUser]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!hasEntered || passwordRecovery) {
    return <WelcomeAuthView onLoginSuccess={() => setHasEntered(true)} />;
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'produtos':
        return <ProductsView />;
      case 'filas':
        return <QueuesView />;
      case 'campanhas':
      case 'automacoes':
        return <CampaignsAutomationsView />;
      case 'ia':
        return <AiStudioView />;
      case 'cta-studio':
        return <CtaStudioView />;
      case 'mensagens':
        return <MessagesView />;
      case 'monitoramento':
        return <GroupMonitoringView />;
      case 'landing-pages':
        return <LandingPagesView />;
      case 'integracoes':
        return <IntegrationsView />;
      case 'grupos':
        return <GroupsChannelsView />;
      case 'crm':
        return <CrmView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'biblioteca':
        return <LibraryView />;
      case 'perfil':
        return <ProfileView onLogout={() => setHasEntered(false)} />;
      case 'equipe':
        return <TeamSubscriptionView />;
      case 'ajuda':
        return <HelpCenterView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans relative overflow-x-hidden">
      {/* Mobile Sidebar Backdrop */}
      {!isSidebarCollapsed && (
        <div 
          onClick={() => setIsSidebarCollapsed(true)} 
          className="fixed inset-0 z-35 bg-black/25 backdrop-blur-xs lg:hidden pointer-events-auto"
        />
      )}

      <Sidebar />
      <Topbar onOpenWelcome={() => setHasEntered(false)} />
      <GlobalSearchModal />

      <main
        className={`relative z-10 transition-all duration-300 ease-in-out pt-20 px-4 sm:px-6 max-w-7xl mx-auto min-h-screen ${
          isSidebarCollapsed ? 'lg:pl-24 pl-0' : 'lg:pl-72 pl-0'
        }`}
      >
        {renderActiveView()}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainContent />
      <ConsentBanner />
    </AppProvider>
  );
}
