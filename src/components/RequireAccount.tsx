import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { Spinner } from "./ui";

/**
 * Só usado nas rotas que realmente dependem do servidor + de uma conta
 * (Comunidade, Admin). O resto do app não passa por aqui: funciona
 * offline, sem login.
 */
export function RequireAccount() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-ink text-text-muted">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
