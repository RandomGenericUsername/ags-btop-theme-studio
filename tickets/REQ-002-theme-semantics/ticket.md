---
id: REQ-002
title: "Migrate the studio to palette.v1 role semantics"
kind: requirement
status: in-progress
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-002/
branch: ticket/REQ-002-theme-semantics
---

# Migrate the studio to palette.v1 role semantics

## Requirement

The studio must stop treating the runtime `colors.yaml` as the legacy CSG shape
(flat `background`/`foreground` plus the `colors:` index list) and must stop
using legacy `@color_*` tokens in its own chrome. It reads the typed
`palette.v1` role map through the platform (`theme.palette()`), maps semantic
roles to the 48 btop keys, and keeps the btop output format
(`theme[key]="value"`) and the user-editable pending-edit/save behavior.

Two layers:

1. **UI chrome CSS** — every `@color_*` reference becomes a `palette.v1` role
   reference (`@surface`, `@on_surface`, `@primary`, …), preserving alpha,
   geometry and selectors.
2. **Content model** — the generated candidate/preview base is a role map, not
   a `colors:` index/ramp list. The picker offers the runtime's role map; the
   generated map resolves role tokens through the same palette. Literal hex
   (authored themes and user picks) stays literal.

No behavior regression: unsaved edits (`pending`), the selected theme, picked
key, scope, save target and preview controls survive a `palette-refresh`; the
studio never restarts on refresh.

## Role → btop key mapping

Mirrors theme-producer's canonical `BTOP_KEY_ROLES` table
(`theme-producer/src/theme_producer/adapters/projections/btop.py`) so a
generated studio theme and the runtime projection agree.

| btop key | palette.v1 role |
| --- | --- |
| `main_bg` | `surface` |
| `main_fg` | `on_surface` |
| `title` | `primary` |
| `hi_fg` | `primary` |
| `selected_bg` | `primary_container` |
| `selected_fg` | `on_primary_container` |
| `inactive_fg` | `outline` |
| `graph_text` | `on_surface_variant` |
| `meter_bg` | `surface_container_high` |
| `proc_misc` | `secondary` |
| `cpu_box`, `mem_box`, `net_box`, `proc_box`, `div_line` | `outline_variant` |
| `proc_pause_bg` | `secondary_container` |
| `proc_follow_bg`, `followed_bg` | `primary_container` |
| `proc_banner_bg` | `tertiary_container` |
| `proc_banner_fg` | `on_tertiary_container` |
| `followed_fg` | `on_primary_container` |
| `temp_start`, `cached_start` | `tertiary` |
| `temp_mid`, `cached_mid`, `cpu_mid` | `secondary` |
| `temp_end`, `cached_end` | `error` |
| `cpu_start` | `primary` |
| `cpu_end` | `tertiary` |
| `free_*`, `available_*`, `download_*`, `upload_*` | `surface_container_low` / `surface_container` / `surface_container_high` |
| `used_start`, `process_start` | `primary_container` |
| `used_mid`, `process_mid` | `secondary_container` |
| `used_end`, `process_end` | `tertiary_container` |

## Acceptance

- [ ] `rg -n '@color_' . --glob '*.css' --glob '*.ts' --glob '*.tsx' --glob '!node_modules' --glob '!build'` returns zero.
- [ ] Chrome CSS uses roles by intent: ink `on_surface`, panels `surface`,
      actions `primary`/`on_primary`, attention `tertiary`, muted
      `on_surface_variant`/`surface_container_high`, destructive
      `error`/`error_container`; alpha/geometry unchanged.
- [ ] Studio palette comes from `theme.palette()`; no app-side parse of
      `colors.yaml` and no `colors:` list indexing.
- [ ] `generatedDefaultMap()` is the role table above; `resolveHex()` resolves
      role tokens through `Palette.roles` and leaves literal hex alone.
- [ ] Picker lists palette roles (plus custom hex/transparent), not
      `ramp[i]` / `color0–15`.
- [ ] btop output is still one `theme[key]="value"` line per key (48 keys),
      and pending edits remain user-editable and are never overwritten by a
      refresh.
- [ ] `make test`, `make conformance`, `make drift`, `make bundle`,
      `make typecheck` pass; platform pin is `v0.4.0`, contracts `v0.3.0`.
- [ ] Screenshots (or an explicit eyeball list) show the studio chrome and the
      Components/preview stage before/after.
