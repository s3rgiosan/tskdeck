import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, errorMessage, onMenu, onSettingsChanged, setWindowHeight, setWindowTitle } from "../api/client";
import { runMenuItem } from "../menu";
import { useDeck } from "../state/store";
import { ErrorAlert } from "./ErrorAlert";
import { KeymapEditor } from "./KeymapEditor";
import { GeneralSettings } from "./Settings";
import type { SymbolName } from "./SymbolIcon";
import { SymbolIcon } from "./SymbolIcon";

type PaneId = "general" | "shortcuts";

const PANES: { id: PaneId; title: string; symbol: SymbolName }[] = [
  { id: "general", title: "General", symbol: "gearshape" },
  { id: "shortcuts", title: "Shortcuts", symbol: "keyboard" },
];

/** The tallest the window gets; a longer pane scrolls. */
export const MAX_WINDOW_HEIGHT = 520;

/** Where the last viewed pane is kept between openings of the window. */
const PANE_KEY = "tskdeck.settingsPane";

function savedPane(): PaneId {
  try {
    return localStorage.getItem(PANE_KEY) === "shortcuts" ? "shortcuts" : "general";
  } catch {
    return "general";
  }
}

function rememberPane(pane: PaneId) {
  try {
    localStorage.setItem(PANE_KEY, pane);
  } catch {
    // Without storage the window opens on General next time.
  }
}

/**
 * The settings window: a title bar with the current pane's name centred above the toolbar of panes,
 * then the pane. The title bar drags the window. Settings stay in step with saves from other windows.
 */
export function SettingsWindow() {
  const [pane, setPane] = useState<PaneId>(savedPane);
  const tabs = useRef<Record<PaneId, HTMLButtonElement | null>>({ general: null, shortcuts: null });
  const toolbar = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const current = PANES.find((p) => p.id === pane) ?? PANES[0];

  useEffect(() => {
    api
      .getSettings()
      .then((settings) => useDeck.getState().applySettings(settings))
      .catch((e: string) => useDeck.setState({ error: errorMessage(e) }));
    const subscriptions = [
      onSettingsChanged((settings) => useDeck.getState().applySettings(settings)),
      onMenu((id) => runMenuItem(id, {})),
    ].map((p) => p.catch(() => null));
    return () => {
      for (const s of subscriptions) void s.then((stop) => stop?.());
    };
  }, []);

  useEffect(() => {
    rememberPane(pane);
    setWindowTitle(current.title).catch(() => null);
  }, [pane, current.title]);

  /** Sizes the window to the toolbar plus the pane's content, up to the maximum height. */
  useLayoutEffect(() => {
    const body = content.current;
    if (!body) return;
    function fit() {
      if (!toolbar.current || !main.current || !body) return;
      const style = getComputedStyle(main.current);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const height = Math.min(MAX_WINDOW_HEIGHT, Math.ceil(toolbar.current.offsetHeight + padding + body.offsetHeight));
      setWindowHeight(height).catch(() => null);
    }
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(body);
    return () => observer.disconnect();
  }, [pane]);

  /** Left and Right move between the pane buttons, and select the pane they land on. */
  function onToolbarKey(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const at = PANES.findIndex((p) => p.id === pane);
    const next = PANES[(at + step + PANES.length) % PANES.length].id;
    setPane(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="settings-window">
      <header className="settings-titlebar" ref={toolbar} data-tauri-drag-region="deep">
        <h1 className="settings-title">{current.title}</h1>
        <div className="pane-toolbar" role="tablist" aria-label="Settings" onKeyDown={onToolbarKey}>
          {PANES.map((p) => (
            <button
              key={p.id}
              ref={(el) => {
                tabs.current[p.id] = el;
              }}
              type="button"
              role="tab"
              id={`pane-tab-${p.id}`}
              aria-selected={p.id === pane}
              aria-controls="settings-pane"
              tabIndex={p.id === pane ? 0 : -1}
              onClick={() => setPane(p.id)}
            >
              <SymbolIcon name={p.symbol} />
              {p.title}
            </button>
          ))}
        </div>
      </header>
      <main className="settings-pane" ref={main} id="settings-pane" role="tabpanel" aria-labelledby={`pane-tab-${pane}`}>
        <div ref={content}>{pane === "general" ? <GeneralSettings /> : <KeymapEditor />}</div>
      </main>
      <ErrorAlert />
    </div>
  );
}
