import assert from "node:assert/strict";
import test from "node:test";

import {
  sliderValueToZoomSpeed,
  TRACKPAD_ZOOM_SPEED,
  trackpadZoomMultiplier,
  wheelDeltaPixels,
  wheelGestureMode,
  zoomSpeedToSliderValue,
} from "./zoomInteraction.js";

test("a deliberate trackpad gesture is a further 2.5x more responsive and remains bounded", () => {
  const zoomIn = trackpadZoomMultiplier(-100);
  const zoomOut = trackpadZoomMultiplier(100);
  const previousZoomIn = trackpadZoomMultiplier(-100, 0, 0.01875);

  assert.equal(TRACKPAD_ZOOM_SPEED, 0.046875);
  assert.ok(zoomIn > 108.58 && zoomIn < 108.59);
  assert.ok(zoomOut > 0.0092 && zoomOut < 0.0093);
  assert.ok(Math.abs(Math.log(zoomIn) / Math.log(previousZoomIn) - 2.5) < 0.000_001);
  assert.ok(Math.abs(zoomIn * zoomOut - 1) < 0.000_001);
  assert.equal(trackpadZoomMultiplier(-1_000), zoomIn);
});

test("line-mode wheel events are normalized consistently", () => {
  assert.equal(trackpadZoomMultiplier(-10, 1), trackpadZoomMultiplier(-100));
  assert.equal(trackpadZoomMultiplier(0), 1);
});

test("ordinary wheel gestures pan while browser pinch gestures zoom", () => {
  assert.equal(wheelGestureMode({ ctrlKey: false, metaKey: false }), "pan");
  assert.equal(wheelGestureMode({ ctrlKey: true, metaKey: false }), "zoom");
  assert.equal(wheelGestureMode({ ctrlKey: false, metaKey: true }), "zoom");
});

test("wheel pan deltas respect pixel, line, and page units", () => {
  assert.equal(wheelDeltaPixels(5, 0), 5);
  assert.equal(wheelDeltaPixels(5, 1), 80);
  assert.equal(wheelDeltaPixels(0.5, 2, 800), 400);
});

test("every Interactive Mode zoom-speed setting is a further 2.5x more responsive", () => {
  for (const value of [0, 25, 50, 75, 100]) {
    const previousSpeed = 0.0009375 * Math.pow(2, (value / 100) * 7.2);
    assert.ok(Math.abs(sliderValueToZoomSpeed(value) / previousSpeed - 2.5) < 0.000_001);
  }

  assert.equal(sliderValueToZoomSpeed(-50), sliderValueToZoomSpeed(0));
  assert.equal(sliderValueToZoomSpeed(150), sliderValueToZoomSpeed(100));
});

test("the optional zoom-speed control opens at the shared trackpad response", () => {
  const sliderValue = zoomSpeedToSliderValue(TRACKPAD_ZOOM_SPEED);
  assert.ok(sliderValue > 60 && sliderValue < 61);
  assert.ok(Math.abs(sliderValueToZoomSpeed(sliderValue) - TRACKPAD_ZOOM_SPEED) < Number.EPSILON);
});
