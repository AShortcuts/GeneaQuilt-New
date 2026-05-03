# GeneaQuilt Web Port

GeneaQuilt Web is a browser-first implementation of the GeneaQuilt genealogy visualization technique. It reads GEDCOM data, lays out people and families as an interactive quilt, and provides search, timeline, minimap, selection, focus, rotation, and export tools in a modern web interface.

This project builds on the ideas from the original Java GeneaQuilt application: <https://github.com/jdfekete/geneaquilt>.

## Why GeneaQuilt

Traditional family trees become hard to read when a genealogy includes many siblings, remarriages, large branches, or overlapping generations. GeneaQuilt uses a matrix-like layout instead:

- people and families are represented as two connected vertex types
- generations are arranged into readable bands
- relationship links stay compact instead of becoming a sprawling tree
- dense genealogies can be scanned through overview, timeline, search, and focus controls
- selection and tracing reveal parents, spouses, children, predecessors, and successors without redrawing the whole structure

The result is especially useful when the question is not just "who is this person's parent?", but "how does this whole family network fit together?"

## Strengths of this web port

The original project is a Java/Swing and Piccolo2D desktop application. This port keeps the core visualization model but reshapes the implementation for the browser.

- Browser-native use: run the viewer locally in a web browser without a Java desktop app shell.
- Rust/Wasm core: GEDCOM parsing, graph modeling, search, timeline summaries, DOI/focus logic, and layout live in deterministic Rust crates with a thin WebAssembly bridge.
- Modern interaction surface: Canvas rendering supports pan, zoom, rotation, minimap navigation, search highlighting, selection details, timeline brushing, focus isolation, and Bring-and-Slide navigation.
- Cleaner architecture: domain data, layout computation, Wasm bindings, and UI rendering are separated instead of coupling graph objects directly to scene-graph nodes.
- Export workflow: the web UI can export an interactive HTML snapshot or open a print/PDF-ready view.
- Testable modules: layout, focus, app-state, gesture, and graph behavior are covered through Rust and JavaScript tests rather than being embedded only in desktop UI behavior.
- Web product UI: file loading, controls, details, timeline, and export actions are organized as a practical browser workspace with light and dark themes.

## What carries over from the original

The original GeneaQuilt README describes the technique as a diagonally-filled matrix for large genealogies, with overview, timeline, search/filtering, and Bring-and-Slide interaction. Those are the important ideas preserved here.

This repository does not attempt to port Swing menus, Piccolo2D node classes, Eclipse project setup, or the Graphviz subprocess fallback directly. Those were useful for the Java desktop implementation, but they are not the right boundaries for a web application.

## Repository layout

- `crates/geneaquilt-core`: GEDCOM parsing, graph model, selection, DOI/focus, search, and timeline logic
- `crates/geneaquilt-layout`: generation ranking, ordering, layout auditing, and packed quilt layout output
- `crates/geneaquilt-wasm`: WebAssembly bridge exposed to the browser
- `web/`: Vite browser app, Canvas renderer, controls, timeline, minimap, export, and UI state
- `docs/architecture.md`: design rationale for the browser/Rust split
- `docs/source-mapping.md`: mapping from original Java concepts to this repo's modules

## Running the web app

```sh
cd web
npm install
npm run dev
```

`npm run dev` rebuilds the Wasm package first, then starts Vite.

For a production build:

```sh
cd web
npm run build
```

The generated Wasm package is written to `web/pkg`. This directory is committed so hosts without Rust, Cargo, or `wasm-pack` can still build the static Vite site.

## Cloudflare Pages

Use these build settings:

- Framework preset: `Vite` if available, otherwise `None`
- Root directory: `web`
- Build command: `npm run build:cloudflare`
- Build output directory: `dist`

Cloudflare does not need Rust or `wasm-pack` with this setup. Before committing changes that affect `crates/geneaquilt-wasm` or its dependencies, run `cd web && npm run build:wasm` locally and commit the updated `web/pkg` files. Cloudflare then only runs `vite build` against the prebuilt Wasm package.

## Current status

The app can load GEDCOM text or files, build a quilt layout, inspect people and families, search across names and file details, brush timeline ranges, focus selections, rotate/fit/zoom the canvas, and export snapshots.

The implementation is still a port, not a claim of full feature parity with every behavior of the original Java application. The emphasis is on preserving the useful visualization model while making the system easier to run, test, maintain, and evolve as a web product.
