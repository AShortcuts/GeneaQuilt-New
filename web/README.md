# Web Shell

This directory is the browser application shell.

Planned responsibilities:

- file upload and drag-and-drop
- Wasm bootstrap and later worker orchestration
- renderer and camera
- search/details/timeline/minimap panels
- Bring-and-Slide input controller

Recommended stack:

- plain JavaScript modules
- Canvas 2D first, with a WebGL upgrade path for dense edge rendering
- a thin bridge to the Rust/Wasm engine

Build notes:

- `npm run build:wasm` generates the browser package into `web/pkg`
- `npm run dev` rebuilds the Wasm package first, then starts Vite
- `npm run build:cloudflare` runs `vite build` against the committed `web/pkg` package for hosts that do not provide Rust or `wasm-pack`
- the generated `pkg` directory is tracked for deployment; run `npm run build:wasm` locally and commit `web/pkg` whenever the Wasm crate changes
