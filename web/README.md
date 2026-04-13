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
- the generated `pkg` directory is not tracked in git
