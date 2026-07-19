import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const crateDirectory = path.join(repositoryRoot, "crates", "geneaquilt-wasm");
const packageDirectory = path.join(repositoryRoot, "web", "pkg");

function requireCommand(command, installHint) {
  const probe = spawnSync(command, ["--version"], { stdio: "ignore" });

  if (probe.error?.code === "ENOENT") {
    console.error(`${command} is required but was not found on PATH. ${installHint}`);
    process.exit(1);
  }

  if (probe.error) {
    throw probe.error;
  }

  if (probe.status !== 0) {
    console.error(`Unable to run ${command} --version.`);
    process.exit(probe.status ?? 1);
  }
}

requireCommand("cargo", "Install Rust from https://rustup.rs/ and try again.");
requireCommand(
  "wasm-pack",
  "Install wasm-pack from https://rustwasm.github.io/wasm-pack/installer/ and try again.",
);

const outputDirectory = path.relative(crateDirectory, packageDirectory);
const build = spawnSync(
  "wasm-pack",
  ["build", ".", "--target", "web", "--out-dir", outputDirectory, "--release"],
  {
    cwd: crateDirectory,
    stdio: "inherit",
  },
);

if (build.error) {
  throw build.error;
}

if (build.signal) {
  console.error(`wasm-pack was terminated by signal ${build.signal}.`);
  process.exit(1);
}

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

// wasm-pack ignores its output by default; this repository intentionally tracks it for deployment.
rmSync(path.join(packageDirectory, ".gitignore"), { force: true });
