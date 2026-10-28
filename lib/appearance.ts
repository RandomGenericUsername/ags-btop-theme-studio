/**
 * The pure core of the btop Theme Studio's live appearance refresh (AD-27).
 *
 * The runtime invokes `palette-refresh <appearance-hash>` after the palette
 * pointer moved. The studio is an authoring tool with `holdsUnsavedState: true`
 * (app.manifest.json), so the refresh is deliberately PENDING-AWARE: it
 * re-applies the desktop Theme pointer and reloads the runtime palette plus
 * the generated base map, while the staged edits (`pending`), the selected
 * theme, the picked key, the edit scope, the save target and the live-preview
 * controls all survive untouched.
 *
 * Two separate concerns live here so a stock-runner test can execute them with
 * no `gi://`/`ags` imports:
 *
 * 1. `applyStudioAppearance(surface)` orders the two non-destructive steps:
 *    re-apply the stable Theme pointer first, then reload the palette-bound
 *    studio inputs.
 * 2. `createAppearanceRefresh(apply)` makes the whole thing idempotent by the
 *    opaque appearance hash: the same hash does no work and still reports
 *    `applied`, while a new hash runs the refresh. A throw is not recorded as
 *    applied, so the runtime's next trigger retries it.
 *
 * PURE: no `ags`, no `gi://*`, no I/O.
 */

/** The two operations the studio performs for one appearance. */
export interface StudioAppearanceSurface {
  /** Re-apply the platform Theme port's stable palette pointer. */
  applyTheme(): void;
  /** Reload the runtime palette and the generated btop map, preserving edits. */
  reloadPalette(): void;
}

/** What the platform's `createPaletteRefreshHandler` accepts as applied. */
export interface AppearanceApplied {
  status: "applied";
}

/**
 * Run the pending-aware appearance refresh in its required order.
 *
 * The Theme pointer is applied before the studio inputs are reloaded: the
 * palette loader reads the runtime's current `colors.yaml`, which the pointer
 * switch changes. Reloading first would keep the previous palette for one
 * appearance.
 */
export function applyStudioAppearance(surface: StudioAppearanceSurface): void {
  surface.applyTheme();
  surface.reloadPalette();
}

/**
 * Wrap an appearance application as a hash-idempotent refresh.
 *
 * The refresh is opaque to the hash; the studio only records which appearance
 * it last applied successfully. Repeated triggers for the same hash are safe
 * and cheap (the runtime ledger retries failures, not successes). A new hash
 * runs the refresh; a failed refresh leaves the previous hash in place so the
 * next trigger retries it.
 */
export function createAppearanceRefresh(
  apply: () => void,
): (appearanceHash: string) => AppearanceApplied {
  let appliedHash: string | null = null;

  return (appearanceHash: string): AppearanceApplied => {
    if (appearanceHash !== appliedHash) {
      apply();
      appliedHash = appearanceHash;
    }
    return { status: "applied" };
  };
}
