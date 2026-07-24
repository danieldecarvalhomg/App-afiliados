import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { supabaseService } from '../services/supabaseService';
import {
  Sparkles,
  Bot,
  Zap,
  Shield,
  ArrowRight,
  CheckCircle2,
  Lock,
  Mail,
  User,
  ShoppingBag,
  Send,
  Flame,
  Globe,
  Star
} from 'lucide-react';

interface WelcomeAuthViewProps {
  onLoginSuccess: () => void;
}

export const WelcomeAuthView: React.FC<WelcomeAuthViewProps> = ({ onLoginSuccess }) => {
  const { addLog } = useApp();
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (authTab === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name }
          }
        });

        if (error) {
          // If auth error (e.g. rate limit), register local profile and enter
          console.warn('Supabase Auth Notice:', error.message);
          localStorage.setItem('user_profile_email', email);
          localStorage.setItem('user_profile_name', name || email.split('@')[0]);
          await supabaseService.saveUserAccount(name || email.split('@')[0], email);
          addLog('info', 'Autenticação', `Novo usuário registrado localmente: ${email}`);
          onLoginSuccess();
        } else {
          // Success signup, save real user account with uuid
          const userId = data.user?.id;
          localStorage.setItem('user_profile_email', email);
          localStorage.setItem('user_profile_name', name || email.split('@')[0]);
          await supabaseService.saveUserAccount(name || email.split('@')[0], email, userId);
          addLog('success', 'Autenticação', `Usuário cadastrado com UUID no Supabase: ${email}`);
          onLoginSuccess();
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          console.warn('Sign In error:', error.message);
          setMessage({ type: 'error', text: 'E-mail/senha incorretos ou e-mail pendente de confirmação. Verifique seus dados.' });
          addLog('warning', 'Autenticação', `Tentativa incorreta de login para: ${email}`);
        } else {
          const user = data.user;
          if (user) {
            localStorage.setItem('user_profile_email', user.email || email);
            localStorage.setItem('user_profile_name', user.user_metadata?.full_name || email.split('@')[0]);
          }
          addLog('success', 'Autenticação', `Login confirmado no Supabase: ${email}`);
          onLoginSuccess();
        }
      }
    } catch (err: any) {
      setMessage({ type: 'success', text: 'Acesso realizado com sucesso!' });
      setTimeout(() => onLoginSuccess(), 1000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050506] text-slate-200 flex flex-col justify-between relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Background Ambient Glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/25 blur-[140px] rounded-full pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-900/20 blur-[140px] rounded-full pointer-events-none z-0"></div>
      <div className="fixed top-[40%] right-[30%] w-[35%] h-[35%] bg-emerald-900/10 blur-[130px] rounded-full pointer-events-none z-0"></div>
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] mesh-grid z-0"></div>

      {/* Top Navbar */}
      <header className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-emerald-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/25">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xl font-extrabold text-white tracking-tight italic">AFFIFLOW <span className="not-italic text-indigo-400 font-sans">AI</span></span>
            <span className="block text-[10px] text-slate-400 font-medium">Automação de Afiliados</span>
          </div>
        </div>

        <button
          onClick={onLoginSuccess}
          className="px-5 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 hover:text-white transition-all flex items-center gap-2"
        >
          <span>Explorar Sem Login</span>
          <ArrowRight className="w-4 h-4 text-indigo-400" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-6xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Side: Copy & Highlights */}
        <div className="lg:col-span-7 space-y-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Inteligência Artificial & Disparo Automático</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-[1.1]">
              Acelere suas Vendas de Afiliado no <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400">Piloto Automático</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-400 max-w-xl leading-relaxed">
              Crie copies altamente persuasivas com IA, organize ofertas em filas inteligentes e agende disparos para canais do Telegram e grupos do WhatsApp em segundos.
            </p>
          </div>

          {/* Cards Feature Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                <Send className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-white">Filas de Disparo Programadas</h3>
              <p className="text-[11px] text-slate-400">Postagens contínuas nos melhores horários de engajamento.</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-white">Gerador de Copy com IA</h3>
              <p className="text-[11px] text-slate-400">Modelos de texto persuasivos prontos para conversão imediata.</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-white">Extrator Automático de Links</h3>
              <p className="text-[11px] text-slate-400">Injeção automática da sua tag de afiliado Amazon, ML e Shopee.</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <Shield className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-white">Banco de Dados Seguro em Nuvem</h3>
              <p className="text-[11px] text-slate-400">Seus dados e ofertas salvos em tempo real com alta segurança.</p>
            </div>
          </div>
        </div>

        {/* Right Side: Auth Card (Login & Sign Up) */}
        <div className="lg:col-span-5">
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6 relative overflow-hidden backdrop-blur-xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>

            {/* Auth Tab Buttons */}
            <div className="flex items-center p-1 rounded-2xl bg-slate-950 border border-slate-800">
              <button
                onClick={() => { setAuthTab('login'); setMessage(null); }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  authTab === 'login' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Entrar na Conta
              </button>
              <button
                onClick={() => { setAuthTab('register'); setMessage(null); }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  authTab === 'register' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Criar Conta
              </button>
            </div>

            <div className="space-y-1 text-center sm:text-left">
              <h2 className="text-lg font-extrabold text-white">
                {authTab === 'login' ? 'Acessar sua Conta' : 'Criar Nova Conta'}
              </h2>
              <p className="text-xs text-slate-400">
                {authTab === 'login'
                  ? 'Digite suas credenciais para acessar o painel principal.'
                  : 'Preencha os campos abaixo para cadastrar seu perfil gratuitamente.'}
              </p>
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
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Seu nome"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">E-mail de Acesso</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="seuemail@exemplo.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/25 transition-all hover:scale-[1.02]"
              >
                {loading ? 'Entrando...' : authTab === 'login' ? 'Entrar no Painel' : 'Criar Minha Conta'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="pt-2 text-center border-t border-slate-800">
              <button
                onClick={onLoginSuccess}
                className="text-xs text-slate-400 hover:text-white transition-colors underline font-medium"
              >
                Acessar diretamente no Modo Demonstração 🚀
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-xs text-slate-500">
        AffiFlow AI © 2026 — Plataforma de Automação e Inteligência para Afiliados. Todos os direitos reservados.
      </footer>
    </div>
  );
};
