/**
 * The btop Theme Studio's `palette-refresh` handler (AD-27; contracts
 * `ags-app-refresh.md`).
 *
 * This module is PURE on purpose: it binds the platform's protocol helper to
 * the studio's hash-idempotent appearance refresh, with no `gi://`/`ags`
 * import. The stock-runner unit test therefore executes the SAME handler
 * `app.tsx` registers and proves its single JSON-string response.
 *
 * The v0.5.0 monorepo handler was pending-aware by construction: its injected
 * work was `theme.apply()` followed by `refreshStudioPalette()`, which reloads
 * only the runtime palette and the generated base map. `ui/StudioWindow.tsx`
 * owns that non-destructive reload and never resets the staged edits, selected
 * theme, picked key, scope or save target. This module adds the protocol's
 * appearance-hash idempotency around the identical work.
 */

import { createPaletteRefreshHandler } from "ags-platform/ports/palette-refresh";
import type { PaletteRefreshRequestHandler } from "ags-platform/ports/palette-refresh";
import { createAppearanceRefresh } from "./appearance.ts";

/**
 * Build the AGS request handler for the studio.
 *
 * `apply` is called at most once per distinct appearance hash and only after
 * the previous one succeeded. The platform helper answers exactly once with
 * `JSON.stringify(...)`, as the runtime's string transport requires.
 */
export function createStudioPaletteRefresh(
  apply: () => void,
): PaletteRefreshRequestHandler {
  return createPaletteRefreshHandler(createAppearanceRefresh(apply));
}
