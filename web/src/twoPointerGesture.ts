export interface GesturePoint {
  x: number;
  y: number;
}

export interface TwoPointerGesture {
  scale: number;
  rotationDegrees: number;
  startMidpoint: GesturePoint;
  currentMidpoint: GesturePoint;
  startDistance: number;
  currentDistance: number;
}

export const PINCH_ZOOM_DEAD_ZONE_PX = 8;
export const ROTATION_DEAD_ZONE_DEGREES = 3;

export function calculateTwoPointerGesture(
  startFirst: GesturePoint,
  startSecond: GesturePoint,
  currentFirst: GesturePoint,
  currentSecond: GesturePoint,
): TwoPointerGesture {
  const startDistance = distance(startFirst, startSecond);
  const currentDistance = distance(currentFirst, currentSecond);
  const startAngle = Math.atan2(startSecond.y - startFirst.y, startSecond.x - startFirst.x);
  const currentAngle = Math.atan2(
    currentSecond.y - currentFirst.y,
    currentSecond.x - currentFirst.x,
  );

  return {
    scale: startDistance > 0 ? currentDistance / startDistance : 1,
    rotationDegrees: normalizeAngleDegrees(((currentAngle - startAngle) * 180) / Math.PI),
    startMidpoint: midpoint(startFirst, startSecond),
    currentMidpoint: midpoint(currentFirst, currentSecond),
    startDistance,
    currentDistance,
  };
}

export function stabilizeTwoPointerGesture(
  gesture: TwoPointerGesture,
  pinchDeadZone = PINCH_ZOOM_DEAD_ZONE_PX,
  rotationDeadZone = ROTATION_DEAD_ZONE_DEGREES,
): TwoPointerGesture {
  const distanceDelta = gesture.currentDistance - gesture.startDistance;
  const intentionalDistanceDelta = removeDeadZone(distanceDelta, pinchDeadZone);
  const scale =
    gesture.startDistance > 0
      ? Math.max(
          Number.EPSILON,
          (gesture.startDistance + intentionalDistanceDelta) / gesture.startDistance,
        )
      : 1;

  return {
    ...gesture,
    scale,
    rotationDegrees: removeDeadZone(gesture.rotationDegrees, rotationDeadZone),
  };
}

function distance(first: GesturePoint, second: GesturePoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first: GesturePoint, second: GesturePoint): GesturePoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function normalizeAngleDegrees(value: number): number {
  let normalized = value;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function removeDeadZone(value: number, deadZone: number): number {
  const magnitude = Math.max(0, Math.abs(value) - Math.max(0, deadZone));
  return Math.sign(value) * magnitude;
}
