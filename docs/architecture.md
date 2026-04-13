# Architecture Recommendation

## Decision

Build GeneaQuilt as a website with a Rust/Wasm computational core and a browser-native rendering shell.

Do not build the first version as a desktop app or a webview wrapper. Packaging can come later if needed, but the core engineering problem is large genealogy layout plus rich interaction inside the browser.

## Why this is the right split

The original Java implementation couples the domain graph to Piccolo2D nodes:

- `Vertex` lazily creates a `PNode`
- `Edge` lazily creates a `PEdge`
- `GeneaQuilt` constructs Swing and Piccolo canvases directly
- `QuiltManager` lays out generations by moving scene-graph nodes

That coupling is not reusable on the web. The reusable assets are the graph semantics and interaction rules, not the UI framework.

## Recommended top-level architecture

### Browser shell

Owns:

- file upload
- search field and result controls
- selection list/details panel
- timeline UI
- minimap/overview UI
- accessibility and keyboard shortcuts
- camera state

Technology direction:

- Vite-based TypeScript shell around Canvas/WebGL rendering
- Worker-driven pipeline for parse and layout
- IndexedDB cache keyed by GEDCOM content hash

This does not prevent a later Tauri wrapper, but it keeps the first product web-native.

### Rust core

Owns:

- GEDCOM parsing and normalization
- graph model
- component analysis
- cycle handling
- layer assignment
- within-layer ordering
- traversal for trace/highlight
- DOI computation for isolate/filter
- search indexing
- packed output structures for rendering

This code should be deterministic, side-effect-light, and independent from any UI toolkit.

### Wasm adapter

Owns:

- stable serialization boundary between JS and Rust
- worker entry points
- packed typed-array outputs for nodes, edges, labels, and hit-test metadata
- incremental recomputation entry points later

The Wasm layer should stay thin. It is an adapter, not the application.

## What to port from the Java source

### Must port

- `GEDReader.java`
  - parse GEDCOM into individuals, families, edges, labels, and dates
- `Network.java`
  - graph indexing, components, parents/spouses/ascendants/descendants helpers
- `GenerationRank.java`
  - main generation/layer assignment currently used by the app
- `QuiltManager.sortLayers()`
  - actual iterative barycentric ordering used in production
- `Selection.java`
  - predecessor/successor tracing semantics
- `HighlightManager.java`
  - overlapping highlight composition rules
- `DOIManager.java`
  - isolate/filter distance computation
- `TimeLine.java`
  - date range aggregation and visible-range mapping
- `BirdsEyeView.java`
  - overview/minimap navigation model
- `SlidingController.java`
  - Bring-and-Slide interaction model

### Do not port literally

- `GeneaQuilt.java`
  - desktop app shell only
- Piccolo2D node subclasses such as `PIndi`, `PFam`, `PEdge`
  - convert their visual semantics into browser rendering data
- `DOTLayersReader.java`
  - subprocess-based Graphviz fallback is not suitable in-browser

### Non-essential source

- `VertexOrder.java`
  - this file is incomplete and not the main ordering path
  - `compute()` stops after `init()`
  - most optimization logic is commented out
  - the real ordering behavior in the app comes from `QuiltManager.sortLayers()`

## Performance model

## Goal categories

- Interaction latency:
  - pan/zoom/highlight/search/trace should feel instant
- Import latency:
  - parse and layout should be fast, but not assumed to complete in literal milliseconds for every GEDCOM
- Revisit latency:
  - cached reloads should be near-instant

## Practical strategy

- Parse and layout in a web worker
- Cache normalized graph and layout output in IndexedDB
- Render from packed arrays, not object-heavy scene graphs
- Use culling by viewport and by visible generation bands
- Use level-of-detail for labels
- Keep hit testing in precomputed row/column intervals where possible

The original app already hints that layout can be expensive by writing `.lyr` cache files. The browser version should do the same conceptually, but in IndexedDB instead of sidecar files.

## Data model recommendation

Represent the quilt as a bipartite graph:

- `Person`
  - id
  - display label fields
  - raw GEDCOM properties
  - date summaries
  - relationship ids
- `Family`
  - id
  - spouse ids
  - child ids
  - date summaries
- `Vertex`
  - enum over `Person` and `Family`
- `Edge`
  - stable id
  - from vertex index
  - to vertex index

Derived indexes:

- `id -> vertex index`
- outgoing edge ranges
- incoming edge ranges
- connected components
- per-layer ordered vertex slices
- search field index

## Layout pipeline

1. Parse GEDCOM into normalized `Person`, `Family`, and `Edge` records
2. Build the directed bipartite graph
3. Detect weakly connected components
4. Handle cycle edges using the same conceptual approach as `GenerationRank`
5. Assign layers
6. Normalize layers to alternating person/family bands
7. Run barycentric ordering passes modeled on `QuiltManager.sortLayers()`
8. Produce packed render coordinates and label anchors
9. Build timeline ranges and minimap metadata

## Interaction model

### Selection and tracing

Selections should remain graph-semantic, not renderer-semantic.

- select a person, family, or connector
- trace predecessors, successors, both, or none
- support multi-selection with stable color assignment
- merge overlapping path highlights

### Isolate/filter

Use DOI distances exactly as a graph computation and apply them visually in the renderer:

- selected and highlighted nodes get DOI near zero
- surrounding nodes are assigned larger DOI
- renderer maps DOI to alpha, scale, or visibility policy

The Rust core should compute DOI. The browser should only animate the transition.

### Bring-and-Slide

Preserve the behavior, but implement it as a camera controller in the browser:

- when dragging left from a person, reveal parents
- when dragging right from a person, reveal children
- show the temporary fan-out path overlay
- commit the destination when the drag reaches a terminal node

This is a product differentiator. It should not be deferred if the goal is real parity with GeneaQuilt.

## Rendering recommendation

### First implementation

Use Canvas 2D for correctness and speed of iteration.

Reason:

- the quilt is mostly orthogonal lines, text, and rectangles
- you can get very far with culling and LOD before needing WebGL
- the interaction semantics are more important than shader complexity in the first milestone

### Upgrade path

Move edge and grid rendering to WebGL when datasets prove Canvas insufficient.

Keep labels and interaction overlays in Canvas or DOM if that remains simpler.

## Suggested repo evolution

### Phase 1

- core graph model
- GEDCOM import
- generation assignment
- barycentric ordering
- static quilt JSON output

### Phase 2

- Wasm adapter
- worker pipeline
- browser file upload
- canvas renderer
- pan/zoom

### Phase 3

- search
- details panel
- trace/highlight modes
- DOI isolate/filter
- timeline
- minimap

### Phase 4

- Bring-and-Slide
- caching and reload acceleration
- performance tuning for large GEDCOMs

## Risks

- GEDCOM data quality is inconsistent; the parser must tolerate missing or duplicate fields
- text measurement differs between Java and browser fonts, so visual parity will not be pixel-identical
- Bring-and-Slide will require careful browser input design to feel as smooth as the Java original
- large datasets may require moving from Canvas-only to hybrid Canvas plus WebGL

## Build tooling

- Use Vite for the website shell and development server
- Add Wasm packaging after the Rust bridge API settles
- Do not make the initial repo depend on a Rust-first frontend toolchain unless the frontend itself moves mostly into Rust

## Bottom line

Rust is recommended for the computational core.

A website is the correct product target.

Vite is a good fit for the browser shell around that core.

The port should preserve the graph semantics and interaction model from the Java source, but it should not attempt a line-for-line UI framework translation.
