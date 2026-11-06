import app from "ags/gtk4/app";
import Gtk from "gi://Gtk?version=4.0";
import style from "./style.css";
// The v2 Appearance plane (contracts v0.7.0 / platform v0.9.0) replaces the
// split Theme + Skin pair: one composed palette+skin+mode generation, installed
// as one USER-priority provider, watched through the single
// `$XDG_STATE_HOME/dotfiles/current/appearance` hop.
import {
  createAppearance,
  createAppearanceRefreshHandler,
} from "ags-platform/adapters/appearance";
import { applyStudioAppearance } from "./lib/appearance";
import { StudioWindow, refreshStudioPalette } from "./ui/StudioWindow";

/**
 * Register one top-level window with the application.
 *
 * gnim types a JSX element — what `StudioWindow(monitor)` returns — as
 * `JSX.Element`, which it declares as the base `GObject.Object`, while AGS's
 * `app.add_window` is typed to take a `Gtk.Window`. At runtime the object a JSX
 * root call returns IS the `Gtk.Window` the tree was rooted in, so the cast
 * states a runtime truth the compiler cannot see. Same helper as `bar/app.tsx`
 * and the other migrated apps.
 */
function addWindow(element: JSX.Element): void {
  app.add_window(element as Gtk.Window);
}

// The app-scoped Appearance (platform v0.9.0): the runtime publishes this app's
// composed `$XDG_CONFIG_HOME/ags-btop-studio/appearance.css` through the one
// `current/appearance` pointer, and the adapter owns the provider and its file
// monitor. `style.css` remains the bundled glass fallback, so a missing
// generation is a no-op.
const appearance = createAppearance({ configDir: "ags-btop-studio" });

app.start({
  css: style,
  instanceName: "btop-theme-studio",
  // Live appearance refresh (AD-27), pending-aware. The v2 helper re-applies
  // the whole appearance (palette, skin and mode) first; the app-owned work
  // then reloads the runtime palette + generated base map. The studio's staged
  // edits (`pending`), selected theme, picked key, scope and save target stay
  // exactly as they are (`holdsUnsavedState: true`). A same-hash trigger is a
  // safe work no-op; a throw is not recorded, so the runtime retries it.
  requestHandler: createAppearanceRefreshHandler(appearance, () => {
    applyStudioAppearance({
      reloadPalette: () => refreshStudioPalette(),
    });
  }),
  main() {
    // One apply for palette + skin + mode. Missing artifacts are a no-op and
    // an identical generation is coalesced, so this never double-installs.
    appearance.apply();
    // Single centered window on the primary monitor (an authoring tool, not
    // chrome). Launch-on-demand only: never registered in the bar, never
    // autostarted (see openspec change add-btop-theme-studio).
    const monitor = app.get_monitors()[0];
    if (monitor) addWindow(StudioWindow(monitor));
  },
});
