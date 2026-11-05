import { api, errorMessage, onUpdateAvailable, onUpdateCheckResult, showAlert } from "../api/client";
import type { UpdateCheckResult } from "../api/types";
import { failure, useDeck } from "../state/store";
import { useUpdates } from "../state/updates";

/**
 * Shows the result of a check that the user started: the card for a release found, an alert when
 * tskdeck is current, or the failure.
 */
export function reportUpdateCheck(result: UpdateCheckResult) {
  if (result.error !== null) {
    useDeck.setState(failure("Couldn't check for updates", result.error));
    return;
  }
  if (result.update !== null) {
    useUpdates.getState().setUpdate(result.update);
    useUpdates.getState().reveal();
    return;
  }
  showAlert("tskdeck is up to date", "No newer version is available.").catch(() => null);
}

/** Checks for updates now and shows the result. */
export function checkForUpdatesNow() {
  api.checkForUpdates().then(
    (update) => reportUpdateCheck({ update, error: null }),
    (e: string) => reportUpdateCheck({ update: null, error: errorMessage(e) }),
  );
}

/** Takes the release a check found before this window loaded, and each one found later. */
export function subscribeToUpdates(): Promise<() => void> {
  api.pendingUpdate().then(
    (update) => useUpdates.getState().setUpdate(update),
    () => null,
  );
  const available = onUpdateAvailable((update) => useUpdates.getState().setUpdate(update));
  const results = onUpdateCheckResult(reportUpdateCheck);
  return Promise.all([available, results]).then((stops) => () => {
    for (const stop of stops) stop();
  });
}
