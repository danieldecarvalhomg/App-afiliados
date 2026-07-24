import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Settings, FileText, CheckCircle2, Database, Trash2 } from 'lucide-react';

export const SettingsLogsView: React.FC = () => {
  const { logs, addLog } = useApp();
  const [logList, setLogList] = useState(logs);
  const [filterLevel, setFilterLevel] = useState<string>('todos');

  const handleClearLogs = () => {
    setLogList([]);
    addLog('info', 'Auditoria', 'Histórico de atividades limpo pelo administrador.');
  };

  const filteredLogs = logList.filter(l => filterLevel === 'todos' || l.level === filterLevel);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-indigo-400" />
            Configurações Globais & Histórico de Atividades
          </h1>
          <p className="text-xs text-slate-400">
            Acompanhe disparos, eventos de automação e registros de auditoria em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4" />
          <span>Servidor em Nuvem: Ativo & Sincronizado</span>
        </div>
      </div>

      {/* Action Bar for Logs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-bold">Filtrar nível:</span>
          {['todos', 'info', 'success', 'warning', 'error'].map(lvl => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-3 py-1 rounded-xl text-[10px] font-bold capitalize transition-all ${
                filterLevel === lvl ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <button
          onClick={handleClearLogs}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 font-bold text-xs flex items-center gap-1.5 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Limpar Histórico
        </button>
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/90 shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase font-semibold">
            <tr>
              <th className="p-4">Data / Horário</th>
              <th className="p-4">Nível</th>
              <th className="p-4">Módulo</th>
              <th className="p-4">Mensagem de Evento</th>
              <th className="p-4">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  Nenhum registro encontrado neste filtro.
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-4 text-slate-400 whitespace-nowrap font-mono text-[11px]">{log.timestamp}</td>
                  <td className="p-4 uppercase font-bold text-[10px]">
                    {log.level === 'success' && <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">SUCESSO</span>}
                    {log.level === 'info' && <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">INFO</span>}
                    {log.level === 'warning' && <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">ALERTA</span>}
                    {log.level === 'error' && <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">ERRO</span>}
                  </td>
                  <td className="p-4 font-bold text-slate-200">{log.module}</td>
                  <td className="p-4 text-slate-300">{log.message}</td>
                  <td className="p-4 text-slate-400 text-[11px] max-w-xs truncate">{log.details || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
