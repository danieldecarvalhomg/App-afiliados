import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import { BrandLogo } from "../components/BrandLogo";
import {
  Sparkles,
  Shield,
  Lock,
  Mail,
  User,
  ShoppingBag,
  Send,
} from "lucide-react";

interface WelcomeAuthViewProps {
  onLoginSuccess: () => void;
}

export const WelcomeAuthView: React.FC<WelcomeAuthViewProps> = ({
  onLoginSuccess,
}) => {
  const { addLog } = useApp();
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [authMode, setAuthMode] = useState<
    "login" | "register" | "forgot" | "reset"
  >(() =>
    new URLSearchParams(window.location.search).get("auth") === "reset"
      ? "reset"
      : "login",
  );

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setAuthMode("reset");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (authMode === "forgot") {
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/?auth=reset`,
        });
        setMessage({
          type: "success",
          text: "Se existir uma conta vinculada a este email, enviaremos as instruções.",
        });
      } else if (authMode === "reset") {
        if (password.length < 8) throw new Error("PASSWORD_TOO_SHORT");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        await supabase.from("security_events").insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          event_type: "PASSWORD_RESET",
          metadata: { source: "password_recovery" },
        });
        setMessage({
          type: "success",
          text: "Senha atualizada. Faça login novamente.",
        });
        await supabase.auth.signOut();
        setAuthMode("login");
      } else if (authTab === "register") {
        if (!acceptedLegal) throw new Error("LEGAL_ACCEPTANCE_REQUIRED");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              accepted_terms: true,
              terms_version: "2026-08-31",
              privacy_version: "2026-08-31",
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) {
          setMessage({
            type: "error",
            text: error.message?.toLowerCase().includes("password")
              ? "Escolha uma senha mais forte (mínimo de 8 caracteres)."
              : "Não foi possível criar a conta. Verifique os dados e tente novamente.",
          });
          addLog("error", "Autenticação", `Erro no cadastro: ${error.message}`);
        } else {
          await supabase.from("security_events").insert({
            user_id: data.user?.id,
            event_type: "LOGIN_SUCCESS",
            metadata: { source: "password" },
          });
          setMessage({
            type: "success",
            text: data.session
              ? "Conta criada com sucesso! Redirecionando..."
              : "Conta criada. Confirme seu email para continuar.",
          });
          addLog(
            "success",
            "Autenticação",
            `Usuário cadastrado no Supabase: ${email}`,
          );
          if (data.session) setTimeout(() => onLoginSuccess(), 1000);
        }
      } else {
        const checkResponse = await fetch("/api/auth/login-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (checkResponse.status === 429) {
          const payload = (await checkResponse.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(payload?.error?.message ?? "Aguarde alguns segundos antes de tentar novamente.");
        }
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          void fetch("/api/auth/login-result", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, success: false }) }).catch(() => undefined);
          console.warn("Sign In error:", error.message);
          setMessage({
            type: "error",
            text: "Email ou senha inválidos. Se sua conta é nova, confirme o email antes de entrar.",
          });
          addLog(
            "warning",
            "Autenticação",
            `Tentativa incorreta de login para: ${email}`,
          );
        } else {
          void fetch("/api/auth/login-result", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, success: true }) }).catch(() => undefined);
          setMessage({
            type: "success",
            text: "Acesso realizado com sucesso!",
          });
          addLog(
            "success",
            "Autenticação",
            `Login confirmado no Supabase: ${email}`,
          );
          setTimeout(() => onLoginSuccess(), 1000);
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setMessage({
        type: "error",
        text:
          err?.message === "PASSWORD_TOO_SHORT"
            ? "Escolha uma senha mais forte (mínimo de 8 caracteres)."
            : err?.message === "LEGAL_ACCEPTANCE_REQUIRED"
              ? "Aceite os Termos de Uso e a Política de Privacidade para criar a conta."
            : "Não foi possível concluir a autenticação. Tente novamente mais tarde.",
      });
    } finally {
      setLoading(false);
    }
  };

  const resendConfirmation = async () => {
    const value = email.trim().toLowerCase();
    if (!value) {
      setMessage({ type: "error", text: "Informe seu email para reenviar a confirmação." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: value });
      if (error) throw error;
      setMessage({ type: "success", text: "Se a conta exigir confirmação, um novo email foi solicitado." });
    } catch {
      setMessage({ type: "success", text: "Se a conta exigir confirmação, um novo email foi solicitado." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="brand-ambient min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col justify-between relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-32 h-72 w-72 rounded-full bg-[#FF2D7D]/8 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-12 h-80 w-80 rounded-full bg-[#FFC629]/10 blur-3xl" />
      {/* Top Navbar */}
      <header className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <BrandLogo markClassName="h-11 w-11" wordmarkClassName="text-2xl" />

        <span className="rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs text-[#6B6F7B] shadow-sm backdrop-blur">
          Login seguro via Supabase
        </span>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-6xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Side: Copy & Highlights */}
        <div className="lg:col-span-7 space-y-9">
          <div className="space-y-5">
            <span className="inline-flex rounded-full border border-[#FF2D7D]/15 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF2D7D] shadow-sm backdrop-blur">
              O hub de quem vive de afiliação
            </span>
            <h1 className="max-w-2xl text-4xl sm:text-6xl font-black text-[#0F172A] tracking-[-0.04em] leading-[1.03]">
              Mais conexões.<br />
              <span className="text-brand-gradient">Mais possibilidades.</span>
            </h1>
            <p className="text-sm sm:text-base text-[#6B6F7B] max-w-xl leading-relaxed">
              Conecte ofertas, conteúdo, automações e canais em um só lugar.
              A AfiliHub ajuda você a divulgar com inteligência e crescer com leveza.
            </p>
          </div>

          {/* Cards Feature Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="brand-ring p-4 rounded-2xl bg-white/80 border border-white space-y-2 backdrop-blur">
              <div className="w-9 h-9 rounded-xl bg-[#FF2D7D]/10 text-[#FF2D7D] flex items-center justify-center">
                <Send className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-medium text-[#0F172A]">
                Filas de Disparo Programadas
              </h3>
              <p className="text-xs text-[#9CA3AF]">
                Postagens contínuas nos melhores horários de engajamento.
              </p>
            </div>

            <div className="brand-ring p-4 rounded-2xl bg-white/80 border border-white space-y-2 backdrop-blur">
              <div className="w-9 h-9 rounded-xl bg-[#FF6B6B]/10 text-[#FF6B6B] flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-medium text-[#0F172A]">
                Gerador de Textos
              </h3>
              <p className="text-xs text-[#9CA3AF]">
                Modelos de texto persuasivos prontos para conversão imediata.
              </p>
            </div>

            <div className="brand-ring p-4 rounded-2xl bg-white/80 border border-white space-y-2 backdrop-blur">
              <div className="w-9 h-9 rounded-xl bg-[#FF9F43]/12 text-[#FF9F43] flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-medium text-[#0F172A]">
                Extrator Automático de Links
              </h3>
              <p className="text-xs text-[#9CA3AF]">
                Injeção automática da sua tag de afiliado Amazon, ML e Shopee.
              </p>
            </div>

            <div className="brand-ring p-4 rounded-2xl bg-white/80 border border-white space-y-2 backdrop-blur">
              <div className="w-9 h-9 rounded-xl bg-[#FFC629]/15 text-[#D99100] flex items-center justify-center">
                <Shield className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-medium text-[#0F172A]">
                Armazenamento Seguro
              </h3>
              <p className="text-xs text-[#9CA3AF]">
                Seus dados e ofertas salvos em tempo real com alta segurança.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Auth Card (Login & Sign Up) */}
        <div className="lg:col-span-5">
          <div className="brand-ring p-8 rounded-3xl bg-white/90 border border-white space-y-6 backdrop-blur-xl">
            {/* Auth Tab Buttons */}
            <div className="flex items-center gap-2 border-b border-[#E8E9ED] pb-4">
              <button
                onClick={() => {
                  setAuthTab("login");
                  setAuthMode("login");
                  setMessage(null);
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authTab === "login"
                    ? "bg-[#F4F4F6] text-[#0F172A] border border-[#E8E9ED]"
                    : "text-[#9CA3AF] hover:text-[#6B6F7B] border border-transparent"
                }`}
              >
                Entrar na Conta
              </button>

              <button
                onClick={() => {
                  setAuthTab("register");
                  setAuthMode("register");
                  setMessage(null);
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authTab === "register"
                    ? "bg-[#F4F4F6] text-[#0F172A] border border-[#E8E9ED]"
                    : "text-[#9CA3AF] hover:text-[#6B6F7B] border border-transparent"
                }`}
              >
                Criar Conta
              </button>
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#0F172A]">
                {authMode === "forgot"
                  ? "Recuperar acesso"
                  : authMode === "reset"
                    ? "Definir nova senha"
                    : authTab === "login"
                      ? "Acessar sua Conta"
                      : "Criar Nova Conta"}
              </h2>
              <p className="text-sm text-[#6B6F7B]">
                {authMode === "forgot"
                  ? "Se existir uma conta, enviaremos instruções para o email informado."
                  : authMode === "reset"
                    ? "Escolha uma nova senha para sua conta."
                    : authTab === "login"
                      ? "Digite suas credenciais para acessar o painel principal."
                      : "Preencha os campos abaixo para cadastrar seu perfil."}
              </p>
            </div>

            {message && (
              <div
                className={`p-3 rounded-lg text-sm font-medium border ${
                  message.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                    : "bg-red-50 border-red-200 text-[#EF4444]"
                }`}
              >
                {message.text}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authTab === "register" && authMode === "register" && (
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
                      className="w-full bg-[#F8FAFC] border border-[#E8E9ED] rounded-lg pl-10 pr-4 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8] transition-colors"
                    />
                  </div>
                </div>
              )}

              {authMode !== "reset" && (
                <div>
                  <label className="text-sm text-[#6B6F7B] block mb-1 font-medium">
                    E-mail de Acesso
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      placeholder="seuemail@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#F8FAFC] border border-[#E8E9ED] rounded-lg pl-10 pr-4 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8] transition-colors"
                    />
                  </div>
                </div>
              )}

              {authMode !== "forgot" && (
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
                      className="w-full bg-[#F8FAFC] border border-[#E8E9ED] rounded-lg pl-10 pr-4 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8] transition-colors"
                    />
                  </div>
                </div>
              )}

              {authTab === "register" && authMode === "register" && (
                <label className="flex items-start gap-2 text-xs leading-relaxed text-[#6B6F7B]">
                  <input
                    type="checkbox"
                    required
                    checked={acceptedLegal}
                    onChange={(event) => setAcceptedLegal(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-zinc-200"
                  />
                  <span>
                    Li e aceito os <a className="underline hover:text-[#0F172A]" href="/termos.html" target="_blank" rel="noreferrer">Termos de Uso</a> e a <a className="underline hover:text-[#0F172A]" href="/privacidade.html" target="_blank" rel="noreferrer">Política de Privacidade</a> (versão 31/08/2026).
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-brand-gradient hover:brightness-[1.03] text-white font-bold text-sm shadow-[0_10px_24px_rgba(255,45,125,0.2)] transition-all mt-2 disabled:opacity-50"
              >
                {loading
                  ? "Processando..."
                  : authMode === "forgot"
                    ? "Enviar instruções"
                    : authMode === "reset"
                      ? "Atualizar senha"
                      : authTab === "login"
                        ? "Entrar no Painel"
                        : "Criar Minha Conta"}
              </button>
            </form>
            {authMode === "login" && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("forgot");
                    setMessage(null);
                  }}
                  className="w-full text-xs text-[#6B6F7B] hover:text-[#0F172A]"
                >
                  Esqueci minha senha
                </button>
                <button
                  type="button"
                  onClick={() => void resendConfirmation()}
                  disabled={loading}
                  className="w-full text-xs text-[#9CA3AF] hover:text-[#6B6F7B] disabled:opacity-50"
                >
                  Reenviar confirmação de email
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#E8E9ED] py-6 text-center text-sm text-[#9CA3AF]">
        <p>AfiliHub © 2026 — Mais conexões. Mais possibilidades.</p>
        <nav className="mt-2 flex flex-wrap justify-center gap-4 text-xs" aria-label="Documentos legais">
          <a className="hover:text-[#0F172A]" href="/termos.html">Termos de Uso</a>
          <a className="hover:text-[#0F172A]" href="/privacidade.html">Privacidade</a>
          <a className="hover:text-[#0F172A]" href="/reembolso.html">Reembolso</a>
        </nav>
      </footer>
    </div>
  );
};
