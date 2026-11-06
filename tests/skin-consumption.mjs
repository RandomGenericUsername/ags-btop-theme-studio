// Source-level gate for REQ-003: consume the app-scoped skin plane.
//
// The platform v0.8.0 exports `createAppSkin({ configDir })`; the runtime
// expands this app's `$XDG_CONFIG_HOME/ags-btop-studio/skin.css` and the
// adapter's file monitor reloads it. This app only has to:
//
//   1. build ONE module-scope Skin for its own configDir;
//   2. apply the palette (theme) first, then the Skin, in `main()`;
//   3. keep the single pending-aware palette-refresh request handler (no skin
//      refresh request — the adapter monitor owns reloads);
//   4. keep `style.css` as the bundled glass fallback.
//
// Run with: node --test tests/skin-consumption.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const APP = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");

/** Strip comments, keeping strings intact (same shape as the conformance gate). */
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
  assert.notEqual(start, -1, `missing marker: ${marker}`);
  const brace = clean.indexOf("{", start);
  assert.notEqual(brace, -1, `missing body for: ${marker}`);
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
  throw new Error(`unterminated body: ${marker}`);
}

const CLEAN = stripComments(APP);

test("app.tsx builds one module-scope Skin for ags-btop-studio", () => {
  assert.match(
    CLEAN,
    /import\s+\{\s*createAppSkin\s*\}\s+from\s+"ags-platform\/adapters\/skin"/,
  );
  assert.match(
    CLEAN,
    /const\s+skin\s*=\s*createAppSkin\(\{\s*configDir:\s*"ags-btop-studio"\s*\}\)/,
  );
  assert.equal(
    (CLEAN.match(/createAppSkin\(/g) ?? []).length,
    1,
    "exactly one app-scoped Skin is created",
  );
  const declaration = CLEAN.indexOf("createAppSkin(");
  const appStart = CLEAN.indexOf("app.start(");
  assert.ok(declaration !== -1 && appStart !== -1, "missing Skin or app.start");
  assert.ok(
    declaration < appStart,
    "the Skin must be module-scope, not built inside app.start/main",
  );
  assert.doesNotMatch(
    CLEAN,
    /createAppSkinValue/,
    "this app has no v1 layout tokens; do not add a token accessor",
  );
});

test("main() applies the palette first, then the app-scoped Skin", () => {
  const main = functionBody(APP, "main()");
  assert.match(main, /theme\.apply\(\)/);
  assert.match(main, /skin\.apply\(\)/);
  assert.ok(
    main.indexOf("theme.apply()") < main.indexOf("skin.apply()"),
    "the palette pointer must be applied before the Skin provider",
  );
  assert.equal(
    (CLEAN.match(/skin\.apply\(\)/g) ?? []).length,
    1,
    "the skin is applied once at startup, not requested in place",
  );
});

test("no skin-refresh request handler is added", () => {
  const handlers = CLEAN.match(/requestHandler\s*:/g) ?? [];
  assert.equal(handlers.length, 1, "there must be exactly one request handler");
  assert.match(CLEAN, /createStudioPaletteRefresh\(/);
  const handler = functionBody(APP, "requestHandler:");
  assert.doesNotMatch(handler, /skin/i, "the request handler stays palette-only");
  assert.doesNotMatch(CLEAN, /skin-refresh|SKIN_REFRESH/);
});

test("style.css remains the bundled glass fallback", () => {
  assert.ok(existsSync(new URL("../style.css", import.meta.url)));
  assert.match(CLEAN, /import\s+style\s+from\s+"\.\/style\.css"/);
  assert.match(CLEAN, /css:\s*style/);
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.btop-theme-studio\s*\{[^}]*background:\s*@surface/s,
    "style.css must keep the studio shell fallback",
  );
});
