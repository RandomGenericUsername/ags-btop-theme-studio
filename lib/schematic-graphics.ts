// btop schematic graphics
//
// PURE helpers for the Components pane's btop reconstruction: gradient
// sampling across a start/mid/end ramp, meter fill counts, and deterministic
// graph levels. No GTK, no AGS, no I/O — the studio renders these values as
// block glyphs, so a stock-runner test can execute the real geometry.
//
// btop itself draws meters with a three-stop gradient and graphs with eight
// block heights. The mock v8 `#btop` reconstruction uses the same primitives;
// these helpers are the single source of truth for both the full schematic and
// the key-coverage sample meter.

/** The eight block heights btop graphs use, lowest first. */
export const GRAPH_GLYPHS: readonly string[] = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** The block btop uses for a filled meter cell. */
export const METER_GLYPH = "█";

/** The block used when `meter_bg` is transparent (graphical, not a glyph gap). */
export const TRANSPARENT_METER_GLYPH = "░";

export interface GradientStops {
  readonly start: string;
  readonly mid: string;
  readonly end: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Clamp a level to btop's 0–100 range (non-finite values become 0). */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function channels(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, "0");
}

/**
 * Interpolate two `#rrggbb` colours. An invalid colour (including btop's
 * transparent `""`) resolves to `fallback`, so the schematic still draws a
 * visible primitive instead of a bare label.
 */
export function lerpHex(a: string, b: string, t: number, fallback = "#ff00ff"): string {
  const from = channels(a) ?? channels(fallback) ?? [255, 0, 255];
  const to = channels(b) ?? from;
  const amount = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return `#${from.map((value, index) => toHex(value + (to[index] - value) * amount)).join("")}`;
}

/**
 * The colour at `index` of `count` across a three-stop gradient. An empty
 * `mid` is btop's two-stop form, so the interpolation runs start → end.
 */
export function gradientAt(
  stops: GradientStops,
  index: number,
  count: number,
  fallback = "#ff00ff",
): string {
  if (count <= 1) return channels(stops.start) ? stops.start : fallback;
  const position = (Math.max(0, index) + 1) / count;
  const mid = channels(stops.mid) ? stops.mid : null;
  if (mid === null) return lerpHex(stops.start, stops.end, position, fallback);
  if (position <= 0.5) return lerpHex(stops.start, mid, position / 0.5, fallback);
  return lerpHex(mid, stops.end, (position - 0.5) / 0.5, fallback);
}

/** Number of filled meter cells for a level: btop's `round(cells * pct / 100)`. */
export function filledCells(percent: number, cells: number): number {
  const width = Math.max(0, Math.floor(cells));
  if (width === 0) return 0;
  return Math.max(0, Math.min(width, Math.round((width * clampPercent(percent)) / 100)));
}

/**
 * Deterministic graph levels for a meter family. The wave shape is the mock's
 * (two summed sines), scaled by the current load so the load / fixed-fill
 * controls visibly change every graph line. Returned levels are always 0–7.
 */
export function graphLevels(width: number, intensity: number, phase = 0): number[] {
  const columns = Math.max(0, Math.floor(width));
  const scale = 0.22 + 0.78 * (clampPercent(intensity) / 100);
  const levels: number[] = [];
  for (let index = 0; index < columns; index += 1) {
    const wave =
      0.62 * ((Math.sin((index + phase) / 5.4) + 1) / 2) +
      0.38 * ((Math.sin((index + phase) / 2.3) + 1) / 2);
    levels.push(Math.max(0, Math.min(7, Math.round(wave * 7 * scale))));
  }
  return levels;
}

/** A meter's fill/empty split as colours for rendering. */
export interface MeterBand {
  readonly fill: readonly string[];
  readonly empty: string;
  readonly filled: number;
  readonly glyph: string;
  readonly emptyGlyph: string;
}

/**
 * Build the colour band for one meter. `meterBackground` transparent (`""`)
 * becomes the supplied faint colour and a lighter glyph, keeping the empty
 * geometry visible without pretending a colour exists.
 */
export function meterBand(
  stops: GradientStops,
  percent: number,
  cells: number,
  meterBackground: string,
  faint = "#555b66",
): MeterBand {
  const width = Math.max(1, Math.floor(cells));
  const filled = filledCells(percent, width);
  const fill: string[] = [];
  for (let index = 0; index < filled; index += 1) {
    fill.push(gradientAt(stops, index, filled));
  }
  const transparent = meterBackground === "";
  return {
    fill,
    empty: transparent ? faint : meterBackground,
    filled,
    glyph: METER_GLYPH,
    emptyGlyph: transparent ? TRANSPARENT_METER_GLYPH : METER_GLYPH,
  };
}
