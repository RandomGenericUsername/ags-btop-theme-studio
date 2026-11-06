import app from "ags/gtk4/app";
import Gtk from "gi://Gtk?version=4.0";
import style from "./style.css";
// Theming through the platform Theme port (spine AD-13): the adapter owns WHICH
// artifact is applied — the stable `colors.css` pointer, repointed on every
// palette change — so this app carries no theme.ts and no apply_css call.
import { theme } from "ags-platform/adapters/theme";
import { createAppSkin } from "ags-platform/adapters/skin";
import { applyStudioAppearance } from "./lib/appearance";
import { createStudioPaletteRefresh } from "./lib/palette-refresh";
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

// The app-scoped Skin (platform v0.8.0): the runtime expands this app's
// `$XDG_CONFIG_HOME/ags-btop-studio/skin.css`; the adapter owns the provider
// and its file monitor. `style.css` remains the bundled glass fallback, so a
// missing skin artifact is a no-op.
const skin = createAppSkin({ configDir: "ags-btop-studio" });

app.start({
  css: style,
  instanceName: "btop-theme-studio",
  // Live palette refresh (AD-27), pending-aware: the handler re-applies the
  // Theme pointer and reloads the runtime palette + generated base map. The
  // studio's staged edits (`pending`), selected theme, picked key, scope and
  // save target stay exactly as they are (`holdsUnsavedState: true`). The
  // appearance hash makes a repeated trigger for the same palette a cheap
  // no-op; a throw is not recorded, so the runtime's next trigger retries it.
  requestHandler: createStudioPaletteRefresh(() => {
    applyStudioAppearance({
      applyTheme: () => theme.apply(),
      reloadPalette: () => refreshStudioPalette(),
    });
  }),
  main() {
    // Reuse the desktop palette so the studio matches the bar. The studio's
    // authored btop themes are previewed on purpose-built content surfaces,
    // never through this palette (see style.css).
    theme.apply();
    // Palette first, then the app-scoped skin: the Skin provider is composed
    // from the live palette and must be the last-installed USER provider.
    skin.apply();
    // Single centered window on the primary monitor (an authoring tool, not
    // chrome). Launch-on-demand only: never registered in the bar, never
    // autostarted (see openspec change add-btop-theme-studio).
    const monitor = app.get_monitors()[0];
    if (monitor) addWindow(StudioWindow(monitor));
  },
});
