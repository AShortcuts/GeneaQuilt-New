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
  - `web/src/features/minimap`
- `geneaquilt.selection.SlidingController`
  - `web/src/features/bring-and-slide`

## Browser shell structure

- `web/src/main.ts`
  - application bootstrap
- `web/src/app.ts`
  - shell composition and status UI
- `web/src/styles.css`
  - visual system for the website shell

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
