// Component tests for lib/schematic-graphics.ts (FIX-003).
//   node tests/schematic-graphics.mjs
//
// The Components pane's btop geometry is pure: gradient sampling, meter fill
// counts and deterministic graph levels. These cases lock the primitives that
// make load / fixed-fill visibly change the schematic.
import {
  GRAPH_GLYPHS,
  clampPercent,
  filledCells,
  gradientAt,
  graphLevels,
  lerpHex,
  meterBand,
} from "../lib/schematic-graphics.ts";

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`FAIL ${name}\n  expected: ${e}\n  actual:   ${a}`);
  } else {
    console.log(`ok ${name}`);
  }
}

check("clampPercent clamps and normalises", [clampPercent(-4), clampPercent(35), clampPercent(140), clampPercent(Number.NaN)], [0, 35, 100, 0]);
check("filledCells follows btop's round(cells*pct/100)", [filledCells(35, 20), filledCells(0, 20), filledCells(100, 20), filledCells(50, 7)], [7, 0, 20, 4]);
check("filledCells never overflows", [filledCells(120, 8), filledCells(-10, 8)], [8, 0]);

check("lerpHex hits both ends", [lerpHex("#000000", "#ffffff", 0), lerpHex("#000000", "#ffffff", 1)], ["#000000", "#ffffff"]);
check("lerpHex handles an invalid colour via fallback", lerpHex("", "#ffffff", 0.5, "#ff0000"), "#ff8080");

check(
  "gradientAt samples start/mid/end",
  [
    gradientAt({ start: "#000000", mid: "#808080", end: "#ffffff" }, 0, 3),
    gradientAt({ start: "#000000", mid: "#808080", end: "#ffffff" }, 2, 3),
  ],
  ["#555555", "#ffffff"],
);
check(
  "gradientAt treats an empty mid as a two-stop ramp",
  gradientAt({ start: "#000000", mid: "", end: "#ffffff" }, 0, 2),
  "#808080",
);

check("GRAPH_GLYPHS has btop's eight heights", GRAPH_GLYPHS.length, 8);

const low = graphLevels(36, 0, 0);
const high = graphLevels(36, 100, 0);
check("graphLevels emits one level per column", [low.length, high.length], [36, 36]);
check("graphLevels stays within 0-7", [...low, ...high].every((level) => level >= 0 && level <= 7), true);
const average = (levels) => levels.reduce((sum, value) => sum + value, 0) / levels.length;
check("higher load raises the graph", average(high) > average(low), true);
check("graphLevels is deterministic", JSON.stringify(graphLevels(10, 50, 3)), JSON.stringify(graphLevels(10, 50, 3)));

const band = meterBand(
  { start: "#000000", mid: "#808080", end: "#ffffff" },
  50,
  10,
  "#222222",
);
check("meterBand splits fill and empty", [band.filled, band.fill.length, band.empty, band.glyph, band.emptyGlyph], [5, 5, "#222222", "█", "█"]);

const transparent = meterBand(
  { start: "#000000", mid: "#808080", end: "#ffffff" },
  50,
  10,
  "",
);
check(
  "a transparent meter_bg still draws a graphical empty band",
  [transparent.empty, transparent.emptyGlyph],
  ["#555b66", "░"],
);

if (failures > 0) {
  console.error(`${failures} case(s) mismatched`);
  process.exitCode = 1;
} else {
  console.log("schematic-graphics cases agree");
}
