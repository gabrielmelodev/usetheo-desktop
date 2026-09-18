# Theo — Frontend Desktop (Electron + Vite + React + TailwindCSS)

Cliente desktop do **Theo Backend**: decks, cartas, revisão SRS, estatísticas e
comunidade, em uma janela nativa via Electron.

> ⚠️ **Nota de transparência**: este código foi escrito em um sandbox sem Node.js/npm
> instalado e sem acesso à internet — não foi possível rodar `npm install` / `npm run dev`
> aqui para validar de ponta a ponta. Revisei cada arquivo manualmente (imports, tipos,
> contratos com o backend), mas **rode `npm install` localmente e me avise se aparecer
> algum erro** — corrijo rápido.

---

## 1. Stack

- **Vite** — build e dev server
- **React 18 + TypeScript**
- **TailwindCSS** — design system próprio (tokens em `tailwind.config.js`)
- **Electron** — empacotamento desktop (Windows/macOS/Linux)
- **React Router** (`HashRouter`, compatível com `file://` no build do Electron)
- **Axios** — cliente HTTP com refresh automático de token

## 2. Identidade visual

O app simula uma "mesa de estudo": fundo azul-tinta profundo (`ink`), com o flashcard
como um cartão de papel físico (`paper`) que **vira de verdade** (flip 3D em CSS) ao
clicar ou apertar espaço. Tipografia serifada (`Fraunces`) nos títulos, `Inter` no corpo,
`IBM Plex Mono` em números/estatísticas — para que dado numérico sempre pareça dado, não
prosa. As cores das avaliações (Again/Hard/Good/Easy) carregam significado semântico, não
são só um esquema decorativo.

## 3. Estrutura

```
electron/
  main.js        # processo principal (janela, CSP, links externos)
  preload.cjs     # ponte mínima renderer <-> Electron (CommonJS)

src/
  main.tsx        # entrypoint React (HashRouter + AuthProvider)
  App.tsx         # definição de rotas
  index.css       # fontes + utilitários de design (flip 3D, grão, scrollbar)

  lib/
    api.ts        # cliente axios: todas as chamadas ao Theo Backend
    auth-context.tsx  # estado de autenticação global
    types.ts      # tipos espelhando os DTOs do backend Rust

  components/
    ui.tsx        # Button, Input, Panel, Badge, EmptyState, etc.
    Layout.tsx    # sidebar + área de conteúdo
    ProtectedRoute.tsx
    StudyCard.tsx # o flashcard com flip 3D (componente-assinatura)
    Heatmap.tsx   # grade de revisões (estilo "commits")

  pages/
    Login.tsx / Register.tsx
    Dashboard.tsx
    Decks.tsx / DeckDetail.tsx
    Study.tsx     # fila de revisão SRS
    Stats.tsx
    Community.tsx
```

## 4. Como conectar ao backend

1. Suba o **Theo Backend** primeiro (veja o README dele) — por padrão em
   `http://localhost:8080`.
2. Configure a URL da API:

   ```bash
   cp .env.example .env
   # .env
   VITE_API_URL=http://localhost:8080/api/v1
   ```

3. O backend já vem com `CORS_ALLOWED_ORIGIN=*` por padrão no `.env.example` dele, então
   funciona out-of-the-box tanto no dev server do Vite quanto dentro do Electron.

## 5. Rodando em desenvolvimento

```bash
npm install

# Só o navegador (mais rápido para iterar na UI)
npm run dev
# abre em http://localhost:5173

# Janela Electron de verdade, com hot reload
npm run electron:dev
```

## 6. Build de produção

```bash
npm run build          # gera dist/ (build web estático)
npm run electron:build # empacota o app desktop (Windows/macOS/Linux) via electron-builder
```

Os instaladores saem em `release/`. O `electron-builder` está configurado no próprio
`package.json` (campo `"build"`) com alvo NSIS no Windows, AppImage no Linux e categoria
de educação no macOS — ajuste conforme sua necessidade de assinatura/distribuição.

## 7. Fluxo de autenticação

- Login/registro guardam `access_token` (JWT) + `refresh_token` (opaco) no
  `localStorage` do renderer.
- Todo request injeta `Authorization: Bearer <access_token>` via interceptor do axios.
- Em qualquer resposta `401`, o interceptor tenta renovar o token uma única vez
  (`/auth/refresh`) e repete a requisição original; se o refresh falhar, os tokens são
  limpos e o usuário cai de volta em `/login` (via `ProtectedRoute`).

## 8. O que está pronto vs. próximos passos

**Pronto:**
- Auth completo (login, registro, refresh silencioso, logout).
- CRUD de decks + criação rápida de cartas (cria automaticamente um note type "Básico"
  na primeira vez, sem o usuário precisar entender templates).
- Fila de estudo com flip de carta, atalho de teclado (espaço) e as 4 avaliações do SRS.
- Painel com resumo, streak e atalho para estudar.
- Estatísticas com heatmap de 365 dias.
- Comunidade: buscar, importar (download) e avaliar decks públicos; publicar deck a
  partir da página do deck.
- Empacotamento Electron (dev e build) já configurado.

**Próximos passos recomendados:**
- Editor de note types customizados na UI (hoje só o fluxo "Básico" tem tela própria;
  o backend já suporta templates arbitrários via `POST /note-types`).
- Modo offline de fato (fila local + sync em background usando `GET /sync/pull` — o
  backend já expõe o endpoint, falta o cache local no frontend, ex. via IndexedDB).
- Atalhos de teclado 1/2/3/4 para avaliar sem usar o mouse.
- Tela de edição/exclusão de cartas existentes (hoje só criação e listagem).
