export async function loadEngineModule() {
  const module = await import("../pkg/geneaquilt_wasm.js");
  await module.default();
  return module;
}
