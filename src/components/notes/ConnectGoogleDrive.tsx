import { useState } from "react";
import { Cloud, Loader2 } from "lucide-react";
import { Button, Panel } from "../ui";
import * as bridge from "../../lib/notes/googleDriveBridge";

export function ConnectGoogleDrive({ onConnected }: { onConnected: () => void }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      await bridge.signIn();
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível conectar ao Google Drive.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center">
      <Panel className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent-bright">
          <Cloud size={28} strokeWidth={1.7} />
        </div>

        <h2 className="text-lg font-semibold text-text">Conecte o Theo Notes ao Google Drive</h2>

        <p className="mt-2 text-sm text-text-muted">
          Seus cadernos ficam salvos direto na sua conta do Google, numa pasta chamada{" "}
          <span className="text-text">"Theo Notes"</span>. Você pode abri-los em qualquer
          dispositivo, inclusive pelo próprio site do Google Drive.
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-again/10 px-3 py-2 text-xs text-again">{error}</p>
        )}

        <Button className="mt-5 w-full" onClick={() => void handleConnect()} disabled={connecting}>
          {connecting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Conectando...
            </>
          ) : (
            <>
              <Cloud size={16} />
              Conectar com o Google
            </>
          )}
        </Button>

        <p className="mt-3 text-[11px] text-text-faint">
          Uma janela do navegador vai abrir para você entrar com a sua conta do Google.
        </p>
      </Panel>
    </div>
  );
}
