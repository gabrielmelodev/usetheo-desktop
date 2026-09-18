import { X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button, ErrorBanner, Input, Label, Panel } from "../ui";

import { createFolder, extractErrorMessage } from "../../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateFolderModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError("Digite um nome para a pasta.");
      return;
    }

    try {
      setLoading(true);

      setError(null);

      await createFolder({
        name: name.trim(),
      });

      setName("");

      onCreated();

      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="
      fixed
      inset-0
      z-50
      flex
      items-center
      justify-center
      bg-black/70
      px-4
      "
    >
      <div
        className="
        w-full
        max-w-md
        rounded-3xl
        bg-ink-soft
        p-6
        shadow-xl
        "
      >
        <div
          className="
          flex
          items-center
          justify-between
          "
        >
          <h2
            className="
            text-xl
            font-semibold
            text-text
            "
          >
            Nova pasta
          </h2>

          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="mt-6">
          <Panel>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && <ErrorBanner message={error} />}

              <div>
                <Label>Nome da pasta</Label>

                <Input
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="
                  Ex.: Direito Constitucional
                  "
                />
              </div>

              <div
                className="
                flex
                gap-3
                "
              >
                <Button type="submit" disabled={loading}>
                  {loading ? "Criando..." : "Criar pasta"}
                </Button>

                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancelar
                </Button>
              </div>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
