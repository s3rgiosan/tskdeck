import { errorMessage } from "../api/client";
import { failure, useDeck } from "../state/store";
import { useUpdates } from "../state/updates";
import { useInstallUpdate } from "./useInstallUpdate";

function reportInstallFailure(e: string) {
  useDeck.setState(failure("The update couldn't be installed", errorMessage(e)));
}

/** Announces a newer release at the foot of the sidebar, and installs it or hides it until the app quits. */
export function UpdateCard() {
  const update = useUpdates((s) => s.update);
  const postponed = useUpdates((s) => s.postponed);
  const postpone = useUpdates((s) => s.postpone);
  const { busy, label, install } = useInstallUpdate(reportInstallFailure);

  if (update === null || postponed === update.version) return null;
  return (
    <div className="update-card" role="status">
      <p className="update-card-text">tskdeck {update.version} is available.</p>
      <div className="update-card-actions">
        <button type="button" className="is-default" onClick={install} disabled={busy}>
          {label}
        </button>
        <button type="button" onClick={postpone} disabled={busy}>
          Later
        </button>
      </div>
    </div>
  );
}
