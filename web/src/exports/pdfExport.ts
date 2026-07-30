import {
  PDFDocument,
  StandardFonts,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

export type PaperSizeId = "letter" | "a4" | "a3";
export type PaperOrientation = "portrait" | "landscape";

export interface ExportMetadata {
  title: string;
  methodName: string;
  credit: string;
  version?: string | null;
  siteAttribution?: string;
  summary?: string | null;
}

export interface TiledPosterOptions {
  paperSize: PaperSizeId;
  orientation: PaperOrientation;
  overlapMm: number;
  scalePercent: number;
  cropMarks: boolean;
  pageCoordinates: boolean;
}

export interface PosterTile {
  pageNumber: number;
  row: number;
  column: number;
  offsetX: number;
  offsetTop: number;
}

export interface PosterPlan {
  pageWidth: number;
  pageHeight: number;
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  overlapPoints: number;
  imageScale: number;
  imageWidth: number;
  imageHeight: number;
  columns: number;
  rows: number;
  pageCount: number;
  tiles: PosterTile[];
}

export interface PngDimensions {
  width: number;
  height: number;
}

const POINTS_PER_INCH = 72;
const PIXELS_PER_INCH = 96;
const POINTS_PER_MILLIMETER = POINTS_PER_INCH / 25.4;
const PIXEL_TO_POINT = POINTS_PER_INCH / PIXELS_PER_INCH;
const POSTER_MARGIN = 30;
const POSTER_FOOTER = 24;
const MAX_POSTER_PAGES = 400;
const MAX_SINGLE_PAGE_POINTS = 14_400;

export const PAPER_SIZES: Readonly<Record<PaperSizeId, readonly [number, number]>> = {
  letter: [612, 792],
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
};

export function paperDimensions(
  paperSize: PaperSizeId,
  orientation: PaperOrientation,
): readonly [number, number] {
  const [shortSide, longSide] = PAPER_SIZES[paperSize];
  return orientation === "portrait" ? [shortSide, longSide] : [longSide, shortSide];
}

export function calculatePosterPlan(
  imageWidthPixels: number,
  imageHeightPixels: number,
  options: TiledPosterOptions,
): PosterPlan {
  assertPositiveFinite(imageWidthPixels, "image width");
  assertPositiveFinite(imageHeightPixels, "image height");
  assertPositiveFinite(options.scalePercent, "poster scale");
  if (!Number.isFinite(options.overlapMm) || options.overlapMm < 0 || options.overlapMm > 30) {
    throw new Error("Poster overlap must be between 0 and 30 millimeters.");
  }

  const [pageWidth, pageHeight] = paperDimensions(options.paperSize, options.orientation);
  const contentX = POSTER_MARGIN;
  const contentY = POSTER_MARGIN + POSTER_FOOTER;
  const contentWidth = pageWidth - POSTER_MARGIN * 2;
  const contentHeight = pageHeight - POSTER_MARGIN * 2 - POSTER_FOOTER;
  const overlapPoints = options.overlapMm * POINTS_PER_MILLIMETER;
  if (overlapPoints >= Math.min(contentWidth, contentHeight) * 0.75) {
    throw new Error("Poster overlap leaves too little printable area on each page.");
  }

  const imageScale = PIXEL_TO_POINT * (options.scalePercent / 100);
  const imageWidth = imageWidthPixels * imageScale;
  const imageHeight = imageHeightPixels * imageScale;
  const horizontalStep = contentWidth - overlapPoints;
  const verticalStep = contentHeight - overlapPoints;
  const columns = tileCount(imageWidth, contentWidth, horizontalStep);
  const rows = tileCount(imageHeight, contentHeight, verticalStep);
  const pageCount = columns * rows;
  if (pageCount > MAX_POSTER_PAGES) {
    throw new Error(
      `This poster would need ${pageCount} pages. Reduce the scale or choose larger paper; the local safety limit is ${MAX_POSTER_PAGES} pages.`,
    );
  }

  const tiles: PosterTile[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push({
        pageNumber: tiles.length + 1,
        row,
        column,
        offsetX: column * horizontalStep,
        offsetTop: row * verticalStep,
      });
    }
  }

  return {
    pageWidth,
    pageHeight,
    contentX,
    contentY,
    contentWidth,
    contentHeight,
    overlapPoints,
    imageScale,
    imageWidth,
    imageHeight,
    columns,
    rows,
    pageCount,
    tiles,
  };
}

export async function createCurrentViewPdf(png: Blob, metadata: ExportMetadata): Promise<Blob> {
  const document = await createDocument(metadata, "Current visualization view");
  const image = await embedPng(document, png);
  const orientation: PaperOrientation = image.width >= image.height ? "landscape" : "portrait";
  const [pageWidth, pageHeight] = paperDimensions("letter", orientation);
  const page = document.addPage([pageWidth, pageHeight]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const headerHeight = metadata.summary ? 62 : 48;
  const footerHeight = 30;
  const margin = 34;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2 - headerHeight - footerHeight;
  const scale = Math.min(contentWidth / image.width, contentHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (pageWidth - width) / 2;
  const y = margin + footerHeight + (contentHeight - height) / 2;

  drawPageHeader(page, bold, metadata, pageHeight, margin);
  page.drawImage(image, { x, y, width, height });
  drawPageFooter(page, font, metadata, margin, pageWidth);
  return pdfBlob(await document.save());
}

export async function createCompleteDiagramPdf(png: Blob, metadata: ExportMetadata): Promise<Blob> {
  const document = await createDocument(metadata, "Complete visualization diagram");
  const image = await embedPng(document, png);
  const margin = 32;
  const headerHeight = metadata.summary ? 52 : 38;
  const footerHeight = 24;
  const naturalWidth = image.width * PIXEL_TO_POINT;
  const naturalHeight = image.height * PIXEL_TO_POINT;
  const maximumImageWidth = MAX_SINGLE_PAGE_POINTS - margin * 2;
  const maximumImageHeight = MAX_SINGLE_PAGE_POINTS - margin * 2 - headerHeight - footerHeight;
  const scale = Math.min(1, maximumImageWidth / naturalWidth, maximumImageHeight / naturalHeight);
  const imageWidth = naturalWidth * scale;
  const imageHeight = naturalHeight * scale;
  const pageWidth = imageWidth + margin * 2;
  const pageHeight = imageHeight + margin * 2 + headerHeight + footerHeight;
  const page = document.addPage([pageWidth, pageHeight]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  drawPageHeader(page, bold, metadata, pageHeight, margin);
  page.drawImage(image, {
    x: margin,
    y: margin + footerHeight,
    width: imageWidth,
    height: imageHeight,
  });
  drawPageFooter(page, font, metadata, margin, pageWidth);
  return pdfBlob(await document.save({ objectsPerTick: 40 }));
}

export async function createTiledPosterPdf(
  png: Blob,
  metadata: ExportMetadata,
  options: TiledPosterOptions,
): Promise<{ blob: Blob; plan: PosterPlan }> {
  const dimensions = await readPngDimensions(png);
  const plan = calculatePosterPlan(dimensions.width, dimensions.height, options);
  const document = await createDocument(metadata, "Tiled visualization poster");
  const image = await embedPng(document, png);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  for (const tile of plan.tiles) {
    const page = document.addPage([plan.pageWidth, plan.pageHeight]);
    drawPosterHeader(page, bold, metadata, tile, plan);
    page.pushOperators(
      pushGraphicsState(),
      moveTo(plan.contentX, plan.contentY),
      lineTo(plan.contentX + plan.contentWidth, plan.contentY),
      lineTo(plan.contentX + plan.contentWidth, plan.contentY + plan.contentHeight),
      lineTo(plan.contentX, plan.contentY + plan.contentHeight),
      closePath(),
      clip(),
      endPath(),
    );
    page.drawImage(image, {
      x: plan.contentX - tile.offsetX,
      y: plan.contentY + plan.contentHeight - plan.imageHeight + tile.offsetTop,
      width: plan.imageWidth,
      height: plan.imageHeight,
    });
    page.pushOperators(popGraphicsState());
    if (options.cropMarks) {
      drawCropMarks(page, plan);
    }
    drawPosterFooter(page, font, metadata, tile, plan, options.pageCoordinates);
  }

  return {
    blob: pdfBlob(await document.save({ objectsPerTick: 25 })),
    plan,
  };
}

export async function readPngDimensions(png: Blob): Promise<PngDimensions> {
  const bytes = new Uint8Array(await png.slice(0, 24).arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte)) {
    throw new Error("The visualization export is not a valid PNG image.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  assertPositiveFinite(width, "PNG width");
  assertPositiveFinite(height, "PNG height");
  return { width, height };
}

async function createDocument(metadata: ExportMetadata, subject: string): Promise<PDFDocument> {
  const document = await PDFDocument.create();
  document.setTitle(metadata.title);
  document.setAuthor(metadata.credit);
  document.setSubject([subject, metadata.methodName, metadata.summary].filter(Boolean).join(" · "));
  document.setCreator(metadata.siteAttribution ?? "GeneaQuilt");
  document.setProducer("GeneaQuilt local browser export");
  document.setCreationDate(new Date());
  return document;
}

async function embedPng(document: PDFDocument, png: Blob): Promise<PDFImage> {
  return document.embedPng(await png.arrayBuffer());
}

function drawPageHeader(
  page: PDFPage,
  font: PDFFont,
  metadata: ExportMetadata,
  pageHeight: number,
  margin: number,
): void {
  page.drawText(fitText(font, metadata.title, 15, page.getWidth() - margin * 2), {
    x: margin,
    y: pageHeight - margin - 15,
    size: 15,
    font,
    color: rgb(0.13, 0.23, 0.19),
  });
  page.drawText(fitText(font, metadata.methodName, 8, page.getWidth() - margin * 2), {
    x: margin,
    y: pageHeight - margin - 29,
    size: 8,
    font,
    color: rgb(0.35, 0.39, 0.36),
  });
  if (metadata.summary) {
    page.drawText(fitText(font, metadata.summary, 7, page.getWidth() - margin * 2), {
      x: margin,
      y: pageHeight - margin - 41,
      size: 7,
      font,
      color: rgb(0.4, 0.42, 0.4),
    });
  }
}

function drawPageFooter(
  page: PDFPage,
  font: PDFFont,
  metadata: ExportMetadata,
  margin: number,
  pageWidth: number,
): void {
  const text = creditLine(metadata);
  page.drawText(fitText(font, text, 7, pageWidth - margin * 2), {
    x: margin,
    y: margin - 4,
    size: 7,
    font,
    color: rgb(0.4, 0.42, 0.4),
  });
}

function drawPosterHeader(
  page: PDFPage,
  font: PDFFont,
  metadata: ExportMetadata,
  tile: PosterTile,
  plan: PosterPlan,
): void {
  const title = `${metadata.title} · ${metadata.methodName}`;
  page.drawText(fitText(font, title, 8, plan.contentWidth - 80), {
    x: plan.contentX,
    y: plan.pageHeight - 19,
    size: 8,
    font,
    color: rgb(0.16, 0.25, 0.21),
  });
  page.drawText(`R${tile.row + 1} C${tile.column + 1}`, {
    x: plan.pageWidth - plan.contentX - 44,
    y: plan.pageHeight - 19,
    size: 8,
    font,
    color: rgb(0.16, 0.25, 0.21),
  });
  if (metadata.summary) {
    page.drawText(fitText(font, metadata.summary, 6, plan.contentWidth), {
      x: plan.contentX,
      y: plan.pageHeight - 30,
      size: 6,
      font,
      color: rgb(0.4, 0.42, 0.4),
    });
  }
}

function drawPosterFooter(
  page: PDFPage,
  font: PDFFont,
  metadata: ExportMetadata,
  tile: PosterTile,
  plan: PosterPlan,
  pageCoordinates: boolean,
): void {
  const coordinate = pageCoordinates
    ? `Row ${tile.row + 1}/${plan.rows} · Column ${tile.column + 1}/${plan.columns} · Page ${tile.pageNumber}/${plan.pageCount}`
    : `Page ${tile.pageNumber}/${plan.pageCount}`;
  page.drawText(pdfSafeText(coordinate), {
    x: plan.contentX,
    y: 29,
    size: 7,
    font,
    color: rgb(0.18, 0.22, 0.19),
  });
  page.drawText(fitText(font, creditLine(metadata), 6, plan.contentWidth), {
    x: plan.contentX,
    y: 17,
    size: 6,
    font,
    color: rgb(0.42, 0.44, 0.42),
  });
}

function drawCropMarks(page: PDFPage, plan: PosterPlan): void {
  const mark = 10;
  const gap = 3;
  const color = rgb(0.2, 0.2, 0.2);
  const left = plan.contentX;
  const right = plan.contentX + plan.contentWidth;
  const bottom = plan.contentY;
  const top = plan.contentY + plan.contentHeight;
  const lines: Array<readonly [number, number, number, number]> = [
    [left - gap - mark, bottom, left - gap, bottom],
    [left, bottom - gap - mark, left, bottom - gap],
    [right + gap, bottom, right + gap + mark, bottom],
    [right, bottom - gap - mark, right, bottom - gap],
    [left - gap - mark, top, left - gap, top],
    [left, top + gap, left, top + gap + mark],
    [right + gap, top, right + gap + mark, top],
    [right, top + gap, right, top + gap + mark],
  ];
  for (const [x1, y1, x2, y2] of lines) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color });
  }
}

function creditLine(metadata: ExportMetadata): string {
  return [
    metadata.credit,
    metadata.version ? `version ${metadata.version}` : null,
    metadata.siteAttribution ?? "GeneaQuilt",
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

function fitText(font: PDFFont, value: string, size: number, maximumWidth: number): string {
  const safe = pdfSafeText(value);
  if (font.widthOfTextAtSize(safe, size) <= maximumWidth) {
    return safe;
  }
  let shortened = safe;
  while (shortened.length > 1 && font.widthOfTextAtSize(`${shortened}...`, size) > maximumWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trimEnd()}...`;
}

export function pdfSafeText(value: string): string {
  return value
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2022\u2027]/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function tileCount(imageLength: number, contentLength: number, step: number): number {
  if (imageLength <= contentLength) {
    return 1;
  }
  return 1 + Math.ceil((imageLength - contentLength) / step);
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`The ${label} must be a positive number.`);
  }
}

function pdfBlob(bytes: Uint8Array): Blob {
  const copy = bytes.slice();
  return new Blob([copy.buffer], { type: "application/pdf" });
}
