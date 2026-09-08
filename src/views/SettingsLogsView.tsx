import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Settings, CheckCircle2, Trash2 } from 'lucide-react';

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
          <h1 className="text-2xl font-semibold text-[#0F172A] tracking-tight flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-[#0F172A]" />
            Histórico de Atividades
          </h1>
          <p className="text-sm text-[#6B6F7B] mt-1">
            Acompanhe eventos de automação e registros de auditoria em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-transparent border border-[#E8E9ED] text-[#6B6F7B] text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Servidor em Nuvem: Ativo</span>
        </div>
      </div>

      {/* Action Bar for Logs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#FFFFFF] p-4 rounded-xl border border-[#E8E9ED]">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#6B6F7B] font-medium mr-1">Filtrar:</span>
          {['todos', 'info', 'success', 'warning', 'error'].map(lvl => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                filterLevel === lvl ? 'bg-[#F4F4F6] text-[#0F172A]' : 'bg-transparent text-[#9CA3AF] hover:text-[#6B6F7B]'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <button
          onClick={handleClearLogs}
          className="px-3 py-1.5 rounded-lg bg-transparent border border-red-200 hover:bg-red-50 text-[#EF4444] font-medium text-xs flex items-center gap-1.5 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Limpar Histórico
        </button>
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto rounded-xl border border-[#E8E9ED] bg-[#FFFFFF]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#F8FAFC] text-[#6B6F7B] border-b border-[#E8E9ED] font-medium text-xs uppercase tracking-wider">
            <tr>
              <th className="p-4">Data / Horário</th>
              <th className="p-4">Nível</th>
              <th className="p-4">Módulo</th>
              <th className="p-4">Mensagem de Evento</th>
              <th className="p-4">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E9ED]">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-[#9CA3AF]">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-[#F4F4F6] transition-colors">
                  <td className="p-4 text-[#6B6F7B] whitespace-nowrap font-mono text-xs">{log.timestamp}</td>
                  <td className="p-4 uppercase font-medium text-[10px]">
                    {log.level === 'success' && <span className="px-2 py-0.5 rounded-md bg-[#F4F4F6] text-emerald-600">SUCESSO</span>}
                    {log.level === 'info' && <span className="px-2 py-0.5 rounded-md bg-[#F4F4F6] text-[#6B6F7B]">INFO</span>}
                    {log.level === 'warning' && <span className="px-2 py-0.5 rounded-md bg-[#F4F4F6] text-[#EAB308]">ALERTA</span>}
                    {log.level === 'error' && <span className="px-2 py-0.5 rounded-md bg-[#F4F4F6] text-[#EF4444]">ERRO</span>}
                  </td>
                  <td className="p-4 font-medium text-[#0F172A] text-xs">{log.module}</td>
                  <td className="p-4 text-[#6B6F7B] text-xs">{log.message}</td>
                  <td className="p-4 text-[#9CA3AF] text-xs max-w-xs truncate">{log.details || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
