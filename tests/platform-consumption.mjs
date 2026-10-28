// ---------------------------------------------------------------------------
// Platform-consumption acceptance tests (REQ-007, EPIC-001).
//
// These make the REQ-007 acceptance executable rather than prose:
//
//   1. Theming routes through the platform `Theme` port; no app-local
//      `theme.ts` and no direct `app.apply_css` call survives (spine AD-13).
//   2. No app-local icon-registry / event-bus copy exists (AD-5/AD-7) — the
//      studio has none today, and this pins that it does not grow one.
//   3. No app -> app imports (spine AD-1): an app depends on `ags-platform`
//      (and `contracts`), never on a sibling app directory.
//
// Source-text assertions, labelled as such: they pin wiring (which module a
// symbol is imported from), which is exactly what the acceptance criteria
// name. They do not execute the app. The behavioral suites (lib, schematic,
// key-widget drift) live beside this file and are run by the same gate.
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");

/**
 * Every app source file (`.ts`/`.tsx`), excluding generated GIR, tests and the
 * repo-local dev trees. The standalone repo root is the app package, so the
 * pinned `.dev/` platform checkout must be skipped or its sources would be
 * audited as if they were this app's.
 */
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "@girs",
  "tests",
  ".git",
  ".dev",
  ".worktrees",
  "build",
  "dist",
  "coverage",
  "templates",
]);

function appSources() {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (IGNORED_DIRECTORIES.has(entry)) continue;
      const full = resolve(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        out.push(full);
      }
    }
  };
  walk(APP);
  return out.sort();
}

function read(path) {
  return readFileSync(path, "utf8");
}

function rel(path) {
  return relative(APP, path);
}

// ---------------------------------------------------------------------------
// 1. Theming through the platform Theme port
// ---------------------------------------------------------------------------

test("the app applies its palette through the platform Theme port", () => {
  const app = read(resolve(APP, "app.tsx"));
  assert.match(
    app,
    /from "ags-platform\/adapters\/theme"/,
    "app.tsx must import the platform Theme adapter (AD-13)",
  );
  assert.match(app, /theme\.apply\(\)/, "app.tsx must call theme.apply()");
});

test("no direct app.apply_css call survives in the app", () => {
  for (const path of appSources()) {
    assert.equal(
      /app\.apply_css\(/.test(read(path)),
      false,
      `${rel(path)} still calls app.apply_css directly — theming must route through the Theme port`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. No app-local platform copies
// ---------------------------------------------------------------------------

test("no app-local theme / icon-registry / event-bus copy exists", () => {
  const banned = [
    "lib/theme.ts",
    "lib/icon-registry.ts",
    "lib/event-bus.ts",
    "lib/event-bus-core.ts",
    "lib/event-contract.ts",
  ];
  for (const name of banned) {
    assert.equal(
      existsSync(resolve(APP, name)),
      false,
      `${name} must not exist — the platform owns that seam (AD-5/AD-7/AD-13)`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. No app -> app imports (AD-1)
// ---------------------------------------------------------------------------

//: The sibling app directories in this monorepo. An import specifier that
//: resolves into one of these is an app -> app edge. `btop-theme-studio` itself
//: is deliberately absent: importing its own files is not an app -> app edge.
const SIBLING_APPS = [
  "bar",
  "notifications",
  "hypr-pano",
  "capture-tool",
  "wallpaper-selector",
  "icme",
];

const IMPORT_RE = /(?:from|import)\s+["']([^"']+)["']/g;

test("no source file imports a sibling app (AD-1)", () => {
  for (const path of appSources()) {
    const text = read(path);
    for (const match of text.matchAll(IMPORT_RE)) {
      const specifier = match[1];
      for (const sibling of SIBLING_APPS) {
        assert.equal(
          new RegExp(`(^|/)${sibling}/`).test(specifier),
          false,
          `${rel(path)} imports "${specifier}" — app -> app edges are forbidden (AD-1)`,
        );
      }
    }
  }
});
