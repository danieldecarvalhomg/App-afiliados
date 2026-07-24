import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { QueueConfig, QueueItem, ChannelPlatform } from '../types';
import {
  ListOrdered,
  Plus,
  Play,
  Pause,
  Shuffle,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  Table as TableIcon,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Settings,
  X,
  Flame,
  Zap,
  Calendar,
  Layers
} from 'lucide-react';

export const QueuesView: React.FC = () => {
  const {
    queues,
    setQueues,
    queueItems,
    deleteQueueItem,
    shuffleQueue,
    clearSentQueueItems,
    toggleQueueStatus,
    moveQueueItemPriority,
    addQueueItem,
    addLog,
    integrations
  } = useApp();

  const [selectedQueueId, setSelectedQueueId] = useState<string>(queues[0]?.id || 'queue-1');
  const [viewMode, setViewMode] = useState<'tabela' | 'cards'>('tabela');
  const [isCreateQueueModalOpen, setIsCreateQueueModalOpen] = useState(false);
  const [isSimulatingSend, setIsSimulatingSend] = useState(false);

  // New Queue Form State
  const [newQueueData, setNewQueueData] = useState<Partial<QueueConfig>>({
    name: 'Fila WhatsApp - Cupons Diários',
    platform: 'WhatsApp',
    channelName: 'Grupo 05 - Achados VIP',
    intervalMinutes: 20,
    autoShuffle: true,
    peakHoursOnly: true,
    timeWindowStart: '08:00',
    timeWindowEnd: '22:00',
    daysOfWeek: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'],
  });

  const currentQueue = queues.find(q => q.id === selectedQueueId) || queues[0];
  const itemsInCurrentQueue = queueItems.filter(i => i.queueConfigId === currentQueue?.id);
  const pendingItems = itemsInCurrentQueue.filter(i => i.status === 'pendente');
  const sentItems = itemsInCurrentQueue.filter(i => i.status === 'enviado');

  const handleSimulateInstantSend = async () => {
    if (pendingItems.length === 0) return;
    setIsSimulatingSend(true);

    const targetItem = pendingItems[0];
    if (targetItem) {
      // 1. Try real dispatch to Telegram if integration is configured
      const tgInt = integrations.find(i => i.key === 'telegram');
      let tgSuccess = false;

      if (currentQueue.platform === 'Telegram' && tgInt?.status === 'conectado' && tgInt.apiKey) {
        try {
          const cleanToken = tgInt.apiKey.startsWith('bot') ? tgInt.apiKey : `bot${tgInt.apiKey}`;
          const chatId = currentQueue.channelId || '@seucanal';
          
          const response = await fetch(`https://api.telegram.org/${cleanToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: targetItem.copyText,
              parse_mode: 'Markdown'
            })
          });

          const data = await response.json();
          if (data.ok) {
            tgSuccess = true;
            addLog('success', 'Telegram API', `Mensagem enviada com sucesso para o canal ${chatId}`);
          } else {
            console.warn('Telegram API Error Response:', data);
            addLog('warning', 'Telegram API', `Aviso do Telegram: ${data.description}`);
          }
        } catch (err: any) {
          console.error('Telegram API Dispatch error:', err);
          addLog('error', 'Telegram API', `Erro de conexão com a API do Telegram: ${err.message}`);
        }
      }

      // 1.2. WhatsApp Redirect dispatch
      let waSuccess = false;
      if (currentQueue.platform === 'WhatsApp') {
        try {
          const textEscaped = encodeURIComponent(targetItem.copyText);
          const phone = currentQueue.channelId && !currentQueue.channelId.startsWith('@') && !isNaN(Number(currentQueue.channelId.replace(/\D/g, ''))) 
            ? currentQueue.channelId.replace(/\D/g, '') 
            : '';
            
          const waUrl = phone 
            ? `https://api.whatsapp.com/send?phone=${phone}&text=${textEscaped}`
            : `https://api.whatsapp.com/send?text=${textEscaped}`;

          window.open(waUrl, '_blank');
          waSuccess = true;
          addLog('success', 'WhatsApp API', `Redirecionamento do WhatsApp acionado para o produto: ${targetItem.productTitle}`);
        } catch (err: any) {
          console.error('WhatsApp Dispatch error:', err);
          addLog('error', 'WhatsApp API', `Erro ao abrir redirecionador do WhatsApp: ${err.message}`);
        }
      }

      // 2. Mark as sent in state
      useApp().setQueueItems(prev => prev.map(i => i.id === targetItem.id ? {
        ...i,
        status: 'enviado',
        sentAt: new Date().toISOString()
      } : i));

      // 3. Update queue counter
      setQueues(prev => prev.map(q => q.id === currentQueue.id ? {
        ...q,
        totalPending: Math.max(0, q.totalPending - 1),
        totalSent: q.totalSent + 1,
        lastDeliveryTime: 'Agora mesmo'
      } : q));

      addLog('success', 'Fila Inteligente', `Disparo ${tgSuccess || waSuccess ? 'REAL' : 'simulado'} concluído com sucesso no canal "${currentQueue.channelName}"`);
    }

    setIsSimulatingSend(false);
  };

  const handleCreateQueue = (e: React.FormEvent) => {
    e.preventDefault();
    const created: QueueConfig = {
      id: 'queue-' + Date.now(),
      name: newQueueData.name || 'Nova Fila de Disparo',
      platform: newQueueData.platform as ChannelPlatform || 'Telegram',
      channelName: newQueueData.channelName || 'Canal / Grupo',
      channelId: newQueueData.channelName || '@seucanal',
      status: 'ativa',
      intervalMinutes: newQueueData.intervalMinutes || 15,
      autoShuffle: newQueueData.autoShuffle ?? true,
      peakHoursOnly: newQueueData.peakHoursOnly ?? true,
      daysOfWeek: newQueueData.daysOfWeek || ['seg', 'ter', 'qua', 'qui', 'sex'],
      timeWindowStart: newQueueData.timeWindowStart || '08:00',
      timeWindowEnd: newQueueData.timeWindowEnd || '22:00',
      nextDeliveryTime: 'Em 15 minutos',
      lastDeliveryTime: 'Sem envios anteriores',
      totalPending: 0,
      totalSent: 0,
      totalFailed: 0,
    };

    setQueues(prev => [...prev, created]);
    setSelectedQueueId(created.id);
    setIsCreateQueueModalOpen(false);
    addLog('success', 'Filas', `Nova fila criada: ${created.name}`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <ListOrdered className="w-6 h-6 text-emerald-400" />
            Filas Inteligentes de Postagem & Agendamentos
          </h1>
          <p className="text-xs text-slate-400">
            Controle o ritmo dos disparos, reordene prioridades, embaralhe e monitore o fluxo de saída em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateQueueModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Criar Nova Fila
          </button>
        </div>
      </div>

      {/* Queue Selectors Cards Bar or Empty State */}
      {queues.length === 0 ? (
        <div className="py-16 px-6 text-center space-y-4 bg-slate-900/40 rounded-3xl border border-slate-800/80">
          <div className="w-14 h-14 rounded-3xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
            <ListOrdered className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-bold text-white">Nenhuma Fila de Disparo Configurada</h3>
            <p className="text-xs text-slate-400">
              Crie a sua primeira fila inteligente para automatizar o envio de ofertas e cupons nos seus canais do Telegram, WhatsApp ou Discord.
            </p>
          </div>
          <button
            onClick={() => setIsCreateQueueModalOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Criar Primeira Fila
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {queues.map(q => {
            const isSelected = q.id === currentQueue?.id;
            return (
              <div
                key={q.id}
                onClick={() => setSelectedQueueId(q.id)}
                className={`p-4 rounded-2xl cursor-pointer border transition-all duration-200 relative overflow-hidden ${
                  isSelected
                    ? 'bg-slate-900 border-emerald-500/50 shadow-xl ring-1 ring-emerald-500/30'
                    : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 uppercase">
                    {q.platform}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleQueueStatus(q.id);
                    }}
                    className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full transition-colors flex items-center gap-1 ${
                      q.status === 'ativa'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {q.status === 'ativa' ? <Play className="w-2.5 h-2.5 fill-current" /> : <Pause className="w-2.5 h-2.5 fill-current" />}
                    {q.status === 'ativa' ? 'Ativa' : 'Pausada'}
                  </button>
                </div>

                <h3 className="text-sm font-bold text-white line-clamp-1 mb-1">{q.name}</h3>
                <p className="text-[11px] text-slate-400 line-clamp-1 mb-3">{q.channelName}</p>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                  <span>Pendente: <strong className="text-white">{queueItems.filter(i => i.queueConfigId === q.id && i.status === 'pendente').length}</strong></span>
                  <span>Enviado: <strong className="text-emerald-400">{queueItems.filter(i => i.queueConfigId === q.id && i.status === 'enviado').length}</strong></span>
                  <span>Intervalo: <strong className="text-indigo-300">{q.intervalMinutes}m</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Queue Details & Statistics Header */}
      {currentQueue && (
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800/80 shadow-xl space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-white">{currentQueue.name}</h2>
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {currentQueue.channelName}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Dias: {currentQueue.daysOfWeek.join(', ')} • Janela: {currentQueue.timeWindowStart} às {currentQueue.timeWindowEnd}
              </p>
            </div>

            {/* Smart Actions Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSimulateInstantSend}
                disabled={isSimulatingSend || pendingItems.length === 0}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-semibold shadow-md hover:opacity-90 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                {isSimulatingSend ? 'Disparando...' : 'Disparar Próximo Agora'}
              </button>

              <button
                onClick={() => shuffleQueue(currentQueue.id)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5"
                title="Embaralhar ordem da fila"
              >
                <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
                Embaralhar Fila
              </button>

              <button
                onClick={() => clearSentQueueItems(currentQueue.id)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5"
                title="Limpar itens já enviados"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                Limpar Enviados
              </button>

              {/* View Mode Toggle */}
              <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800">
                <button
                  onClick={() => setViewMode('tabela')}
                  className={`p-1.5 rounded-lg text-xs transition-colors ${
                    viewMode === 'tabela' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                  }`}
                  title="Visão Tabela"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded-lg text-xs transition-colors ${
                    viewMode === 'cards' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                  }`}
                  title="Visão Cards"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Key Queue Stats Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Pendentes na Fila</span>
              <span className="text-xl font-extrabold text-white">{pendingItems.length} ofertas</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Total Enviadas</span>
              <span className="text-xl font-extrabold text-emerald-400">{sentItems.length} ofertas</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Próximo Envio</span>
              <span className="text-sm font-bold text-indigo-300">{currentQueue.nextDeliveryTime || 'Pausada'}</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Último Envio</span>
              <span className="text-sm font-bold text-slate-300">{currentQueue.lastDeliveryTime || 'Nenhum envio'}</span>
            </div>
          </div>

          {/* Queue Items Listing */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span>Itens da Fila ({itemsInCurrentQueue.length})</span>
              <span className="text-xs font-normal text-slate-400">Arraste ou use os botões para reordenar prioridades</span>
            </h3>

            {itemsInCurrentQueue.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-800">
                Nenhum item agendado nesta fila no momento.
              </div>
            ) : viewMode === 'tabela' ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase font-semibold">
                    <tr>
                      <th className="p-3">Prioridade</th>
                      <th className="p-3">Produto & Cópia</th>
                      <th className="p-3">Marketplace</th>
                      <th className="p-3">Preço</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                    {itemsInCurrentQueue.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono font-bold text-indigo-400">
                          #{idx + 1}
                        </td>
                        <td className="p-3 max-w-xs">
                          <div className="flex items-center gap-3">
                            <img src={item.productImage} alt={item.productTitle} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                            <div>
                              <p className="font-semibold text-white line-clamp-1">{item.productTitle}</p>
                              <p className="text-[10px] text-slate-400 line-clamp-1">{item.copyText}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 font-semibold text-slate-300">{item.marketplace}</td>
                        <td className="p-3 font-bold text-emerald-400">R$ {item.price.toFixed(2)}</td>
                        <td className="p-3">
                          {item.status === 'pendente' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300">Pendente</span>}
                          {item.status === 'enviado' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">Enviado</span>}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {item.status === 'pendente' && (
                              <>
                                <button
                                  onClick={() => moveQueueItemPriority(item.id, 'up')}
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                                  title="Subir prioridade"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => moveQueueItemPriority(item.id, 'down')}
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                                  title="Descer prioridade"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => deleteQueueItem(item.id)}
                              className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300"
                              title="Remover item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {itemsInCurrentQueue.map((item, idx) => (
                  <div key={item.id} className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-indigo-400">Prioridade #{idx + 1}</span>
                      {item.status === 'pendente' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300">Pendente</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">Enviado</span>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <img src={item.productImage} alt={item.productTitle} className="w-14 h-14 rounded-xl object-cover" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-white line-clamp-1">{item.productTitle}</p>
                        <p className="text-xs font-bold text-emerald-400">R$ {item.price.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-400 line-clamp-2 mt-1">{item.copyText}</p>
                      </div>
                    </div>

                    <div className="flex justify-end gap-1 pt-2 border-t border-slate-800">
                      {item.status === 'pendente' && (
                        <>
                          <button onClick={() => moveQueueItemPriority(item.id, 'up')} className="p-1.5 rounded bg-slate-800 text-slate-300">
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => moveQueueItemPriority(item.id, 'down')} className="p-1.5 rounded bg-slate-800 text-slate-300">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button onClick={() => deleteQueueItem(item.id)} className="p-1.5 rounded bg-rose-500/20 text-rose-300">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create Queue */}
      {isCreateQueueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white">Criar Nova Fila de Postagem</h2>
              <button onClick={() => setIsCreateQueueModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQueue} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Nome da Fila:</label>
                <input
                  type="text"
                  required
                  value={newQueueData.name}
                  onChange={(e) => setNewQueueData({ ...newQueueData, name: e.target.value })}
                  placeholder="Ex: Fila WhatsApp - Ofertas Tech"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Plataforma:</label>
                  <select
                    value={newQueueData.platform}
                    onChange={(e) => setNewQueueData({ ...newQueueData, platform: e.target.value as ChannelPlatform })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Telegram">Telegram</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Discord">Discord</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Instagram">Instagram</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Intervalo de Envios (minutos):</label>
                  <input
                    type="number"
                    min="1"
                    value={newQueueData.intervalMinutes}
                    onChange={(e) => setNewQueueData({ ...newQueueData, intervalMinutes: parseInt(e.target.value) || 15 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Nome do Grupo ou Canal de Destino:</label>
                <input
                  type="text"
                  required
                  value={newQueueData.channelName}
                  onChange={(e) => setNewQueueData({ ...newQueueData, channelName: e.target.value })}
                  placeholder="Ex: @promos_tech_vip ou Grupo 01"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateQueueModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md"
                >
                  Criar Fila
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
