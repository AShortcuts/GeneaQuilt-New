import test from "node:test";
import assert from "node:assert/strict";

import { appSurfaceState, shouldFitAfterSourceLoad } from "./appState.js";

test("appSurfaceState hides data panels until a quilt is loaded", () => {
  assert.deepEqual(appSurfaceState({ hasScene: false, hasSelection: false }), {
    state: "empty",
    showSource: true,
    showStage: false,
    showDetails: false,
    showSearch: false,
  });
});

test("appSurfaceState shows the workspace after a quilt is loaded", () => {
  assert.deepEqual(appSurfaceState({ hasScene: true, hasSelection: false }), {
    state: "loaded",
    showSource: true,
    showStage: true,
    showDetails: false,
    showSearch: true,
  });
});

test("appSurfaceState shows details only when a selection exists", () => {
  assert.deepEqual(appSurfaceState({ hasScene: true, hasSelection: true }), {
    state: "inspecting",
    showSource: true,
    showStage: true,
    showDetails: true,
    showSearch: true,
  });
});

test("sample tree loads refit after the quilt panel is revealed", () => {
  assert.equal(shouldFitAfterSourceLoad("sample"), true);
  assert.equal(shouldFitAfterSourceLoad("file"), false);
  assert.equal(shouldFitAfterSourceLoad("manual"), false);
});
