/// <reference types="vite/client" />

declare module '*.css';


declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_PLAYER_API_MODE?: "direct" | "proxy";
  readonly VITE_DYNMAP_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
