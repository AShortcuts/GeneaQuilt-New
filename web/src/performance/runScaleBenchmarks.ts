import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import initWasm, { GeneaQuiltEngine, initSync } from "../../pkg/geneaquilt_wasm.js";
import { canonicalDocumentToDerivedGedcom } from "../domain/toGedcom.ts";
import type { VisualizationContext } from "../visualizations/adapter.ts";
import { buildAreaAdaptiveScene } from "../visualizations/methods/areaAdaptive/AreaAdaptiveAdapter.ts";
import { buildColumnTreeScene } from "../visualizations/methods/columns/ColumnTreeAdapter.ts";
import { buildDualTreeScene } from "../visualizations/methods/focused/DualTreeAdapter.ts";
import {
  buildHourglassScene,
  buildPedigreeScene,
} from "../visualizations/methods/focused/FocusedAdapters.ts";
import {
  buildDualOutlineScene,
  buildFanChartScene,
  buildHTreeScene,
  buildLocalRadialScene,
} from "../visualizations/methods/focused/PedigreeAlternativeAdapters.ts";
import {
  buildBipartitePGraphScene,
  buildOreGraphScene,
  buildPGraphScene,
} from "../visualizations/methods/pgraphs/PGraphAdapters.ts";
import {
  buildRelationshipNodeScene,
  buildTraversalScene,
} from "../visualizations/methods/structural/StructuralAdapters.ts";
import { buildTimeNetsScene } from "../visualizations/methods/temporal/TimeNetsAdapter.ts";
import { buildBirthplaceClusterScene } from "../visualizations/methods/thesis/BirthplaceClusterAdapter.ts";
import {
  buildForceScene,
  buildRadialForceScene,
} from "../visualizations/methods/thesis/ForceAdapters.ts";
import { buildFractalScene } from "../visualizations/methods/thesis/FractalAdapter.ts";
import { buildSugiyamaScene } from "../visualizations/methods/thesis/LayeredAdapters.ts";
import type { DiagramScene } from "../visualizations/diagram/types.ts";
import { createScaleFixture, type ScaleFixture } from "./scaleFixtures.ts";

interface BenchmarkResult {
  method: string;
  people: number;
  milliseconds: number;
  nodes: number;
  edges: number;
  runs: number;
}

type SceneBuilder = (context: VisualizationContext) => DiagramScene;

const wasmPath = fileURLToPath(new URL("../../pkg/geneaquilt_wasm_bg.wasm", import.meta.url));
try {
  initSync({ module: readFileSync(wasmPath) });
} catch (error) {
  if (!(error instanceof Error && /already initialized/i.test(error.message))) throw error;
  await initWasm();
}

const builders: ReadonlyArray<readonly [string, SceneBuilder]> = [
  ["pedigree", buildPedigreeScene],
  ["hourglass", buildHourglassScene],
  ["dual-tree", buildDualTreeScene],
  ["ore", buildOreGraphScene],
  ["pgraph", buildPGraphScene],
  ["bipartite-pgraph", buildBipartitePGraphScene],
  ["relationship-nodes", buildRelationshipNodeScene],
  ["bfs", (context) => buildTraversalScene(context, "bfs")],
  ["dfs", (context) => buildTraversalScene(context, "dfs")],
  ["sugiyama-default", (context) => buildSugiyamaScene(context, false)],
  ["sugiyama-genealogy", (context) => buildSugiyamaScene(context, true)],
  ["force-default", (context) => buildForceScene(context, false)],
  ["force-genealogy", (context) => buildForceScene(context, true)],
  ["force-radial", buildRadialForceScene],
  ["fractal", (context) => buildFractalScene(context, { width: 1280, height: 720 })],
  ["birthplace-cluster", buildBirthplaceClusterScene],
  ["fan", buildFanChartScene],
  ["h-tree", buildHTreeScene],
  ["local-radial", buildLocalRadialScene],
  ["dual-outline", buildDualOutlineScene],
  ["timenets", (context) => buildTimeNetsScene(context, { width: 1280, height: 720 })],
  ["column-tree", buildColumnTreeScene],
  ["area-adaptive", (context) => buildAreaAdaptiveScene(context, { width: 1280, height: 720 })],
];

const fixtureSizes = [100, 1_000, 10_000] as const;
const fixtures = new Map(fixtureSizes.map((size) => [size, createScaleFixture(size)]));
const results: BenchmarkResult[] = [];

for (const size of fixtureSizes) {
  const fixture = fixtures.get(size);
  if (!fixture) throw new Error(`Missing ${size}-person fixture.`);
  results.push(benchmarkGeneaQuilt(fixture, size));
  for (const [method, builder] of builders) {
    results.push(benchmarkScene(method, builder, fixture, size));
  }
}
results.push(benchmarkGeneaQuilt(createScaleFixture(50_000), 50_000));

process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      runtime: process.version,
      platform: `${process.platform}-${process.arch}`,
      results,
    },
    null,
    2,
  )}\n`,
);

function benchmarkGeneaQuilt(fixture: ScaleFixture, people: number): BenchmarkResult {
  const gedcom = canonicalDocumentToDerivedGedcom(fixture.document);
  const runs = people >= 10_000 ? 1 : 3;
  let nodes = 0;
  let edges = 0;
  const milliseconds = median(
    Array.from({ length: runs }, () => {
      const started = performance.now();
      const engine = GeneaQuiltEngine.with_ranker(gedcom, "original");
      const scene = JSON.parse(engine.scene_json()) as {
        vertices?: unknown[];
        edges?: unknown[];
      };
      nodes = scene.vertices?.length ?? 0;
      edges = scene.edges?.length ?? 0;
      engine.free();
      return performance.now() - started;
    }),
  );
  return { method: "geneaquilt", people, milliseconds: round(milliseconds), nodes, edges, runs };
}

function benchmarkScene(
  method: string,
  builder: SceneBuilder,
  fixture: ScaleFixture,
  people: number,
): BenchmarkResult {
  const context: VisualizationContext = {
    document: fixture.document,
    theme: "light",
    focalPersonId:
      method === "pedigree" || method === "fan" || method === "h-tree"
        ? fixture.deepestDescendantId
        : fixture.rootPersonId,
    secondaryFocalPersonId: fixture.rootPersonId,
  };
  if (method === "dual-tree" || method === "dual-outline") {
    context.focalPersonId = fixture.deepestDescendantId;
  }
  const runs = people >= 10_000 || method.startsWith("force-") ? 1 : 3;
  let nodes = 0;
  let edges = 0;
  const milliseconds = median(
    Array.from({ length: runs }, () => {
      const started = performance.now();
      const scene = builder(context);
      nodes = scene.nodes.length;
      edges = scene.edges.length;
      return performance.now() - started;
    }),
  );
  return {
    method,
    people,
    milliseconds: round(milliseconds),
    nodes,
    edges,
    runs,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
