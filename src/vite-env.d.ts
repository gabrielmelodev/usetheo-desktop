/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SYNC_PROTOCOL?: "legacy" | "cloudflare";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
