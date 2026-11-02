# ags-btop-theme-studio

Standalone AGS/GTK4 **btop Theme Studio** — a launch-on-demand authoring tool
for btop themes. The repo root **is** the app package.

Extracted from `ags-apps` tag `v0.5.0`, directory `btop-theme-studio/`, without
dropping behavior: the single centered window, the pure theme model, the
generated key→widget map + vendored btop sources + generator, the save pipeline
and the real-pty live-preview engine all travel with the app.

| Field | Value |
| --- | --- |
| Repo | `ags-btop-theme-studio` |
| App id | `btop-theme-studio` |
| AGS instance | `btop-theme-studio` |
| Config dir | `ags-btop-studio` |
| Window | `btop-theme-studio-window` |
| Launcher | `btop-theme-studio` |
| Keybind description | Open btop theme studio |
| Manifest mode | `live` (`holdsUnsavedState: true`) |

`app.manifest.json` is the single identity source. The runtime discovers the
deployed config link, requires `manifest.instance == app.tsx instanceName ==
ags list`, and requires `manifest.configDir == the deployed link basename`.

## What it does

The studio makes btop's two systemic colour defects visible (`meter_bg` and
`used_start` resolving to the same mid-luminance palette stop) and lets a user
create, fork, tune, preview and deploy themes:

- **Schematic** — consumes btop's real config (`shown_boxes` + `presets`) and
  never invents box geometry.
- **Key tree + generated key→widget map** — "where does this key show?" is
  answered from a committed artifact generated from btop's own source, with a
  drift guard.
- **Palette picker, gradient editor, diagnosis, diff** — pure `lib/` logic,
  unit-tested with plain `node`.
- **Save targets** — repo-authoritative or installed-spine, with the resolved
  path shown read-only.
- **Live preview** — the **real btop binary** on a pty (`live/btop_live.py`),
  kept warm, reloaded with `SIGUSR2` per edit, and reconstructed with `pyte`.
  It writes only to a throwaway temp root.

## Thin platform consumer

This app depends on `ags-platform`, never on another app (AD-1):

- **Theming** — the desktop palette is applied through the `Theme` port
  (`ags-platform/adapters/theme`, AD-13). `style.css` chrome is bound to the
  typed `palette.v1` roles (`@surface`, `@on_surface`, `@primary`, …) so a
  palette swap restyles the window. The studio also reads the same typed
  palette via `theme.palette()`; its generated candidate is a semantic
  key→role map, not the legacy `colors:` index/ramp list. The two CONTENT
  literals that remain are deliberate: `.canvas` is the neutral stage the
  candidate btop theme is judged on, and `.live-frame` reproduces btop's own
  black terminal.
- **Icons / events** — this app has no icon-registry or event-bus copy and
  consumes no contract topic: it reads and writes files locally. The
  platform-consumption test pins that it does not grow one.
- **AD-24 (overlay lifecycle)** — measured, not assumed; the studio keeps the
  direct window-tree build (13.1 ms), as recorded in the original migration.

## `palette-refresh` (live, pending-aware)

The runtime invokes:

```sh
ags request palette-refresh <appearance-hash> -i btop-theme-studio
```

The app:

1. re-applies the stable Theme pointer;
2. reloads the runtime palette and the generated base map;
3. leaves the staged edits (`pending`), selected theme, picked key, edit scope,
   save target and preview controls exactly as they are.

`lib/appearance.ts` owns the ordering and hash idempotency; `lib/palette-refresh.ts`
binds the platform's `createPaletteRefreshHandler`, so the response is exactly
one JSON-encoded string (`{"ok":true}` or a protocol failure). A thrown refresh
is retryable and is not recorded as applied. A wallpaper change never restarts
the process; `holdsUnsavedState: true` means the refresh may never discard
pending work.

## Layout

| path | role |
|---|---|
| `app.tsx` | AGS entry point — instance `btop-theme-studio`, one centered window |
| `app.manifest.json` | identity tuple |
| `lib/` | pure, I/O-free logic (unit-tested with plain `node`) |
| `lib/palette-refresh.ts` | the executable live-refresh handler wiring |
| `lib/appearance.ts` | pending-aware refresh order + appearance-hash idempotency |
| `lib/key_widgets.json` | canonical generated key→widget map (drift-checked) |
| `lib/key-widgets.generated.ts` | the importable form of the same artifact |
| `ui/StudioWindow.tsx` | the window: schematic, key tree, picker, diagnosis, diff, save targets, live view |
| `tools/key_widgets.py` | the generator + drift-guard verifier |
| `tools/btop_*.cpp` | vendored btop v1.4.7 sources the generator parses (Apache-2.0) |
| `live/btop_live.py` | the live preview engine (real btop on a pty + `pyte`) |
| `tests/` | pure suites + platform consumption + manifest/handler/template conformance |
| `live/tests/` | live-engine tests (`uv run --with pyte pytest`) |
| `tsconfig.app.json` | app typecheck config (hand-written, committed) |
| `tickets/` | LIFECYCLE, INDEX, `_template`, this repo's tickets |
| `scripts/worktree-guard.sh` | no-main / dirty-main-aborts discipline |

### Why the Python engine and generated map live here

Both are app runtime / reproducibility assets, not provisioning concerns:

- `live/btop_live.py` is what the “Refresh live preview” button executes
  (`<cwd>/live/btop_live.py`, where `ags run -d .` puts the app dir in cwd).
  Shipping the app without it would break the Live view.
- `lib/key_widgets.json` + `lib/key-widgets.generated.ts` are imported app
  source, and `tools/` is the generator that `key-widgets-verify` re-runs as a
  drift guard. They must travel with the app for the gate to stay meaningful.

## Local development

The program tuple is `ags-platform` `v0.4.0` / `contracts` `v0.3.0`. In this
run those tags are local-only; the local gates use gitignored symlinks under
`.dev/`:

```sh
mkdir -p .dev/ags-platform .dev/contracts
ln -s ../../../ags-platform .dev/ags-platform/v0.4.0
ln -s ../../../contracts .dev/contracts/v0.3.0
```

`make platform-dev` also links `node_modules/ags-platform` (the Node-friendly
shortcut); `make contracts-dev` creates the contracts shortcut. `.dev/` is
gitignored and never committed.

```sh
make test          # pure suites + executable palette-refresh handler tests
make conformance   # manifest + handler + template conformance
make drift         # re-derive lib/key_widgets.json from vendored btop sources
make typecheck     # LOCAL desktop stack: ags + GIR declarations
make bundle        # LOCAL: ags bundle app.tsx build/btop-theme-studio.js
make live-tests    # LOCAL/manual: real btop on a pty (uv + pyte)
make gates         # test + conformance + drift + bundle + typecheck
```

`make test`, `make conformance` and `make drift` are the stock-runner gates
(`make ci`). Typecheck is local and authoritative; CI deliberately has no
self-hosted job (AD-19/AD-23).

Run the app:

```sh
ags run -d .
ags request palette-refresh <appearance-hash> -i btop-theme-studio
```

## Vendored sources

`tools/btop_draw.v1.4.7.cpp` and `tools/btop_theme.cpp` are vendored from btop
v1.4.7 (Apache-2.0) solely so the generator is reproducible and drift-checked.
They are not compiled. Refresh them deliberately when pinning a new btop
version, then regenerate the artifact with `make drift` (and `--ts`).

## Consumer surfaces

`dotfiles-v3` / the composition app list owns deployment; `dotfiles-provision`
installs the tag and links `config/ags-btop-studio`; `dotfiles-assets` owns the
keybind described as **Open btop theme studio** and the `btop-theme-studio`
launcher. This repo does not provision or edit those repos; it proves only the
app-side contract.
