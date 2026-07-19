# Architecture Summary

This is the short, editable reference for the current GeneaQuilt Web architecture. Use it when making product, implementation, or deployment decisions.

## Core Direction

GeneaQuilt Web is a browser-first port of the original Java GeneaQuilt application. The goal is not to reproduce the old Swing/Piccolo2D application structure, but to preserve the useful genealogy visualization model in a modern, testable web architecture.

The app is split into:

- a Rust core for genealogy data, graph operations, layout, search, timeline, and focus logic
- a thin Wasm bridge for browser access to the Rust engine
- a Vite browser shell for UI, file loading, rendering, interaction, and export

## Why This Shape

The original Java app mixed domain data with desktop scene-graph nodes. That made sense for a Java desktop app, but it is the wrong unit of reuse for the web.

This project keeps graph semantics separate from rendering:

- Rust owns deterministic computation.
- JavaScript owns browser UI state and event handling.
- Canvas owns visual drawing and hit interaction.
- CSS owns the practical workstation visual system.

This lets the genealogy engine remain independent from any one UI framework.

## Repository Boundaries

### `crates/geneaquilt-core`

Owns domain and graph behavior:

- GEDCOM parsing and normalization
- person/family model types
- graph records and relationship indexes
- search behavior
- selection and trace semantics
- DOI/focus computation
- timeline aggregation

This crate should stay UI-independent.

### `crates/geneaquilt-layout`

Owns layout behavior:

- generation ranking
- alternate ranking experiments
- within-layer ordering
- layout audit tooling
- packed layout output for rendering

This crate should produce deterministic layout data, not visual UI objects.

### `crates/geneaquilt-wasm`

Owns the browser bridge:

- exposes the Rust engine to JavaScript
- serializes scene, search, details, timeline, and interaction data
- stays thin; application behavior should not accumulate here unless it is truly bridge-specific

### `web/src`

Owns the browser app:

- `main.js`: app bootstrap
- `engine.js`: dynamic Wasm import boundary
- `app.js`: UI composition and interaction wiring
- `appState.js`: app surface visibility/state rules
- `focusModel.js`: unified selection/search/timeline focus state
- `quiltRenderer.js`: Canvas renderer, camera, minimap, hit testing, rotation, export
- `styles.css`: practical visual system for the browser workspace

## Data Flow

1. User loads GEDCOM text or a file in the browser.
2. `app.js` passes the source to `GeneaQuiltEngine` through the Wasm bridge.
3. Rust parses GEDCOM, builds the person/family graph, ranks generations, orders vertices, and returns JSON.
4. `quiltRenderer.js` converts scene data into Canvas geometry and handles pan, zoom, fit, rotation, minimap, hit testing, and export.
5. Search, selection, timeline brushing, focus isolation, and details are requested from the Rust engine and reflected in browser UI state.

## Interaction Model

The app treats focus as a combined model instead of separate one-off highlight systems:

- primary selected vertex
- pinned highlights
- search matches
- visible viewport ids
- active timeline range

`focusModel.js` turns those inputs into renderer state and timeline-active ids.

Current interaction surfaces:

- GEDCOM source load and sample data
- layout style selection
- search by names, dates, ids, and file details
- relationship mode selection
- focus isolation and depth slider
- zoom speed and rotation controls
- timeline range brushing
- minimap navigation
- person/family detail panel
- pinned highlights
- Bring-and-Slide navigation
- interactive HTML export and print/PDF export

## Rendering Choices

The renderer uses Canvas 2D first.

Reasons:

- the quilt is mostly text, rectangles, orthogonal lines, and small markers
- Canvas is simple to tune and easy to export
- interaction semantics matter more than advanced shader rendering at this stage
- culling and level-of-detail can be added before reaching for WebGL

The current visual direction is a practical genealogy workstation:

- neutral panels and restrained borders
- teal for primary actions and focus
- amber for family/timeline context
- rust for selected/highlighted state
- a solid faint blue-cyan canvas background to distinguish the quilt workspace
- no decorative glass, blobs, or marketing-style hero treatment

## Deployment Choice

Cloudflare Pages builds only the static web app.

Because Cloudflare does not provide Rust, Cargo, or `wasm-pack` in this setup, the generated Wasm package is committed under `web/pkg`.

Deployment flow:

1. Run `npm run build:wasm` from the repository root after changes to `crates/geneaquilt-wasm` or dependencies.
2. Commit the updated `web/pkg` files.
3. Cloudflare runs the root `npm run build:cloudflare` command, which delegates to the Vite workspace.

Cloudflare Pages settings:

- root directory: repository root
- build command: `npm run build:cloudflare`
- output directory: `web/dist`

## Current Tradeoffs

- Committing `web/pkg` is intentional for Cloudflare simplicity, but it means Wasm output must be refreshed locally when Rust changes.
- `app.js` currently owns a lot of UI wiring; split only when a boundary becomes stable and reduces complexity.
- `quiltRenderer.js` is the right place for Canvas geometry and camera behavior, but not for graph semantics.
- Search, timeline, DOI, and selection should remain graph-computed in Rust where possible.
- Web workers and IndexedDB caching are still future improvements, not current dependencies.

## Future Directions

Likely next architecture improvements:

- move parse/layout to a web worker when large files make main-thread work visible
- cache parsed graph and layout output by GEDCOM content hash
- split `app.js` into focused UI modules after interaction boundaries settle
- add keyboard accessibility for key controls and canvas navigation
- add larger GEDCOM performance tests and renderer culling checks
- consider WebGL only if Canvas becomes the measured bottleneck
