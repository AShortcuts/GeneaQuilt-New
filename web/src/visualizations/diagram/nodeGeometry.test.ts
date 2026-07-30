import assert from "node:assert/strict";
import test from "node:test";

import { createScaleFixture } from "../../performance/scaleFixtures.ts";
import type { VisualizationContext } from "../adapter.ts";
import { buildAreaAdaptiveScene } from "../methods/areaAdaptive/AreaAdaptiveAdapter.ts";
import { buildColumnTreeScene } from "../methods/columns/ColumnTreeAdapter.ts";
import { buildDualTreeScene } from "../methods/focused/DualTreeAdapter.ts";
import { buildHourglassScene, buildPedigreeScene } from "../methods/focused/FocusedAdapters.ts";
import {
  buildDualOutlineScene,
  buildHTreeScene,
  buildLocalRadialScene,
} from "../methods/focused/PedigreeAlternativeAdapters.ts";
import {
  buildBipartitePGraphScene,
  buildOreGraphScene,
  buildPGraphScene,
} from "../methods/pgraphs/PGraphAdapters.ts";
import {
  buildRelationshipNodeScene,
  buildTraversalScene,
} from "../methods/structural/StructuralAdapters.ts";
import { buildForceScene, buildRadialForceScene } from "../methods/thesis/ForceAdapters.ts";
import { buildSugiyamaScene } from "../methods/thesis/LayeredAdapters.ts";
import type { DiagramNode, DiagramScene } from "./types.ts";
import { findPersonNodeOverlaps, separateNodesHorizontally } from "./nodeGeometry.ts";

test("rectangle separation gives every Person card its own footprint", () => {
  const nodes: DiagramNode[] = [
    personNode("a", 0, 0, 130),
    personNode("b", 30, 4, 150),
    personNode("c", 70, 48, 120),
  ];

  assert.ok(findPersonNodeOverlaps(nodes).length > 0);
  separateNodesHorizontally(nodes, 12);
  assert.equal(findPersonNodeOverlaps(nodes).length, 0);
  assert.deepEqual(
    nodes.map((node) => node.y),
    [0, 4, 48],
  );
});

test("all card-based native diagram methods keep Person rectangles disjoint", () => {
  const fixture = createScaleFixture(100);
  const base: VisualizationContext = {
    document: fixture.document,
    theme: "light",
    focalPersonId: fixture.rootPersonId,
    secondaryFocalPersonId: fixture.rootPersonId,
  };
  const ancestorFocus: VisualizationContext = {
    ...base,
    focalPersonId: fixture.deepestDescendantId,
  };
  const scenes: DiagramScene[] = [
    buildPedigreeScene(ancestorFocus),
    buildHourglassScene(base),
    buildDualTreeScene(ancestorFocus),
    buildHTreeScene(ancestorFocus),
    buildLocalRadialScene(base),
    buildDualOutlineScene(ancestorFocus),
    buildOreGraphScene(base),
    buildPGraphScene(base),
    buildBipartitePGraphScene(base),
    buildRelationshipNodeScene(base),
    buildTraversalScene(base, "bfs"),
    buildTraversalScene(base, "dfs"),
    buildSugiyamaScene(base, false),
    buildSugiyamaScene(base, true),
    buildForceScene(base, false),
    buildForceScene(base, true),
    buildRadialForceScene(base),
    buildColumnTreeScene(base),
    buildAreaAdaptiveScene(base, { width: 1280, height: 720 }),
  ];

  for (const scene of scenes) {
    const overlaps = findPersonNodeOverlaps(scene.nodes);
    assert.deepEqual(
      overlaps,
      [],
      `${scene.methodId} overlaps ${overlaps.map((item) => `${item.firstId}/${item.secondId}`).join(", ")}`,
    );
  }
});

function personNode(id: string, x: number, y: number, width: number): DiagramNode {
  return {
    id,
    recordId: id,
    relatedRecordIds: [],
    label: id,
    shape: "person",
    x,
    y,
    width,
    height: 34,
  };
}
