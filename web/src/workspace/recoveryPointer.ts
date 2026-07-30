const LAST_LOCAL_TREE_KEY = "geneaquilt.last-local-tree";
const LAST_METHOD_KEY = "geneaquilt.last-visualization-method";
const ACTIVE_DRAFT_KEY = "geneaquilt.active-draft";

export interface ActiveDraftPointer {
  token: string;
  updatedAt: string;
}

export class WorkspaceRecoveryStore {
  readonly #local: Storage;
  readonly #session: Storage;

  constructor(local: Storage = localStorage, session: Storage = sessionStorage) {
    this.#local = local;
    this.#session = session;
  }

  lastLocalTreeId(): string | null {
    return normalizedValue(this.#local.getItem(LAST_LOCAL_TREE_KEY));
  }

  setLastLocalTreeId(id: string | null): void {
    setOptionalValue(this.#local, LAST_LOCAL_TREE_KEY, id);
  }

  lastVisualizationMethod(): string | null {
    return normalizedValue(this.#local.getItem(LAST_METHOD_KEY));
  }

  setLastVisualizationMethod(methodId: string | null): void {
    setOptionalValue(this.#local, LAST_METHOD_KEY, methodId);
  }

  activeDraft(): ActiveDraftPointer | null {
    const raw = this.#session.getItem(ACTIVE_DRAFT_KEY);
    if (!raw) {
      return null;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      this.#session.removeItem(ACTIVE_DRAFT_KEY);
      return null;
    }
    if (
      typeof value !== "object" ||
      value === null ||
      !("token" in value) ||
      !("updatedAt" in value) ||
      typeof value.token !== "string" ||
      typeof value.updatedAt !== "string" ||
      !value.token.trim()
    ) {
      this.#session.removeItem(ACTIVE_DRAFT_KEY);
      return null;
    }
    return { token: value.token, updatedAt: value.updatedAt };
  }

  setActiveDraft(pointer: ActiveDraftPointer | null): void {
    if (!pointer) {
      this.#session.removeItem(ACTIVE_DRAFT_KEY);
      return;
    }
    this.#session.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(pointer));
  }
}

function setOptionalValue(storage: Storage, key: string, value: string | null): void {
  const normalized = normalizedValue(value);
  if (normalized) {
    storage.setItem(key, normalized);
  } else {
    storage.removeItem(key);
  }
}

function normalizedValue(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}
