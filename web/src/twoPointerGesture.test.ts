import assert from "node:assert/strict";
import test from "node:test";

import { calculateTwoPointerGesture, stabilizeTwoPointerGesture } from "./twoPointerGesture.ts";

test("two-pointer gesture reports pinch scale, rotation, and moving midpoint", () => {
  const gesture = calculateTwoPointerGesture(
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 40, y: 20 },
    { x: 40, y: 220 },
  );

  assert.equal(gesture.scale, 2);
  assert.equal(gesture.rotationDegrees, 90);
  assert.deepEqual(gesture.startMidpoint, { x: 50, y: 0 });
  assert.deepEqual(gesture.currentMidpoint, { x: 40, y: 120 });
  assert.equal(gesture.startDistance, 100);
  assert.equal(gesture.currentDistance, 200);
});

test("two-pointer gesture remains finite when both pointers begin together", () => {
  const gesture = calculateTwoPointerGesture(
    { x: 20, y: 20 },
    { x: 20, y: 20 },
    { x: 10, y: 10 },
    { x: 40, y: 40 },
  );

  assert.equal(gesture.scale, 1);
  assert.ok(Number.isFinite(gesture.rotationDegrees));
});

test("two-pointer rotation takes the shortest path across the angle boundary", () => {
  const degrees = (value: number): { x: number; y: number } => ({
    x: Math.cos((value * Math.PI) / 180),
    y: Math.sin((value * Math.PI) / 180),
  });
  const gesture = calculateTwoPointerGesture(
    { x: 0, y: 0 },
    degrees(170),
    { x: 0, y: 0 },
    degrees(-170),
  );

  assert.ok(Math.abs(gesture.rotationDegrees - 20) < 0.000_001);
});

test("parallel two-pointer movement stays a pure pan", () => {
  const gesture = stabilizeTwoPointerGesture(
    calculateTwoPointerGesture(
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 42, y: 65 },
      { x: 142, y: 65 },
    ),
  );

  assert.equal(gesture.scale, 1);
  assert.equal(gesture.rotationDegrees, 0);
  assert.deepEqual(gesture.currentMidpoint, { x: 92, y: 65 });
});

test("small spacing and angle jitter do not zoom or rotate", () => {
  const gesture = stabilizeTwoPointerGesture(
    calculateTwoPointerGesture(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 20, y: 20 },
      { x: 124, y: 22 },
    ),
  );

  assert.equal(gesture.scale, 1);
  assert.equal(gesture.rotationDegrees, 0);
});

test("deliberate pinch and rotation begin smoothly after their dead zones", () => {
  const gesture = stabilizeTwoPointerGesture(
    calculateTwoPointerGesture(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 120 * Math.cos(Math.PI / 18), y: 120 * Math.sin(Math.PI / 18) },
    ),
  );

  assert.ok(Math.abs(gesture.scale - 1.12) < 0.000_001);
  assert.ok(Math.abs(gesture.rotationDegrees - 7) < 0.000_001);
});
