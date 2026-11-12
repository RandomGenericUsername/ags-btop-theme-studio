// Source-level gate for REQ-004/REQ-006: consume the v3 Appearance plane.
//
// Platform v1.1.0 exports `createAppearance({ configDir })` and
// `createAppearanceRefreshHandler(appearance, work)`. The adapter owns the one
// provider and the one monitor on `$XDG_STATE_HOME/dotfiles/current`, reads
// `current/manifest.json` plus `current/appearance/<configDir>.css`, and the
// refresh helper installs the requested `appearance-refresh <genHash>`
// generation before the app-owned work. This app only has to:
//
//   1. build ONE module-scope Appearance for its own configDir and apply it in
//      `main()` (no separate Theme/Skin applies);
//   2. register exactly one `createAppearanceRefreshHandler` whose work is the
//      pending-aware `refreshStudioPalette()` / base-map reload;
//   3. consume no btop layout tokens: the rails keep the natural CSS
//      `min-width` + `hexpand` construction, with no fixed pane size requests;
//   4. keep `style.css` as the bundled glass fallback.
//
// Run with: node --test tests/appearance-consumption.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const APP = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
const WINDOW = readFileSync(new URL("../ui/StudioWindow.tsx", import.meta.url), "utf8");

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
const CLEAN_WINDOW = stripComments(WINDOW);

test("app.tsx builds one module-scope Appearance for ags-btop-studio", () => {
  assert.match(
    CLEAN,
    /import\s*\{[^}]*\bcreateAppearance\b[^}]*\}\s*from\s*"ags-platform\/adapters\/appearance"/s,
  );
  assert.match(
    CLEAN,
    /const\s+appearance\s*=\s*createAppearance\(\{\s*configDir:\s*"ags-btop-studio"\s*\}\)/,
  );
  assert.equal(
    (CLEAN.match(/createAppearance\(/g) ?? []).length,
    1,
    "there must be exactly one app-scoped Appearance",
  );
  const declaration = CLEAN.indexOf("createAppearance(");
  const appStart = CLEAN.indexOf("app.start(");
  assert.ok(declaration !== -1 && appStart !== -1, "missing Appearance or app.start");
  assert.ok(
    declaration < appStart,
    "the Appearance must be module-scope, not built inside app.start/main",
  );
});

test("main() applies the whole appearance and drops the Theme/Skin applies", () => {
  const main = functionBody(APP, "main()");
  assert.match(main, /appearance\.apply\(\)/);
  assert.doesNotMatch(main, /theme\.apply\(\)/);
  assert.doesNotMatch(main, /skin\.apply\(\)/);
  assert.doesNotMatch(CLEAN, /createAppSkin|adapters\/skin|adapters\/theme/);
});

test("the one request handler is createAppearanceRefreshHandler(appearance, work)", () => {
  const handlers = CLEAN.match(/requestHandler\s*:/g) ?? [];
  assert.equal(handlers.length, 1, "there must be exactly one request handler");
  assert.match(
    CLEAN,
    /import\s*\{[^}]*\bcreateAppearanceRefreshHandler\b[^}]*\}\s*from\s*"ags-platform\/adapters\/appearance"/s,
  );
  assert.match(CLEAN, /createAppearanceRefreshHandler\(appearance,\s*\(\)\s*=>/);

  const work = functionBody(APP, "requestHandler:");
  assert.match(work, /applyStudioAppearance\(/);
  assert.match(work, /reloadPalette:\s*\(\)\s*=>\s*refreshStudioPalette\(\)/);
  assert.doesNotMatch(work, /theme\.apply|skin\.apply|reapplyTheme/);
  assert.doesNotMatch(
    work,
    /appearance\.apply\(\)/,
    "work must not double-apply; the helper owns the appearance apply",
  );
  assert.match(
    work,
    /return\s*\{\s*status:\s*"applied"\s*\}/,
    "the v3 work result must name the frozen applied status",
  );
  assert.doesNotMatch(CLEAN, /skin-refresh|SKIN_REFRESH/);
});

test("the retired v2 request command is not implemented", () => {
  assert.doesNotMatch(CLEAN, /argv\[0\]/);
  assert.doesNotMatch(CLEAN, /PALETTE_REFRESH_COMMAND|palette-refresh/);
  assert.doesNotMatch(CLEAN, /\{"ok":\s*(?:true|false)\}/);
});

test("the studio consumes no btop layout tokens and keeps natural panes", () => {
  assert.doesNotMatch(CLEAN_WINDOW, /layout\.ags-btop-studio/);
  assert.doesNotMatch(CLEAN_WINDOW, /\bleftWidth\b|\brightWidth\b/);
  assert.doesNotMatch(CLEAN_WINDOW, /leftScroll\.set_size_request\(/);
  assert.doesNotMatch(CLEAN_WINDOW, /right\.set_size_request\(/);
  assert.match(CLEAN, /StudioWindow\(monitor\)/);
  assert.doesNotMatch(CLEAN, /StudioWindow\(monitor,\s*appearance\)/);
});

test("style.css remains the bundled glass fallback", () => {
  assert.ok(existsSync(new URL("../style.css", import.meta.url)));
  assert.match(CLEAN, /import\s+style\s+from\s+"\.\/style\.css"/);
  assert.match(CLEAN, /css:\s*style/);
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  assert.match(css, /\.studio-left-scroll\s*\{[^}]*min-width:\s*280px/s);
  assert.match(css, /\.studio-right\s*\{[^}]*min-width:\s*320px/s);
  assert.match(
    css,
    /\.btop-theme-studio\s*\{[^}]*background:\s*@surface/s,
    "style.css must keep the studio shell fallback",
  );
});
