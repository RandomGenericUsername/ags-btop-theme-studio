# AGENTS.md — ags-btop-theme-studio operating contract

Canonical agent instructions for this repo. Claude (`CLAUDE.md` symlinks here),
OpenCode and every BMAD/OpenSpec skill must follow this.

## 1. Evidence rule (hard requirement)

Every technical claim carries testable evidence: a file path + line range, a
commit SHA, a URL + quoted section, or an executed command with its result.

Format: non-trivial claims get `Evidence:` and `Verify:` lines. If evidence does
not exist yet, write `Evidence: MISSING — run <X>` and do not present the claim
as fact. Prefer executed output over recalled text.

## 2. What this repo is

`ags-btop-theme-studio` is the standalone btop Theme Studio: a launch-on-demand
AGS/GTK4 authoring tool. The repo root **is** the app package: `app.tsx` lives
at the root, never in a subdirectory.

Identity is single-valued and enforced by `app.manifest.json`:

```text
app=btop-theme-studio  instance=btop-theme-studio  configDir=ags-btop-studio
mode=live              holdsUnsavedState=true
```

- Window: `btop-theme-studio-window`; launcher: `btop-theme-studio`; keybind
  description: “Open btop theme studio”.
- No app imports another app. Depend on `ags-platform` (and `contracts` at test
  time only), never on a sibling app repo.
- This repo is the extraction of `ags-apps` v0.5.0 `btop-theme-studio/`. It
  carries the whole app package: the pure `lib/` model, the `ui/` window, the
  vendored btop sources + key→widget generator in `tools/`, and the real
  `live/btop_live.py` preview engine.
- No GUI or host changes belong here. Provisioning, the app list, keybinds and
  launchers are owned by `dotfiles-provision` / `dotfiles-assets`; this repo
  proves only the app-side contract.

## 3. Ticket flow

All work starts in `tickets/` (`_template/`, `INDEX.md`, `LIFECYCLE.md`).
App-local work is ticketed here; cross-app program work stays in `ags-apps`
until archive.

Never work on main: `scripts/worktree-guard.sh check-clean` before starting and
`scripts/worktree-guard.sh create <id> <slug>` to branch + worktree. Record
`worktree=` and `branch=` in the ticket. Keep changes small, verifiable and
committable; never mix planning edits with implementation in one turn.

## 4. Local gates vs stock CI

**Local is authoritative for typecheck.** CI runs only stock-runner jobs
(`ubuntu-latest`): `make test`, `make conformance` and `make drift`. There is
no self-hosted runner and no CI secret dependency.

- `make test` — pure unit suites: the studio libraries, platform consumption,
  the generated key→widget drift guard, and the executable `palette-refresh`
  handler tests. Node + python3 only.
- `make conformance` — manifest identity, the real live handler and the shared
  template gate.
- `make drift` — re-derive `lib/key_widgets.json` from the vendored btop
  v1.4.7 sources.
- `make typecheck` — LOCAL: needs `ags` on PATH plus GIR; generates
  machine-specific `@girs/` and `env.d.ts` (gitignored).
- `make bundle` — LOCAL: `ags bundle app.tsx build/btop-theme-studio.js`.
- `make live-tests` — LOCAL/manual: the real-pty preview engine (needs btop,
  `uv`, `pyte`). Deliberately not a stock-runner gate.
- `make gates` — test + conformance + drift + bundle + typecheck.

The program tuple is `ags-platform` v0.4.0 / `contracts` v0.3.0, local-only in
this run. Locally the tags are symlinked under `.dev/` (gitignored); CI checks
the tags out explicitly. Never commit a fetched platform, a `contracts`
checkout, `node_modules/`, `@girs/`, generated `tsconfig.json` or bundle output.

## 5. Palette-refresh invariants

`lib/palette-refresh.ts` and `lib/appearance.ts` are pure and executed by
tests. `app.tsx` registers the platform helper with this app's real work.

- exactly one JSON-string response per request, through the platform helper;
- idempotent by appearance hash; a thrown refresh is not recorded as applied;
- re-apply the Theme pointer before reloading the palette inputs;
- **pending-aware** (`holdsUnsavedState: true`): the reload only replaces the
  runtime palette and the generated base map. Staged edits (`pending`), the
  selected theme, the picked key, the edit scope, the save target and the
  live-preview controls survive. Never restart, quit or reset the studio.

`make conformance` asserts these source invariants and the platform
`checkAppRepo` template gate. Do not weaken them to make a test pass.

## 6. Releases

Immutable annotated tags (`v0.1.0`, …); a published tag is never moved.
Installed tags are read-only and writable state lives under XDG paths (AD-37).
Tag only after `make gates` passes, and record the evidence in the release
ticket.
