// ---------------------------------------------------------------------------
// Pure unit tests for the studio's live appearance refresh and its
// `palette-refresh` handler (AD-27; contracts `ags-app-refresh.md`).
//
// These execute the app's real pure modules with plain Node — no AGS/GTK —
// so a handler that silently no-ops cannot pass:
//   - the pending-aware refresh order (Theme pointer, then palette reload);
//   - appearance-hash idempotency and failure retry;
//   - exactly one JSON-string response per request, including malformed input.
//
// Run from the repo root:  make test
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTE_REFRESH_COMMAND } from "ags-platform/ports/palette-refresh";
import {
  applyStudioAppearance,
  createAppearanceRefresh,
} from "../lib/appearance.ts";
import { createStudioPaletteRefresh } from "../lib/palette-refresh.ts";

const HASH = "appearance-2026-10-27";

// ── Pending-aware refresh core ─────────────────────────────────────────────

test("applyStudioAppearance applies the Theme pointer before reloading the palette", () => {
  const calls = [];
  applyStudioAppearance({
    applyTheme: () => calls.push("theme"),
    reloadPalette: () => calls.push("palette"),
  });
  assert.deepEqual(calls, ["theme", "palette"]);
});

test("appearance refresh is idempotent by appearance hash", () => {
  let applies = 0;
  const refresh = createAppearanceRefresh(() => {
    applies += 1;
  });

  assert.deepEqual(refresh(HASH), { status: "applied" });
  assert.equal(applies, 1, "first hash applies");

  assert.deepEqual(refresh(HASH), { status: "applied" });
  assert.equal(applies, 1, "the same hash is a safe no-op");

  assert.deepEqual(refresh("appearance-next"), { status: "applied" });
  assert.equal(applies, 2, "a new hash applies again");
});

test("a failed appearance refresh is retried for the same hash", () => {
  let applies = 0;
  const refresh = createAppearanceRefresh(() => {
    applies += 1;
    if (applies === 1) throw new Error("palette not ready");
  });

  assert.throws(() => refresh(HASH), /palette not ready/);
  assert.deepEqual(refresh(HASH), { status: "applied" });
  assert.equal(applies, 2, "the failed hash was not recorded as applied");
});

// ── The real palette-refresh handler ───────────────────────────────────────

test("palette-refresh answers once with the protocol's JSON string", () => {
  const responses = [];
  let applies = 0;
  const handler = createStudioPaletteRefresh(() => {
    applies += 1;
  });

  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(applies, 1, "the real refresh ran");
  assert.equal(responses.length, 1, "exactly one response");
  assert.equal(typeof responses[0], "string", "AGS transport is a string");
  assert.equal(responses[0], JSON.stringify({ ok: true }));
});

test("palette-refresh is a no-op for the same hash but still applied", () => {
  const responses = [];
  let applies = 0;
  const handler = createStudioPaletteRefresh(() => {
    applies += 1;
  });

  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));
  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(applies, 1, "same appearance must not reload twice");
  assert.deepEqual(responses, [JSON.stringify({ ok: true }), JSON.stringify({ ok: true })]);
});

test("palette-refresh reports a thrown refresh as a retryable failure", () => {
  const responses = [];
  const handler = createStudioPaletteRefresh(() => {
    throw new Error("theme pointer missing");
  });

  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(responses.length, 1);
  assert.deepEqual(JSON.parse(responses[0]), {
    ok: false,
    error: "theme pointer missing",
    retryable: true,
  });
});

test("a malformed palette-refresh request never runs the refresh", () => {
  const responses = [];
  let applies = 0;
  const handler = createStudioPaletteRefresh(() => {
    applies += 1;
  });

  handler([PALETTE_REFRESH_COMMAND], (response) => responses.push(response));
  assert.equal(applies, 0);
  assert.equal(responses.length, 1);
  assert.deepEqual(JSON.parse(responses[0]), {
    ok: false,
    error: "malformed palette-refresh request",
    retryable: false,
  });
});
