export {};

declare global {
  interface Window {
    theoDesktop: {
      platform: string;

      versions: {
        electron: string;
        chrome: string;
        node: string;
      };

      window: {
        minimize(): void;
        maximize(): void;
        close(): void;
      };

      updater: {
        checkNow(): Promise<{ skipped?: boolean; reason?: string } | void>;

        quitAndInstall(): void;

        onChecking(cb: () => void): void;

        onAvailable(cb: (info: unknown) => void): void;

        onNotAvailable(cb: (info: unknown) => void): void;

        onError(cb: (message: string) => void): void;

        onProgress(cb: (progress: { percent: number }) => void): void;

        onDownloaded(cb: (info: unknown) => void): void;
      };

      /**
       * ============================================================
       * BANCO DE DADOS LOCAL
       * ============================================================
       *
       * Comunicação com o Electron para exportar/importar
       * o arquivo SQLite local do Theo.
       */
      localDatabase: {
        export(): Promise<{
          ok: boolean;
          canceled?: boolean;
          message?: string;
          path?: string;
        }>;

        import(): Promise<{
          ok: boolean;
          canceled?: boolean;
          message?: string;
          path?: string;
          backupPath?: string;
        }>;

        getPath(): Promise<string>;
      };
    };
  }
}
