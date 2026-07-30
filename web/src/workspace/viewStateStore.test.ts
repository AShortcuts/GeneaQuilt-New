import assert from "node:assert/strict";
import test from "node:test";

import { createVisualizationViewState } from "../visualizations/viewport/viewState.ts";
import { ViewStateStore, viewStateKey } from "./viewStateStore.ts";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

test("View State is isolated by tree, method, and focal people", () => {
  const storage = new MemoryStorage();
  const store = new ViewStateStore(storage);
  const scope = {
    treeId: "tree:one",
    methodId: "pedigree",
    focalPersonId: "@I1@",
    secondaryFocalPersonId: null,
  };
  const state = createVisualizationViewState("pedigree", {
    minX: 1,
    minY: 2,
    width: 300,
    height: 200,
  });

  store.save(scope, state);

  assert.deepEqual(store.load(scope), state);
  assert.equal(store.load({ ...scope, focalPersonId: "@I2@" }), null);
  assert.match(viewStateKey(scope), /^geneaquilt\.view-state\.v1:/);
});

test("View State clears only the requested tree and discards invalid storage", () => {
  const storage = new MemoryStorage();
  const store = new ViewStateStore(storage);
  const first = { treeId: "first", methodId: "geneaquilt" };
  const second = { treeId: "second", methodId: "geneaquilt" };
  const state = createVisualizationViewState("geneaquilt", {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotationDegrees: 0,
  });
  store.save(first, state);
  store.save(second, state);
  storage.setItem(viewStateKey({ treeId: "broken", methodId: "geneaquilt" }), "{");

  assert.equal(store.load({ treeId: "broken", methodId: "geneaquilt" }), null);
  store.clearTree("first");
  assert.equal(store.load(first), null);
  assert.deepEqual(store.load(second), state);
});
