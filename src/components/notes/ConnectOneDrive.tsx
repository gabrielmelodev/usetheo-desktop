import { useState } from "react";
import { Cloud, Loader2 } from "lucide-react";
import { Button, Panel } from "../ui";
import * as bridge from "../../lib/notes/oneDriveBridge";

export function ConnectOneDrive({ onConnected }: { onConnected: () => void }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      await bridge.signIn();
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível conectar ao OneDrive.");
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

        <h2 className="text-lg font-semibold text-text">Conecte o Theo Notes ao OneDrive</h2>

        <p className="mt-2 text-sm text-text-muted">
          Seus cadernos ficam salvos direto na sua conta da Microsoft, numa pasta chamada{" "}
          <span className="text-text">"Theo Notes"</span>. Você pode abri-los em qualquer
          dispositivo, inclusive pelo próprio site do OneDrive.
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
              Conectar com a Microsoft
            </>
          )}
        </Button>

        <p className="mt-3 text-[11px] text-text-faint">
          Uma janela do navegador vai abrir para você entrar com a sua conta Microsoft.
        </p>
      </Panel>
    </div>
  );
}
