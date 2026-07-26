/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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

const MainContent: React.FC = () => {
  const { activeTab, isSidebarCollapsed, setIsSidebarCollapsed } = useApp();
  const [hasEntered, setHasEntered] = useState(false);

  if (!hasEntered) {
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
    <div className="min-h-screen bg-[#050506] text-slate-200 font-sans selection:bg-indigo-500 selection:text-white relative overflow-x-hidden">
      {/* Background Ambient Glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[45%] h-[45%] bg-indigo-900/20 blur-[130px] rounded-full pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-emerald-900/15 blur-[130px] rounded-full pointer-events-none z-0"></div>
      <div className="fixed top-[40%] right-[20%] w-[30%] h-[30%] bg-violet-900/10 blur-[120px] rounded-full pointer-events-none z-0"></div>
      
      {/* Mesh Overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] mesh-grid z-0"></div>

      {/* Mobile Sidebar Backdrop Mask */}
      {!isSidebarCollapsed && (
        <div 
          onClick={() => setIsSidebarCollapsed(true)} 
          className="fixed inset-0 z-35 bg-black/60 backdrop-blur-sm lg:hidden pointer-events-auto"
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
    </AppProvider>
  );
}
