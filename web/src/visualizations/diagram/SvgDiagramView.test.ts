import assert from "node:assert/strict";
import test from "node:test";

import type { DiagramBounds } from "./types.ts";
import {
  buildInteractiveSvgDocument,
  fitBoundsToViewport,
  fitNodeLabel,
  panViewBoxByPixels,
  pinchViewBox,
  shouldCaptureDiagramPointer,
} from "./SvgDiagramView.ts";

const VIEWPORT = { width: 1280, height: 720 } as const;
const INSETS = { top: 126, right: 24, bottom: 96, left: 24 } as const;

test("fit bounds keep a tall diagram clear of floating controls", () => {
  const scene = { minX: 0, minY: 0, width: 1000, height: 1800 };
  assertInsideSafeArea(scene, fitBoundsToViewport(scene, VIEWPORT.width, VIEWPORT.height, INSETS));
});

test("fit bounds keep a wide diagram clear of floating controls", () => {
  const scene = { minX: -500, minY: -200, width: 2400, height: 600 };
  assertInsideSafeArea(scene, fitBoundsToViewport(scene, VIEWPORT.width, VIEWPORT.height, INSETS));
});

test("fit bounds can keep a small family tree at a readable card scale", () => {
  const scene = { minX: 0, minY: 0, width: 260, height: 150 };
  const viewBox = fitBoundsToViewport(scene, VIEWPORT.width, VIEWPORT.height, INSETS, 1.35);
  const renderedScale = Math.min(VIEWPORT.width / viewBox.width, VIEWPORT.height / viewBox.height);

  assert.ok(Math.abs(renderedScale - 1.35) < 0.000_001);
  assertInsideSafeArea(scene, viewBox);
});

test("long visual labels are shortened without changing a node's full source label", () => {
  assert.equal(fitNodeLabel("Yeshayahu HaNavi a.k.a Isaiah", 164), "Yeshayahu HaNavi a.k...");
  assert.equal(fitNodeLabel("Avraham", 164), "Avraham");
});

test("pinch zoom preserves the genealogy point beneath the moving touch midpoint", () => {
  const viewBox = pinchViewBox(
    { minX: 0, minY: 0, width: 1_000, height: 600 },
    { x: 500, y: 300 },
    { x: 0.6, y: 0.4 },
    2,
  );

  assert.deepEqual(viewBox, {
    minX: 200,
    minY: 180,
    width: 500,
    height: 300,
  });
  assert.equal(viewBox.minX + viewBox.width * 0.6, 500);
  assert.equal(viewBox.minY + viewBox.height * 0.4, 300);
});

test("wheel or two-finger translation pans without changing the zoom", () => {
  const viewBox = panViewBoxByPixels(
    { minX: 100, minY: 200, width: 1_000, height: 600 },
    64,
    -36,
    1_280,
    720,
  );

  assert.deepEqual(viewBox, {
    minX: 150,
    minY: 170,
    width: 1_000,
    height: 600,
  });
});

test("person cards keep click ownership while open canvas keeps drag capture", () => {
  assert.equal(shouldCaptureDiagramPointer(true, 1), false);
  assert.equal(shouldCaptureDiagramPointer(false, 1), true);
  assert.equal(shouldCaptureDiagramPointer(true, 2), true);
});

test("standalone SVG export is interactive, local-only, and escapes its title", () => {
  const html = buildInteractiveSvgDocument({
    title: `Family </title><script src="https://example.com/x.js"></script>`,
    svgMarkup:
      '<svg id="standalone-diagram" viewBox="0 0 800 600" role="img"><rect width="10" height="10"/></svg>',
    dark: false,
  });

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /id="fit-button"/);
  assert.match(html, /addEventListener\("wheel"/);
  assert.match(html, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(html, /two-finger scroll to move/);
  assert.match(html, /Math\.abs\(distanceDelta\) - 8/);
  assert.match(html, /beginPinch/);
  assert.match(html, /addEventListener\("keydown"/);
  assert.match(html, /Print \/ Save PDF/);
  assert.ok(!html.includes(`</title><script src="https://example.com/x.js">`));
  assert.match(html, /Family &lt;\/title&gt;&lt;script/);
});

function assertInsideSafeArea(scene: DiagramBounds, viewBox: DiagramBounds): void {
  const scale = Math.min(VIEWPORT.width / viewBox.width, VIEWPORT.height / viewBox.height);
  const offsetX = (VIEWPORT.width - viewBox.width * scale) / 2;
  const offsetY = (VIEWPORT.height - viewBox.height * scale) / 2;
  const left = offsetX + (scene.minX - viewBox.minX) * scale;
  const top = offsetY + (scene.minY - viewBox.minY) * scale;
  const right = offsetX + (scene.minX + scene.width - viewBox.minX) * scale;
  const bottom = offsetY + (scene.minY + scene.height - viewBox.minY) * scale;

  assert.ok(left >= INSETS.left - 0.001, `left edge ${left} should clear ${INSETS.left}`);
  assert.ok(top >= INSETS.top - 0.001, `top edge ${top} should clear ${INSETS.top}`);
  assert.ok(
    right <= VIEWPORT.width - INSETS.right + 0.001,
    `right edge ${right} should clear ${INSETS.right}`,
  );
  assert.ok(
    bottom <= VIEWPORT.height - INSETS.bottom + 0.001,
    `bottom edge ${bottom} should clear ${INSETS.bottom}`,
  );
}
