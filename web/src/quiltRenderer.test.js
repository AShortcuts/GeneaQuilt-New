import assert from "node:assert/strict";
import test from "node:test";

import { canvasPointerIntent } from "./quiltRenderer.js";

test("canvas dragging starts only from open canvas", () => {
  assert.equal(canvasPointerIntent(null, null), "pan");
  assert.equal(canvasPointerIntent({ id: "@I1@", kind: "person" }, null), "select");
  assert.equal(canvasPointerIntent({ id: "@F1@", kind: "family" }, "@F1@"), "select");
});

test("the selected person keeps the dedicated Bring-and-Slide gesture", () => {
  assert.equal(canvasPointerIntent({ id: "@I1@", kind: "person" }, "@I1@"), "slide");
});
