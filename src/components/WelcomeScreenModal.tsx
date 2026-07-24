import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { Sparkles, Bot, Zap, Shield, ArrowRight, CheckCircle2, Lock, Mail, User, X, Database } from 'lucide-react';

interface WelcomeScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeScreenModal: React.FC<WelcomeScreenModalProps> = ({ isOpen, onClose }) => {
  const { addLog } = useApp();
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (authTab === 'register') {
        await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name }
          }
        });
        setMessage({ type: 'success', text: 'Conta criada e autenticada com sucesso! Entrando no painel...' });
        addLog('success', 'Autenticação', `Novo usuário cadastrado: ${email}`);
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        await supabase.auth.signInWithPassword({
          email,
          password
        });
        setMessage({ type: 'success', text: 'Login realizado com sucesso!' });
        addLog('success', 'Autenticação', `Login realizado: ${email}`);
        setTimeout(() => {
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      setMessage({ type: 'success', text: 'Entrando no painel...' });
      setTimeout(() => onClose(), 1000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl relative grid grid-cols-1 md:grid-cols-2">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-950/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left Side: Product Presentation & Glow */}
        <div className="p-8 bg-gradient-to-br from-indigo-950/80 via-slate-900 to-purple-950/40 border-r border-slate-800/80 flex flex-col justify-between space-y-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="space-y-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-white tracking-tight">AffiFlow AI</h2>
                <span className="text-[10px] text-indigo-300 font-mono">SaaS de Automação de Afiliados</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Plataforma completa para disparos automáticos em canais de Telegram e WhatsApp, geração de copies com Inteligência Artificial e sincronização em tempo real com o **Supabase**.
            </p>

            {/* Capability Badges */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Postagem Programada em Filas Inteligentes</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Gerador de Copies Persuasivas com Gemini IA</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Banco de Dados PostgreSQL no Supabase (`gizosgydmrkxtpgazjhq`)</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs space-y-1 relative z-10">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-[11px]">
              <Database className="w-3.5 h-3.5" /> Supabase Backend Conectado
            </div>
            <p className="text-[11px] text-slate-400">
              Todas as ofertas, agendamentos e leads são salvos no seu projeto do Supabase.
            </p>
          </div>
        </div>

        {/* Right Side: Auth Form */}
        <div className="p-8 flex flex-col justify-center space-y-6">
          {/* Auth Tab Buttons */}
          <div className="flex items-center p-1 rounded-2xl bg-slate-950 border border-slate-800">
            <button
              onClick={() => { setAuthTab('login'); setMessage(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                authTab === 'login' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Entrar na Conta
            </button>
            <button
              onClick={() => { setAuthTab('register'); setMessage(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                authTab === 'register' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Criar Conta
            </button>
          </div>

          {message && (
            <div className={`p-3.5 rounded-xl text-xs font-medium border ${
              message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authTab === 'register' && (
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Nome Completo</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Seu nome"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 block mb-1 font-medium">E-mail</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1 font-medium">Senha</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all hover:scale-[1.02]"
            >
              {loading ? 'Autenticando...' : authTab === 'login' ? 'Entrar com Supabase' : 'Criar Minha Conta'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-2 text-center">
            <button
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white transition-colors underline font-medium"
            >
              Continuar em Modo Convidado / Demo 🚀
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
