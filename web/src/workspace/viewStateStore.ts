import {
  parseVisualizationViewState,
  type VisualizationViewState,
} from "../visualizations/viewport/viewState.ts";

const VIEW_STATE_PREFIX = "geneaquilt.view-state.v1";

export interface ViewStateScope {
  treeId: string;
  methodId: string;
  focalPersonId?: string | null;
  secondaryFocalPersonId?: string | null;
}

export class ViewStateStore {
  readonly #storage: Storage;

  constructor(storage: Storage = sessionStorage) {
    this.#storage = storage;
  }

  load(scope: ViewStateScope): VisualizationViewState | null {
    const raw = this.#storage.getItem(viewStateKey(scope));
    if (!raw) {
      return null;
    }
    try {
      const state = parseVisualizationViewState(JSON.parse(raw) as unknown);
      if (state?.methodId === scope.methodId) {
        return state;
      }
    } catch {
      // Invalid session state is disposable and must never prevent a tree from opening.
    }
    this.#storage.removeItem(viewStateKey(scope));
    return null;
  }

  save(scope: ViewStateScope, state: VisualizationViewState): void {
    if (state.methodId !== scope.methodId) {
      throw new Error("A visualization View State cannot be saved for a different method.");
    }
    this.#storage.setItem(viewStateKey(scope), JSON.stringify(state));
  }

  clearTree(treeId: string): void {
    const prefix = `${VIEW_STATE_PREFIX}:${encodeURIComponent(treeId)}:`;
    const keys: string[] = [];
    for (let index = 0; index < this.#storage.length; index += 1) {
      const key = this.#storage.key(index);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      this.#storage.removeItem(key);
    }
  }
}

export function viewStateKey(scope: ViewStateScope): string {
  return [
    VIEW_STATE_PREFIX,
    encodeURIComponent(scope.treeId),
    encodeURIComponent(scope.methodId),
    encodeURIComponent(scope.focalPersonId ?? "-"),
    encodeURIComponent(scope.secondaryFocalPersonId ?? "-"),
  ].join(":");
}
