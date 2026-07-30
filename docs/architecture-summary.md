# Architecture Summary

This is the short reference for GeneaQuilt's current foundation and accepted target architecture. The full agreed behavior and delivery sequence are in [`product-direction.md`](./product-direction.md); current phase and Acceptance Gate evidence is in [`roadmap-verification.md`](./roadmap-verification.md); canonical language is in [`../CONTEXT.md`](../CONTEXT.md), and durable decisions are in [`adr`](./adr).

## Status

The phased foundation is implemented. One canonical Genealogy Document now feeds the Adam home Projection, local GEDCOM analysis, explainable recommendations, a required Method choice, isolated Native Visualizations, the Avraham A/B Comparison View, Interactive Mode, and local export pipelines. All twenty-four catalogued Methods now have selectable Native Visualizations and documented accuracy reviews.

## Core Direction

GeneaQuilt remains a browser-first website with no server-side storage, processing, accounts, synchronization, or hosted sharing.

The app is split into:

- a Rust core for GEDCOM preservation, genealogy data, validation, graph operations, analysis, search, and shared relationship semantics
- a thin Wasm bridge for browser access to the Rust engine
- a substantially TypeScript Vite shell for workspace state, recommendations, method selection, interaction, and export
- isolated Visualization Method Implementations that may use Rust or TypeScript and SVG, Canvas, or WebGL as appropriate

## Why This Shape

The original Java app mixed domain data with desktop scene-graph nodes. That made sense for a Java desktop app, but it is the wrong unit of reuse for the web.

This project keeps graph semantics separate from rendering:

- Rust owns deterministic computation.
- TypeScript owns browser state, validated seams, navigation, and interaction.
- Each Visualization Method owns its own Layout and drawing technology.
- CSS owns shared theme tokens and the practical workstation visual system.

This keeps genealogy meaning independent from UI technology without forcing mathematically different methods through shared geometry.

## Permanent Constraints

- All genealogy processing remains local to the device.
- Families use the binary `HUSB`/`WIFE` model recorded in [ADR 0002](./adr/0002-use-binary-husband-wife-families.md).
- Visualization Method geometry remains isolated as recorded in [ADR 0003](./adr/0003-isolate-visualization-implementations.md).
- Only reviewed Native Visualizations are selectable.
- Tree creation and editing remain out of the current product scope, although the document architecture must not prevent them later.

## Repository Boundaries

### `crates/geneaquilt-core`

Owns domain and graph behavior:

- GEDCOM parsing and normalization
- preservation of unsupported source structures
- binary Family validation and Impossible Parent Loop detection
- person/family model types
- graph records and relationship indexes
- Tree Analysis and Projection support
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

### Browser Modules

The browser is separated into a Tree Workspace, Method Recommendation Module, Visualization Registry, Visualization Host, isolated Method Implementations, export modules, and a Fidelity Harness. New orchestration and Method code is TypeScript; the mature GeneaQuilt Canvas renderer remains behind a typed Adapter while it is migrated incrementally.

## Data Flow

1. The user explores Adam HaRishon's Tree or chooses a GEDCOM family tree file.
2. A worker asks Rust to preserve, parse, validate, normalize, and analyze the Genealogy Document.
3. The selection screen shows Tree Analysis, explainable recommendations, and all methods.
4. The user selects an Available Method.
5. The Registry chooses an isolated Adapter, and the Host opens Interactive Mode.
6. The active Implementation owns Projection, Layout, routing, drawing, and method-specific interaction.
7. The local workspace retains approved Local Trees in IndexedDB and performs only explicit local exports.

## Interaction Model

The app treats focus as a combined model instead of separate one-off highlight systems:

- primary selected vertex
- pinned highlights
- search matches
- visible viewport ids
- active timeline range

`focusModel.js` turns those inputs into renderer state and timeline-active ids.

Current interaction surfaces:

- the documented Adam home Projection and full Interactive Mode
- local GEDCOM selection, validation, Tree Analysis, and explainable recommendations
- explicit Method selection before Interactive Mode
- isolated method switching, search, zoom, fit, and person/Family details
- a text relationship path independent of the drawing
- the Avraham A/B comparison with desktop split view and mobile A/B tabs
- GeneaQuilt minimap plus optional Method tools for alternate ranking, scoped
  search, relationship direction, multi-highlight, isolate depth, zoom
  response, tilt, timeline brushing, advanced details, and Bring-and-Slide;
  the restored shell's deletion gate is tracked in
  [`geneaquilt-shell-parity.md`](./geneaquilt-shell-parity.md)
- local PNG, print, current-view PDF, complete-diagram PDF, and Tiled Poster PDF exports
- user-tree Source GEDCOM and standalone Canvas/SVG HTML exports with privacy disclosure; Adam source/standalone exports remain prohibited

## Rendering Choices

GeneaQuilt continues to use Canvas where it serves the method well. Other methods may use SVG, Canvas, WebGL, TypeScript, or Rust independently. Shared theme and interaction concepts do not imply shared geometry.

The accepted visual direction is a practical genealogy workstation:

- neutral panels and restrained borders
- teal for primary actions and focus
- amber for family/timeline context
- rust for selected/highlighted state
- a solid faint blue-cyan canvas background to distinguish the quilt workspace
- restrained floating glass toolbars in Interactive Mode, with strong contrast and solid accessibility fallbacks

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

## Current Migration Risks

- Committing `web/pkg` is intentional for Cloudflare simplicity, but it means Wasm output must be refreshed locally when Rust changes.
- The Canvas GeneaQuilt renderer remains JavaScript while the modular workspace, schemas, recommendations, comparison, exports, and SVG methods are TypeScript; conversion should continue only behind existing contracts.
- The former single-view shell remains outside the active import graph until
  every unique GeneaQuilt interaction passes the parity gate in
  [`geneaquilt-shell-parity.md`](./geneaquilt-shell-parity.md).
- Large SVG methods have fast deterministic Layouts but can still be limited by browser paint and visual density; see [`performance-baseline.md`](./performance-baseline.md).
- Area-adaptive drawing now applies the published leaf-only monotone local-folding rule, selects fold height by fitted node-area use, and discloses its rooted-tree projection limits.
- The bundled Adam manifest still uses release placeholders for the public request email and exact final creator-credit wording.
- Desktop and 390 x 844 Chromium workflows are audited; current Safari, Firefox, and lower-powered target-device profiling remain release verification work.

## Next Direction

The phased foundation in [`product-direction.md`](./product-direction.md) is implemented through exports and measured scale work. Remaining work is release content, target-device browser profiling, and any gated Method whose authoritative fidelity evidence becomes available. Further worker, caching, culling, level-of-detail, Canvas, or WebGL changes should be driven by measurements rather than by method uniformity.
