import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const CONSENT_KEY = "promofy_consent_v1";

type Consent = {
  id: string;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  recordedAt: string;
  synced?: boolean;
};

function readConsent(): Consent | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null") as Consent | null;
    return parsed?.necessary === true ? parsed : null;
  } catch {
    return null;
  }
}

function loadTrackers(consent: Consent): void {
  if (consent.analytics) {
    const id = import.meta.env.VITE_GOOGLE_ANALYTICS_ID?.trim();
    if (id && !document.querySelector(`script[data-promofy-ga="${id}"]`)) {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      script.dataset.promofyGa = id;
      document.head.appendChild(script);
      const win = window as typeof window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
      win.dataLayer = win.dataLayer ?? [];
      win.gtag = (...args: unknown[]) => { win.dataLayer!.push(args); };
      win.gtag("js", new Date());
      win.gtag("config", id, { anonymize_ip: true });
    }
  }

  if (consent.marketing) {
    const id = import.meta.env.VITE_META_PIXEL_ID?.trim();
    type FacebookPixel = ((...args: unknown[]) => void) & { queue: unknown[][] };
    const win = window as typeof window & { fbq?: FacebookPixel };
    if (id && !win.fbq) {
      const fbq = Object.assign(
        (...args: unknown[]) => { fbq.queue.push(args); },
        { queue: [] as unknown[][] },
      ) as FacebookPixel;
      win.fbq = fbq;
      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/pt_BR/fbevents.js";
      script.dataset.promofyMetaPixel = id;
      document.head.appendChild(script);
      fbq("init", id);
      fbq("track", "PageView");
    }
  }
}

async function syncConsent(consent: Consent): Promise<void> {
  if (consent.synced) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await supabase.from("consent_events").insert({
    user_id: data.user.id,
    client_event_id: consent.id,
    event_type: "COOKIE_PREFERENCES",
    document_versions: { cookies: "2026-08-31", privacy: "2026-08-31" },
    preferences: { necessary: true, analytics: consent.analytics, marketing: consent.marketing },
  });
  if (!error || error.code === "23505") {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ ...consent, synced: true }));
  }
}

export function ConsentBanner() {
  const [consent, setConsent] = useState<Consent | null>(() => readConsent());
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!consent) return;
    loadTrackers(consent);
    void syncConsent(consent);
    const { data } = supabase.auth.onAuthStateChange(() => { void syncConsent(readConsent() ?? consent); });
    return () => data.subscription.unsubscribe();
  }, [consent]);

  function save(next: Pick<Consent, "analytics" | "marketing">) {
    const value: Consent = {
      id: crypto.randomUUID(),
      necessary: true,
      analytics: next.analytics,
      marketing: next.marketing,
      recordedAt: new Date().toISOString(),
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
    setConsent(value);
  }

  if (consent) return null;
  return (
    <aside className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-xl border border-[#D4D4D8] bg-[#FFFFFF] p-4 text-sm text-[#D4D4D8] shadow-2xl" role="dialog" aria-label="Preferências de cookies">
      <p className="font-medium">Sua privacidade no AfiliHub</p>
      <p className="mt-1 text-xs leading-relaxed text-[#6B6F7B]">Usamos armazenamento necessário para login e segurança. Analytics e publicidade são opcionais e só carregam com sua autorização. <a href="/privacidade.html" className="underline">Saiba mais</a>.</p>
      {customizing && <div className="mt-3 flex flex-wrap gap-4 text-xs"><label><input type="checkbox" checked disabled className="mr-1" />Necessários</label><label><input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} className="mr-1" />Analytics</label><label><input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} className="mr-1" />Publicidade</label></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => save({ analytics: false, marketing: false })} className="rounded-lg border border-[#6B6F7B] px-3 py-2 text-xs">Recusar opcionais</button>
        {customizing ? <button onClick={() => save({ analytics, marketing })} className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-black">Salvar preferências</button> : <button onClick={() => setCustomizing(true)} className="rounded-lg border border-[#6B6F7B] px-3 py-2 text-xs">Personalizar</button>}
        <button onClick={() => save({ analytics: true, marketing: true })} className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-black">Aceitar todos</button>
      </div>
    </aside>
  );
}
