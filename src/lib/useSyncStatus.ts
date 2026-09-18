import { useEffect, useRef, useState } from "react";
import { http, getStoredTokens } from "./api";
import { pullFromServer } from "./sync";

type SyncStatus = "syncing" | "online" | "offline";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

/**
 * Mantém o banco local em dia com o servidor:
 *
 * 1. Tempo real: escuta /sync/watch (SSE). Assim que algo muda no
 *    backend (inclusive uma exclusão feita em outro dispositivo),
 *    puxa as mudanças na hora.
 * 2. Periódico: a cada 30s, se a versão mudou desde a última vez
 *    que conferimos, também puxa — isso cobre o caso do SSE cair
 *    silenciosamente ou não ser suportado.
 *
 * Em ambos os casos, quem realmente atualiza o IndexedDB é
 * `pullFromServer`, que por sua vez avisa o resto do app via o
 * evento "theo-sync-finished" (ver sync.ts). Sem isso, apagar algo
 * em outro dispositivo (ou aqui mesmo) não refletia em tempo real:
 * o app só buscava dados novos no login.
 */
export function useSyncStatus(enabled: boolean = true) {
  const [status, setStatus] = useState<SyncStatus>("syncing");
  const [version, setVersion] = useState<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastPulledVersionRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  async function pullIfNewVersion(newVersion: number) {
    if (lastPulledVersionRef.current === newVersion) {
      // Já buscamos essa versão — evita pulls duplicados quando o
      // polling e o SSE disparam quase ao mesmo tempo.
      return;
    }

    if (pullingRef.current) return;

    pullingRef.current = true;
    setStatus("syncing");

    try {
      await pullFromServer();
      lastPulledVersionRef.current = newVersion;
      setStatus("online");
    } catch (error) {
      console.error("Erro ao buscar mudanças do sync:", error);
      setStatus("offline");
    } finally {
      pullingRef.current = false;
    }
  }

  async function checkSync() {
    try {
      setStatus("syncing");
      const { data } = await http.get("/sync/version");
      setVersion(data.version);
      await pullIfNewVersion(data.version);
      setStatus("online");
    } catch (error) {
      console.error("Erro sync:", error);
      setStatus("offline");
    }
  }

  useEffect(() => {
    // Sem conta na nuvem (modo local) não há o que sincronizar em tempo
    // real. Reage a login/logout: quando `enabled` muda, o efeito é
    // refeito (a conexão anterior é fechada no cleanup abaixo).
    if (!enabled || !getStoredTokens()?.access_token) {
      setStatus("offline");
      return;
    }

    checkSync();

    // Fallback: mantém o polling de 30s rodando mesmo com SSE ativo, para
    // garantir que os dados continuam sendo recalculados/atualizados se o
    // navegador/ambiente não suportar EventSource ou se a conexão SSE cair
    // silenciosamente.
    const interval = setInterval(checkSync, 30000);

    // Real-time: além do polling, escuta o servidor via Server-Sent Events
    // (rota /sync/watch). Assim que algo muda no backend, a versão chega em
    // segundos em vez de esperar até 30s do polling — e agora isso também
    // dispara a busca das mudanças, não só a atualização do número.
    const token = getStoredTokens()?.access_token;
    if (token && typeof EventSource !== "undefined") {
      const url = `${API_URL}/sync/watch?access_token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener("version", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data);
          setVersion(payload.version);
          void pullIfNewVersion(payload.version);
        } catch {
          // ignora eventos malformados
        }
      });

      es.onerror = () => {
        // Não derruba o status pra "offline" aqui — o polling acima já cobre
        // isso. O browser tenta reconectar o EventSource sozinho.
      };
    }

    return () => {
      clearInterval(interval);
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [enabled]);

  return {
    status,
    version,
    refreshSync: checkSync,
  };
}
