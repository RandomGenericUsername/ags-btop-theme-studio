---
id: REQ-004
title: "Migrate the studio to the v2 Appearance plane"
kind: requirement
status: in-progress
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-004/
branch: ticket/REQ-004-appearance-migration
---

# Migrate the studio to the v2 Appearance plane

## Requirement

The contracts v0.7.0 / platform v0.9.0 Appearance plane replaces the split
Theme + Skin pair with one composed generation: `createAppearance({ configDir })`
applies palette + skin + mode from the single `current/appearance` hop, and
`createAppearanceRefreshHandler(appearance, work?)` always re-applies the whole
appearance before app-owned derived work. Migrate this app without a redesign:

- `app.tsx` holds one module-level
  `const appearance = createAppearance({ configDir: "ags-btop-studio" })`
  and calls `appearance.apply()` in `main()` instead of `theme.apply()` /
  `skin.apply()`.
- The one `palette-refresh` handler becomes
  `createAppearanceRefreshHandler(appearance, work)`. The app-owned work is the
  existing pending-aware `refreshStudioPalette()` / base-map reload; staged
  edits, selected theme, picked key, scope, save target and preview controls
  still survive. No new request command is added.
- The namespaced layout tokens that exist for this app are consumed in TSX:
  `layout.ags-btop-studio.left-width` (fallback `280`) and `right-width`
  (fallback `320`) feed the existing pane size requests; `.peek()` is used
  where GTK needs a plain number.
- `style.css` remains the bundled glass fallback; no structure, class or
  behavior change.
- The local pin moves to `ags-platform` v0.9.0 / `contracts` v0.7.0, with local
  `.dev/` overrides for the gates.
- Source-level tests assert the module-level appearance apply/configDir, the
  `createAppearanceRefreshHandler` wiring, the layout-token reads and the
  retained `style.css` fallback, and reject the retired theme/skin applies.

## Acceptance

- [ ] `app.tsx` creates one module-scope Appearance for
      `configDir: "ags-btop-studio"` and applies it in `main()`; no
      `theme.apply()` or `skin.apply()` survives.
- [ ] The request handler is `createAppearanceRefreshHandler(appearance, work)`
      and the work preserves the pending-aware `refreshStudioPalette()` /
      base-map reload; no new request command exists.
- [ ] `layout.ags-btop-studio.left-width` / `right-width` are read with their
      `280` / `320` fallbacks and drive the pane size requests.
- [ ] `style.css` is still bundled through `app.start({ css: style })` and
      remains the glass fallback; no structure/class/behavior change.
- [ ] `Makefile` pins `ags-platform` v0.9.0 and `contracts` v0.7.0; local
      `.dev/` links and every pin assertion agree.
- [ ] Source-level test covers appearance apply/configDir/handler, the layout
      tokens, the pending-aware reload and `style.css`.
- [ ] `make gates` passes; v0.4.0 (next minor) is tagged after the
      fast-forward merge.

## Evidence

Pending implementation.

## Deviations

None yet.
