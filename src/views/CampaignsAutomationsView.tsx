import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, Layers3, Loader2, Megaphone, Pencil, Plus, RefreshCw, Save, Users, Wifi } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { CampaignCollection, CreateCampaignCollectionInput } from '../domain/dispatch/types';
import type { WhatsAppConnection, WhatsAppGroup } from '../domain/whatsapp/types';
import { dispatchApi, dispatchNavigation } from '../services/dispatchApi';
import { whatsappApi } from '../services/whatsappApi';
import { AutomationsView } from './AutomationsView';

type Screen = 'list' | 'create' | 'edit' | 'detail';
const panel = 'rounded-xl border border-[#E8E9ED] bg-[#FFFFFF]';
const input = 'w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none focus:border-[#6B6F7B]';

export const CampaignsAutomationsView: React.FC = () => {
  const { activeTab } = useApp();
  const [campaigns, setCampaigns] = useState<CampaignCollection[]>([]);
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [screen, setScreen] = useState<Screen>('list');
  const [selected, setSelected] = useState<CampaignCollection | null>(null);
  const [name, setName] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignData, connectionData] = await Promise.all([dispatchApi.listCampaigns(), whatsappApi.listConnections()]);
      setCampaigns(campaignData);
      setConnections(connectionData);
      const intent = dispatchNavigation.consumeCampaignIntent();
      if (intent?.type === 'create') {
        setSelected(null); setName(''); setConnectionId(connectionData[0]?.id ?? ''); setGroupIds([]); setScreen('create');
      } else if (intent?.type === 'detail') {
        const target = campaignData.find((item) => item.id === intent.campaignId) ?? null;
        setSelected(target); setScreen(target ? 'detail' : 'list');
      } else {
        setSelected((current) => current ? campaignData.find((item) => item.id === current.id) ?? null : null);
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar campanhas.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === 'campanhas') void load(); }, [activeTab, load]);
  useEffect(() => {
    if (!connectionId || !['create', 'edit'].includes(screen)) { setGroups([]); return; }
    let cancelled = false;
    void whatsappApi.listConnectionGroups(connectionId)
      .then((items) => { if (!cancelled) setGroups(items); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Falha ao carregar grupos.'); });
    return () => { cancelled = true; };
  }, [connectionId, screen]);

  const availableGroups = useMemo(() => groups.filter((group) => group.syncStatus === 'active'), [groups]);
  const selectedConnection = useMemo(() => connections.find((item) => item.id === connectionId) ?? null, [connectionId, connections]);
  const beginCreate = () => { setSelected(null); setName(''); setConnectionId(connections[0]?.id ?? ''); setGroupIds([]); setError(null); setScreen('create'); };
  const beginEdit = (campaign: CampaignCollection) => { setSelected(campaign); setName(campaign.name); setConnectionId(campaign.connectionId); setGroupIds(campaign.groups.map((group) => group.whatsappGroupId)); setError(null); setScreen('edit'); };
  const toggleGroup = (id: string) => setGroupIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const syncGroups = async () => {
    if (!selectedConnection || selectedConnection.status !== 'connected') { setError('Conecte o WhatsApp selecionado antes de sincronizar os grupos.'); return; }
    setBusy('sync'); setError(null);
    try { setGroups(await whatsappApi.syncGroups(selectedConnection.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao sincronizar grupos.'); }
    finally { setBusy(null); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload: CreateCampaignCollectionInput = { name: name.trim(), connectionId, groupIds };
    setBusy('save'); setError(null);
    try {
      const saved = screen === 'edit' && selected ? await dispatchApi.updateCampaign(selected.id, payload) : await dispatchApi.createCampaign(payload);
      setCampaigns((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setSelected(saved); setScreen('detail');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a campanha.'); }
    finally { setBusy(null); }
  };

  if (activeTab === 'automacoes') return <AutomationsView />;
  if (screen === 'create' || screen === 'edit') return (
    <div className="space-y-6 pb-12">
      <button onClick={() => setScreen(selected ? 'detail' : 'list')} className="flex items-center gap-2 text-sm text-[#6B6F7B]"><ArrowLeft className="h-4 w-4" /> Voltar</button>
      <header><h1 className="text-2xl font-medium">{screen === 'edit' ? 'Editar campanha' : 'Nova campanha'}</h1><p className="mt-1 text-sm text-[#6B6F7B]">Crie um grupo de grupos para reutilizar ao configurar filas.</p></header>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      <form onSubmit={save} className={`${panel} max-w-3xl space-y-6 p-6`}>
        <label className="block text-xs text-[#6B6F7B]">Nome da campanha<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Grupos de ofertas" className={`${input} mt-1.5`} /></label>
        <label className="block text-xs text-[#6B6F7B]">Conexão dos grupos<select required value={connectionId} onChange={(event) => { setConnectionId(event.target.value); setGroupIds([]); }} className={`${input} mt-1.5`}><option value="">Selecione uma conexão</option>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.label} · {connection.status}</option>)}</select></label>
        <section className="space-y-3 border-t border-[#E8E9ED] pt-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-medium">Grupos da campanha</h2><p className="mt-1 text-xs text-[#9CA3AF]">{groupIds.length} selecionado{groupIds.length === 1 ? '' : 's'}.</p></div><button type="button" disabled={!connectionId || busy !== null} onClick={() => void syncGroups()} className="flex items-center gap-2 rounded-lg border border-[#E8E9ED] px-3 py-2 text-xs disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} /> Sincronizar</button></div>
          {!connectionId ? <div className="rounded-lg border border-dashed border-[#E8E9ED] p-8 text-center text-sm text-[#9CA3AF]">Selecione uma conexão.</div> : availableGroups.length === 0 ? <div className="rounded-lg border border-dashed border-[#E8E9ED] p-8 text-center text-sm text-[#9CA3AF]">Nenhum grupo disponível.</div> : <div className="max-h-80 space-y-2 overflow-y-auto">{availableGroups.map((group) => <label key={group.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-3"><input type="checkbox" checked={groupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} /><span className="min-w-0 flex-1 truncate text-sm">{group.name}</span><span className="text-xs text-[#9CA3AF]">{group.participantsCount.toLocaleString('pt-BR')}</span></label>)}</div>}
        </section>
        <div className="flex justify-end gap-3 border-t border-[#E8E9ED] pt-5"><button type="button" onClick={() => setScreen(selected ? 'detail' : 'list')} className="px-4 py-2 text-sm text-[#6B6F7B]">Cancelar</button><button type="submit" disabled={busy !== null || !name.trim() || !connectionId || groupIds.length === 0} className="flex items-center gap-2 rounded-lg bg-[#EDEDED] px-4 py-2 text-sm font-medium text-[#111] disabled:opacity-40">{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar campanha</button></div>
      </form>
    </div>
  );
  if (screen === 'detail' && selected) return (
    <div className="space-y-6 pb-12">
      <button onClick={() => setScreen('list')} className="flex items-center gap-2 text-sm text-[#6B6F7B]"><ArrowLeft className="h-4 w-4" /> Voltar para campanhas</button>
      <header className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-medium">{selected.name}</h1><p className="mt-1 text-sm text-[#6B6F7B]">Agrupamento reutilizável de grupos.</p></div><button onClick={() => beginEdit(selected)} className="flex items-center gap-2 rounded-lg border border-[#E8E9ED] px-3 py-2 text-sm"><Pencil className="h-4 w-4" /> Editar</button></header>
      <div className="grid gap-4 sm:grid-cols-2"><div className={`${panel} p-4`}><Wifi className="mb-3 h-4 w-4 text-[#9CA3AF]" /><p className="text-xs text-[#9CA3AF]">Conexão</p><p className="mt-1 text-sm">{selected.connectionLabel}</p></div><div className={`${panel} p-4`}><Users className="mb-3 h-4 w-4 text-[#9CA3AF]" /><p className="text-xs text-[#9CA3AF]">Grupos</p><p className="mt-1 text-sm">{selected.groups.length} destino{selected.groups.length === 1 ? '' : 's'}</p></div></div>
      <section className={`${panel} overflow-hidden`}><div className="border-b border-[#E8E9ED] px-5 py-4"><h2 className="text-sm font-medium">Grupos vinculados</h2></div>{selected.groups.map((group) => <div key={group.id} className="flex items-center justify-between border-b border-[#E8E9ED] px-5 py-4 last:border-0"><span className="text-sm">{group.name}</span><span className="text-xs text-[#9CA3AF]">{group.participantsCount.toLocaleString('pt-BR')} participantes</span></div>)}</section>
    </div>
  );
  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="flex items-center gap-2.5 text-2xl font-medium"><Megaphone className="h-5 w-5" /> Campanhas</h1><p className="mt-1 text-sm text-[#6B6F7B]">Monte grupos de grupos para selecionar dentro da configuração das filas.</p></div><button onClick={beginCreate} disabled={loading} className="flex items-center gap-2 rounded-lg bg-[#EDEDED] px-4 py-2 text-sm font-medium text-[#111] disabled:opacity-40"><Plus className="h-4 w-4" /> Nova campanha</button></header>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {loading ? <div className={`${panel} flex items-center justify-center gap-2 py-20 text-sm text-[#6B6F7B]`}><Loader2 className="h-4 w-4 animate-spin" /> Carregando campanhas •••</div> : campaigns.length === 0 ? <div className={`${panel} px-6 py-16 text-center`}><Layers3 className="mx-auto mb-3 h-9 w-9 text-[#D4D4D8]" /><p className="text-sm text-[#6B6F7B]">Nenhuma campanha criada.</p><p className="mt-1 text-xs text-[#9CA3AF]">Crie um agrupamento para reutilizar vários grupos em uma fila.</p></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{campaigns.map((campaign) => <article key={campaign.id} className={`${panel} flex flex-col justify-between p-5`}><div><Layers3 className="h-4 w-4 text-[#9CA3AF]" /><h2 className="mt-4 truncate text-sm font-medium">{campaign.name}</h2><div className="mt-4 space-y-2 border-t border-[#E8E9ED] pt-4 text-xs text-[#6B6F7B]"><p className="flex items-center gap-2"><Wifi className="h-3.5 w-3.5" /> {campaign.connectionLabel}</p><p className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> {campaign.groups.length} grupo{campaign.groups.length === 1 ? '' : 's'}</p></div></div><div className="mt-5 flex justify-end border-t border-[#E8E9ED] pt-4"><button onClick={() => { setSelected(campaign); setScreen('detail'); }} className="flex items-center gap-2 rounded-lg border border-[#E8E9ED] px-3 py-2 text-xs"><Eye className="h-3.5 w-3.5" /> Ver grupos</button></div></article>)}</div>}
    </div>
  );
};
