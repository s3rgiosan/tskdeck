import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { suppressChromeContextMenu } from "./contextMenu";
import { isMacPlatform } from "./keys/keymap";
import { trackWindowActivity } from "./windowActivity";
import { trackWindowChrome } from "./windowChrome";
import "./styles.css";

// Lets the stylesheet adapt the sidebar and title bar to the macOS window chrome.
if (isMacPlatform()) document.documentElement.classList.add("is-mac");

trackWindowActivity();
suppressChromeContextMenu();

async function start() {
  // Dev-only IPC mock for previews in a plain browser; production builds drop this branch.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) await import("./dev/mockTauri");
  trackWindowChrome();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void start();
