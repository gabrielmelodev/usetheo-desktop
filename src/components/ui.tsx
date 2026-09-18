import {
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-ink hover:bg-accent-bright active:bg-accent-dim disabled:bg-accent/40",
  secondary:
    "bg-ink-softer text-text border border-white/10 hover:border-white/20 hover:bg-ink-soft",
  ghost: "bg-transparent text-text-muted hover:text-text hover:bg-white/5",
  danger: "bg-again/90 text-white hover:bg-again",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium
        transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
        ${buttonVariants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-white/10 bg-ink-softer px-3.5 py-2.5 text-sm text-text
        placeholder:text-text-faint outline-none transition-colors
        focus:border-accent/60 focus:ring-1 focus:ring-accent/40 ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-white/10 bg-ink-softer px-3.5 py-2.5 text-sm text-text
        placeholder:text-text-faint outline-none transition-colors
        focus:border-accent/60 focus:ring-1 focus:ring-accent/40 ${className}`}
      {...props}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
      {children}
    </label>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-ink-soft/80 p-6 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "streak" | "again";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-white/5 text-text-muted",
  accent: "bg-accent/15 text-accent-bright",
  success: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
  streak: "bg-streak/15 text-streak",
  again: "bg-again/15 text-again",
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
      {icon && <div className="mb-4 text-text-faint">{icon}</div>}
      <h3 className="font-display text-lg text-text">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-again/30 bg-again/10 px-4 py-3 text-sm text-again">
      {message}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      role="status"
      aria-label="Carregando"
    />
  );
}

// =====================================================================
// TOOLTIP
// =====================================================================
//
// Uso: <Tooltip label="Atalho: Ctrl+K"><button>...</button></Tooltip>
//
// Por que centralizar isto: antes cada tela usava `title="..."` do HTML
// (que demora ~1s pra aparecer, não é estilizável e some em telas
// touch). Este componente dá o mesmo resultado visual em todo o app,
// com um pequeno atraso proposital para não piscar em passagens
// rápidas do mouse.

export function Tooltip({
  label,
  children,
  placement = "top",
}: {
  label: string;
  children: ReactNode;
  placement?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}

      {open && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-ink-soft px-2 py-1 text-[11px] font-medium text-text shadow-lg ${
            placement === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
          }`}
        >
          {label}
        </span>
      )}
    </div>
  );
}

// =====================================================================
// MODAL
// =====================================================================
//
// Padroniza o que antes era reimplementado em cada tela (backdrop,
// blur, animação de entrada, botão de fechar, largura). Fechar por
// clique fora e por Esc é opcional (`dismissible`, padrão true) — use
// `dismissible={false}` para fluxos que não devem ser perdidos por
// acidente (ex.: um cronômetro rodando, um formulário longo já
// preenchido).

export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  size = "md",
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  icon?: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissible?: boolean;
  children: ReactNode;
}) {
  if (!open) return null;

  const widths: Record<string, string> = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${widths[size]} overflow-hidden rounded-3xl border border-white/10 bg-ink-soft shadow-2xl shadow-black/30`}
      >
        {(title || dismissible) && (
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              {icon && (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                  {icon}
                </div>
              )}

              <div className="min-w-0">
                {title && (
                  <h2 className="truncate font-display text-lg font-semibold text-text">{title}</h2>
                )}
                {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
              </div>
            </div>

            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-text-muted transition hover:border-white/20 hover:bg-white/[0.06] hover:text-text"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
