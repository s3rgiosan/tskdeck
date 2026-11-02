import { useEffect, useState } from "react";
import { requestTskCheck } from "../api/client";
import type { OpenMode } from "../api/types";
import { useDeck } from "../state/store";

/** The General pane: where a task opens and where tsk lives. Each change is saved as it is made. */
export function GeneralSettings() {
  const settings = useDeck((s) => s.settings);
  const saveSettings = useDeck((s) => s.saveSettings);
  const [path, setPath] = useState(settings.tskPath ?? "");
  const [detectError, setDetectError] = useState<string | null>(null);

  // The saved path can arrive after the first render, from the settings file or another window.
  useEffect(() => {
    setPath(settings.tskPath ?? "");
  }, [settings.tskPath]);

  async function commitPath(next: string) {
    const trimmed = next.trim();
    const tskPath = trimmed === "" ? null : trimmed;
    const current = useDeck.getState().settings;
    if (tskPath === current.tskPath) return false;
    await saveSettings({ ...current, tskPath });
    return true;
  }

  /** Clears a saved path, which makes the main window look for tsk again; with no path saved, asks it directly. */
  async function detect() {
    setPath("");
    setDetectError(null);
    const cleared = await commitPath("");
    if (!cleared) await requestTskCheck().catch(() => setDetectError("Could not reach the main window"));
  }

  function chooseMode(openMode: OpenMode) {
    void saveSettings({ ...useDeck.getState().settings, openMode });
  }

  return (
    <div className="form-grid">
      <span className="form-label" id="open-mode-label">
        Open tasks:
      </span>
      <div className="form-choices" role="radiogroup" aria-labelledby="open-mode-label">
        <label>
          <input type="radio" name="open-mode" checked={settings.openMode === "beside"} onChange={() => chooseMode("beside")} />
          Beside the board
        </label>
        <label>
          <input type="radio" name="open-mode" checked={settings.openMode === "overlay"} onChange={() => chooseMode("overlay")} />
          Over the board
        </label>
      </div>
      <label className="form-label" htmlFor="tsk-path">
        tsk path:
      </label>
      <div className="form-field">
        <input
          id="tsk-path"
          type="text"
          value={path}
          placeholder="Detected automatically"
          spellCheck={false}
          onChange={(e) => setPath(e.target.value)}
          onBlur={() => void commitPath(path)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitPath(path);
          }}
        />
        <button type="button" onClick={() => void detect()}>
          Detect
        </button>
      </div>
      {detectError !== null && (
        <p role="alert" className="flow-error form-note">
          {detectError}
        </p>
      )}
    </div>
  );
}
