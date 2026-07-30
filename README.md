# GeneaQuilt

GeneaQuilt is a private, browser-first workspace for understanding GEDCOM family tree files through several accurate visualization methods. It helps a newcomer open a genealogy, understand its structure, choose an appropriate view, and explore or compare it without uploading family data to a server.

The project builds on the original Java [GeneaQuilts application](https://github.com/jdfekete/geneaquilt) by Jean-Daniel Fekete, Pierre Dragicevic, and INRIA. GeneaQuilt remains the leading method for a coherent Whole-dataset View of very large genealogies, while the workspace also includes focused, chronological, print-oriented, graph, and rooted-tree methods with candid limitations.

## What the site does

- Opens and analyzes GEDCOM files locally in a browser worker.
- Starts with a documented 58-person Projection from Adam through Ya'akov's children.
- Explains counts, disconnected groups, generation shape, sibling groups, remarriage, half-siblings, Pedigree Collapse, Reconvergence, dates, and relationship problems.
- Recommends methods with plain-language reasons, then requires the user to choose one before Interactive Mode.
- Provides twenty-four reviewed Native Visualizations behind isolated Adapters.
- Compares two live methods on the same Avraham three-generation descendant sample, using A/B switching on mobile.
- Keeps optional Local Trees in IndexedDB with open, rename, export, and individual permanent deletion.
- Produces attributed PNG, current-view PDF, complete-diagram PDF, print, and Tiled Poster PDF output locally. GeneaQuilt also supports standalone interactive HTML for a user's own tree.

GEDCOM is a family tree file format. GeneaQuilt reads it; it does not edit the user's source genealogy in this iteration.

## Privacy boundary

GeneaQuilt has no accounts, server-side genealogy processing, hosted sharing, or synchronization. Chosen GEDCOM files stay on the device unless the user explicitly exports or shares a local file.

The creator-owned Source GEDCOM for Adam HaRishon's Tree is not shipped by the website and cannot be exported from its interface. The public app contains a smaller method-neutral visualization document without notes, source records, custom properties, media, or the Source GEDCOM text. Charts and reports derived from that built-in tree include its title, creator credit, version, and GeneaQuilt attribution.

## Architecture

- `crates/geneaquilt-core`: GEDCOM parsing and preservation, binary Family validation, graph semantics, Tree Analysis, search, selection, and timeline data
- `crates/geneaquilt-layout`: deterministic GeneaQuilt ranking, ordering, and layout audits
- `crates/geneaquilt-wasm`: thin browser bridge to the Rust engine
- `web/src/workspace`: home, Local Trees, required Method selection, Interactive Mode, and export orchestration
- `web/src/recommendations`: deterministic document- and goal-specific Method Recommendations
- `web/src/visualizations`: Registry, typed Adapter Interface, fidelity evidence, ratings, performance records, and isolated Method Implementations
- `web/src/comparison`: live A/B Comparison View and complete rating table
- `web/src/workers`: off-main-thread GEDCOM validation and Tree Analysis
- `web/src/exports`: attributed PDF and poster generation

Visualization Methods share the canonical Genealogy Document, theme tokens, and host behavior. They do not share algorithm-specific geometry.

The accepted product behavior is in [docs/product-direction.md](docs/product-direction.md), the current architecture is summarized in [docs/architecture-summary.md](docs/architecture-summary.md), and durable decisions are in [docs/adr](docs/adr).

## Local setup

Prerequisites:

- Node.js `20.19+`, `22.13+`, or `24+`; Node.js 22 LTS is recommended by `.nvmrc`
- npm 9 or newer
- the stable Rust toolchain with rustfmt and Clippy
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/) for Wasm changes and the full local build

Install dependencies and start Vite:

```sh
npm install
npm run dev
```

Open the `Local` URL printed by Vite, normally <http://localhost:5173>. Any `Network` URLs are optional addresses for testing the same local server from another device on the network.

## Local commands

| Command                    | Purpose                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`              | Rebuild Wasm locally, then start Vite                                           |
| `npm run build`            | Rebuild Wasm locally, then create the production web build                      |
| `npm run build:wasm`       | Regenerate the committed browser package in `web/pkg`                           |
| `npm run build:cloudflare` | Build the static Vite site from the committed Wasm package                      |
| `npm run preview`          | Preview the latest production build locally                                     |
| `npm run benchmark:scale`  | Reproduce the deterministic visualization scale baseline                        |
| `npm test`                 | Run the web and Rust test suites locally                                        |
| `npm run lint`             | Run ESLint and Clippy locally, with warnings denied                             |
| `npm run format:check`     | Verify JavaScript, TypeScript, CSS, JSON, Markdown, and Rust formatting locally |
| `npm run check`            | Run formatting, types, lint, tests, and the deployable static build locally     |

The project does not depend on GitHub Actions. The repository's authoritative verification command is `npm run check` on the contributor's computer.

## Static deployment

`web/pkg` is committed so a static host can build the Vite app without installing Rust. After changing `crates/geneaquilt-wasm` or its Rust dependencies, run `npm run build:wasm` locally and include the regenerated files.

Cloudflare Pages uses:

- root directory: repository root
- build command: `npm run build:cloudflare`
- output directory: `web/dist`

This deployment serves only static files. All genealogy computation still happens in the visitor's browser.

## License and attribution

This project is available under the [BSD 3-Clause License](LICENSE). The original GeneaQuilts copyright notice is retained in the license.
