import assert from "node:assert/strict";
import test from "node:test";

import type { DocumentAnalysis } from "../domain/schema.ts";
import { hasVisualizationAdapter } from "../visualizations/adapters.ts";
import { VISUALIZATION_METHODS } from "../visualizations/registry.ts";
import { LARGE_GENEALOGY_THRESHOLD, recommendMethods } from "./recommendMethods.ts";

const analysis: DocumentAnalysis = {
  people: 10_000,
  families: 4_200,
  relationship_links: 14_000,
  disconnected_family_groups: 4,
  generation_depth: 36,
  widest_generation: 1_100,
  largest_sibling_group: 13,
  people_with_multiple_spouses: 62,
  people_in_multiple_spouse_families: 80,
  half_sibling_structures: 29,
  pedigree_collapse_people: 4_000,
  reconvergence_points: 340,
  people_with_dates: 8_000,
  families_with_dates: 2_000,
  date_coverage_percent: 70,
  findings: [],
  blocks_interactive: false,
};

test("the Registry lists every catalogued method once and keeps generic baselines secondary", () => {
  assert.equal(VISUALIZATION_METHODS.length, 24);
  assert.equal(new Set(VISUALIZATION_METHODS.map((method) => method.id)).size, 24);
  assert.equal(
    VISUALIZATION_METHODS.find((method) => method.id === "force-default")?.category,
    "thoroughness",
  );
  assert.equal(
    VISUALIZATION_METHODS.find((method) => method.id === "sugiyama-default")?.category,
    "thoroughness",
  );
});

test("every method marked available has a registered Native Visualization", () => {
  const availableMethods = VISUALIZATION_METHODS.filter(
    (method) => method.availability === "available",
  );

  assert.deepEqual(availableMethods.map((method) => method.id).sort(), [
    "area-adaptive",
    "bfs",
    "bipartite-pgraph",
    "birthplace-cluster",
    "column-tree",
    "dfs",
    "dual-outline",
    "dual-tree",
    "fan",
    "force-default",
    "force-genealogy",
    "force-radial",
    "fractal",
    "geneaquilt",
    "h-tree",
    "hourglass",
    "local-radial",
    "ore",
    "pedigree",
    "pgraph",
    "relationship-nodes",
    "sugiyama-default",
    "sugiyama-genealogy",
    "timenets",
  ]);
  assert.ok(availableMethods.every((method) => hasVisualizationAdapter(method.id)));
});

test("a large recursive whole-tree goal explains why GeneaQuilt is the leading available method", () => {
  const result = recommendMethods(analysis, "whole-genealogy");

  assert.equal(result.recommended[0]?.method.id, "geneaquilt");
  assert.ok(result.recommended[0]?.reasons.some((reason) => /10,000 people/.test(reason)));
  assert.ok(result.recommended[0]?.reasons.some((reason) => /reconvergence/.test(reason)));
  assert.equal(result.all.length, 24);
});

test("recommendations remain deterministic and the reviewed chronological method is selectable", () => {
  const first = recommendMethods(analysis, "chronology");
  const second = recommendMethods(analysis, "chronology");
  const timeNets = first.all.find((recommendation) => recommendation.method.id === "timenets");

  assert.deepEqual(first, second);
  assert.equal(timeNets?.selectable, true);
  assert.ok(timeNets?.reasons.some((reason) => /chronological|Time/.test(reason)));
  assert.ok(timeNets?.reasons.some((reason) => /date coverage/i.test(reason)));
  assert.ok(!timeNets?.cautions.some((caution) => /in development/i.test(caution)));
});

test("the large-tree recommendation threshold is the benchmark-confirmed 1,000 people", () => {
  assert.equal(LARGE_GENEALOGY_THRESHOLD, 1_000);
});
