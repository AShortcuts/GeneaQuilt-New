import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import {
  calculatePosterPlan,
  createCompleteDiagramPdf,
  createCurrentViewPdf,
  createTiledPosterPdf,
  paperDimensions,
  pdfSafeText,
  readPngDimensions,
  type TiledPosterOptions,
} from "./pdfExport.ts";

const ONE_PIXEL_PNG = new Blob(
  [
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  ],
  { type: "image/png" },
);

const METADATA = {
  title: "Test genealogy",
  methodName: "Test method",
  credit: "Test creator",
  version: "1",
  siteAttribution: "GeneaQuilt",
  summary: "1 visible person of 1 total. Whole genealogy.",
};

const DEFAULT_OPTIONS: TiledPosterOptions = {
  paperSize: "letter",
  orientation: "landscape",
  overlapMm: 10,
  scalePercent: 100,
  cropMarks: true,
  pageCoordinates: true,
};

test("paper dimensions follow the selected orientation", () => {
  assert.deepEqual(paperDimensions("letter", "portrait"), [612, 792]);
  assert.deepEqual(paperDimensions("letter", "landscape"), [792, 612]);
  assert.deepEqual(paperDimensions("a3", "portrait"), [841.89, 1190.55]);
});

test("poster planning uses row-major coordinates with the requested overlap", () => {
  const plan = calculatePosterPlan(2400, 1400, DEFAULT_OPTIONS);
  assert.ok(plan.columns > 1);
  assert.ok(plan.rows > 1);
  assert.equal(plan.tiles.length, plan.columns * plan.rows);
  assert.deepEqual(plan.tiles[0], {
    pageNumber: 1,
    row: 0,
    column: 0,
    offsetX: 0,
    offsetTop: 0,
  });
  assert.equal(plan.tiles[1]?.row, 0);
  assert.equal(plan.tiles[1]?.column, 1);
  assert.equal(plan.tiles[plan.columns]?.row, 1);
  assert.equal(plan.tiles[plan.columns]?.column, 0);
  assert.ok(plan.overlapPoints > 28 && plan.overlapPoints < 29);
});

test("larger paper cannot require more tiles for the same poster", () => {
  const letter = calculatePosterPlan(3000, 1800, DEFAULT_OPTIONS);
  const a3 = calculatePosterPlan(3000, 1800, { ...DEFAULT_OPTIONS, paperSize: "a3" });
  assert.ok(a3.pageCount <= letter.pageCount);
});

test("poster planning rejects an unsafe page explosion", () => {
  assert.throws(
    () => calculatePosterPlan(100_000, 100_000, DEFAULT_OPTIONS),
    /local safety limit is 400 pages/,
  );
});

test("PNG dimensions are read from the IHDR header without decoding family data", async () => {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 1234);
  view.setUint32(20, 567);
  assert.deepEqual(await readPngDimensions(new Blob([bytes], { type: "image/png" })), {
    width: 1234,
    height: 567,
  });
});

test("PDF text replaces punctuation unsupported by the standard embedded font", () => {
  assert.equal(pdfSafeText("Tree — creator • “quoted”"), 'Tree - creator - "quoted"');
});

test("current and complete diagram exports produce real PDF files", async () => {
  const [current, complete] = await Promise.all([
    createCurrentViewPdf(ONE_PIXEL_PNG, METADATA),
    createCompleteDiagramPdf(ONE_PIXEL_PNG, METADATA),
  ]);
  assert.equal(await fileSignature(current), "%PDF-");
  assert.equal(await fileSignature(complete), "%PDF-");
  assert.equal(current.type, "application/pdf");
  assert.equal(complete.type, "application/pdf");
});

test("tiled poster export produces the planned row-major PDF page set", async () => {
  const result = await createTiledPosterPdf(ONE_PIXEL_PNG, METADATA, DEFAULT_OPTIONS);
  assert.equal(result.plan.pageCount, 1);
  assert.equal(result.plan.tiles[0]?.pageNumber, 1);
  assert.equal(await fileSignature(result.blob), "%PDF-");
});

async function fileSignature(blob: Blob): Promise<string> {
  return new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
}
