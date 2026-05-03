import test from "node:test";
import assert from "node:assert/strict";

import {
  appSurfaceState,
  matchesPopupState,
  normalizeSurfaceFinish,
  shouldFitAfterSourceLoad,
} from "./appState.js";

test("appSurfaceState hides data panels until a quilt is loaded", () => {
  assert.deepEqual(appSurfaceState({ hasScene: false, hasSelection: false }), {
    state: "empty",
    showSource: true,
    showStage: false,
    showDetails: false,
    showSearch: false,
    showControls: false,
  });
});

test("appSurfaceState shows the workspace after a quilt is loaded", () => {
  assert.deepEqual(appSurfaceState({ hasScene: true, hasSelection: false }), {
    state: "loaded",
    showSource: true,
    showStage: true,
    showDetails: false,
    showSearch: true,
    showControls: true,
  });
});

test("appSurfaceState shows details only when a selection exists", () => {
  assert.deepEqual(appSurfaceState({ hasScene: true, hasSelection: true }), {
    state: "inspecting",
    showSource: true,
    showStage: true,
    showDetails: true,
    showSearch: true,
    showControls: true,
  });
});

test("sample tree loads refit after the quilt panel is revealed", () => {
  assert.equal(shouldFitAfterSourceLoad("sample"), true);
  assert.equal(shouldFitAfterSourceLoad("file"), false);
  assert.equal(shouldFitAfterSourceLoad("manual"), false);
});

test("normalizeSurfaceFinish collapses old appearance modes to one simple surface", () => {
  assert.equal(normalizeSurfaceFinish("glossy"), "simple");
  assert.equal(normalizeSurfaceFinish("matte"), "simple");
  assert.equal(normalizeSurfaceFinish("unknown"), "simple");
  assert.equal(normalizeSurfaceFinish(null), "simple");
});

test("matchesPopupState shows matches only for a live search", () => {
  assert.deepEqual(matchesPopupState({ hasScene: false, query: "john" }), {
    showPopup: false,
    state: "hidden",
  });
  assert.deepEqual(matchesPopupState({ hasScene: true, query: "" }), {
    showPopup: false,
    state: "hidden",
  });
  assert.deepEqual(matchesPopupState({ hasScene: true, query: "john", resultCount: 2 }), {
    showPopup: true,
    state: "results",
  });
  assert.deepEqual(matchesPopupState({ hasScene: true, query: "zzz", resultCount: 0 }), {
    showPopup: true,
    state: "empty",
  });
});
