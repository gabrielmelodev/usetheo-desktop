import { X, Upload, FileArchive, Folder, CheckCircle2, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "../ui";
import type { Folder as FolderType } from "../../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  folders: FolderType[];
  onImported: (folderId: string | null) => void;
}

export default function ImportAnkiModal({ open, onClose, folders, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [folderId, setFolderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  function resetForm() {
    setImportFile(null);
    setFolderId("");
    setDragActive(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function closeModal() {
    if (loading) return;

    resetForm();
    onClose();
  }

  function selectFile(file?: File) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".apkg")) {
      alert("Selecione um arquivo do Anki no formato .apkg");
      return;
    }

    setImportFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();

    setDragActive(false);

    const file = e.dataTransfer.files?.[0];

    selectFile(file);
  }

  async function handleImportAnki() {
    if (!importFile) {
      alert("Selecione um arquivo .apkg");
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();

      formData.append("file", importFile);

      if (folderId) {
        formData.append("folder_id", folderId);
      }

      const stored = localStorage.getItem("theo.tokens");

      if (!stored) {
        throw new Error("Sessão não encontrada");
      }

      const tokens = JSON.parse(stored);

      if (!tokens.access_token) {
        throw new Error("Token inválido");
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL}/import/anki`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        let message = "Não foi possível importar o deck.";

        try {
          const data = await response.json();

          message = data.message ?? data.error ?? message;
        } catch {
          const text = await response.text();

          if (text) {
            message = text;
          }
        }

        if (response.status === 401) {
          localStorage.removeItem("theo.tokens");
          window.location.href = "/login";
          return;
        }

        throw new Error(message);
      }

      const importedFolder = folderId || null;

      resetForm();
      onClose();
      onImported(importedFolder);

      alert("Deck importado com sucesso!");
    } catch (err) {
      console.error("Erro importando Anki:", err);

      alert(err instanceof Error ? err.message : "Erro inesperado ao importar o deck.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="
        fixed inset-0 z-50
        flex items-center justify-center
        bg-accent/10
        
      
        p-4
        backdrop-blur-sm
      "
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          closeModal();
        }
      }}
    >
      <div
        className="
          w-full max-w-lg
          overflow-hidden
          rounded-2xl
          border-accent-dim
          border border-border
          bg-accent/5
          shadow-2xl
        "
      >
        {/* HEADER */}
        <div
          className="
            flex items-center justify-between
            border-b border-border
            border-accent-dim
            px-6 py-5
          "
        >
          <div className="flex items-center gap-3">
            <div
              className="
                flex h-11 w-11
                items-center justify-center
                rounded-xl
                bg-accent/10
                text-accent
              "
            >
              <FileArchive size={22} />
            </div>

            <div>
              <h2 className="text-base font-semibold text-text">Importar Anki</h2>

              <p className="mt-0.5 text-xs text-text-muted">
                Importe um deck diretamente para o Theo
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={closeModal}
            className="
              flex h-9 w-9
              items-center justify-center
              rounded-lg
              text-text-muted
              transition
              hover:bg-background
              hover:text-text
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            <X size={19} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="space-y-6 p-6">
          {/* DROPZONE */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text">Arquivo do Anki</label>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!loading) {
                  setDragActive(true);
                }
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => {
                if (!loading) {
                  inputRef.current?.click();
                }
              }}
              className={`
                group
                relative
                cursor-pointer
                rounded-2xl
                border-2
                border-dashed
                p-7
                text-center
                transition-all

                ${
                  dragActive
                    ? "border-accent bg-accent/10"
                    : importFile
                      ? "border-accent/40 bg-accent/5"
                      : "border-border hover:border-accent/50 hover:bg-background"
                }

                ${loading ? "cursor-not-allowed opacity-60" : ""}
              `}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".apkg"
                disabled={loading}
                className="hidden"
                onChange={(e) => {
                  selectFile(e.target.files?.[0]);
                }}
              />

              {importFile ? (
                <div className="flex flex-col items-center">
                  <div
                    className="
                      flex h-14 w-14
                      items-center justify-center
                      rounded-2xl
                      bg-accent/10
                      text-accent
                    "
                  >
                    <CheckCircle2 size={28} />
                  </div>

                  <p className="mt-4 max-w-full truncate px-4 text-sm font-medium text-accent">
                    {importFile.name}
                  </p>

                  <p className="mt-1 text-xs text-text-muted">
                    {(importFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>

                  <span
                    className="
                      mt-3
                      rounded-lg
                      bg-background
                      px-3 py-1.5
                      text-xs
                      text-text-muted
                    "
                  >
                    Clique para trocar o arquivo
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div
                    className="
                      flex h-14 w-14
                      items-center justify-center
                      rounded-2xl
                      bg-accent/10
                      text-accent
                      border-accent-dim
                      transition
                      group-hover:scale-105
                    "
                  >
                    <Upload size={27} />
                  </div>

                  <p className="mt-4 text-sm font-medium text-text">Arraste seu arquivo aqui</p>

                  <p className="mt-1 text-xs text-text-muted">ou clique para selecionar</p>

                  <span
                    className="
                      mt-4
                      rounded-lg
                      bg-background
                      px-3 py-1.5
                      text-[11px]
                      font-medium
                      text-text-muted
                    "
                  >
                    Apenas arquivos .apkg
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* FOLDER */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="anki-folder" className="text-sm font-medium text-text">
                Pasta de destino
              </label>

              <span className="text-xs text-accent">Opcional</span>
            </div>

            <div className="relative">
              <Folder
                size={18}
                className="
                  pointer-events-none
                  absolute
                  left-3
                  top-1/2
                  -translate-y-1/2
                  text-text-muted
                "
              />

              <select
                id="anki-folder"
                disabled={loading}
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="
                  w-full
                  appearance-none
                  rounded-xl
                  border border-border
                  bg-background
                  py-3
                  pl-10
                  pr-4
                  text-sm
                  text-text
                  outline-none
                  transition
                  focus:border-accent
                  focus:ring-2
                  bg-accent/5
                  border-accent-dim
                  focus:ring-accent/20
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                "
              >
                <option value="">
                  Sem pasta — Decks
                  {folders.length > 0 ? " (raiz)" : ""}
                </option>

                {folders.map((folder) => (
                  <option key={folder.id} className="bg-accent" value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>

            {folders.length === 0 && (
              <p className="mt-2 text-xs text-text-muted">
                Nenhuma pasta criada. O deck será importado na raiz.
              </p>
            )}
          </div>

          {/* SUMMARY */}
          {importFile && (
            <div
              className="
                rounded-xl
                border border-border
                bg-background
                p-4
              "
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-muted">Importação</p>

                  <p className="mt-1 text-sm font-medium text-text">{importFile.name}</p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-text-muted">Destino</p>

                  <p className="mt-1 text-sm font-medium text-text">
                    {folderId
                      ? (folders.find((folder) => folder.id === folderId)?.name ?? "Pasta")
                      : "Raiz"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* FOOTER */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              disabled={loading}
              onClick={closeModal}
              className="
                rounded-xl
                px-4 py-2.5
                text-sm
                font-medium
                text-text-muted
                transition
                hover:bg-background
                hover:text-text
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              Cancelar
            </button>

            <Button disabled={!importFile || loading} onClick={handleImportAnki}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={17} className="animate-spin" />
                  Importando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload size={17} />
                  Importar deck
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
