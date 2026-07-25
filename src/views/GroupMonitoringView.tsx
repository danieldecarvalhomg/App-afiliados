import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MonitoredGroup, CapturedMessage, ExtractedDataJSON, GroupRules } from '../types';
import {
  Bot,
  Plus,
  Play,
  Pause,
  Trash2,
  Settings,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Filter,
  Search,
  MessageSquare,
  Sparkles,
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  RotateCcw,
  Sliders,
  X,
  Check,
  Send,
  Edit3,
  FileText
} from 'lucide-react';
function formatWhatsAppMarkdown(text: string): string {
  if (!text) return '';

  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold: *text*
  formatted = formatted.replace(/\*([^\*\n]+)\*/g, '<strong>$1</strong>');
  // Italic: _text_
  formatted = formatted.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  // Strikethrough: ~text~
  formatted = formatted.replace(/~([^~\n]+)~/g, '<del class="opacity-70">$1</del>');
  // Monospace: `text`
  formatted = formatted.replace(/`([^`\n]+)`/g, '<code class="bg-black/40 px-1.5 py-0.5 rounded font-mono text-[11px] text-amber-300">$1</code>');

  return formatted;
}

export const GroupMonitoringView: React.FC = () => {
  const {
    monitoredGroups,
    addMonitoredGroup,
    updateMonitoredGroup,
    deleteMonitoredGroup,
    toggleMonitoredGroupStatus,
    capturedMessages,
    approveCapturedMessage,
    rejectCapturedMessage,
    processCapturedMessageAI,
    addLog
  } = useApp();

  // Navigation Sub-Tab State
  const [activeTab, setActiveTab] = useState<'grupos' | 'revisao' | 'historico'>('grupos');

  // Add Group Modal State
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupUrl, setNewGroupUrl] = useState('');
  const [newGroupPlatform, setNewGroupPlatform] = useState<'Telegram' | 'WhatsApp'>('Telegram');
  const [newGroupStore, setNewGroupStore] = useState('Todas as Lojas');
  const [newGroupConfidence, setNewGroupConfidence] = useState(0.7);

  // Group Rules Modal State
  const [activeRulesGroup, setActiveRulesGroup] = useState<MonitoredGroup | null>(null);
  const [editingRules, setEditingRules] = useState<GroupRules>({
    mandatoryKeywords: [],
    forbiddenKeywords: [],
    minPrice: 0,
    maxPrice: 10000,
    enableOCR: true,
    maxPerHour: 30,
    dedupHours: 12,
    autoApproveConfidence: 0.7
  });
  const [forbiddenKeyInput, setForbiddenKeyInput] = useState('');

  // Simulator Modal State
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simGroupId, setSimGroupId] = useState('');
  const [simRawText, setSimRawText] = useState(
    '🔥 PROMOÇÃO IMPERDÍVEL! TV 55 4K Smart QLED de R$ 3.999 por R$ 2.499,00 no PIX com frete grátis! Use o cupom TVQLED200 https://amzn.to/tv-samsung-deal'
  );
  const [isProcessingSim, setIsProcessingSim] = useState(false);

  // Edit Review Item State
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState<Partial<ExtractedDataJSON>>({});

  // History Filter State
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('todas');

  const pendingMessages = capturedMessages.filter(m => m.status === 'Pendente');

  // Handle Add Group Submit
  const handleAddGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    addMonitoredGroup({
      name: newGroupName,
      externalIdOrUrl: newGroupUrl || 'https://t.me/grupo_ofertas',
      platform: newGroupPlatform,
      linkedStore: newGroupStore,
      rules: {
        mandatoryKeywords: [],
        forbiddenKeywords: ['esgotado'],
        minPrice: 5,
        enableOCR: true,
        maxPerHour: 35,
        dedupHours: 12,
        autoApproveConfidence: newGroupConfidence
      }
    });

    setIsAddGroupOpen(false);
    setNewGroupName('');
    setNewGroupUrl('');
  };

  // Open Rules Modal
  const handleOpenRules = (group: MonitoredGroup) => {
    setActiveRulesGroup(group);
    setEditingRules(group.rules || {
      mandatoryKeywords: [],
      forbiddenKeywords: [],
      minPrice: 0,
      enableOCR: true,
      maxPerHour: 30,
      dedupHours: 12,
      autoApproveConfidence: 0.7
    });
  };

  // Save Rules
  const handleSaveRules = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeRulesGroup) {
      updateMonitoredGroup(activeRulesGroup.id, { rules: editingRules });
      setActiveRulesGroup(null);
    }
  };

  // Trigger Live Test Simulation Capture
  const handleRunSimulation = async () => {
    setIsProcessingSim(true);
    try {
      const targetGroup = simGroupId || (monitoredGroups[0]?.id || 'grp-1');
      const result = await processCapturedMessageAI(simRawText, targetGroup);
      
      addLog(
        'success',
        'Monitor IA',
        `Mensagem processada! Confiança: ${Math.round(result.confidence * 100)}% - Status: ${result.status}`
      );
      
      if (result.status === 'Pendente') {
        setActiveTab('revisao');
      } else {
        setActiveTab('historico');
      }
      setIsSimulatorOpen(false);
    } catch (e) {
      addLog('error', 'Monitor IA', 'Falha ao simular captura de mensagem.');
    } finally {
      setIsProcessingSim(false);
    }
  };

  // Start Edit in Review Item
  const handleStartEditReview = (item: CapturedMessage) => {
    setEditingReviewId(item.id);
    setEditJson(item.extractedJson || {});
  };

  // Save Edited Review Item & Approve
  const handleSaveAndApproveReview = (id: string) => {
    approveCapturedMessage(id, editJson);
    setEditingReviewId(null);
  };

  // Filtered History List
  const filteredHistory = capturedMessages.filter(m => {
    const matchesSearch =
      m.rawContent.toLowerCase().includes(historySearch.toLowerCase()) ||
      m.groupName.toLowerCase().includes(historySearch.toLowerCase()) ||
      (m.extractedJson?.produto || '').toLowerCase().includes(historySearch.toLowerCase());

    const matchesStatus =
      historyStatusFilter === 'todas' ? true : m.status.toLowerCase() === historyStatusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header & Breadcrumb */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Início</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white font-semibold">Monitoramento de Grupos IA</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <Bot className="w-6 h-6 text-emerald-400" />
              Monitoramento de Grupos com Inteligência Artificial
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Acompanhamento de grupos concorrentes, extração automática de ofertas com IA e conversão direta para o seu template.
            </p>
          </div>

          {/* Sub-Tab Selector Buttons */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
            <button
              onClick={() => setActiveTab('grupos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'grupos'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Grupos Monitorados ({monitoredGroups.length})
            </button>
            <button
              onClick={() => setActiveTab('revisao')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'revisao'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Fila de Revisão</span>
              {pendingMessages.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                  {pendingMessages.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('historico')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'historico'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Histórico ({capturedMessages.length})
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SUB-TAB 1: GRUPOS MONITORADOS                                        */}
      {/* ==================================================================== */}
      {activeTab === 'grupos' && (
        <div className="space-y-6">
          {/* Top Bar Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Motor de Escuta Ativa em Grupos de Promoção
              </h3>
              <p className="text-xs text-slate-400">
                Cadastre links ou IDs de grupos externos do WhatsApp e Telegram para capturar postagens em tempo real.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setIsSimulatorOpen(true)}
                className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition-all shadow-md"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                ⚡ Simular Captura ao Vivo
              </button>

              <button
                onClick={() => setIsAddGroupOpen(true)}
                className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all hover:scale-105"
              >
                <Plus className="w-4 h-4" />
                + Adicionar Grupo
              </button>
            </div>
          </div>

          {/* Cards Grid of Monitored Groups */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {monitoredGroups.length === 0 ? (
              <div className="col-span-full py-12 text-center rounded-3xl bg-slate-900/50 border border-slate-800 text-xs text-slate-500 space-y-2">
                <Bot className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="font-bold text-slate-300">Nenhum grupo cadastrado no momento</p>
                <p>Clique em "+ Adicionar Grupo" para iniciar a monitoração automática.</p>
              </div>
            ) : (
              monitoredGroups.map(group => (
                <div
                  key={group.id}
                  className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800/80 shadow-xl space-y-5 flex flex-col justify-between hover:border-slate-700 transition-all"
                >
                  <div className="space-y-4">
                    {/* Header: Title & Platform Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              group.platform === 'WhatsApp'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                            }`}
                          >
                            {group.platform}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                            {group.linkedStore}
                          </span>
                        </div>
                        <h3 className="text-sm font-extrabold text-white line-clamp-1">{group.name}</h3>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                          group.status === 'ativo'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {group.status === 'ativo' ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>

                    <p className="text-[11px] font-mono text-slate-400 truncate bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800/80">
                      {group.externalIdOrUrl}
                    </p>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-2xl bg-slate-950 border border-slate-800/80">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Capturas</span>
                        <span className="text-xs font-bold text-white font-mono">{group.capturedCount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Aprovadas</span>
                        <span className="text-xs font-bold text-emerald-400 font-mono">{group.approvedCount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Atividade</span>
                        <span className="text-[10px] font-medium text-slate-300">{group.lastActivity}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                    <button
                      onClick={() => toggleMonitoredGroupStatus(group.id)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                        group.status === 'ativo'
                          ? 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20'
                      }`}
                    >
                      {group.status === 'ativo' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {group.status === 'ativo' ? 'Pausar' : 'Ativar'}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenRules(group)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 flex items-center gap-1 transition-colors"
                      >
                        <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                        Regras
                      </button>

                      <button
                        onClick={() => deleteMonitoredGroup(group.id)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 transition-colors"
                        title="Remover grupo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 2: FILA DE REVISÃO                                           */}
      {/* ==================================================================== */}
      {activeTab === 'revisao' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                Fila de Aprovação Manual ({pendingMessages.length} pendentes)
              </h2>
              <p className="text-xs text-slate-400">
                Ofertas capturadas com índice de confiança intermediário aguardando sua validação ou edição de campos.
              </p>
            </div>

            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold font-mono">
              Autopiloto Filtro Ativo
            </span>
          </div>

          {pendingMessages.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 text-xs text-slate-500 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="font-bold text-white">Sua fila de revisão está vazia!</p>
              <p>Todas as mensagens capturadas foram aprovadas automaticamente ou processadas.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {pendingMessages.map(item => {
                const isEditing = editingReviewId === item.id;
                const json = isEditing ? editJson : item.extractedJson;

                return (
                  <div
                    key={item.id}
                    className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6"
                  >
                    {/* Header Details */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {item.groupName} ({item.platform})
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{item.createdAt}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Confiança IA:</span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                            item.confidence >= 0.8
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {Math.round(item.confidence * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Comparative View: Before & After */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Antes: Raw Message */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-400 block uppercase">
                          ANTES: Mensagem Original do Grupo
                        </span>
                        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                          {item.rawContent}
                        </div>
                      </div>

                      {/* Depois: Formatted WhatsApp Live Preview */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-emerald-400 block uppercase flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5" />
                          DEPOIS: Convertido no Seu Template
                        </span>
                        <div className="p-4 rounded-2xl bg-[#0b141a] border border-slate-800 min-h-[160px] flex flex-col justify-end">
                          <div className="p-3 rounded-xl bg-[#005c4b] text-white text-xs font-sans whitespace-pre-wrap leading-relaxed border border-emerald-500/30 shadow-md">
                            <div
                              dangerouslySetInnerHTML={{
                                __html: formatWhatsAppMarkdown(item.finalText || '')
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Editable Extracted Data Panel */}
                    <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                          Campos Extraídos pela IA (Editáveis)
                        </span>

                        {!isEditing && (
                          <button
                            onClick={() => handleStartEditReview(item)}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                          >
                            Editar Campos
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">Produto</label>
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={json?.produto || ''}
                            onChange={e => setEditJson({ ...editJson, produto: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white disabled:opacity-80"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">Preço (R$)</label>
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={json?.preco || ''}
                            onChange={e => setEditJson({ ...editJson, preco: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-emerald-400 font-bold disabled:opacity-80"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">Preço Original (R$)</label>
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={json?.preco_original || ''}
                            onChange={e => setEditJson({ ...editJson, preco_original: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white disabled:opacity-80"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">Cupom</label>
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={json?.cupom || ''}
                            onChange={e => setEditJson({ ...editJson, cupom: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white font-mono disabled:opacity-80"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bottom Review Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        onClick={() => rejectCapturedMessage(item.id)}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
                      >
                        <XCircle className="w-4 h-4 text-rose-400" />
                        Descartar
                      </button>

                      <button
                        onClick={() => handleSaveAndApproveReview(item.id)}
                        className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all hover:scale-105"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Aprovar e Enviar p/ Fila
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 3: HISTÓRICO DE CONVERSÕES                                   */}
      {/* ==================================================================== */}
      {activeTab === 'historico' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar no histórico por produto, palavra-chave ou grupo..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Status:</span>
              <select
                value={historyStatusFilter}
                onChange={e => setHistoryStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="todas">Todas</option>
                <option value="aprovada">Aprovada</option>
                <option value="pendente">Pendente</option>
                <option value="rejeitada">Rejeitada</option>
                <option value="falhou na extração">Falhou na Extração</option>
              </select>
            </div>
          </div>

          {/* History List */}
          <div className="space-y-4">
            {filteredHistory.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 text-xs text-slate-500">
                Nenhum histórico registrado para os filtros selecionados.
              </div>
            ) : (
              filteredHistory.map(item => (
                <div
                  key={item.id}
                  className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-white">{item.groupName}</span>
                      <span className="text-slate-500 font-mono text-[10px]">{item.createdAt}</span>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        item.status === 'Aprovada'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : item.status === 'Pendente'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 block uppercase">Original Capturado</span>
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-slate-300 line-clamp-3">
                        {item.rawContent}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-emerald-400 block uppercase">Texto Convertido Final</span>
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-slate-200 line-clamp-3">
                        {item.finalText || '[Falha na extração]'}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ADICIONAR GRUPO                                              */}
      {/* ==================================================================== */}
      {isAddGroupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                Adicionar Grupo Monitorado
              </h2>
              <button onClick={() => setIsAddGroupOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddGroupSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Nome do Grupo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Promoções Tech Telegram"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Link ou ID do Grupo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: https://t.me/meugrupo ou link do WhatsApp"
                  value={newGroupUrl}
                  onChange={e => setNewGroupUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Plataforma</label>
                  <select
                    value={newGroupPlatform}
                    onChange={e => setNewGroupPlatform(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none"
                  >
                    <option value="Telegram">Telegram</option>
                    <option value="WhatsApp">WhatsApp</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Loja Vinculada</label>
                  <select
                    value={newGroupStore}
                    onChange={e => setNewGroupStore(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none"
                  >
                    <option value="Todas as Lojas">Todas as Lojas (Auto)</option>
                    <option value="Amazon">Amazon</option>
                    <option value="Mercado Livre">Mercado Livre</option>
                    <option value="Shopee">Shopee</option>
                    <option value="AliExpress">AliExpress</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Limiar para Aprovação Autopiloto (Confiança IA)</label>
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  value={newGroupConfidence}
                  onChange={e => setNewGroupConfidence(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <span className="text-[10px] text-slate-400 font-mono block text-right">
                  Exigir {Math.round(newGroupConfidence * 100)}% de confiança para auto-publicar
                </span>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddGroupOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md"
                >
                  Salvar Grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: SIMULADOR DE CAPTURA AO VIVO                                  */}
      {/* ==================================================================== */}
      {isSimulatorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white">Simulador de Captura de Oferta em Tempo Real</h2>
              </div>
              <button onClick={() => setIsSimulatorOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Grupo de Origem</label>
                <select
                  value={simGroupId}
                  onChange={e => setSimGroupId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none"
                >
                  {monitoredGroups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.platform})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Cole a Mensagem Bruta Capturada</label>
                <textarea
                  rows={4}
                  value={simRawText}
                  onChange={e => setSimRawText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-xs font-mono text-slate-200 focus:outline-none leading-relaxed"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSimulatorOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRunSimulation}
                  disabled={isProcessingSim}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md flex items-center gap-2"
                >
                  {isProcessingSim ? 'Extraindo via IA...' : '⚡ Processar com IA'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: REGRAS DO GRUPO                                               */}
      {/* ==================================================================== */}
      {activeRulesGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-white">Regras de {activeRulesGroup.name}</h2>
              </div>
              <button onClick={() => setActiveRulesGroup(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRules} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Preço Mínimo (R$)</label>
                  <input
                    type="number"
                    value={editingRules.minPrice || 0}
                    onChange={e => setEditingRules({ ...editingRules, minPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Limite por Hora</label>
                  <input
                    type="number"
                    value={editingRules.maxPerHour || 30}
                    onChange={e => setEditingRules({ ...editingRules, maxPerHour: parseInt(e.target.value) || 30 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRules.enableOCR}
                    onChange={e => setEditingRules({ ...editingRules, enableOCR: e.target.checked })}
                    className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-300 font-semibold">Ativar Leitura OCR em Imagens</span>
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveRulesGroup(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md"
                >
                  Salvar Regras
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
