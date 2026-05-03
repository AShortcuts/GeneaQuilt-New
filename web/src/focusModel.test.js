import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFocusModel,
  describeFocusModel,
  interpolateCamera,
} from "./focusModel.js";

test("buildFocusModel coordinates selection, pins, search, viewport, and timeline", () => {
  const model = buildFocusModel({
    selectedId: "I1",
    pinnedIds: ["I2", "I1", "I2"],
    searchMatchIds: ["I3", "I1"],
    visibleIds: ["I4", "I3"],
    timelineFocus: {
      start_year: 1900,
      end_year: 1920,
      vertex_ids: ["I2", "I5"],
    },
  });

  assert.deepEqual(model.primaryId, "I1");
  assert.deepEqual(model.highlightIds, ["I1", "I2"]);
  assert.deepEqual(model.searchIds, ["I3", "I1"]);
  assert.deepEqual(model.visibleIds, ["I4", "I3"]);
  assert.deepEqual(model.timelineIds, ["I2", "I5"]);
  assert.deepEqual(model.timelineActiveIds, ["I1", "I2", "I3"]);
  assert.equal(model.hasSelectionContext, true);
  assert.equal(model.hasTimelineContext, true);
});

test("buildFocusModel uses viewport and search context when no timeline range is active", () => {
  const model = buildFocusModel({
    selectedId: null,
    pinnedIds: [],
    searchMatchIds: ["I7"],
    visibleIds: ["I4", "I7", "I8"],
    timelineFocus: null,
  });

  assert.deepEqual(model.highlightIds, []);
  assert.deepEqual(model.timelineIds, []);
  assert.deepEqual(model.timelineActiveIds, ["I4", "I7", "I8"]);
  assert.equal(model.hasSelectionContext, false);
  assert.equal(model.hasTimelineContext, false);
});

test("describeFocusModel summarizes the combined focus without exposing subsystems", () => {
  assert.equal(
    describeFocusModel(
      buildFocusModel({
        selectedId: "I1",
        pinnedIds: ["I2"],
        searchMatchIds: ["I3", "I4"],
        visibleIds: ["I5"],
        timelineFocus: { start_year: 1900, end_year: 1920, vertex_ids: ["I1"] },
      }),
    ),
    "1 selected · 1 pinned · 2 search matches · 1900-1920",
  );

  assert.equal(
    describeFocusModel(
      buildFocusModel({
        selectedId: null,
        pinnedIds: [],
        searchMatchIds: [],
        visibleIds: [],
        timelineFocus: null,
      }),
    ),
    "No active focus",
  );
});

test("interpolateCamera eases between camera states", () => {
  assert.deepEqual(
    interpolateCamera(
      { scale: 1, offsetX: 0, offsetY: 20 },
      { scale: 3, offsetX: 100, offsetY: 60 },
      0.5,
    ),
    { scale: 2, offsetX: 50, offsetY: 40 },
  );

  assert.deepEqual(
    interpolateCamera(
      { scale: 1, offsetX: 0, offsetY: 0 },
      { scale: 3, offsetX: 100, offsetY: 100 },
      2,
    ),
    { scale: 3, offsetX: 100, offsetY: 100 },
  );
}
);
