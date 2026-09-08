import React, { useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import { CheckCircle2, Lock, Mail, User, X, Database } from "lucide-react";

interface WelcomeScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeScreenModal: React.FC<WelcomeScreenModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { addLog } = useApp();
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (authTab === "register") {
        await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
          },
        });
        setMessage({
          type: "success",
          text: "Conta criada e autenticada com sucesso! Entrando no painel...",
        });
        addLog("success", "Autenticação", `Novo usuário cadastrado: ${email}`);
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        await supabase.auth.signInWithPassword({
          email,
          password,
        });
        setMessage({ type: "success", text: "Login realizado com sucesso!" });
        addLog("success", "Autenticação", `Login realizado: ${email}`);
        setTimeout(() => {
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      setMessage({
        type: "error",
        text: "Não foi possível concluir a autenticação. Verifique os dados e tente novamente.",
      });
      addLog(
        "warning",
        "Autenticação",
        `Falha de autenticação: ${err?.message ?? "erro desconhecido"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F8FAFC]/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#E8E9ED] rounded-xl w-full max-w-4xl overflow-hidden shadow-2xl relative grid grid-cols-1 md:grid-cols-2">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-lg bg-transparent hover:bg-[#F4F4F6] text-[#6B6F7B] hover:text-[#0F172A] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left Side: Product Presentation */}
        <div className="p-8 bg-[#F8FAFC] border-r border-[#E8E9ED] flex flex-col justify-between space-y-8 relative overflow-hidden">
          <div className="space-y-6 relative z-10">
            <div>
              <BrandLogo markClassName="h-11 w-11" wordmarkClassName="text-xl" />
              <span className="ml-[3.35rem] mt-0.5 block text-[10px] text-[#6B6F7B] font-mono">
                Plataforma de Automação
              </span>
            </div>

            <p className="text-sm text-[#6B6F7B] leading-relaxed">
              Plataforma completa para disparos automáticos em canais de
              Telegram e WhatsApp e gerenciamento de ofertas.
            </p>

            {/* Capability Badges */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 text-sm text-[#6B6F7B]">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Postagem Programada em Filas</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-[#6B6F7B]">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Gerador de Conteúdo e Links</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-[#6B6F7B]">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Integração Segura e Banco de Dados</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[#FFFFFF] border border-[#E8E9ED] text-xs space-y-2 relative z-10">
            <div className="flex items-center gap-2 text-[#0F172A] font-medium text-xs">
              <Database className="w-3.5 h-3.5" /> Supabase Backend Conectado
            </div>
            <p className="text-[11px] text-[#6B6F7B]">
              Todas as informações salvas de forma segura em seu projeto.
            </p>
          </div>
        </div>

        {/* Right Side: Auth Form */}
        <div className="p-8 flex flex-col justify-center space-y-6">
          {/* Auth Tab Buttons */}
          <div className="flex items-center p-1 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED]">
            <button
              onClick={() => {
                setAuthTab("login");
                setMessage(null);
              }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                authTab === "login"
                  ? "bg-[#F4F4F6] text-[#0F172A] border border-[#E8E9ED]"
                  : "text-[#9CA3AF] hover:text-[#6B6F7B]"
              }`}
            >
              Entrar na Conta
            </button>
            <button
              onClick={() => {
                setAuthTab("register");
                setMessage(null);
              }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                authTab === "register"
                  ? "bg-[#F4F4F6] text-[#0F172A] border border-[#E8E9ED]"
                  : "text-[#9CA3AF] hover:text-[#6B6F7B]"
              }`}
            >
              Criar Conta
            </button>
          </div>

          {message && (
            <div
              className={`p-3.5 rounded-lg text-sm font-medium border ${
                message.type === "success"
                  ? "bg-[#F4F4F6] border-emerald-200 text-emerald-600"
                  : "bg-[#F4F4F6] border-red-200 text-[#EF4444]"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authTab === "register" && (
              <div>
                <label className="text-sm text-[#6B6F7B] block mb-1 font-medium">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#E8E9ED] rounded-lg pl-9 pr-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-sm text-[#6B6F7B] block mb-1 font-medium">
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#E8E9ED] rounded-lg pl-9 pr-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8]"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-[#6B6F7B] block mb-1 font-medium">
                Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#E8E9ED] rounded-lg pl-9 pr-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-2 rounded-lg bg-[#EDEDED] hover:bg-white text-[#0F172A] font-medium text-sm transition-colors flex justify-center items-center gap-2"
            >
              {loading
                ? "Autenticando..."
                : authTab === "login"
                  ? "Entrar"
                  : "Criar Minha Conta"}
            </button>
          </form>

          <div className="pt-2 text-center text-xs text-[#9CA3AF]">
            O painel exige uma sessão autenticada.
          </div>
        </div>
      </div>
    </div>
  );
};
