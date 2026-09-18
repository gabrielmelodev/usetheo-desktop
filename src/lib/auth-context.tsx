import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "./api";
import { getStoredTokens } from "./api";
import { fullSync } from "./sync";
import { adoptAnonymousData, switchLocalAccount } from "./localdb";
import type { Requires2FAResponse, UserPublic } from "./types";

interface RegisterPayload {
  first_name: string;
  last_name: string;
  email: string;
  cpf: string;
  country: string;
  city: string;
  password: string;
}

interface AuthContextValue {
  /** Conta na nuvem, se o usuário estiver logado. `null` = modo local (offline), não "carregando". */
  user: UserPublic | null;
  /** Só fica `true` brevemente na inicialização, enquanto confere se há uma sessão salva. Nunca bloqueia o app: não há tela de login obrigatória. */
  loading: boolean;
  /** Retorna o desafio de 2FA se a conta tiver habilitado; caso contrário, já loga e sincroniza. */
  login: (email: string, password: string) => Promise<Requires2FAResponse | null>;
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<string>;
  logout: () => Promise<void>;
  /** Puxa manualmente os dados da nuvem para o dispositivo (mesma coisa que roda após o login). */
  sync: () => Promise<{ pulled: number; pushed: number; deleted: number }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// A cada quanto tempo tentamos um push+pull completo em segundo plano,
// além da sincronização em tempo real (SSE) que fica em useSyncStatus.
//
// Isso existe como rede de segurança para o lado do PUSH: uma exclusão
// feita aqui só fica na fila local (pending_deletes) até ser enviada ao
// servidor. Sem isso, ela só sairia daqui no próximo login ou clique em
// "Sincronizar agora" — e outros dispositivos não veriam a exclusão até
// lá. O pull em si já é coberto em tempo real pelo SSE/polling.
const BACKGROUND_SYNC_INTERVAL_MS = 2 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tokens = getStoredTokens();
    if (!tokens) {
      // Sem sessão salva: entra direto no modo local, sem esperar rede nenhuma.
      setLoading(false);
      return;
    }
    api
      .fetchMe()
      .then(async (u) => {
        await switchLocalAccount(u.id);
        setUser(u);
        // Sincronização em segundo plano; não atrasa a entrada no app.
        void fullSync().catch(() => {});
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // ============================================================
  // SINCRONIZAÇÃO PERIÓDICA EM SEGUNDO PLANO
  // ============================================================

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      void fullSync().catch(() => {});
    }, BACKGROUND_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    if ("requires_2fa" in res) {
      return res;
    }
    await adoptAnonymousData(res.user.id).catch(() => {});
    await switchLocalAccount(res.user.id);
    setUser(res.user);
    void fullSync().catch(() => {});
    return null;
  }, []);

  const verifyTwoFactor = useCallback(async (challengeToken: string, code: string) => {
    const res = await api.verifyTwoFactor(challengeToken, code);
    await adoptAnonymousData(res.user.id).catch(() => {});
    await switchLocalAccount(res.user.id);
    setUser(res.user);
    void fullSync().catch(() => {});
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const res = await api.register(payload);
    // Não loga automaticamente: o backend exige verificação de e-mail antes do login.
    return res.message;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    await switchLocalAccount(null);
    setUser(null);
    // Os dados locais NÃO são apagados: o app continua funcionando no modo local.
  }, []);

  const sync = useCallback(async () => {
    return fullSync();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyTwoFactor, register, logout, sync }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
