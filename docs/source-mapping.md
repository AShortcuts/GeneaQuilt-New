# Source Mapping

This document maps the original Java code to the new website-first architecture.

## Original Java to new modules

- `geneaquilt.io.GEDReader`
  - `crates/geneaquilt-core::gedcom`
- `geneaquilt.data.Network`
  - `crates/geneaquilt-core::graph`
- `geneaquilt.data.Vertex`
  - `crates/geneaquilt-core::model`
- `geneaquilt.data.Indi`
  - `crates/geneaquilt-core::model::Person`
- `geneaquilt.data.Fam`
  - `crates/geneaquilt-core::model::Family`
- `geneaquilt.data.Edge`
  - `crates/geneaquilt-core::graph::EdgeRecord`
- `geneaquilt.algorithms.GenerationRank`
  - `crates/geneaquilt-layout::generation_rank`
- `geneaquilt.nodes.QuiltManager.sortLayers`
  - `crates/geneaquilt-layout::ordering`
- `geneaquilt.selection.Selection`
  - `crates/geneaquilt-core::selection`
- `geneaquilt.selection.DOIManager`
  - `crates/geneaquilt-core::doi`
- `geneaquilt.nodes.TimeLine`
  - `crates/geneaquilt-core::timeline`
- `geneaquilt.BirdsEyeView`
  - `web/src/quiltRenderer.js` behind `GeneaQuiltAdapter`
- `geneaquilt.selection.SlidingController`
  - `web/src/quiltRenderer.js` behind `GeneaQuiltAdapter`

## Browser shell structure

- `web/src/workspaceMain.ts`
  - home, upload, Method selection, and Interactive Mode bootstrap
- `web/src/workspace/workspaceApp.ts`
  - Tree Workspace and Visualization Host orchestration
- `web/src/comparisonMain.ts`
  - dedicated Comparison View bootstrap
- `web/src/comparison/comparisonApp.ts`
  - isolated A/B views, capability ratings, and Method Details
- `web/src/workers/document.worker.ts`
  - off-main-thread GEDCOM parsing, validation, and Tree Analysis
- `web/src/domain`
  - validated method-neutral schemas and documented Projections
- `web/src/recommendations`
  - deterministic, explainable Method Recommendations
- `web/src/visualizations/registry.ts`
  - Method identities, capabilities, availability, sources, and candid limits
- `web/src/visualizations/adapter.ts`
  - the typed lifecycle Interface implemented by every Native Visualization
- `web/src/visualizations/adapters.ts`
  - Adapter lookup without shared Layout geometry
- `web/src/visualizations/geneaquilt`
  - GeneaQuilt's Wasm/Canvas Adapter
- `web/src/visualizations/methods`
  - isolated SVG Method Implementations
- `web/src/exports`
  - attributed PDF and Tiled Poster PDF generation
- `web/src/workspace/database.ts`
  - device-local IndexedDB persistence for Local Trees
- `web/src/styles.css`
  - shared visual tokens and global shell styles
- `web/src/workspace.css`
  - responsive home, selection, Interactive Mode, and dialog styles
- `web/src/comparison.css`
  - responsive A/B Comparison View and rating-table styles

The single-view `main.js`/`app.js` shell is retained outside the active import
graph as a temporary GeneaQuilt interaction-parity reference. It is not a
production fallback or compatibility layer. Its remaining capability migration
is tracked in [`geneaquilt-shell-parity.md`](./geneaquilt-shell-parity.md).

The former hand-drawn visualization-lab prototype is not an authoritative
method implementation and must not be revived as an alternate drawing path.
The active Comparison View uses the same Native Visualization Adapters as
Interactive Mode.

## Explicitly not first-class ports

- `geneaquilt.GeneaQuilt`
  - replaced by the website shell
- `geneaquilt.nodes.PIndi`
  - replaced by render data plus browser drawing
- `geneaquilt.nodes.PFam`
  - replaced by render data plus browser drawing
- `geneaquilt.nodes.PEdge`
  - replaced by render data plus browser drawing
- `geneaquilt.io.DOTLayersReader`
  - replaced by internal Rust layout and cache
- `geneaquilt.algorithms.VertexOrder`
  - not used as the primary ordering implementation
