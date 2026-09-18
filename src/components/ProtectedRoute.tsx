import { Outlet } from "react-router-dom";

/**
 * O app funciona offline, sem login: as rotas gerais (Decks, Study,
 * Editais, Stats, Conta...) não exigem mais uma conta pra abrir — os
 * dados ficam salvos no próprio dispositivo (ver `lib/localApi.ts`).
 *
 * Login só é necessário para Comunidade e Admin, que dependem do
 * servidor — essas usam `RequireAccount` em vez desta aqui.
 */
export function ProtectedRoute() {
  return <Outlet />;
}
