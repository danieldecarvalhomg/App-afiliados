import React from 'react';
import { HelpCircle, Key, Zap } from 'lucide-react';

export const HelpCenterView: React.FC = () => {
  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold text-[#0F172A] tracking-tight flex items-center gap-2.5">
          <HelpCircle className="w-6 h-6 text-[#0F172A]" />
          Central de Ajuda
        </h1>
        <p className="text-sm text-[#6B6F7B] mt-1">
          Aprenda a configurar suas chaves de API nos marketplaces e obter seu token do Bot.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED] space-y-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-[#0F172A]" />
            <h3 className="text-sm font-medium text-[#0F172A]">Como obter Tag de Afiliado Amazon BR</h3>
          </div>
          <p className="text-sm text-[#6B6F7B] leading-relaxed">
            1. Acesse o portal de Associados da Amazon.<br />
            2. Copie seu ID de Associado (ex: <span className="bg-[#F8FAFC] border border-[#E8E9ED] font-mono px-1.5 py-0.5 rounded text-xs">affiliauto-20</span>).<br />
            3. Cole na aba Integrações para converter links automaticamente.
          </p>
        </div>

        <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED] space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#0F172A]" />
            <h3 className="text-sm font-medium text-[#0F172A]">Como criar Bot do Telegram para Disparos</h3>
          </div>
          <p className="text-sm text-[#6B6F7B] leading-relaxed">
            1. No Telegram, converse com @BotFather e crie um novo bot com <span className="bg-[#F8FAFC] border border-[#E8E9ED] font-mono px-1.5 py-0.5 rounded text-xs">/newbot</span>.<br />
            2. Copie o HTTP API Token gerado e adicione como administrador do seu Canal.<br />
            3. Cole o Token na central de integrações.
          </p>
        </div>
      </div>
    </div>
  );
};
