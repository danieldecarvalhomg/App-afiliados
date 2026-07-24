import React from 'react';
import { HelpCircle, BookOpen, MessageSquare, ExternalLink, Key, Zap } from 'lucide-react';

export const HelpCenterView: React.FC = () => {
  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <HelpCircle className="w-6 h-6 text-indigo-400" />
          Central de Ajuda & Tutoriais de Integração
        </h1>
        <p className="text-xs text-slate-400">
          Aprenda a configurar suas chaves de API nos marketplaces e obter seu token do Bot Telegram e WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Como obter Tag de Afiliado Amazon BR</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            1. Acesse o portal de Associados da Amazon.<br />
            2. Copie seu ID de Associado (ex: `affiliauto-20`).<br />
            3. Cole na aba Integrações do AffiFlow AI para converter links automaticamente.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Como criar Bot do Telegram para Disparos</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            1. No Telegram, converse com @BotFather e crie um novo bot com `/newbot`.<br />
            2. Copie o HTTP API Token gerado e adicione como administrador do seu Canal.<br />
            3. Cole o Token na central de integrações.
          </p>
        </div>
      </div>
    </div>
  );
};
