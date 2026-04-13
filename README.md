# GeneaQuilt Web Port

This repository is the starting point for a website-first port of the original Java GeneaQuilt application.

The target product is a browser application, not a desktop wrapper. Rust is used for the graph model, layout, traversal, search, and future Wasm execution path. The browser owns rendering, input, accessibility, and the surrounding product UI.

## Why this shape

The original Java code mixes data objects with Piccolo2D scene nodes and Swing controls. That works on desktop, but it is the wrong unit of reuse for the web. The useful parts to preserve are:

- GEDCOM ingestion into a bipartite `individual <-> family` graph
- Generation and ordering algorithms
- Traversal-driven highlight and trace behavior
- DOI-based isolate/filter behavior
- Overview and timeline features

The parts not worth porting literally are:

- Swing menus and desktop UI glue
- Piccolo2D scene graph ownership inside domain objects
- Graphviz subprocess fallback for layer computation
- `VertexOrder.java`, which is unfinished and not the main ordering path

## Repository layout

- `docs/architecture.md`: recommended system design for the website port
- `docs/source-mapping.md`: mapping from the original Java packages to the new modules
- `crates/geneaquilt-core`: Rust domain model and traversal/search primitives
- `crates/geneaquilt-layout`: Rust layout engine for layers and ordering
- `crates/geneaquilt-wasm`: browser-facing bridge surface for future Wasm exports
- `web/`: Vite website shell

## Immediate plan

1. Implement GEDCOM import into `geneaquilt-core`
2. Port generation assignment and layer ordering into `geneaquilt-layout`
3. Add real GEDCOM parsing and packed layout output to `geneaquilt-wasm`
4. Build the browser renderer around culling, level-of-detail, and fast hit testing

## Current status

This commit establishes the architecture, the Rust workspace scaffold, and a Vite-based web shell. It does not yet parse GEDCOM or render the quilt.
