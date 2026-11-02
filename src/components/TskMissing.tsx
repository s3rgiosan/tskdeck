import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import type { TskError, TskInfo } from "../api/types";
import { useDeck } from "../state/store";

const INSTALL_URL = "https://gettsk.sh/docs/install/";

function describe(tsk: TskInfo | null, error: TskError | null): { title: string; body: ReactNode } {
  if (tsk !== null && !tsk.supported) {
    return {
      title: "Update tsk",
      body: (
        <>
          Found tsk {tsk.version} at <code>{tsk.path}</code>. tskdeck needs {tsk.minimum} or newer.
        </>
      ),
    };
  }
  if (error !== null && error.kind !== "notFound") {
    return { title: "Can't Run tsk", body: error.message };
  }
  return { title: "tsk Not Found", body: "tskdeck is a desktop client for the tsk CLI and needs it installed." };
}

/** A full-window screen; its empty space drags the window. */
export function TskMissing(props: { tsk: TskInfo | null; error: TskError | null; onChoosePath: () => void }) {
  const { title, body } = describe(props.tsk, props.error);
  const recheckTsk = useDeck((s) => s.recheckTsk);
  return (
    <div className="screen" data-tauri-drag-region>
      <div className="missing" role="alert">
        <h1>{title}</h1>
        <p>{body}</p>
        <p>
          <a
            href={INSTALL_URL}
            onClick={(e) => {
              e.preventDefault();
              void openUrl(INSTALL_URL);
            }}
          >
            Install instructions
          </a>
        </p>
        <p className="missing-actions">
          <button type="button" onClick={props.onChoosePath}>
            Choose tsk Path…
          </button>
          <button type="button" onClick={() => void recheckTsk()}>
            Check Again
          </button>
        </p>
      </div>
    </div>
  );
}
