import assert from "node:assert/strict";
import test from "node:test";

import { loadGenerationIndex } from "../gen_auto/whitegen-generation-index.mjs";

test("loads Whitegen pages once and indexes all requested generations", async () => {
  const calls = [];
  const pages = {
    1: Array.from({ length: 100 }, (_, index) => ({ number: `WPROMO-${96000 + index}`, id: index })),
    2: [{ number: "WPROMO-96310", id: 310 }],
  };
  const fetchPage = async (page, perPage) => {
    calls.push({ page, perPage });
    return pages[page] ?? [];
  };

  const index = await loadGenerationIndex(
    ["WPROMO-96005", "WPROMO-96310", "WPROMO-99999"],
    fetchPage,
    100
  );

  assert.equal(index.get("WPROMO-96005")?.id, 5);
  assert.equal(index.get("WPROMO-96310")?.id, 310);
  assert.equal(index.has("WPROMO-99999"), false);
  assert.deepEqual(calls, [
    { page: 1, perPage: 100 },
    { page: 2, perPage: 100 },
    { page: 3, perPage: 100 },
  ]);
});

test("stops paging as soon as all requested generations are found", async () => {
  const calls = [];
  const fetchPage = async (page, perPage) => {
    calls.push({ page, perPage });
    return [{ number: "WPROMO-96310", id: 310 }];
  };

  const index = await loadGenerationIndex(["WPROMO-96310"], fetchPage, 100);

  assert.equal(index.get("WPROMO-96310")?.id, 310);
  assert.deepEqual(calls, [{ page: 1, perPage: 100 }]);
});

test("limits lookup time when requested generation does not exist", async () => {
  const calls = [];
  const fetchPage = async (page, perPage) => {
    calls.push({ page, perPage });
    return Array.from({ length: 10 }, (_, index) => ({ number: `WPROMO-${page}-${index}` }));
  };

  const index = await loadGenerationIndex(["WPROMO-96310"], fetchPage, 100, 3);

  assert.equal(index.has("WPROMO-96310"), false);
  assert.equal(calls.length, 3);
});
