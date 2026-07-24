import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  User,
  Shield,
  Key,
  CheckCircle2,
  Lock,
  Mail,
  Smartphone,
  Sparkles,
  Award,
  Save,
  Check,
  Zap,
  Globe,
  Camera,
  LogOut
} from 'lucide-react';

interface ProfileViewProps {
  onLogout: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onLogout }) => {
  const { addLog } = useApp();

  const [fullName, setFullName] = useState(() => {
    return localStorage.getItem('user_profile_name') || 'Daniel Guimarães';
  });
  const [email, setEmail] = useState(() => {
    return localStorage.getItem('user_profile_email') || 'daniel@afiliadoapp.com';
  });
  const [roleTitle, setRoleTitle] = useState(() => {
    return localStorage.getItem('user_profile_role') || 'Afiliado Master & Growth Hacker';
  });
  const [phone, setPhone] = useState(() => {
    return localStorage.getItem('user_profile_phone') || '(11) 99887-6655';
  });

  // Profile Image Url State
  const [avatarUrl, setAvatarUrl] = useState(() => {
    return localStorage.getItem('user_profile_avatar') || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('user_profile_name', fullName);
    localStorage.setItem('user_profile_email', email);
    localStorage.setItem('user_profile_role', roleTitle);
    localStorage.setItem('user_profile_phone', phone);
    localStorage.setItem('user_profile_avatar', avatarUrl);
    
    setSavedSuccess(true);
    addLog('success', 'Perfil', 'Alterações do perfil salvas com sucesso.');
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleLogoutAction = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Local session reset:', e);
    }
    // Clear user keys and log out
    localStorage.removeItem('user_profile_name');
    localStorage.removeItem('user_profile_email');
    localStorage.removeItem('user_profile_avatar');
    addLog('info', 'Autenticação', 'Usuário deslogou da conta.');
    onLogout();
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Top Banner / Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-900/60 via-purple-900/40 to-slate-900 border border-slate-800 p-8">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
          {/* Avatar Display */}
          <div className="relative group shrink-0">
            <img
              src={avatarUrl}
              alt="Perfil"
              className="w-24 h-24 rounded-3xl object-cover border-2 border-indigo-500/40 shadow-2xl"
              onError={() => {
                setAvatarUrl('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80');
              }}
            />
            <div className="absolute inset-0 bg-slate-950/60 rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </div>

          <div className="text-center sm:text-left space-y-1.5 flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">{fullName}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                <Award className="w-3 h-3 text-amber-400" />
                Plano Pro Unlimited
              </span>
            </div>
            <p className="text-xs text-indigo-300 font-medium">{roleTitle}</p>
            <p className="text-[11px] text-slate-400 font-mono">{email} • Membro desde Julho/2026</p>
          </div>

          {/* Logout Button in header */}
          <button
            onClick={handleLogoutAction}
            className="px-4 py-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center gap-2 transition-all shadow-lg"
          >
            <LogOut className="w-4 h-4" />
            Sair da Conta
          </button>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSaveProfile} className="max-w-3xl space-y-6">
        {/* Personal Info Form */}
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800/80 space-y-5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-400" />
            Dados Pessoais & Configuração de Perfil
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-slate-400 block mb-1.5 font-medium">Nome Completo</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1.5 font-medium">E-mail de Acesso</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1.5 font-medium">Cargo / Função</label>
              <input
                type="text"
                value={roleTitle}
                onChange={e => setRoleTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1.5 font-medium">Telefone / WhatsApp</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-slate-400 block mb-1.5 font-medium">URL da sua Foto de Perfil</label>
              <input
                type="text"
                value={avatarUrl}
                onChange={e => setAvatarUrl(e.target.value)}
                placeholder="Cole o link da sua foto (ex: link do Instagram, Unsplash ou qualquer URL)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="submit"
              className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all hover:scale-105"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
              {savedSuccess ? 'Salvo com Sucesso!' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
