import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquare, RefreshCw, Users } from 'lucide-react';
import type { WhatsAppConnection, WhatsAppGroup } from '../domain/whatsapp/types';
import { whatsappApi } from '../services/whatsappApi';

export const GroupsChannelsView: React.FC = () => {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [connectionFilter, setConnectionFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [connectionData, groupData] = await Promise.all([
        whatsappApi.listConnections(),
        whatsappApi.listGroups(),
      ]);
      setConnections(connectionData);
      setGroups(groupData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar grupos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleGroups = useMemo(
    () => groups.filter((group) => connectionFilter === 'all' || group.connectionId === connectionFilter),
    [connectionFilter, groups],
  );

  const sync = async () => {
    const targets = connections.filter((connection) => (
      connection.status === 'connected'
      && (connectionFilter === 'all' || connection.id === connectionFilter)
    ));
    if (targets.length === 0) {
      setError('Conecte o WhatsApp selecionado antes de sincronizar os grupos.');
      return;
    }
    setSyncing(true);
    setError(null);
    try {
      await Promise.all(targets.map((connection) => whatsappApi.syncGroups(connection.id)));
      setGroups(await whatsappApi.listGroups());
      setConnections(await whatsappApi.listConnections());
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Falha ao sincronizar grupos.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-[#0F172A] tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6" /> Grupos &amp; Canais
          </h1>
          <p className="text-sm text-[#6B6F7B] mt-1">
            Grupos reais sincronizados, separados pela conexão WhatsApp de origem.
          </p>
        </div>
        <button
          onClick={() => void sync()}
          disabled={syncing || loading}
          className="px-4 py-2 rounded-lg bg-[#EDEDED] text-[#0F172A] disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sincronizar grupos
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-[#F4F4F6] border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 p-3 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED]">
        <MessageSquare className="w-4 h-4 text-[#9CA3AF]" />
        <label htmlFor="whatsapp-filter" className="text-xs text-[#6B6F7B]">WhatsApp</label>
        <select
          id="whatsapp-filter"
          value={connectionFilter}
          onChange={(event) => setConnectionFilter(event.target.value)}
          className="ml-auto min-w-48 px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-xs text-[#0F172A] focus:outline-none"
        >
          <option value="all">Todos</option>
          {connections.map((connection) => (
            <option key={connection.id} value={connection.id}>{connection.label}</option>
          ))}
        </select>
      </div>

      <div className="rounded-xl bg-[#FFFFFF] border border-[#E8E9ED] overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(140px,0.5fr)_120px_110px] gap-4 px-5 py-3 border-b border-[#E8E9ED] text-xs text-[#9CA3AF]">
          <span>Grupo</span>
          <span>WhatsApp</span>
          <span>Participantes</span>
          <span>Status</span>
        </div>
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#9CA3AF]" /></div>
        ) : visibleGroups.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-8 h-8 text-[#D4D4D8] mx-auto mb-3" />
            <p className="text-sm text-[#6B6F7B]">Nenhum grupo sincronizado.</p>
            <p className="text-xs text-[#9CA3AF] mt-1">Conecte um número e use “Sincronizar grupos”.</p>
          </div>
        ) : (
          visibleGroups.map((group) => (
            <div
              key={group.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(140px,0.5fr)_120px_110px] gap-4 items-center px-5 py-4 border-b last:border-b-0 border-[#E8E9ED] text-sm"
            >
              <div className="min-w-0">
                <p className="text-[#0F172A] truncate">{group.name}</p>
                <p className="text-[11px] text-[#6B6F7B] truncate mt-0.5">{group.externalGroupId}</p>
              </div>
              <span className="text-[#6B6F7B] truncate">{group.connectionLabel || 'WhatsApp'}</span>
              <span className="text-[#6B6F7B] tabular-nums">
                {group.participantsCount.toLocaleString('pt-BR')}
              </span>
              <span className={`text-xs ${group.syncStatus === 'active' ? 'text-emerald-600' : 'text-[#9CA3AF]'}`}>
                {group.syncStatus === 'active' ? 'Disponível' : 'Indisponível'}
              </span>
            </div>
          ))
        )}
      </div>
      <p className="text-xs text-[#6B6F7B]">
        Grupos que deixam de aparecer permanecem no histórico como indisponíveis e não são apagados automaticamente.
      </p>
    </div>
  );
};
