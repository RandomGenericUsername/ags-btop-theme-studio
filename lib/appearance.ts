/**
 * The pure app-owned work for the btop Theme Studio's live appearance refresh
 * (AD-27).
 *
 * The runtime invokes `palette-refresh <appearance-hash>` after an appearance
 * change. Platform v0.9.0's `createAppearanceRefreshHandler` re-applies the
 * WHOLE appearance (palette + skin + mode) first, so this app no longer owns a
 * `theme.apply()`/`skin.apply()` step or the hash ledger. What remains is the
 * studio's genuinely app-owned, pending-aware reload: replace only the runtime
 * palette and the generated base map.
 *
 * The studio is an authoring tool with `holdsUnsavedState: true`
 * (app.manifest.json), so the reload is deliberately PENDING-AWARE: staged
 * edits (`pending`), the selected theme, the picked key, the edit scope, the
 * save target and the live-preview controls all survive untouched. Never
 * restart, quit or reset the studio.
 *
 * PURE: no `ags`, no `gi://*`, no I/O.
 */

/** The one GTK operation the studio performs for one appearance. */
export interface StudioAppearanceSurface {
  /** Reload the runtime palette and the generated btop map, preserving edits. */
  reloadPalette(): void;
}

/**
 * Run the non-destructive app-owned appearance work.
 *
 * The Theme/Skin apply happens in the platform helper before this runs; the
 * palette loader reads the runtime's current `colors.yaml`, which the composed
 * appearance has already repointed.
 */
export function applyStudioAppearance(surface: StudioAppearanceSurface): void {
  surface.reloadPalette();
}
