// Theme model, pending edits, picker scopes, diagnosis, and the one-click
// meter fixes (design D7/D9, capability `btop-theme-studio`).
//
// Pure and I/O-free: the UI layer owns file reads/writes and the AGS
// containers. Everything here is unit-testable with plain node.

import type { Palette } from "ags-platform/ports/palette";
import {
  GRADIENT_FAMILIES,
  THEME_KEYS,
  keysOf,
  familyOf,
  isGradientStop,
  roleSuffix,
  sameRoleKeys,
} from "./theme-keys.ts";

export type ThemeKind = "generated" | "authored";

export interface Theme {
  readonly id: string;
  readonly name: string;
  readonly kind: ThemeKind;
  readonly active: boolean;
  readonly map: Readonly<Record<string, string>>;
}

/** Pending edits: theme key → new (unwritten) value. */
export type PendingEdits = ReadonlyMap<string, string>;

export type Scope = "key" | "role" | "all";

export const TRANSPARENT = "";

const FALLBACK = "#ff00ff";

/**
 * The canonical btop key -> palette.v1 role mapping (48 keys).
 *
 * This mirrors theme-producer's `BTOP_KEY_ROLES` capability table
 * (`src/theme_producer/adapters/projections/btop.py`): the studio's generated
 * base and the runtime's `colors.btop.theme` projection must agree. Users may
 * still edit any key (literal hex or another role) in the pending map.
 */
export const BTOP_KEY_ROLES: Readonly<Record<string, string>> = Object.freeze({
  main_bg: "surface",
  main_fg: "on_surface",
  title: "primary",
  hi_fg: "primary",
  selected_bg: "primary_container",
  selected_fg: "on_primary_container",
  inactive_fg: "outline",
  graph_text: "on_surface_variant",
  meter_bg: "surface_container_high",
  proc_misc: "secondary",
  cpu_box: "outline_variant",
  mem_box: "outline_variant",
  net_box: "outline_variant",
  proc_box: "outline_variant",
  div_line: "outline_variant",
  proc_pause_bg: "secondary_container",
  proc_follow_bg: "primary_container",
  proc_banner_bg: "tertiary_container",
  proc_banner_fg: "on_tertiary_container",
  followed_bg: "primary_container",
  followed_fg: "on_primary_container",
  temp_start: "tertiary",
  temp_mid: "secondary",
  temp_end: "error",
  cpu_start: "primary",
  cpu_mid: "secondary",
  cpu_end: "tertiary",
  free_start: "surface_container_low",
  free_mid: "surface_container",
  free_end: "surface_container_high",
  cached_start: "tertiary",
  cached_mid: "secondary",
  cached_end: "error",
  available_start: "surface_container_low",
  available_mid: "surface_container",
  available_end: "surface_container_high",
  used_start: "primary_container",
  used_mid: "secondary_container",
  used_end: "tertiary_container",
  download_start: "surface_container_low",
  download_mid: "surface_container",
  download_end: "surface_container_high",
  upload_start: "surface_container_low",
  upload_mid: "surface_container",
  upload_end: "surface_container_high",
  process_start: "primary_container",
  process_mid: "secondary_container",
  process_end: "tertiary_container",
});

/**
 * A small semantic fallback when the platform palette is unavailable (first
 * launch before the runtime has produced `colors.yaml`). It is deliberately a
 * role map, not a legacy `colors:` index list: the studio never invents the
 * old carrier shape again.
 */
export const FALLBACK_PALETTE: Palette = Object.freeze({
  version: "1",
  roles: Object.freeze({
    background: "#101216",
    surface: "#101216",
    on_surface: "#c2c2c5",
    on_surface_variant: "#a8a8ad",
    surface_container_low: "#16171c",
    surface_container: "#1b1c22",
    surface_container_high: "#25262e",
    outline: "#8b8b93",
    outline_variant: "#3a3a42",
    primary: "#6ea8fe",
    on_primary: "#0b0b1a",
    primary_container: "#2d3a52",
    on_primary_container: "#dbe4ff",
    secondary: "#9a7268",
    on_secondary: "#1a1210",
    secondary_container: "#3a2f2c",
    on_secondary_container: "#ffd9d0",
    tertiary: "#dbab67",
    on_tertiary: "#1f1608",
    tertiary_container: "#4a3a22",
    on_tertiary_container: "#ffe1b3",
    error: "#ff6b6b",
    on_error: "#2a0000",
    error_container: "#5a1f1f",
    on_error_container: "#ffdada",
    on_backdrop: "#e3e1e9",
  }),
});

/**
 * Resolve a theme value to a hex colour. A `#` literal is returned verbatim;
 * an empty string is btop's transparent value; anything else is a palette.v1
 * role name resolved through the platform palette. Unknown tokens are the
 * diagnostic magenta fallback, never a stale `ramp[i]`/`colorN` index.
 */
export function resolveHex(value: string | undefined, palette: Palette): string {
  if (value === undefined) return FALLBACK;
  if (value === "") return TRANSPARENT;
  if (value.startsWith("#")) return value;
  return palette.roles[value] ?? FALLBACK;
}

/** The effective theme map: on-disk map overlaid with pending edits. */
export function effectiveMap(
  map: Readonly<Record<string, string>>,
  edits: PendingEdits,
): Record<string, string> {
  const next: Record<string, string> = { ...map };
  for (const [key, value] of edits) next[key] = value;
  return next;
}

/** The keys a pick applies to for a scope (spec: This key / Same role / All). */
export function scopeKeys(
  key: string,
  scope: Scope,
  map: Readonly<Record<string, string>>,
): string[] {
  if (scope === "key") return [key];
  if (scope === "role") return sameRoleKeys(key);
  return keysOf(map);
}

/** Apply a pick at a scope; returns the next pending-edit map. */
export function applyPick(
  edits: PendingEdits,
  key: string,
  value: string,
  scope: Scope,
  map: Readonly<Record<string, string>>,
): Map<string, string> {
  const next = new Map(edits);
  for (const target of scopeKeys(key, scope, map)) next.set(target, value);
  return next;
}

export interface DiffEntry {
  readonly key: string;
  readonly from: string;
  readonly to: string;
}

/** The pending edits as an ordered diff against the on-disk map. */
export function diffEdits(
  map: Readonly<Record<string, string>>,
  edits: PendingEdits,
): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const key of keysOf(map)) {
    if (!edits.has(key)) continue;
    const from = map[key] ?? "";
    const to = edits.get(key) as string;
    if (from !== to) entries.push({ key, from, to });
  }
  return entries;
}

/** Revert discards every pending edit (spec scenario: diff returns to empty). */
export function revert(): Map<string, string> {
  return new Map();
}

// ── One-click meter fixes ───────────────────────────────────────────────────

/**
 * "Reserve surface for meters": the unfilled meter is drawn from the theme's
 * surface (`main_bg`) and the used floor is raised (`used_start` ← `used_mid`),
 * so a low-load meter no longer reads as full.
 */
export function fixReserveSurface(map: Readonly<Record<string, string>>): Record<string, string> {
  const next = { ...map };
  next.meter_bg = next.main_bg ?? TRANSPARENT;
  if (next.used_mid) next.used_start = next.used_mid;
  return next;
}

/** "Transparent meters": the unfilled meter becomes transparent (empty value). */
export function fixTransparentMeters(map: Readonly<Record<string, string>>): Record<string, string> {
  return { ...map, meter_bg: TRANSPARENT };
}

// ── Gradient editor ─────────────────────────────────────────────────────────

export const GRADIENT_LIMIT_NOTE =
  "btop gradients have exactly three stops (start / mid / end). New theme keys cannot be added — btop ignores unknown ones.";

/** True when a family's mid stop is empty (a two-stop gradient). */
export function isTwoStop(map: Readonly<Record<string, string>>, family: string): boolean {
  const mid = map[`${family}_mid`];
  return mid === undefined || mid === "";
}

/**
 * "Add middle colour" for a two-stop gradient: set `*_mid` to the start colour
 * (falling back to the end), turning it into a three-stop gradient.
 */
export function addMiddleColour(map: Readonly<Record<string, string>>, family: string): Record<string, string> {
  if (!GRADIENT_FAMILIES.includes(family)) return { ...map };
  const next = { ...map };
  next[`${family}_mid`] = next[`${family}_start`] || next[`${family}_end`] || TRANSPARENT;
  return next;
}

// ── Diagnosis ───────────────────────────────────────────────────────────────

export type DiagnosisLevel = "error" | "warn" | "ok";

export interface Diagnosis {
  readonly level: DiagnosisLevel;
  readonly message: string;
}

function relativeLuminance(hex: string): number {
  if (!hex.startsWith("#") || hex.length !== 7) return 0.5;
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * Meter-contrast defects. The motivating defect: `used_start` and `meter_bg`
 * resolve to the same colour, so a low-load meter block vanishes into the empty
 * meter. Also flags an unfilled meter that competes with the background.
 */
export function diagnose(map: Readonly<Record<string, string>>, palette: Palette): Diagnosis[] {
  const out: Diagnosis[] = [];
  const usedStart = resolveHex(map.used_start, palette);
  const meterBg = resolveHex(map.meter_bg, palette);
  const background = resolveHex(map.main_bg, palette);

  if (map.used_start !== undefined && map.meter_bg !== undefined && usedStart === meterBg) {
    out.push({
      level: "error",
      message:
        `used_start and meter_bg are the SAME colour (${usedStart}) — ` +
        "low-load meter blocks vanish into the empty meter.",
    });
  }

  if (map.meter_bg !== undefined && map.main_bg !== undefined) {
    if (meterBg === TRANSPARENT) {
      out.push({ level: "ok", message: "meter_bg is transparent — the unfilled meter shows the surface behind it." });
    } else {
      const delta = Math.abs(relativeLuminance(meterBg) - relativeLuminance(background));
      if (delta > 0.02) {
        out.push({
          level: "warn",
          message:
            `meter_bg differs from the background (Δ ${delta.toFixed(2)}) — ` +
            "the unfilled part of every meter competes with the data.",
        });
      } else {
        out.push({ level: "ok", message: `meter_bg sits against the background (Δ ${delta.toFixed(2)}).` });
      }
    }
  }

  if (map.used_start !== undefined && map.meter_bg !== undefined && usedStart !== TRANSPARENT) {
    const delta = Math.abs(relativeLuminance(usedStart) - relativeLuminance(meterBg));
    if (delta < 0.05) {
      out.push({
        level: "warn",
        message: `used low-end is close to meter_bg (Δ ${delta.toFixed(2)}) — a low-load meter may still read as full.`,
      });
    }
  }

  return out;
}

// ── Theme library ───────────────────────────────────────────────────────────

export interface LibraryState {
  readonly themes: readonly Theme[];
}

/** The generated base is read-only and palette-linked: it can be forked, not deleted. */
export function canDelete(theme: Theme): boolean {
  return theme.kind !== "generated";
}

export function deleteTheme(library: LibraryState, id: string): LibraryState {
  const theme = library.themes.find((candidate) => candidate.id === id);
  if (!theme || !canDelete(theme)) return library;
  return { themes: library.themes.filter((candidate) => candidate.id !== id) };
}

/** Fork a theme: freeze its current resolved colours into a new authored theme. */
export function forkTheme(theme: Theme, id: string, name: string, palette: Palette): Theme {
  const map: Record<string, string> = {};
  for (const key of keysOf(theme.map)) map[key] = resolveHex(theme.map[key], palette);
  return { id, name, kind: "authored", active: false, map };
}

/** Duplicate a theme as-is (keeping its token form) into a new authored theme. */
export function duplicateTheme(theme: Theme, id: string, name: string): Theme {
  return { id, name, kind: "authored", active: false, map: { ...theme.map } };
}

/** Create a fresh authored theme from a base map. */
export function createTheme(id: string, name: string, map: Readonly<Record<string, string>>): Theme {
  return { id, name, kind: "authored", active: false, map: { ...map } };
}

/** Mark exactly one theme active (the one btop uses via `color_theme`). */
export function markActive(library: LibraryState, id: string): LibraryState {
  if (!library.themes.some((theme) => theme.id === id)) return library;
  return { themes: library.themes.map((theme) => ({ ...theme, active: theme.id === id })) };
}

// ── Serialization ───────────────────────────────────────────────────────────

/** Serialize a theme to btop's `.theme` body (`theme[key]="value"` per line). */
export function serializeTheme(map: Readonly<Record<string, string>>): string {
  return keysOf(map)
    .map((key) => `theme[${key}]="${map[key]}"`)
    .join("\n")
    .concat("\n");
}

/** Parse a btop `.theme` body into a key→value map. */
export function parseTheme(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /^theme\[([A-Za-z0-9_]+)\]="([^"]*)"/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) map[match[1]] = match[2];
  return map;
}

/**
 * The generated base map (palette-linked role tokens) for a fresh session.
 * Every one of the 48 btop keys starts on the canonical role in
 * `BTOP_KEY_ROLES`; the user can then pick a different role or a literal hex.
 */
export function generatedDefaultMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const key of THEME_KEYS) map[key] = BTOP_KEY_ROLES[key] ?? "";
  return map;
}

export { THEME_KEYS, GRADIENT_FAMILIES, familyOf, isGradientStop, roleSuffix };
