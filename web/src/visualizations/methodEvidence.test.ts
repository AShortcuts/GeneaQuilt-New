import assert from "node:assert/strict";
import test from "node:test";

import { getMethodEvidence, getMethodExportSupport } from "./methodEvidence.ts";
import { VISUALIZATION_METHODS } from "./registry.ts";

test("every available method records a completed accuracy review and export contract", () => {
  const available = VISUALIZATION_METHODS.filter((method) => method.availability === "available");
  for (const method of available) {
    const evidence = getMethodEvidence(method.id);
    const exports = getMethodExportSupport(method.id);
    assert.equal(evidence?.status, "verified", `${method.id} needs verified evidence`);
    assert.ok(evidence && evidence.checkedAgainst.length >= 3);
    assert.ok(evidence && evidence.invariants.length >= 3);
    assert.ok(evidence?.webDifferences);
    assert.ok(exports, `${method.id} needs an explicit export contract`);
  }
});

test("area-adaptive is selectable only with verified evidence and complete local exports", () => {
  const method = VISUALIZATION_METHODS.find((candidate) => candidate.id === "area-adaptive");
  assert.equal(method?.availability, "available");
  assert.equal(getMethodEvidence("area-adaptive")?.status, "verified");
  assert.deepEqual(getMethodExportSupport("area-adaptive"), {
    png: true,
    print: true,
    standaloneHtml: true,
    currentViewPdf: true,
    completeDiagramPdf: true,
    tiledPosterPdf: true,
  });
});
