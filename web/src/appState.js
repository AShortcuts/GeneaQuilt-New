export function appSurfaceState({ hasScene, hasSelection }) {
  if (!hasScene) {
    return {
      state: "empty",
      showSource: true,
      showStage: false,
      showDetails: false,
      showSearch: false,
      showControls: false,
    };
  }

  return {
    state: hasSelection ? "inspecting" : "loaded",
    showSource: true,
    showStage: true,
    showDetails: Boolean(hasSelection),
    showSearch: true,
    showControls: true,
  };
}

export function shouldFitAfterSourceLoad(sourceKind) {
  return sourceKind === "sample";
}

export function normalizeSurfaceFinish() {
  return "simple";
}

export function matchesPopupState({ hasScene, query, resultCount = 0 }) {
  if (!hasScene || !String(query ?? "").trim()) {
    return {
      showPopup: false,
      state: "hidden",
    };
  }

  return {
    showPopup: true,
    state: resultCount > 0 ? "results" : "empty",
  };
}
