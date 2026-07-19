# Contributing to GeneaQuilt

Thanks for helping improve GeneaQuilt. The repository has one contributor-facing command surface at the root, with a Rust workspace under `crates/` and an npm workspace under `web/`.

## Prerequisites

- Node.js `20.19+`, `22.13+`, or `24+`; Node.js 22 LTS is the recommended local version
- npm 9 or newer
- the stable Rust toolchain with Cargo, rustfmt, and Clippy
- `wasm-pack` for development and full production builds

With `nvm` and `rustup`, the typical setup is:

```sh
nvm use
rustup component add rustfmt clippy
cargo install wasm-pack
```

## Setup

Install JavaScript dependencies once from the repository root:

```sh
npm install
```

Start the application with:

```sh
npm run dev
```

The development command rebuilds the Rust WebAssembly package and then starts Vite at <http://localhost:5173>.

## Root commands

| Command                    | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `npm run dev`              | Rebuild Wasm and start the Vite development server           |
| `npm run build`            | Rebuild Wasm and create a production web build               |
| `npm run build:wasm`       | Regenerate the browser package in `web/pkg`                  |
| `npm run build:cloudflare` | Build Vite using the committed Wasm package                  |
| `npm run preview`          | Preview the latest production build locally                  |
| `npm test`                 | Run the JavaScript and Rust test suites                      |
| `npm run lint`             | Run ESLint and Clippy, with all warnings denied              |
| `npm run format`           | Format the web and Rust workspaces with Prettier and rustfmt |
| `npm run format:check`     | Verify web and Rust formatting without changing files        |
| `npm run check`            | Run formatting, linting, tests, and the deployable web build |

Direct Cargo commands such as `cargo test`, `cargo fmt`, and `cargo clippy` continue to work from the repository root.

## WebAssembly changes

`web/pkg` is intentionally committed because the Cloudflare build does not install Rust or `wasm-pack`. After changing `crates/geneaquilt-wasm` or its Rust dependencies:

1. Run `npm run build:wasm`.
2. Include the regenerated `web/pkg` files in the same pull request.
3. Run `npm run check` before submitting the change.

Generated files should not be edited by hand.

## Pull requests

- Keep changes focused and explain user-visible behavior in the pull request description.
- Add or update tests when behavior changes.
- Preserve the separation between domain behavior in Rust and browser interaction or rendering in `web/`.
- Update documentation when commands, prerequisites, architecture, or deployment behavior changes.
