export const TRACKPAD_ZOOM_SPEED = 0.046875;
export const WHEEL_PAN_SPEED = 0.55;

const MAX_WHEEL_DELTA = 100;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
const ZOOM_SLIDER_MIN_SPEED = 0.00234375;
const ZOOM_SLIDER_EXPONENT = 7.2;

/**
 * Converts a browser-reported pinch/zoom wheel delta into a bounded multiplier.
 * Keeping this shared makes Canvas and SVG methods feel equally responsive.
 */
export function trackpadZoomMultiplier(deltaY, deltaMode = 0, speed = TRACKPAD_ZOOM_SPEED) {
  const deltaModeScale = deltaMode === DOM_DELTA_LINE ? 16 : deltaMode === DOM_DELTA_PAGE ? 120 : 1;
  const normalizedDelta = clamp(deltaY * deltaModeScale, -MAX_WHEEL_DELTA, MAX_WHEEL_DELTA);
  return Math.exp(-normalizedDelta * speed);
}

export function wheelGestureMode(event) {
  return event.ctrlKey || event.metaKey ? "zoom" : "pan";
}

export function wheelDeltaPixels(delta, deltaMode = 0, pageSize = 120) {
  const deltaModeScale =
    deltaMode === DOM_DELTA_LINE ? 16 : deltaMode === DOM_DELTA_PAGE ? pageSize : 1;
  return delta * deltaModeScale;
}

export function sliderValueToZoomSpeed(value) {
  const ratio = clamp(value / 100, 0, 1);
  return ZOOM_SLIDER_MIN_SPEED * Math.pow(2, ratio * ZOOM_SLIDER_EXPONENT);
}

export function zoomSpeedToSliderValue(speed) {
  const maximum = ZOOM_SLIDER_MIN_SPEED * Math.pow(2, ZOOM_SLIDER_EXPONENT);
  const normalized = clamp(speed, ZOOM_SLIDER_MIN_SPEED, maximum);
  return (Math.log2(normalized / ZOOM_SLIDER_MIN_SPEED) / ZOOM_SLIDER_EXPONENT) * 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
