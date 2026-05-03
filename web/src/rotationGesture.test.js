import test from "node:test";
import assert from "node:assert/strict";

import {
  anchoredRotationDegrees,
  normalizeRotationDegrees,
} from "./quiltRenderer.js";

test("anchoredRotationDegrees rotates around the first pointer", () => {
  assert.equal(
    anchoredRotationDegrees({
      anchor: { x: 100, y: 100 },
      start: { x: 140, y: 100 },
      current: { x: 100, y: 140 },
      initialRotation: 0,
    }),
    90,
  );

  assert.equal(
    anchoredRotationDegrees({
      anchor: { x: 100, y: 100 },
      start: { x: 100, y: 140 },
      current: { x: 140, y: 100 },
      initialRotation: -15,
    }),
    -90,
  );
});

test("normalizeRotationDegrees clamps canvas tilt to the supported range", () => {
  assert.equal(normalizeRotationDegrees(135), 90);
  assert.equal(normalizeRotationDegrees(-135), -90);
  assert.equal(normalizeRotationDegrees(Number.NaN), 0);
});
