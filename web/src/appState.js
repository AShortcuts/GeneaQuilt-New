export function appSurfaceState({ hasScene, hasSelection }) {
  if (!hasScene) {
    return {
      state: "empty",
      showSource: true,
      showStage: false,
      showDetails: false,
      showSearch: false,
    };
  }

  return {
    state: hasSelection ? "inspecting" : "loaded",
    showSource: true,
    showStage: true,
    showDetails: Boolean(hasSelection),
    showSearch: true,
  };
}

export function shouldFitAfterSourceLoad(sourceKind) {
  return sourceKind === "sample";
}

export function normalizeSurfaceFinish(value) {
  return value === "matte" ? "matte" : "glossy";
}
