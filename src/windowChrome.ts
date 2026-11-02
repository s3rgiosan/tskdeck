import { isFullscreen, onFullscreenChanged, reduceTransparency } from "./api/client";

const FULLSCREEN = "is-fullscreen";
const REDUCE_TRANSPARENCY = "reduce-transparency";

/**
 * Mirrors full screen and the Reduce Transparency setting onto the root element. The setting is read
 * again each time the window gains focus, since it can change while the app is in the background.
 */
export function trackWindowChrome(): () => void {
  const root = document.documentElement;
  const readTransparency = () => {
    reduceTransparency()
      .then((reduce) => root.classList.toggle(REDUCE_TRANSPARENCY, reduce))
      .catch(() => null);
  };
  isFullscreen()
    .then((fullscreen) => root.classList.toggle(FULLSCREEN, fullscreen))
    .catch(() => null);
  const stopFullscreen = onFullscreenChanged((fullscreen) => root.classList.toggle(FULLSCREEN, fullscreen)).catch(
    () => null,
  );
  readTransparency();
  window.addEventListener("focus", readTransparency);
  return () => {
    window.removeEventListener("focus", readTransparency);
    void stopFullscreen.then((unlisten) => unlisten?.());
  };
}
