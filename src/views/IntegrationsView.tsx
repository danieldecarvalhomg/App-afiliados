import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Integration } from '../types';
import {
  Boxes,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Settings,
  FileText,
  Plug,
  ShoppingBag,
  Send,
  MessageSquare,
  Globe,
  Key,
  Tag,
  RefreshCw,
  X,
  ExternalLink,
  Zap,
  Database
} from 'lucide-react';

export const IntegrationsView: React.FC = () => {
  const { integrations, toggleIntegrationStatus, updateIntegrationConfig, logs } = useApp();

  const [activeConfigIntegration, setActiveConfigIntegration] = useState<Integration | null>(null);
  const [activeLogsIntegration, setActiveLogsIntegration] = useState<Integration | null>(null);

  // Form State for Config Modal
  const [tagInput, setTagInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [configWarning, setConfigWarning] = useState<string | null>(null);

  const openConfigModal = (int: Integration, warning?: string) => {
    setActiveConfigIntegration(int);
    setTagInput(int.tagAfiliado || '');
    setApiKeyInput(int.apiKey || '');
    setConfigWarning(warning || null);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeConfigIntegration) {
      updateIntegrationConfig(activeConfigIntegration.id, tagInput, apiKeyInput);
      setActiveConfigIntegration(null);
      setConfigWarning(null);
    }
  };

  const handleConnectClick = (int: Integration) => {
    if (int.status === 'conectado') {
      // Allow immediate disconnect
      toggleIntegrationStatus(int.id);
    } else {
      const isMarketplace = ['amazon', 'mercadolivre', 'shopee', 'aliexpress'].includes(int.key);
      const isMissingTag = isMarketplace && !int.tagAfiliado;
      const isMissingKey = !isMarketplace && !int.apiKey;

      if (isMissingTag || isMissingKey) {
        openConfigModal(
          int,
          `⚠️ Insira as credenciais do ${int.name} abaixo e salve para ativar a conexão!`
        );
      } else {
        toggleIntegrationStatus(int.id);
      }
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <Boxes className="w-6 h-6 text-cyan-400" />
          Central de Integrações & Conexões
        </h1>
        <p className="text-xs text-slate-400">
          Conecte e gerencie suas contas de afiliados nos marketplaces e canais de transmissão.
        </p>
      </div>

      {/* Grid of Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {integrations.map(int => (
          <div
            key={int.id}
            className={`p-6 rounded-3xl bg-slate-900/90 border transition-all duration-300 flex flex-col justify-between space-y-5 ${
              int.status === 'conectado'
                ? 'border-slate-800 hover:border-emerald-500/40'
                : int.status === 'requer_atencao'
                ? 'border-amber-500/40 shadow-amber-950/20'
                : 'border-slate-800 opacity-80 hover:opacity-100'
            }`}
          >
            {/* Top header & Status */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center font-bold text-indigo-400">
                    {int.key === 'amazon' && <ShoppingBag className="w-5 h-5 text-amber-400" />}
                    {int.key === 'mercadolivre' && <Boxes className="w-5 h-5 text-yellow-400" />}
                    {int.key === 'shopee' && <ShoppingBag className="w-5 h-5 text-orange-400" />}
                    {int.key === 'telegram' && <Send className="w-5 h-5 text-cyan-400" />}
                    {int.key === 'whatsapp' && <MessageSquare className="w-5 h-5 text-emerald-400" />}
                    {int.key === 'aliexpress' && <Globe className="w-5 h-5 text-rose-400" />}
                    {int.key === 'discord' && <Zap className="w-5 h-5 text-indigo-400" />}
                    {int.key === 'supabase' && <Database className="w-5 h-5 text-emerald-400" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{int.name}</h3>
                    <span className="text-[10px] text-slate-400 capitalize">{int.category}</span>
                  </div>
                </div>

                {/* Status Badge */}
                {int.status === 'conectado' && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Conectado
                  </span>
                )}
                {int.status === 'requer_atencao' && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Atenção
                  </span>
                )}
                {int.status === 'desconectado' && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    Desconectado
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 leading-relaxed min-h-[3rem]">
                {int.description}
              </p>

              {int.tagAfiliado && (
                <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center justify-between">
                  <span className="text-slate-500">Tag Afiliado:</span>
                  <span className="font-bold text-indigo-300">{int.tagAfiliado}</span>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="text-[10px] text-slate-500 flex items-center justify-between">
                <span>Última Sincronização:</span>
                <span className="text-slate-300 font-medium">{int.lastSync}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleConnectClick(int)}
                  className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                    int.status === 'conectado'
                      ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                  }`}
                >
                  {int.status === 'conectado' ? 'Desconectar' : 'Conectar'}
                </button>

                <button
                  onClick={() => openConfigModal(int)}
                  className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-1"
                >
                  <Settings className="w-3.5 h-3.5 text-indigo-400" />
                  Configurar
                </button>

                <button
                  onClick={() => setActiveLogsIntegration(int)}
                  className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Logs
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Config Integration */}
      {activeConfigIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Configurar {activeConfigIntegration.name}</h2>
              </div>
              <button onClick={() => setActiveConfigIntegration(null)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {configWarning && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold leading-relaxed">
                {configWarning}
              </div>
            )}

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Tag de Afiliado / ID de Associado:</label>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Ex: affiliauto-20 ou sub_tag_2026"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Chave API / Token de Acesso Live:</label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Ex: ak_live_19823019823"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveConfigIntegration(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md"
                >
                  Salvar Configuração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Drawer: Logs Integration */}
      {activeLogsIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Logs da Integração - {activeLogsIntegration.name}</h2>
              </div>
              <button onClick={() => setActiveLogsIntegration(null)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 max-h-80 overflow-y-auto font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-slate-500 text-center py-4">Nenhum log registrado para esta integração.</p>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>{log.timestamp}</span>
                      <span className="uppercase font-bold text-indigo-400">{log.level}</span>
                    </div>
                    <p className="text-slate-200">{log.message}</p>
                    {log.details && <p className="text-[10px] text-slate-400">{log.details}</p>}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setActiveLogsIntegration(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold"
              >
                Fechar Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
