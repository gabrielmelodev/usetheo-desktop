import type { ReactNode } from "react";
import { LockKeyhole, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "../lib/auth-context";

export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { user, sync } = useAuth();

  // Sem conta: Theo continua utilizável localmente.
  // Com conta: o servidor é a autoridade do acesso; o valor abaixo é
  // apenas o último estado validado e não substitui a proteção do backend.
  if (!user || user.access_allowed !== false) {
    return <>{children}</>;
  }

  const status = user.subscription_status ?? "expired";
  const message =
    status === "trial"
      ? "Seu período gratuito terminou."
      : "Sua assinatura não está ativa.";

  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.035] p-7 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent-bright">
          <LockKeyhole size={24} />
        </div>

        <h1 className="text-xl font-semibold text-text">{message}</h1>

        <p className="mt-3 text-sm leading-6 text-text-muted">
          Para continuar utilizando os recursos protegidos do Theo, ative sua assinatura.
          Seus dados locais não são apagados.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => void sync().catch(() => {})}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-text transition hover:bg-white/[0.06]"
          >
            <RefreshCw size={15} />
            Verificar novamente
          </button>

          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("theo-open-subscription"));
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            <Sparkles size={15} />
            Assinar agora
          </button>
        </div>

        <p className="mt-5 text-[11px] text-text-muted">
          SQLite local preservado • sincronização independente • sem exclusão de dados
        </p>
      </div>
    </div>
  );
}
