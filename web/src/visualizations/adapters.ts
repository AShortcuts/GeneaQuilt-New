import type { VisualizationAdapter } from "./adapter.ts";
import { geneaQuiltAdapter } from "./geneaquilt/GeneaQuiltAdapter.ts";
import { areaAdaptiveAdapter } from "./methods/areaAdaptive/AreaAdaptiveAdapter.ts";
import { columnTreeAdapter } from "./methods/columns/ColumnTreeAdapter.ts";
import { dualTreeAdapter } from "./methods/focused/DualTreeAdapter.ts";
import { hourglassAdapter, pedigreeAdapter } from "./methods/focused/FocusedAdapters.ts";
import {
  dualOutlineAdapter,
  fanChartAdapter,
  hTreeAdapter,
  localRadialAdapter,
} from "./methods/focused/PedigreeAlternativeAdapters.ts";
import {
  bipartitePGraphAdapter,
  oreGraphAdapter,
  pGraphAdapter,
} from "./methods/pgraphs/PGraphAdapters.ts";
import {
  bfsAdapter,
  dfsAdapter,
  relationshipNodeAdapter,
} from "./methods/structural/StructuralAdapters.ts";
import { birthplaceClusterAdapter } from "./methods/thesis/BirthplaceClusterAdapter.ts";
import {
  genealogyForceAdapter,
  genericForceAdapter,
  radialForceAdapter,
} from "./methods/thesis/ForceAdapters.ts";
import { fractalAdapter } from "./methods/thesis/FractalAdapter.ts";
import {
  genealogySugiyamaAdapter,
  genericSugiyamaAdapter,
} from "./methods/thesis/LayeredAdapters.ts";
import { timeNetsAdapter } from "./methods/temporal/TimeNetsAdapter.ts";

const ADAPTERS: ReadonlyMap<string, VisualizationAdapter> = new Map(
  [
    geneaQuiltAdapter,
    pedigreeAdapter,
    hourglassAdapter,
    dualTreeAdapter,
    fanChartAdapter,
    hTreeAdapter,
    localRadialAdapter,
    dualOutlineAdapter,
    oreGraphAdapter,
    pGraphAdapter,
    bipartitePGraphAdapter,
    areaAdaptiveAdapter,
    relationshipNodeAdapter,
    bfsAdapter,
    dfsAdapter,
    fractalAdapter,
    birthplaceClusterAdapter,
    radialForceAdapter,
    genealogyForceAdapter,
    genericForceAdapter,
    genealogySugiyamaAdapter,
    genericSugiyamaAdapter,
    timeNetsAdapter,
    columnTreeAdapter,
  ].map((adapter) => [adapter.methodId, adapter]),
);

export function getVisualizationAdapter(methodId: string): VisualizationAdapter {
  const adapter = ADAPTERS.get(methodId);
  if (!adapter) {
    throw new Error(`The Native Visualization for ${methodId} is not registered.`);
  }
  return adapter;
}

export function hasVisualizationAdapter(methodId: string): boolean {
  return ADAPTERS.has(methodId);
}
