// ---------------------------------------------------------------------------
// Pure unit tests for the studio's app-owned appearance work and the platform
// v3 refresh helper it registers (AD-27; contracts `appearance-refresh.md`).
//
// These execute the app's real pure module plus the platform's pure
// `createAppearanceRefreshHandler` with plain Node — no AGS/GTK — so a handler
// that silently no-ops cannot pass:
//   - the app work reloads only the palette/base map (the helper owns apply);
//   - the helper installs the REQUESTED `appearance-refresh <genHash>`
//     generation before that work and answers with the same hash;
//   - apply is repeated per request, work is idempotent by generation hash;
//   - a thrown apply is retryable and does not advance the hash;
//   - deferred work is reported against the requested hash;
//   - exactly one JSON-string response per request, including malformed input
//     and the retired v2 `palette-refresh` command.
//
// Run from the repo root:  make test
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPEARANCE_REFRESH_COMMAND,
  createAppearanceRefreshHandler,
} from "ags-platform/ports/appearance-refresh";
import { applyStudioAppearance } from "../lib/appearance.ts";

const HASH = "a".repeat(64);
const NEXT = "b".repeat(64);

function applied(genHash) {
  return { status: "applied", genHash };
}

// ── App-owned appearance work ──────────────────────────────────────────────

test("applyStudioAppearance reloads the palette only", () => {
  const calls = [];
  applyStudioAppearance({
    reloadPalette: () => calls.push("palette"),
  });
  assert.deepEqual(calls, ["palette"]);
});

// ── The v3 generation-bound appearance refresh handler ─────────────────────

test("the handler applies the requested generation before the app work", () => {
  const responses = [];
  const events = [];
  const handler = createAppearanceRefreshHandler(
    {
      applyGeneration: (genHash) => {
        events.push(`apply:${genHash}`);
        return applied(genHash);
      },
    },
    (genHash) => {
      events.push(`work:${genHash}`);
      return { status: "applied" };
    },
  );

  handler([APPEARANCE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.deepEqual(events, [`apply:${HASH}`, `work:${HASH}`]);
  assert.equal(responses.length, 1, "exactly one response");
  assert.equal(typeof responses[0], "string", "AGS transport is a string");
  assert.deepEqual(JSON.parse(responses[0]), { applied: HASH });
});

test("the same generation re-applies but does not rerun app work", () => {
  const responses = [];
  let applies = 0;
  let worked = 0;
  const handler = createAppearanceRefreshHandler(
    {
      applyGeneration: (genHash) => {
        applies += 1;
        return applied(genHash);
      },
    },
    () => {
      worked += 1;
      return { status: "applied" };
    },
  );

  handler([APPEARANCE_REFRESH_COMMAND, HASH], (response) => responses.push(response));
  handler([APPEARANCE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(applies, 2, "every request re-verifies the requested generation");
  assert.equal(worked, 1, "app work is idempotent by generation hash");
  assert.deepEqual(responses, [
    JSON.stringify({ applied: HASH }),
    JSON.stringify({ applied: HASH }),
  ]);
});

test("a new generation applies both the appearance and the app work", () => {
  const responses = [];
  const applies = [];
  const worked = [];
  const handler = createAppearanceRefreshHandler(
    {
      applyGeneration: (genHash) => {
        applies.push(genHash);
        return applied(genHash);
      },
    },
    (genHash) => {
      worked.push(genHash);
      return { status: "applied" };
    },
  );

  handler([APPEARANCE_REFRESH_COMMAND, HASH], (response) => responses.push(response));
  handler([APPEARANCE_REFRESH_COMMAND, NEXT], (response) => responses.push(response));

  assert.deepEqual(applies, [HASH, NEXT]);
  assert.deepEqual(worked, [HASH, NEXT]);
  assert.deepEqual(responses, [
    JSON.stringify({ applied: HASH }),
    JSON.stringify({ applied: NEXT }),
  ]);
});

test("a deferred generation installs nothing and does not run app work", () => {
  const responses = [];
  let worked = 0;
  const handler = createAppearanceRefreshHandler(
    {
      applyGeneration: (genHash) => ({
        status: "deferred",
        reason: "current generation moved",
        genHash,
      }),
    },
    () => {
      worked += 1;
      return { status: "applied" };
    },
  );

  handler([APPEARANCE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(worked, 0);
  assert.deepEqual(JSON.parse(responses[0]), {
    deferred: "current generation moved",
    genHash: HASH,
  });
});

test("a thrown appearance apply is retried for the same generation", () => {
  const responses = [];
  let applies = 0;
  const handler = createAppearanceRefreshHandler({
    applyGeneration: (genHash) => {
      applies += 1;
      if (applies === 1) throw new Error("appearance not ready");
      return applied(genHash);
    },
  });

  handler([APPEARANCE_REFRESH_COMMAND, HASH], (response) => responses.push(response));
  handler([APPEARANCE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(applies, 2, "the failed generation was not recorded as applied");
  assert.equal(responses.length, 2);
  assert.deepEqual(JSON.parse(responses[0]), {
    failed: "appearance not ready",
    retryable: true,
    genHash: HASH,
  });
  assert.deepEqual(JSON.parse(responses[1]), { applied: HASH });
});

test("deferred app work is reported against the requested generation", () => {
  const responses = [];
  const handler = createAppearanceRefreshHandler(
    { applyGeneration: (genHash) => applied(genHash) },
    () => ({ status: "deferred", reason: "save in flight" }),
  );

  handler([APPEARANCE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.deepEqual(JSON.parse(responses[0]), {
    deferred: "save in flight",
    genHash: HASH,
  });
});

test("a malformed appearance-refresh request never applies the appearance", () => {
  const responses = [];
  let applies = 0;
  const handler = createAppearanceRefreshHandler({
    applyGeneration: (genHash) => {
      applies += 1;
      return applied(genHash);
    },
  });

  handler([APPEARANCE_REFRESH_COMMAND], (response) => responses.push(response));
  handler([APPEARANCE_REFRESH_COMMAND, "appearance-2026-10-27"], (response) =>
    responses.push(response),
  );
  handler(["palette-refresh", HASH], (response) => responses.push(response));

  assert.equal(applies, 0, "no malformed or retired request applies a generation");
  assert.equal(responses.length, 3);
  assert.deepEqual(JSON.parse(responses[0]), {
    failed: "malformed appearance-refresh request",
    retryable: false,
    genHash: "0".repeat(64),
  });
  assert.deepEqual(JSON.parse(responses[1]), {
    failed: "malformed appearance-refresh request",
    retryable: false,
    genHash: "0".repeat(64),
  });
  assert.deepEqual(JSON.parse(responses[2]), {
    failed: "malformed appearance-refresh request",
    retryable: false,
    genHash: HASH,
  });
});
