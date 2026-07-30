import type { CanonicalDocument } from "../domain/schema.ts";
import { parseCanonicalDocument } from "../domain/schemaValidation.ts";

export const LOCAL_TREE_RECORD_VERSION = 2 as const;
export const LOCAL_TREE_REVISION_RECORD_VERSION = 1 as const;
export const LOCAL_TREE_DRAFT_RECORD_VERSION = 1 as const;

export interface LocalTreeRecord {
  recordVersion: 1 | typeof LOCAL_TREE_RECORD_VERSION;
  id: string;
  title: string;
  sourceFileName: string;
  sourceGedcom: string;
  sourceSha256: string;
  sourceByteSize: number;
  document: CanonicalDocument;
  revision: number;
  gedcomVersion: string | null;
  createdAt: string;
  updatedAt: string;
  lastSavedAt: string;
  lastOpenedAt: string;
}

export interface LocalTreeSummary {
  id: string;
  title: string;
  sourceFileName: string;
  sourceSha256: string;
  sourceByteSize: number;
  people: number;
  families: number;
  revision: number;
  gedcomVersion: string | null;
  updatedAt: string;
  lastSavedAt: string;
  lastOpenedAt: string;
}

export interface NewLocalTreeInput {
  title: string;
  sourceFileName: string;
  sourceGedcom: string;
  document: CanonicalDocument;
  revision?: number;
  gedcomVersion?: string | null;
}

export interface LocalTreeRevisionRecord {
  recordVersion: typeof LOCAL_TREE_REVISION_RECORD_VERSION;
  id: string;
  treeId: string;
  revision: number;
  label: string;
  sourceGedcom: string;
  document: CanonicalDocument;
  savedAt: string;
}

export interface LocalTreeDraftRecord {
  recordVersion: typeof LOCAL_TREE_DRAFT_RECORD_VERSION;
  token: string;
  title: string;
  sourceFileName: string;
  sourceGedcom: string;
  document: CanonicalDocument;
  updatedAt: string;
  expiresAt: string;
}

export interface AdamDocumentManifest {
  schemaVersion: 1;
  documentId: "adam-harishon";
  title: string;
  version: string;
  source: {
    format: string;
    producer: string;
    sha256: string;
    includedInWebsite: false;
  };
  creator: {
    credit: string;
    creditIsProvisional: boolean;
    requestEmail: string | null;
  };
  anchors: {
    adamPersonId: string;
    avrahamPersonId: string;
    yaakovPersonId: string;
  };
  homeProjection: {
    id: string;
    people: number;
    families: number;
    rule: string;
  };
  publicArtifact: {
    path: string;
    containsSourceGedcom: false;
    containsNotes: false;
    containsMedia: false;
    containsVisualizationRecords: true;
  };
  exportPolicy: {
    sourceGedcom: false;
    standaloneInteractiveHtml: false;
    charts: true;
    reports: true;
    images: true;
    pdf: true;
    tiledPosterPdf: true;
  };
}

export async function createLocalTreeRecord(input: NewLocalTreeInput): Promise<LocalTreeRecord> {
  const now = new Date().toISOString();
  const title = input.title.trim();
  if (!title) {
    throw new Error("A Local Tree needs a title.");
  }
  if (!input.sourceGedcom.trim()) {
    throw new Error("A Local Tree cannot be saved without its Source GEDCOM.");
  }

  return {
    recordVersion: LOCAL_TREE_RECORD_VERSION,
    id: `local-${crypto.randomUUID()}`,
    title,
    sourceFileName: input.sourceFileName,
    sourceGedcom: input.sourceGedcom,
    sourceSha256: await sha256(input.sourceGedcom),
    sourceByteSize: new Blob([input.sourceGedcom]).size,
    document: input.document,
    revision: input.revision ?? 0,
    gedcomVersion: input.gedcomVersion ?? input.document.source_profile.gedcom_version,
    createdAt: now,
    updatedAt: now,
    lastSavedAt: now,
    lastOpenedAt: now,
  };
}

export async function updateLocalTreeRecordContent(
  record: LocalTreeRecord,
  sourceGedcom: string,
  document: CanonicalDocument,
  revision: number,
): Promise<LocalTreeRecord> {
  if (!sourceGedcom.trim()) {
    throw new Error("A Local Tree cannot be saved without its Source GEDCOM.");
  }
  const now = new Date().toISOString();
  return {
    ...record,
    recordVersion: LOCAL_TREE_RECORD_VERSION,
    sourceGedcom,
    sourceSha256: await sha256(sourceGedcom),
    sourceByteSize: new Blob([sourceGedcom]).size,
    document,
    revision,
    gedcomVersion: document.source_profile.gedcom_version,
    updatedAt: now,
    lastSavedAt: now,
  };
}

export function createLocalTreeRevisionRecord(
  treeId: string,
  revision: number,
  label: string,
  sourceGedcom: string,
  document: CanonicalDocument,
  savedAt = new Date().toISOString(),
): LocalTreeRevisionRecord {
  return {
    recordVersion: LOCAL_TREE_REVISION_RECORD_VERSION,
    id: `${treeId}:${revision}`,
    treeId,
    revision,
    label: label.trim() || "Updated Local Tree",
    sourceGedcom,
    document,
    savedAt,
  };
}

export function createLocalTreeDraftRecord(input: {
  token?: string;
  title: string;
  sourceFileName: string;
  sourceGedcom: string;
  document: CanonicalDocument;
  ttlMilliseconds?: number;
}): LocalTreeDraftRecord {
  const updatedAt = new Date();
  const ttlMilliseconds = input.ttlMilliseconds ?? 24 * 60 * 60 * 1000;
  return {
    recordVersion: LOCAL_TREE_DRAFT_RECORD_VERSION,
    token: input.token ?? `draft-${crypto.randomUUID()}`,
    title: input.title.trim() || "Untitled family tree",
    sourceFileName: input.sourceFileName,
    sourceGedcom: input.sourceGedcom,
    document: input.document,
    updatedAt: updatedAt.toISOString(),
    expiresAt: new Date(updatedAt.getTime() + ttlMilliseconds).toISOString(),
  };
}

export function normalizeLocalTreeRecord(value: unknown): LocalTreeRecord {
  const record = expectRecord(value, "Local Tree");
  const recordVersion = record.recordVersion === 2 ? 2 : 1;
  const document = parseCanonicalDocument(record.document);
  const updatedAt = expectString(record.updatedAt, "Local Tree.updatedAt");
  return {
    recordVersion,
    id: expectString(record.id, "Local Tree.id"),
    title: expectString(record.title, "Local Tree.title"),
    sourceFileName: expectString(record.sourceFileName, "Local Tree.sourceFileName"),
    sourceGedcom: expectString(record.sourceGedcom, "Local Tree.sourceGedcom"),
    sourceSha256: expectString(record.sourceSha256, "Local Tree.sourceSha256"),
    sourceByteSize: expectNonnegativeInteger(record.sourceByteSize, "Local Tree.sourceByteSize"),
    document,
    revision:
      record.revision === undefined
        ? 0
        : expectNonnegativeInteger(record.revision, "Local Tree.revision"),
    gedcomVersion:
      record.gedcomVersion === undefined
        ? document.source_profile.gedcom_version
        : expectNullableString(record.gedcomVersion, "Local Tree.gedcomVersion"),
    createdAt: expectString(record.createdAt, "Local Tree.createdAt"),
    updatedAt,
    lastSavedAt:
      record.lastSavedAt === undefined
        ? updatedAt
        : expectString(record.lastSavedAt, "Local Tree.lastSavedAt"),
    lastOpenedAt: expectString(record.lastOpenedAt, "Local Tree.lastOpenedAt"),
  };
}

export function normalizeLocalTreeRevisionRecord(value: unknown): LocalTreeRevisionRecord {
  const record = expectRecord(value, "Local Tree revision");
  return {
    recordVersion: LOCAL_TREE_REVISION_RECORD_VERSION,
    id: expectString(record.id, "Local Tree revision.id"),
    treeId: expectString(record.treeId, "Local Tree revision.treeId"),
    revision: expectNonnegativeInteger(record.revision, "Local Tree revision.revision"),
    label: expectString(record.label, "Local Tree revision.label"),
    sourceGedcom: expectString(record.sourceGedcom, "Local Tree revision.sourceGedcom"),
    document: parseCanonicalDocument(record.document),
    savedAt: expectString(record.savedAt, "Local Tree revision.savedAt"),
  };
}

export function normalizeLocalTreeDraftRecord(value: unknown): LocalTreeDraftRecord {
  const record = expectRecord(value, "Local Tree draft");
  return {
    recordVersion: LOCAL_TREE_DRAFT_RECORD_VERSION,
    token: expectString(record.token, "Local Tree draft.token"),
    title: expectString(record.title, "Local Tree draft.title"),
    sourceFileName: expectString(record.sourceFileName, "Local Tree draft.sourceFileName"),
    sourceGedcom: expectString(record.sourceGedcom, "Local Tree draft.sourceGedcom"),
    document: parseCanonicalDocument(record.document),
    updatedAt: expectString(record.updatedAt, "Local Tree draft.updatedAt"),
    expiresAt: expectString(record.expiresAt, "Local Tree draft.expiresAt"),
  };
}

export function summarizeLocalTree(record: LocalTreeRecord): LocalTreeSummary {
  return {
    id: record.id,
    title: record.title,
    sourceFileName: record.sourceFileName,
    sourceSha256: record.sourceSha256,
    sourceByteSize: record.sourceByteSize,
    people: record.document.people.length,
    families: record.document.families.length,
    revision: record.revision,
    gedcomVersion: record.gedcomVersion,
    updatedAt: record.updatedAt,
    lastSavedAt: record.lastSavedAt,
    lastOpenedAt: record.lastOpenedAt,
  };
}

async function sha256(value: string): Promise<string> {
  if (!crypto.subtle) {
    throw new Error("This browser cannot create the content hash required for Local Trees.");
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} is not a valid stored record.`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string.`);
  }
  return value;
}

function expectNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }
  return expectString(value, path);
}

function expectNonnegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative safe integer.`);
  }
  return value;
}
