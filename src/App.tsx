import { SettingsWindow } from "./components/SettingsWindow";
import { Shell } from "./components/Shell";

/** The settings window loads the page at `#settings`; every other window shows the board. */
function App() {
  return window.location.hash === "#settings" ? <SettingsWindow /> : <Shell />;
}

export default App;
