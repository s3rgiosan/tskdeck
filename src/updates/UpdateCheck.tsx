import { useState } from "react";
import { api, errorMessage } from "../api/client";
import type { UpdateInfo } from "../api/types";
import { useInstallUpdate } from "./useInstallUpdate";

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "available"; update: UpdateInfo }
  | { kind: "failed"; error: string }
  | { kind: "installFailed"; error: string };

function statusText(state: CheckState): string {
  switch (state.kind) {
    case "checking":
      return "Checking…";
    case "current":
      return "Up to date";
    case "available":
      return `Version ${state.update.version} available`;
    case "failed":
      return `Couldn't check for updates: ${state.error}`;
    case "installFailed":
      return `Couldn't install the update: ${state.error}`;
    default:
      return "";
  }
}

/** The Check Now button with its one-line result, and the install button once a release is found. */
export function UpdateCheck() {
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  const { busy, label, install } = useInstallUpdate((e) => setState({ kind: "installFailed", error: errorMessage(e) }));

  function check() {
    setState({ kind: "checking" });
    api.checkForUpdates().then(
      (update) => setState(update ? { kind: "available", update } : { kind: "current" }),
      (e: string) => setState({ kind: "failed", error: errorMessage(e) }),
    );
  }

  const text = statusText(state);
  return (
    <div className="form-field form-note">
      {state.kind === "available" ? (
        <button type="button" onClick={install} disabled={busy}>
          {label}
        </button>
      ) : (
        <button type="button" onClick={check} disabled={state.kind === "checking"}>
          Check Now
        </button>
      )}
      <span className="update-status" role="status">
        {text}
      </span>
    </div>
  );
}
