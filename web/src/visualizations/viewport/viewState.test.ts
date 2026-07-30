import assert from "node:assert/strict";
import test from "node:test";

import { createVisualizationViewState, parseVisualizationViewState } from "./viewState.ts";

test("visualization View State round-trips finite camera values", () => {
  const state = createVisualizationViewState("geneaquilt", {
    scale: 1.2,
    offsetX: 40,
    offsetY: -12,
    rotationDegrees: 0,
  });

  assert.deepEqual(parseVisualizationViewState(JSON.parse(JSON.stringify(state))), state);
});

test("visualization View State rejects non-finite or malformed cameras", () => {
  assert.equal(
    parseVisualizationViewState({
      version: 1,
      methodId: "geneaquilt",
      camera: { scale: Number.NaN },
    }),
    null,
  );
  assert.equal(parseVisualizationViewState({ version: 1, methodId: "", camera: {} }), null);
});
