// ---------------------------------------------------------------------------
// Manifest + handler + template conformance for the standalone
// ags-btop-theme-studio app (AD-26/AD-27/AD-33/AD-35).
//
// This is the repo-local gate the standalone contract requires:
//   1. `app.manifest.json` is schema-valid and carries the studio identity;
//   2. app.tsx / window / launcher / config dir agree with that identity;
//   3. the live palette-refresh handler is the real v0.5.0 pending-aware work
//      (Theme pointer + palette reload) wrapped in the protocol helper;
//   4. the shared dev-flow template is present and the platform's own
//      `checkAppRepo` template gate passes;
//   5. no template token survives and the local program tuple is pinned.
//
// Run from the repo root:  make conformance
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAgsAppManifest } from "ags-platform/ports/app-manifest";
import {
  checkAppRepoAt,
  formatAppConformanceReport,
} from "ags-platform/conformance/app-conformance";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const IDENTITY = {
  schemaVersion: 1,
  app: "btop-theme-studio",
  instance: "btop-theme-studio",
  configDir: "ags-btop-studio",
  mode: "live",
  holdsUnsavedState: true,
};

function readText(...parts) {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

/** Strip comments, keeping strings intact. */
function stripComments(source) {
  let out = "";
  let state = null;
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (state === "line") {
      if (c === "\n") {
        state = null;
        out += c;
      }
      i += 1;
      continue;
    }
    if (state === "block") {
      if (c === "*" && next === "/") {
        state = null;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (state === "'" || state === '"' || state === "`") {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === state) state = null;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      state = "line";
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      state = "block";
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") state = c;
    out += c;
    i += 1;
  }
  return out;
}

/** The `{...}` body of the function named by `marker`, comments stripped. */
function functionBody(source, marker) {
  const clean = stripComments(source);
  const start = clean.indexOf(marker);
  assert.notEqual(start, -1, `missing function marker: ${marker}`);
  const brace = clean.indexOf("{", start);
  assert.notEqual(brace, -1, `missing function body for: ${marker}`);
  let depth = 0;
  let state = null;
  for (let i = brace; i < clean.length; i += 1) {
    const c = clean[i];
    if (state !== null) {
      if (c === "\\") {
        i += 1;
      } else if (c === state) {
        state = null;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      state = c;
      continue;
    }
    if (c === "{") depth += 1;
    if (c === "}") {
      depth -= 1;
      if (depth === 0) return clean.slice(brace + 1, i);
    }
  }
  throw new Error(`unterminated function body: ${marker}`);
}

function findContractsRoot() {
  const override = process.env.CONTRACTS_ROOT;
  if (override) return override;
  let dir = ROOT;
  for (let i = 0; i < 8; i += 1) {
    dir = dirname(dir);
    if (existsSync(join(dir, "contracts", "schemas", "ags-app-manifest.schema.json"))) {
      return join(dir, "contracts");
    }
  }
  return null;
}

// Every authored file, minus generated/local-only trees.
function walk(dir = ROOT) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      [
        ".git",
        "node_modules",
        "@girs",
        ".dev",
        ".worktrees",
        "build",
        "dist",
        "contracts",
        ".pytest_cache",
        "__pycache__",
      ].includes(entry.name)
    ) {
      continue;
    }
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(relative(ROOT, absolute).split("\\").join("/"));
  }
  return files;
}

// ── 1. Manifest identity ───────────────────────────────────────────────────

test("the manifest is schema-valid and carries the studio identity", () => {
  const parsed = parseAgsAppManifest(readText("app.manifest.json"));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues ?? []));
  assert.deepEqual(parsed.manifest, IDENTITY);
});

test("the manifest agrees with app.tsx, the studio window and style.css", () => {
  const app = readText("app.tsx");
  const window = readText("ui", "StudioWindow.tsx");
  assert.match(app, /instanceName:\s*"btop-theme-studio"/);
  assert.match(window, /name="btop-theme-studio-window"/);
  assert.match(window, /title="btop Theme Studio"/);
  assert.match(readText("style.css"), /\.btop-theme-studio\s*\{/);
});

test("the launcher, keybind and config dir are documented for consumers", () => {
  const readme = readText("README.md");
  assert.match(readme, /`btop-theme-studio`/);
  assert.match(readme, /Open btop theme studio/);
  assert.match(readme, /ags-btop-studio/);
  assert.match(readme, /`btop-theme-studio-window`/);
});

test("no unreplaced template token survives", () => {
  const open = "{" + "{";
  const close = "}" + "}";
  const tokens = ["APP", "INSTANCE", "CONFIG_DIR", "WINDOW", "LAUNCHER", "REPO", "KEYBIND"].map(
    (name) => `${open}${name}${close}`,
  );
  const offenders = walk().filter((file) => {
    const text = readText(file);
    return tokens.some((token) => text.includes(token));
  });
  assert.deepEqual(offenders, [], `template token found in: ${offenders.join(", ")}`);
});

// ── 2. The live handler is real and pending-aware ──────────────────────────

test("app.tsx registers the real palette-refresh handler", () => {
  const app = readText("app.tsx");
  assert.match(app, /from\s+"\.\/lib\/palette-refresh"/);
  assert.match(app, /createStudioPaletteRefresh\(/);
  assert.match(app, /requestHandler:/);
  assert.match(app, /applyStudioAppearance\(/);
  assert.match(app, /applyTheme:\s*\(\)\s*=>\s*theme\.apply\(\)/);
  assert.match(app, /reloadPalette:\s*\(\)\s*=>\s*refreshStudioPalette\(\)/);
});

test("the handler module binds the platform helper to hash idempotency", () => {
  const handler = readText("lib", "palette-refresh.ts");
  assert.match(handler, /from\s+"ags-platform\/ports\/palette-refresh"/);
  assert.match(handler, /createPaletteRefreshHandler\(/);
  assert.match(handler, /createAppearanceRefresh\(apply\)/);
});

test("the palette reload preserves staged edits and selection", () => {
  const window = readText("ui", "StudioWindow.tsx");
  const reload = functionBody(window, "function reloadPaletteForRefresh(): void");
  assert.match(reload, /setPalette\(loadPalette\(\)\)/);
  assert.match(reload, /loadGeneratedMap\(\)/);
  assert.match(reload, /setThemes\(/);
  for (const forbidden of [
    "setPending",
    "setCurrentId",
    "setSelected",
    "setScope",
    "setTarget",
    "setControls",
    "setConfText",
  ]) {
    assert.doesNotMatch(reload, new RegExp(forbidden), `${forbidden} must not run on palette refresh`);
  }
  assert.match(
    window,
    /refreshPalette\s*=\s*reloadPaletteForRefresh/,
    "the window registers the non-destructive reload with the app handler",
  );
  const refresh = functionBody(window, "export function refreshStudioPalette(): void");
  assert.match(refresh, /refreshPalette\?\.\(\)/);
});

// ── 3. Repository template + platform conformance ──────────────────────────

test("the platform template gate passes for this repo", () => {
  const report = checkAppRepoAt(ROOT);
  assert.equal(report.ok, true, formatAppConformanceReport(report, ROOT));
});

test("the studio shell keeps the mock-v8 three-column hierarchy", () => {
  const window = readText("ui", "StudioWindow.tsx");
  const css = readText("style.css");
  // Regions: header strip, left rail, center stage, right rail.
  for (const region of [
    "studio-header",
    "studio-left-scroll",
    "studio-center",
    "studio-right",
    "studio-body",
    "section-title",
    "studio-path",
    "studio-lib",
    "diagPanel",
    "diffPanel",
    "picker",
    "footer",
  ]) {
    assert.ok(window.includes(region), `window is missing the ${region} region`);
  }
  // The real live preview stays the Live pane of the stage.
  assert.match(window, /live\/btop_live\.py/);
  assert.match(window, /function refreshLive\(/);
  assert.match(window, /label: "Components"/);
  assert.match(window, /label: "Live"/);
  // The shell chrome is declared in the stylesheet.
  for (const rule of [
    ".studio-header",
    ".studio-left-scroll",
    ".studio-center",
    ".studio-right",
    ".section-title",
    ".studio-path",
    ".canvas-bar",
    ".pbar",
    ".banner",
    ".canvas",
    ".diag",
    ".diff",
    ".footer",
  ]) {
    assert.ok(css.includes(rule), `style.css is missing ${rule}`);
  }
});

test("the real btop preview is the default stage and follows edits", () => {
  const window = readText("ui", "StudioWindow.tsx");
  assert.match(window, /let livePaneActive = true/);
  assert.match(window, /function liveSignatureOf/);
  assert.match(window, /function scheduleLiveRefresh/);
  assert.match(window, /serializeTheme\(effective\(\)\)/);
  assert.match(window, /meterFill\(controls\(\), controls\(\)\.load\)/);
  assert.match(window, /liveFrame\.get_label\(\) === LIVE_PLACEHOLDER/);
  assert.match(window, /const liveScroll = new Gtk\.ScrolledWindow/);
  assert.match(window, /liveScroll\.get_vadjustment\(\)\.set_value\(0\)/);
});

test("the Components pane draws the graphical btop schematic", () => {
  const window = readText("ui", "StudioWindow.tsx");
  const css = readText("style.css");
  const render = functionBody(window, "function renderSchematic(): void");
  // The six btop box builders plus the cpu overview/cores pair and topbar.
  for (const builder of [
    "renderTopbar(",
    "cpuOverviewBox(",
    "cpuCoresBox(",
    "gpuBox(",
    "memBox(",
    "netBox(",
    "disksBox(",
    "procBox(",
  ]) {
    assert.ok(render.includes(builder), `renderSchematic is missing ${builder}`);
  }
  // Meters, graph lines, theme colours and the preset box set are real.
  assert.match(render, /buildSchematic\(/);
  assert.match(render, /meterFill\(controls\(\), controls\(\)\.load\)/);
  assert.match(render, /backdropColour\(/);
  assert.match(window, /meterBand\(/);
  assert.match(window, /graphLevels\(/);
  assert.match(render, /canvasProvider\.load_from_string\(css\)/);
  // Every drawn element is a button whose click selects its primary key.
  assert.match(window, /button\.connect\("clicked", \(\) => setSelected\(primary\)\)/);
  assert.match(window, /tooltip_text: `click → \$\{primary\}`/);
  // The stage primitives exist in the stylesheet.
  for (const rule of [".btop-frame", ".btop-box", ".btop-graph", ".btop-meter", ".btop-subbox", ".key-hit"]) {
    assert.ok(css.includes(rule), `style.css is missing ${rule}`);
  }
});

test("the app package keeps its tests, vendored sources and live engine", () => {
  for (const path of [
    "tests/unit.test.mjs",
    "tests/app-contract.test.mjs",
    "tests/schematic-graphics.mjs",
    "tests/platform-consumption.mjs",
    "tests/key-widgets-verify.mjs",
    "lib/schematic-graphics.ts",
    "tools/key_widgets.py",
    "tools/btop_draw.v1.4.7.cpp",
    "tools/btop_theme.cpp",
    "live/btop_live.py",
    "live/conftest.py",
    "live/tests/test_btop_live.py",
    "lib/key_widgets.json",
    "lib/key-widgets.generated.ts",
  ]) {
    assert.ok(existsSync(join(ROOT, path)), `${path} is missing`);
  }
});

test("the contracts v0.3.0 manifest schema agrees with the platform", () => {
  const contractsRoot = findContractsRoot();
  assert.notEqual(contractsRoot, null, "cannot find contracts (set CONTRACTS_ROOT)");
  const schema = JSON.parse(
    readFileSync(join(contractsRoot, "schemas", "ags-app-manifest.schema.json"), "utf8"),
  );
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(
    [...schema.required].sort(),
    ["app", "configDir", "holdsUnsavedState", "instance", "mode", "schemaVersion"],
  );
  assert.equal(
    schema.allOf[0].then.properties.holdsUnsavedState.const,
    false,
    "restart stays invalid when holdsUnsavedState is true",
  );
});

test("the Makefile pins the v0.3.0 program tuple and the full gate set", () => {
  const makefile = readText("Makefile");
  assert.match(makefile, /^AGS_PLATFORM_VERSION := v0\.3\.0$/m);
  assert.match(makefile, /^CONTRACTS_VERSION := v0\.3\.0$/m);
  assert.match(makefile, /^gates: test conformance drift bundle typecheck$/m);
  assert.match(makefile, /^ci: test conformance drift$/m);
});

test("the CI workflow is stock-runner only", () => {
  const ci = readText(".github", "workflows", "ci.yml");
  assert.match(ci, /runs-on:\s*ubuntu-latest/);
  assert.doesNotMatch(ci, /runs-on:\s*self-hosted/);
  assert.match(ci, /make ci/);
});
