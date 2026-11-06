// ---------------------------------------------------------------------------
// Pure unit tests for the studio's app-owned appearance work and the platform
// v2 refresh helper it registers (AD-27; contracts `ags-app-refresh.md`).
//
// These execute the app's real pure module plus the platform's pure
// `createAppearanceRefreshHandler` with plain Node — no AGS/GTK — so a handler
// that silently no-ops cannot pass:
//   - the app work reloads only the palette/base map (the helper owns apply);
//   - the helper applies the whole appearance before that work;
//   - apply is repeated per request, work is idempotent by appearance hash;
//   - a thrown apply is retryable and does not advance the hash;
//   - exactly one JSON-string response per request, including malformed input.
//
// Run from the repo root:  make test
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { createAppearanceRefreshHandler } from "ags-platform/ports/appearance-refresh";
import { PALETTE_REFRESH_COMMAND } from "ags-platform/ports/palette-refresh";
import { applyStudioAppearance } from "../lib/appearance.ts";

const HASH = "appearance-2026-10-27";

// ── App-owned appearance work ──────────────────────────────────────────────

test("applyStudioAppearance reloads the palette only", () => {
  const calls = [];
  applyStudioAppearance({
    reloadPalette: () => calls.push("palette"),
  });
  assert.deepEqual(calls, ["palette"]);
});

// ── The v2 appearance refresh handler ──────────────────────────────────────

test("the handler applies the whole appearance before the app work", () => {
  const responses = [];
  const worked = [];
  let applies = 0;
  const handler = createAppearanceRefreshHandler(
    { apply: () => void (applies += 1) },
    (hash) => void worked.push(hash),
  );

  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(applies, 1, "appearance.apply() ran before the work");
  assert.deepEqual(worked, [HASH], "the app-owned work ran");
  assert.equal(responses.length, 1, "exactly one response");
  assert.equal(typeof responses[0], "string", "AGS transport is a string");
  assert.equal(responses[0], JSON.stringify({ ok: true }));
});

test("the same hash re-applies appearance but does not rerun app work", () => {
  const responses = [];
  let applies = 0;
  let worked = 0;
  const handler = createAppearanceRefreshHandler(
    { apply: () => void (applies += 1) },
    () => void (worked += 1),
  );

  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));
  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(applies, 2, "every request re-applies the appearance");
  assert.equal(worked, 1, "app work is idempotent by appearance hash");
  assert.deepEqual(responses, [JSON.stringify({ ok: true }), JSON.stringify({ ok: true })]);
});

test("a new hash applies both the appearance and the app work", () => {
  const responses = [];
  let applies = 0;
  let worked = 0;
  const handler = createAppearanceRefreshHandler(
    { apply: () => void (applies += 1) },
    () => void (worked += 1),
  );

  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));
  handler([PALETTE_REFRESH_COMMAND, "appearance-next"], (response) => responses.push(response));

  assert.equal(applies, 2);
  assert.equal(worked, 2);
  assert.deepEqual(responses, [JSON.stringify({ ok: true }), JSON.stringify({ ok: true })]);
});

test("a thrown appearance apply is retried for the same hash", () => {
  const responses = [];
  let applies = 0;
  const handler = createAppearanceRefreshHandler({
    apply: () => {
      applies += 1;
      if (applies === 1) throw new Error("appearance not ready");
    },
  });

  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));
  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(applies, 2, "the failed hash was not recorded as applied");
  assert.equal(responses.length, 2);
  assert.deepEqual(JSON.parse(responses[0]), {
    ok: false,
    error: "appearance not ready",
    retryable: true,
  });
  assert.deepEqual(JSON.parse(responses[1]), { ok: true });
});

test("a malformed palette-refresh request never applies the appearance", () => {
  const responses = [];
  let applies = 0;
  const handler = createAppearanceRefreshHandler({
    apply: () => void (applies += 1),
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
