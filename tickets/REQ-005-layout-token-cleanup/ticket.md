---
id: REQ-005
title: "Drop the btop layout token reads and restore natural panes"
kind: requirement
status: in-progress
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-005/
branch: ticket/REQ-005-layout-token-cleanup
---

# Drop the btop layout token reads and restore natural panes

## Requirement

The v2 appearance migration fed
`layout.ags-btop-studio.left-width` / `right-width` into
`leftScroll.set_size_request(...)` / `right.set_size_request(...)`. Pre-v2 the
`280` / `320` values existed only as CSS `min-width` on `.studio-left-scroll` /
`.studio-right`; the panes were otherwise natural (the right rail's scroll area
already expands). The assets repo is retiring the unused token group, so this
follow-up removes the app-side consumption without changing the layout or any
preview behavior:

- `ui/StudioWindow.tsx` has no `layout.ags-btop-studio.*` read, no
  `leftWidth` / `rightWidth` accessor and no width
  `set_size_request` on the left/right rails. The pre-v2 natural pane
  construction is restored: CSS `min-width` plus the existing `hexpand`.
- `StudioWindow` returns to its pre-v2 one-argument signature and `app.tsx`
  calls `StudioWindow(monitor)`. The module-scope
  `createAppearance({ configDir: "ags-btop-studio" })` apply and the
  `createAppearanceRefreshHandler(appearance, work)` refresh path are unchanged.
- `style.css` remains the bundled glass fallback and keeps
  `.studio-left-scroll { min-width: 280px }` /
  `.studio-right { min-width: 320px }`; no structure, class or behavior change.
- The source validation test rejects layout-token usage and the pane width
  size requests while keeping the appearance apply/configDir/refresh
  assertions.
- The preview engine, generated key widgets and btop parsing are untouched.
- The next patch tag follows after the fast-forward merge.

## Acceptance

- [ ] `ui/StudioWindow.tsx` contains no `layout.ags-btop-studio.*` reads,
      `leftWidth` / `rightWidth` values or pane width `set_size_request` calls.
- [ ] The left/right rails are natural again: `style.css` owns the `280px` /
      `320px` minimums and the existing `hexpand` is preserved.
- [ ] `app.tsx` keeps the module-scope appearance apply/configDir and the
      `createAppearanceRefreshHandler(appearance, work)` wiring unchanged.
- [ ] The source validation test covers the absence of btop layout tokens and
      the pane construction while keeping the appearance assertions.
- [ ] The preview engine, generated widgets and `style.css` structure/classes
      are unchanged.
- [ ] `make gates` passes with the local platform/contracts overrides.
- [ ] v0.4.1 is tagged after the fast-forward merge; `main` and the tag are
      pushed.

## Evidence

Pending implementation.

## Deviations

None yet.
