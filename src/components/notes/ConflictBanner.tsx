import { AlertTriangle, X } from "lucide-react";
import type { SyncConflict } from "../../lib/notes/types";
import * as notesApi from "../../lib/notes/notesApi";

const reasonLabel: Record<SyncConflict["reason"], string> = {
  remote_changed: "foi editada em outro lugar ao mesmo tempo",
  remote_deleted: "foi apagada em outro lugar enquanto você editava",
  create_collision: "foi criada em dois lugares ao mesmo tempo",
};

export function ConflictBanner({
  conflicts,
  onDismiss,
  onOpenPage,
}: {
  conflicts: SyncConflict[];
  onDismiss: (id: string) => void;
  onOpenPage: (localId: string) => void;
}) {
  if (conflicts.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 flex flex-col gap-2">
      {conflicts.map((conflict) => (
        <div
          key={conflict.id}
          className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" strokeWidth={1.7} />

          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-amber-200">Conflito de sincronização</p>

            <p className="mt-0.5 text-text-muted">
              A página <span className="text-text">"{conflict.originalTitle}"</span>{" "}
              {reasonLabel[conflict.reason]}. Suas alterações foram salvas como uma cópia, para
              nada se perder.
            </p>

            <button
              type="button"
              onClick={() => onOpenPage(conflict.pageLocalId)}
              className="mt-1.5 text-xs font-medium text-amber-300 underline decoration-dotted underline-offset-2 hover:text-amber-200"
            >
              Abrir "{conflict.duplicateTitle}"
            </button>
          </div>

          <button
            type="button"
            onClick={() => void notesApi.dismissConflict(conflict.id).then(() => onDismiss(conflict.id))}
            className="shrink-0 rounded-md p-1 text-text-faint hover:bg-white/5 hover:text-text"
            aria-label="Dispensar aviso"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
