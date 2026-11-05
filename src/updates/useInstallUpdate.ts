import { useCallback, useEffect, useRef, useState } from "react";
import { api, onUpdateProgress } from "../api/client";
import type { UpdateProgress } from "../api/types";

/** Shown on the install button while nothing is installing. */
export const INSTALL_LABEL = "Install and Relaunch";

/** Download progress, or "installing" once every byte has arrived. Null while idle. */
type Phase = UpdateProgress | "installing" | null;

function labelFor(phase: Phase): string {
  if (phase === null) return INSTALL_LABEL;
  if (phase === "installing") return "Installing…";
  if (phase.total === null || phase.total <= 0) return "Downloading…";
  const percent = Math.min(100, Math.floor((phase.downloaded / phase.total) * 100));
  return `Downloading… ${percent}%`;
}

/**
 * Drives an install button: starts the install, follows the download progress and reports a
 * failure through `onError`. The app relaunches on success, so a finished install needs no state.
 */
export function useInstallUpdate(onError: (e: string) => void): { busy: boolean; label: string; install: () => void } {
  const [phase, setPhase] = useState<Phase>(null);
  const report = useRef(onError);
  report.current = onError;

  useEffect(() => {
    const stop = onUpdateProgress((progress) => {
      setPhase((prev) => {
        if (prev === null) return prev;
        const done = progress.total !== null && progress.total > 0 && progress.downloaded >= progress.total;
        return done ? "installing" : progress;
      });
    }).catch(() => null);
    return () => {
      void stop.then((unlisten) => unlisten?.());
    };
  }, []);

  const install = useCallback(() => {
    setPhase({ downloaded: 0, total: null });
    api.installUpdate().catch((e: string) => {
      setPhase(null);
      report.current(e);
    });
  }, []);

  return { busy: phase !== null, label: labelFor(phase), install };
}
