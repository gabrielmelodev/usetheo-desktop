import { useEffect, useState } from "react";

type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available" }
  | { phase: "not-available" }
  | { phase: "downloading"; percent: number }
  | { phase: "downloaded" }
  | { phase: "error"; message: string };

type UpdateProgress = {
  percent: number;
};

type UpdaterApi = {
  onChecking: (callback: () => void) => void;
  onAvailable: (callback: () => void) => void;
  onNotAvailable: (callback: () => void) => void;
  onError: (callback: (message: string) => void) => void;
  onProgress: (callback: (progress: UpdateProgress) => void) => void;
  onDownloaded: (callback: () => void) => void;
  checkNow: () => void | Promise<void>;
  downloadNow: () => void | Promise<void>;
  quitAndInstall: () => void;
};

type TheoDesktopApi = {
  updater?: UpdaterApi;
};

type TheoWindow = Window & {
  theoDesktop?: TheoDesktopApi;
};

export function useAppUpdate() {
  const [state, setState] = useState<UpdateState>({
    phase: "idle",
  });

  useEffect(() => {
    const desktop = window as TheoWindow;
    const updater = desktop.theoDesktop?.updater;

    if (!updater) {
      return;
    }

    updater.onChecking(() => {
      setState({
        phase: "checking",
      });
    });

    updater.onAvailable(() => {
      setState({
        phase: "available",
      });
    });

    updater.onNotAvailable(() => {
      setState({
        phase: "not-available",
      });
    });

    updater.onError((message: string) => {
      setState({
        phase: "error",
        message,
      });
    });

    updater.onProgress((progress: UpdateProgress) => {
      setState({
        phase: "downloading",
        percent: Math.round(progress.percent),
      });
    });

    updater.onDownloaded(() => {
      setState({
        phase: "downloaded",
      });
    });
  }, []);

  return {
    state,

    checkNow: () => {
      const desktop = window as TheoWindow;
      return desktop.theoDesktop?.updater?.checkNow();
    },

    downloadNow: () => {
      const desktop = window as TheoWindow;
      return desktop.theoDesktop?.updater?.downloadNow();
    },

    installNow: () => {
      const desktop = window as TheoWindow;
      desktop.theoDesktop?.updater?.quitAndInstall();
    },
  };
}
