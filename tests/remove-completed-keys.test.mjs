import assert from "node:assert/strict";
import test from "node:test";

import { getCompletedKeysInSelection } from "../src/lib/completed-task-selection.mjs";

test("returns only archived keys that are present in the current generation list", () => {
  const currentKeys = Array.from({ length: 50 }, (_, index) => `WPROMO-${95800 + index}`);
  const archivedKeys = Array.from({ length: 240 }, (_, index) => `WPROMO-${95600 + index}`);

  assert.deepEqual(
    getCompletedKeysInSelection(currentKeys, archivedKeys),
    ["WPROMO-95800", "WPROMO-95801", "WPROMO-95802", "WPROMO-95803", "WPROMO-95804", "WPROMO-95805", "WPROMO-95806", "WPROMO-95807", "WPROMO-95808", "WPROMO-95809", "WPROMO-95810", "WPROMO-95811", "WPROMO-95812", "WPROMO-95813", "WPROMO-95814", "WPROMO-95815", "WPROMO-95816", "WPROMO-95817", "WPROMO-95818", "WPROMO-95819", "WPROMO-95820", "WPROMO-95821", "WPROMO-95822", "WPROMO-95823", "WPROMO-95824", "WPROMO-95825", "WPROMO-95826", "WPROMO-95827", "WPROMO-95828", "WPROMO-95829", "WPROMO-95830", "WPROMO-95831", "WPROMO-95832", "WPROMO-95833", "WPROMO-95834", "WPROMO-95835", "WPROMO-95836", "WPROMO-95837", "WPROMO-95838", "WPROMO-95839"]
  );
});

test("matching is case-insensitive and keeps the current-list spelling", () => {
  assert.deepEqual(
    getCompletedKeysInSelection(["wpromo-95833", "WPROMO-99999"], ["WPROMO-95833"]),
    ["wpromo-95833"]
  );
});
