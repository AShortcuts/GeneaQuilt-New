import assert from "node:assert/strict";
import test from "node:test";

import { FitToggleState } from "./fitToggle.ts";

interface Camera {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const cloneCamera = (camera: Camera): Camera => ({ ...camera });

test("fit toggle bookmarks the current camera before fitting", () => {
  const toggle = new FitToggleState(cloneCamera);
  const camera = { scale: 1.4, offsetX: 120, offsetY: -45 };

  assert.deepEqual(toggle.toggle(camera), { kind: "fit" });
  assert.equal(toggle.isFitted, true);

  camera.scale = 9;
  assert.deepEqual(toggle.toggle({ scale: 0.4, offsetX: 0, offsetY: 0 }), {
    kind: "restore",
    state: { scale: 1.4, offsetX: 120, offsetY: -45 },
  });
  assert.equal(toggle.isFitted, false);
});

test("fit toggle reset discards a stale bookmark", () => {
  const toggle = new FitToggleState(cloneCamera);
  toggle.toggle({ scale: 2, offsetX: 10, offsetY: 20 });

  toggle.reset();

  assert.deepEqual(toggle.toggle({ scale: 0.8, offsetX: -4, offsetY: 7 }), { kind: "fit" });
  assert.equal(toggle.isFitted, true);
});
