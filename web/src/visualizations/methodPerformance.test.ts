import assert from "node:assert/strict";
import test from "node:test";

import { getMethodPerformance } from "./methodPerformance.ts";
import { VISUALIZATION_METHODS } from "./registry.ts";

test("every catalogued method publishes measured scale evidence", () => {
  for (const method of VISUALIZATION_METHODS) {
    const evidence = getMethodPerformance(method.id);
    assert.ok(evidence, `${method.id} is missing performance evidence`);
    assert.ok(evidence.people >= 10_000);
    assert.ok(evidence.milliseconds >= 0);
    assert.ok(evidence.interpretation.length > 40);
  }
});

test("GeneaQuilt alone carries the 50,000-person stress result", () => {
  assert.equal(getMethodPerformance("geneaquilt")?.people, 50_000);
  assert.ok(
    VISUALIZATION_METHODS.filter(
      (method) => method.id !== "geneaquilt" && getMethodPerformance(method.id)?.people === 50_000,
    ).length === 0,
  );
});
