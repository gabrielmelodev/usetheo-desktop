import { useEffect } from "react";
import { Clock3, LockKeyhole, Sparkles, X } from "lucide-react";
import { useAuth } from "../lib/auth-context";

interface SubscriptionModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SubscriptionModal({ open, onClose }: SubscriptionModalProps) {
  const { user, sync } = useAuth();

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const status = user?.subscription_status ?? "trial";
  const expiresAt = user?.subscription_expires_at ?? user?.trial_expires_at;

  const formattedDate = expiresAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(expiresAt))
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-modal-title"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-ink-soft shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-text-muted transition hover:bg-white/[0.08] hover:text-text"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>

        <div className="px-6 pb-6 pt-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
            {status === "active" ? <Sparkles size={22} /> : <LockKeyhole size={22} />}
          </div>

          <h2 id="subscription-modal-title" className="text-xl font-bold tracking-tight text-text">
            {status === "active" ? "Assinatura ativa" : "Assinatura do Theo"}
          </h2>

          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-text-muted">
            {status === "trial"
              ? "Seu acesso está no período gratuito de 7 dias."
              : status === "active"
                ? "Sua assinatura está ativa. O acesso é validado pelo servidor."
                : "O período de acesso terminou. Seus dados locais permanecem preservados."}
          </p>

          {formattedDate && (
            <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-text-muted">
              <Clock3 size={14} />
              {status === "trial" ? "Acesso até" : "Válido até"} {formattedDate}
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-left">
            <p className="text-sm font-medium text-text">Pagamento</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Nenhum provedor de pagamento foi conectado nesta versão. A camada de assinatura já
              está preparada para receber um checkout e webhooks sem colocar credenciais no app.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void sync().catch(() => {})}
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-text transition hover:bg-white/[0.06]"
          >
            <Sparkles size={15} />
            Atualizar status
          </button>
        </div>
      </div>
    </div>
  );
}
