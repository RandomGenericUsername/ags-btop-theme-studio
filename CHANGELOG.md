# Changelog

## v0.5.1 — 2026-11-07

- Bump the local `ags-platform` dev pin from `v1.0.0` to `v1.0.1` (OPS-001):
  - `Makefile`, the stock-runner CI workflow, `tests/app-contract.test.mjs`,
    `README.md`, `AGENTS.md` and the appearance-consumption test comment name
    the `v1.0.1` pin and the `.dev/ags-platform/v1.0.1` path.
  - `contracts` stays `v0.8.0`; app code, handler/ack behavior, the preview
    engine, generated widgets, `style.css`, layout tokens and lane policy are
    unchanged.

## v0.5.0 — 2026-11-07

- Consume Generations v3 (REQ-006):
  - Pin the gate tuple at `ags-platform` v1.0.0 / `contracts` v0.8.0 in the
    `Makefile`, the stock-runner CI workflow and `tests/app-contract.test.mjs`.
  - `createAppearance({ configDir: "ags-btop-studio" })` keeps the one
    module-scope appearance and `appearance.apply()`; platform v1.0.0 now reads
    `$XDG_STATE_HOME/dotfiles/current/manifest.json` plus
    `current/appearance/ags-btop-studio.css` behind the one `current` pointer.
  - The one request handler is the generation-bound
    `appearance-refresh <genHash>` helper. Its pending-aware studio work still
    reloads only the runtime palette and generated base map, and now returns the
    frozen `{ status: "applied" }` work result. A stale v2 `palette-refresh`
    request, an appearance hash or a missing generation hash is rejected.
  - Rewrite `tests/unit.test.mjs` to execute the v3 protocol (requested-hash
    apply/ack, idempotent work, retryable throws, deferred work, malformed and
    retired requests) and update the source gates for the v3 handler.
  - The preview engine, generated key widgets, btop parsing, `style.css` and
    the natural panes are unchanged.

## v0.4.1 — 2026-11-06

- Drop the unused btop layout token reads (REQ-005):
  - `ui/StudioWindow.tsx` no longer reads
    `layout.ags-btop-studio.left-width` / `right-width` or applies fixed
    `set_size_request` widths. The left/right rails are natural again:
    `style.css` owns the `280px` / `320px` minimums and the existing `hexpand`
    is preserved; no structure, class or behavior change.
  - `StudioWindow` returns to its pre-v2 one-argument signature. The
    module-scope `createAppearance({ configDir: "ags-btop-studio" })` apply and
    the `createAppearanceRefreshHandler(appearance, work)` refresh path are
    unchanged.
  - Update `tests/appearance-consumption.mjs` to reject layout-token usage
    while keeping the appearance assertions; the preview engine and generated
    widgets are untouched.

## v0.4.0 — 2026-11-06

- Migrate the studio to the v2 Appearance plane (REQ-004):
  - `app.tsx` declares one module-level
    `createAppearance({ configDir: "ags-btop-studio" })` and `main()` calls
    `appearance.apply()` instead of the split `theme.apply()` / `skin.apply()`.
    The runtime publishes one composed palette + skin + mode generation behind
    `$XDG_STATE_HOME/dotfiles/current/appearance`; `style.css` stays the bundled
    glass fallback and a missing generation is a no-op.
  - The `palette-refresh` handler is
    `createAppearanceRefreshHandler(appearance, work)`. The platform helper
    re-applies the whole appearance first; the app-owned work keeps the
    pending-aware `refreshStudioPalette()` / base-map reload, so staged edits,
    the selected theme, picked key, scope, save target and preview controls
    survive. No new request command is added and `lib/palette-refresh.ts` is
    retired.
  - Read the TSX-owned layout tokens
    `layout.ags-btop-studio.left-width` (`280`) / `right-width` (`320`) and feed
    the existing rail size requests. `style.css` keeps its `280px` / `320px`
    glass fallbacks.
  - Add `tests/appearance-consumption.mjs` for the module-level appearance
    apply/configDir, the v2 handler wiring, the layout-token reads and the
    retained fallback; update the unit and conformance suites.
  - Pin the gate tuple at `ags-platform` v0.9.0 / `contracts` v0.7.0.

## v0.3.0 — 2026-11-05

- Consume the app-scoped skin plane (REQ-003): `app.tsx` declares one
  `createAppSkin({ configDir: "ags-btop-studio" })` and `main()` calls
  `skin.apply()` immediately after `theme.apply()`. The composed provider is
  installed last at USER priority over the bundled `style.css` glass fallback;
  missing skin artifacts are a no-op. The palette-refresh handler is unchanged
  and no skin-refresh request is added — the adapter's own monitor reloads
  `$XDG_CONFIG_HOME/ags-btop-studio/skin.css`. Add
  `tests/skin-consumption.mjs` for the startup order, config dir, single
  request handler and retained fallback. Pin the gate tuple at `ags-platform`
  v0.8.0 / `contracts` v0.6.0.
- Migrate the studio to the `palette.v1` semantics exposed by `ags-platform`
  v0.4.0 (REQ-002):
  - `style.css` chrome now references roles (`@surface`, `@on_surface`,
    `@primary`/`@on_primary`, `@primary_container`, `@tertiary`, `@error`,
    `@on_surface_variant`) instead of `@color_*`; alpha and geometry are kept.
  - `ui/StudioWindow.tsx` loads the typed palette through `theme.palette()`
    (with a semantic fallback), instead of parsing `colors.yaml` and the
    legacy `colors:` list. The picker lists roles plus custom hex/transparent.
  - `lib/theme-model.ts` exports the canonical `BTOP_KEY_ROLES` table (the
    same mapping as theme-producer) and builds `generatedDefaultMap()` from
    role tokens. Literal hex from authored/user themes is preserved.
  - Bump the gate platform pin to `v0.4.0`; contracts stays `v0.3.0`.
- The pending-aware `palette-refresh` behavior is unchanged: unsaved edits,
  selection, scope, save target and preview controls survive; no restart.

## v0.1.3 — 2026-10-29

- Rebuild the **Components** pane as a real graphical btop reconstruction
  instead of a label-only grid: cpu overview + cpu-core detail, gpu, mem, net,
  disks and proc boxes with themed borders, `┤ title ├` headers, dotted
  leaders, labels, values, gradient meter bars (`█`) and graph lines
  (`▁▂▃▄▅▆▇█`).
- Add pure `lib/schematic-graphics.ts` (gradient sampling, meter fill counts,
  deterministic load-scaled graph levels) and lock it with
  `tests/schematic-graphics.mjs`.
- Resolve every drawn colour from the selected theme's effective map + palette
  ramp: `cpu_box` / `mem_box` / `net_box` / `proc_box` borders, `title`,
  `main_fg`, `inactive_fg`, `graph_text`, `div_line`, `hi_fg`, the gradient
  families and `meter_bg`.
- Wire the existing controls into the drawing: load / fixed fill drive every
  meter and graph and the displayed percentages, preset chips select the box
  set, and the backdrop toggle repaints the stage.
- Make elements selectable: clicking a meter fill selects its gradient
  `*_start` key, the empty meter selects `meter_bg`, a box header selects its
  box key, and graphs/values/tabs/chips select the key they paint. Selection
  drives the right rail, gradient/palette editor, pending diff and diagnosis;
  the selected key's painted elements get a themed highlight.
- Keep the real btop **Live** pane unchanged; `make live-tests` 11/11.
- Widen the default window to 1700×900 so the three schematic columns and the
  side rails fit without horizontal clipping.
- Gates: `make gates` PASS (test / conformance 15/15 / drift / bundle /
  typecheck 0 errors in-tree).

## v0.1.2 — 2026-10-28

- Restore the **real btop live preview as the default center stage**; v0.1.1
  opened on the label-only Components pane and hid the real preview behind the
  Live tab, making the center look inert on launch.
- Render the live frame on launch and **debounce-refresh it when the effective
  theme changes** while Live is active (theme/key edits, Revert, palette
  refresh), without refreshing on selection/scope/target/control changes.
- Keep Components available with a `meterFill()`-driven sample meter so the
  load/fill controls have a visible effect in that pane.
- Restore the dedicated live scroller: the caption and Refresh control stay
  pinned, and each capture resets to the top instead of leaving the outer
  canvas on the blank end of the frame (the v0.1.1 tab refactor dropped it).
- Runtime audit: theme selection, New/Duplicate/Delete/Fork, Active, repo and
  installed saves, picker scopes, gradient, transparent, diagnosis, pending
  diff, preset/load, palette-refresh and window toggle all exercised against
  renamed source instances; v0.1.0 baseline compared for save/selection behavior.
- Pre-existing and unchanged: the `~/.dotfiles` repo-root default, the
  `ags run` warm-instance conflict, and the install-spine save path.

## v0.1.1 — 2026-10-28
 — 2026-10-28

- Visual/layout pass on the Studio shell to match mock v8:
  - header/intro strip and a 280 / 1fr / 320 three-column hierarchy;
  - left rail with save target, read-only palette/theme/config inputs, consumed
    `btop.conf`, theme library (star + kind/active badges) and the 48-key list
    with per-key colour dots;
  - center stage with a two-row load/fill controls bar, preset chips,
    generated-theme banner, Components/Live tabs, key-coverage card, diagnosis
    rows and a pending-edit diff panel;
  - right rail with selection key/value rows, "Where it shows", gradient stops,
    ramp / color0–15 / named-token palette grid, custom hex, edit scope and the
    sticky Save/Revert footer.
- The **real btop live preview** (`live/btop_live.py`) is preserved as the Live
  pane; the mock's fake schematic is not copied over it.
- `style.css` now expresses the mock-v8 panel/section vocabulary through the
  `@color_*` desktop tokens; `.canvas` and `.live-frame` remain content literals.
- Add the layout conformance test (“the studio shell keeps the mock-v8
  three-column hierarchy”) to `tests/app-contract.test.mjs`.

No state, pending-edit, save-target, fork/save or palette-refresh semantics
changed in this release.

## v0.1.0 — 2026-10-27

- Extract the btop Theme Studio from `ags-apps` v0.5.0 (`btop-theme-studio/`)
  into the standalone `ags-btop-theme-studio` repo; the repo root is the app
  package.
- Keep the identity tuple: app/instance `btop-theme-studio`, config dir
  `ags-btop-studio`, window `btop-theme-studio-window`, launcher
  `btop-theme-studio`, keybind “Open btop theme studio”, mode `live`,
  `holdsUnsavedState: true`.
- Implement the real v0.5.0 pending-aware `palette-refresh`: re-apply the
  Theme pointer, reload the runtime palette + generated base map, preserve
  staged edits/selection/scope/save target; idempotent by appearance hash.
- Copy the app's pure `lib/`, `ui/`, `tests/`, `tools/` (vendored btop v1.4.7
  sources + key→widget generator) and the real-pty `live/` preview engine
  without dropping behavior.
- Add the standalone dev flow (`AGENTS.md`, tickets, worktree guard, Makefile,
  CI, README, tests) and the manifest/handler/template conformance gate.
- Pin the local-only v0.3.0 `ags-platform`/`contracts` tuple via `.dev/`
  symlinks.
