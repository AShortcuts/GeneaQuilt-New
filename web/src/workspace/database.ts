import {
  createLocalTreeDraftRecord,
  createLocalTreeRecord,
  createLocalTreeRevisionRecord,
  normalizeLocalTreeDraftRecord,
  normalizeLocalTreeRecord,
  normalizeLocalTreeRevisionRecord,
  summarizeLocalTree,
  updateLocalTreeRecordContent,
  type LocalTreeDraftRecord,
  type LocalTreeRecord,
  type LocalTreeRevisionRecord,
  type LocalTreeSummary,
  type NewLocalTreeInput,
} from "./models.ts";

const DATABASE_NAME = "geneaquilt-workspace";
const DATABASE_VERSION = 2;
const LOCAL_TREES_STORE = "local-trees";
const TREE_REVISIONS_STORE = "tree-revisions";
const TREE_DRAFTS_STORE = "tree-drafts";
const REVISION_LIMIT = 30;

let databasePromise: Promise<IDBDatabase> | null = null;

export async function listLocalTrees(): Promise<LocalTreeSummary[]> {
  const database = await openWorkspaceDatabase();
  const transaction = database.transaction(LOCAL_TREES_STORE, "readonly");
  const values = await requestResult<unknown[]>(
    transaction.objectStore(LOCAL_TREES_STORE).getAll(),
  );
  await transactionComplete(transaction);
  return values
    .map(normalizeLocalTreeRecord)
    .map(summarizeLocalTree)
    .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
}

export async function getLocalTree(id: string): Promise<LocalTreeRecord | null> {
  const database = await openWorkspaceDatabase();
  const transaction = database.transaction(LOCAL_TREES_STORE, "readonly");
  const value = await requestResult<unknown>(transaction.objectStore(LOCAL_TREES_STORE).get(id));
  await transactionComplete(transaction);
  return value === undefined ? null : normalizeLocalTreeRecord(value);
}

export async function saveLocalTree(input: NewLocalTreeInput): Promise<LocalTreeRecord> {
  const record = await createLocalTreeRecord(input);
  const initialRevision = createLocalTreeRevisionRecord(
    record.id,
    record.revision,
    "Created Local Tree",
    record.sourceGedcom,
    record.document,
    record.lastSavedAt,
  );
  const database = await openWorkspaceDatabase();
  const transaction = database.transaction([LOCAL_TREES_STORE, TREE_REVISIONS_STORE], "readwrite");
  await requestResult(transaction.objectStore(LOCAL_TREES_STORE).add(record));
  await requestResult(transaction.objectStore(TREE_REVISIONS_STORE).add(initialRevision));
  await transactionComplete(transaction);
  return record;
}

export async function commitLocalTreeEdit(input: {
  id: string;
  expectedRevision: number;
  label: string;
  sourceGedcom: string;
  document: LocalTreeRecord["document"];
}): Promise<LocalTreeRecord> {
  const current = await getLocalTree(input.id);
  if (!current) {
    throw new Error(`Local Tree ${input.id} no longer exists on this device.`);
  }
  if (current.revision !== input.expectedRevision) {
    throw revisionConflict(input.expectedRevision, current.revision);
  }
  const nextRevision = current.revision + 1;
  const next = await updateLocalTreeRecordContent(
    current,
    input.sourceGedcom,
    input.document,
    nextRevision,
  );
  const revision = createLocalTreeRevisionRecord(
    current.id,
    nextRevision,
    input.label,
    input.sourceGedcom,
    input.document,
    next.lastSavedAt,
  );

  const database = await openWorkspaceDatabase();
  const transaction = database.transaction([LOCAL_TREES_STORE, TREE_REVISIONS_STORE], "readwrite");
  const treeStore = transaction.objectStore(LOCAL_TREES_STORE);
  const storedValue = await requestResult<unknown>(treeStore.get(input.id));
  if (storedValue === undefined) {
    transaction.abort();
    throw new Error(`Local Tree ${input.id} no longer exists on this device.`);
  }
  const stored = normalizeLocalTreeRecord(storedValue);
  if (stored.revision !== input.expectedRevision) {
    transaction.abort();
    throw revisionConflict(input.expectedRevision, stored.revision);
  }
  await requestResult(treeStore.put(next));
  const revisionStore = transaction.objectStore(TREE_REVISIONS_STORE);
  await requestResult(revisionStore.put(revision));
  const revisions = (
    await requestResult<unknown[]>(
      revisionStore.index("tree-id").getAll(IDBKeyRange.only(input.id)),
    )
  )
    .map(normalizeLocalTreeRevisionRecord)
    .sort((left, right) => left.revision - right.revision);
  for (const stale of revisions.slice(0, Math.max(0, revisions.length - REVISION_LIMIT))) {
    await requestResult(revisionStore.delete(stale.id));
  }
  await transactionComplete(transaction);
  return next;
}

export async function listLocalTreeRevisions(
  treeId: string,
  limit = REVISION_LIMIT,
): Promise<LocalTreeRevisionRecord[]> {
  const database = await openWorkspaceDatabase();
  const transaction = database.transaction(TREE_REVISIONS_STORE, "readonly");
  const values = await requestResult<unknown[]>(
    transaction.objectStore(TREE_REVISIONS_STORE).index("tree-id").getAll(IDBKeyRange.only(treeId)),
  );
  await transactionComplete(transaction);
  return values
    .map(normalizeLocalTreeRevisionRecord)
    .sort((left, right) => left.revision - right.revision)
    .slice(-Math.max(0, limit));
}

export async function renameLocalTree(id: string, title: string): Promise<LocalTreeRecord> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error("A Local Tree title cannot be empty.");
  }
  return updateLocalTree(id, (record) => ({
    ...record,
    title: normalizedTitle,
    updatedAt: new Date().toISOString(),
  }));
}

export async function markLocalTreeOpened(id: string): Promise<LocalTreeRecord> {
  return updateLocalTree(id, (record) => ({
    ...record,
    lastOpenedAt: new Date().toISOString(),
  }));
}

export async function deleteLocalTree(id: string): Promise<void> {
  const database = await openWorkspaceDatabase();
  const transaction = database.transaction([LOCAL_TREES_STORE, TREE_REVISIONS_STORE], "readwrite");
  await requestResult(transaction.objectStore(LOCAL_TREES_STORE).delete(id));
  const revisionStore = transaction.objectStore(TREE_REVISIONS_STORE);
  const revisionKeys = await requestResult<IDBValidKey[]>(
    revisionStore.index("tree-id").getAllKeys(IDBKeyRange.only(id)),
  );
  for (const key of revisionKeys) {
    await requestResult(revisionStore.delete(key));
  }
  await transactionComplete(transaction);
}

export async function saveLocalTreeDraft(input: {
  token?: string;
  title: string;
  sourceFileName: string;
  sourceGedcom: string;
  document: LocalTreeRecord["document"];
  ttlMilliseconds?: number;
}): Promise<LocalTreeDraftRecord> {
  const record = createLocalTreeDraftRecord(input);
  const database = await openWorkspaceDatabase();
  const transaction = database.transaction(TREE_DRAFTS_STORE, "readwrite");
  await requestResult(transaction.objectStore(TREE_DRAFTS_STORE).put(record));
  await transactionComplete(transaction);
  return record;
}

export async function getLocalTreeDraft(token: string): Promise<LocalTreeDraftRecord | null> {
  const database = await openWorkspaceDatabase();
  const transaction = database.transaction(TREE_DRAFTS_STORE, "readonly");
  const value = await requestResult<unknown>(transaction.objectStore(TREE_DRAFTS_STORE).get(token));
  await transactionComplete(transaction);
  if (value === undefined) {
    return null;
  }
  const record = normalizeLocalTreeDraftRecord(value);
  if (record.expiresAt <= new Date().toISOString()) {
    await deleteLocalTreeDraft(token);
    return null;
  }
  return record;
}

export async function deleteLocalTreeDraft(token: string): Promise<void> {
  const database = await openWorkspaceDatabase();
  const transaction = database.transaction(TREE_DRAFTS_STORE, "readwrite");
  await requestResult(transaction.objectStore(TREE_DRAFTS_STORE).delete(token));
  await transactionComplete(transaction);
}

export async function cleanupExpiredLocalTreeDrafts(
  now = new Date().toISOString(),
): Promise<number> {
  const database = await openWorkspaceDatabase();
  const transaction = database.transaction(TREE_DRAFTS_STORE, "readwrite");
  const store = transaction.objectStore(TREE_DRAFTS_STORE);
  const values = (await requestResult<unknown[]>(store.getAll())).map(
    normalizeLocalTreeDraftRecord,
  );
  const expired = values.filter((record) => record.expiresAt <= now);
  for (const record of expired) {
    await requestResult(store.delete(record.token));
  }
  await transactionComplete(transaction);
  return expired.length;
}

async function updateLocalTree(
  id: string,
  update: (record: LocalTreeRecord) => LocalTreeRecord,
): Promise<LocalTreeRecord> {
  const database = await openWorkspaceDatabase();
  const transaction = database.transaction(LOCAL_TREES_STORE, "readwrite");
  const store = transaction.objectStore(LOCAL_TREES_STORE);
  const value = await requestResult<unknown>(store.get(id));
  if (value === undefined) {
    transaction.abort();
    throw new Error(`Local Tree ${id} no longer exists on this device.`);
  }
  const current = normalizeLocalTreeRecord(value);
  const next = update(current);
  await requestResult(store.put(next));
  await transactionComplete(transaction);
  return next;
}

function openWorkspaceDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    return Promise.reject(
      new Error("This browser does not provide the local storage required for Local Trees."),
    );
  }
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOCAL_TREES_STORE)) {
        const store = database.createObjectStore(LOCAL_TREES_STORE, { keyPath: "id" });
        store.createIndex("last-opened", "lastOpenedAt");
        store.createIndex("source-sha256", "sourceSha256", { unique: false });
      }
      if (!database.objectStoreNames.contains(TREE_REVISIONS_STORE)) {
        const store = database.createObjectStore(TREE_REVISIONS_STORE, { keyPath: "id" });
        store.createIndex("tree-id", "treeId", { unique: false });
        store.createIndex("saved-at", "savedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(TREE_DRAFTS_STORE)) {
        const store = database.createObjectStore(TREE_DRAFTS_STORE, { keyPath: "token" });
        store.createIndex("expires-at", "expiresAt", { unique: false });
      }
    });
    request.addEventListener("success", () => {
      const database = request.result;
      database.addEventListener("versionchange", () => {
        database.close();
        databasePromise = null;
      });
      resolve(database);
    });
    request.addEventListener("error", () => {
      databasePromise = null;
      reject(request.error ?? new Error("Unable to open the Local Trees database."));
    });
    request.addEventListener("blocked", () => {
      databasePromise = null;
      reject(
        new Error(
          "Another GeneaQuilt tab is preventing a Local Trees database upgrade. Close it and try again.",
        ),
      );
    });
  });
  return databasePromise;
}

function revisionConflict(expected: number, actual: number): Error {
  return new Error(
    `This Local Tree changed in another tab (expected saved revision ${expected}, found ${actual}). Reopen it before making more edits.`,
  );
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("A Local Trees database request failed."));
    });
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => {
      reject(transaction.error ?? new Error("A Local Trees database transaction was cancelled."));
    });
    transaction.addEventListener("error", () => {
      reject(transaction.error ?? new Error("A Local Trees database transaction failed."));
    });
  });
}
