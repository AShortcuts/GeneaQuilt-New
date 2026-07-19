# Web Workspace

This directory contains the Vite browser application: the Canvas renderer, camera and gestures, search and details panels, timeline, minimap, exports, and the thin bridge to the Rust/WebAssembly engine.

`web` is an npm workspace managed from the repository root. Install dependencies and use the primary commands there:

```sh
npm install
npm run dev
```

Keeping the browser application in its own workspace prevents frontend configuration and dependencies from being mixed with the Rust crates while preserving a single contributor-facing command surface.

## Workspace commands

These commands can also be run from this directory when working specifically on the browser application:

- `npm run dev` rebuilds the Wasm package and starts Vite
- `npm test` runs the browser module tests with Node's built-in test runner
- `npm run lint` checks the workspace with ESLint
- `npm run format` formats the workspace with Prettier
- `npm run build` rebuilds Wasm and creates `dist`
- `npm run build:wasm` regenerates the browser package in `pkg`
- `npm run build:cloudflare` builds Vite against the committed `pkg` package
- `npm run preview` previews the latest production build

The generated `pkg` directory is intentionally tracked for deployment. Run `npm run build:wasm` and commit the resulting `pkg` changes whenever `crates/geneaquilt-wasm` or its Rust dependencies change.
