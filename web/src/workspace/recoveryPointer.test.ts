import assert from "node:assert/strict";
import test from "node:test";

import { WorkspaceRecoveryStore } from "./recoveryPointer.ts";

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

test("workspace recovery stores only compact pointers and preferences", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const store = new WorkspaceRecoveryStore(local, session);

  store.setLastLocalTreeId("local-1");
  store.setLastVisualizationMethod("geneaquilt");
  store.setActiveDraft({ token: "draft-1", updatedAt: "2026-07-30T12:00:00.000Z" });

  assert.equal(store.lastLocalTreeId(), "local-1");
  assert.equal(store.lastVisualizationMethod(), "geneaquilt");
  assert.deepEqual(store.activeDraft(), {
    token: "draft-1",
    updatedAt: "2026-07-30T12:00:00.000Z",
  });
  assert.equal(
    [...Array.from({ length: session.length }, (_, index) => session.key(index))]
      .filter((key): key is string => Boolean(key))
      .some((key) => session.getItem(key)?.includes("0 HEAD")),
    false,
  );
});

test("invalid draft pointers are removed instead of blocking startup", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  session.setItem("geneaquilt.active-draft", "{broken");
  const store = new WorkspaceRecoveryStore(local, session);

  assert.equal(store.activeDraft(), null);
  assert.equal(session.getItem("geneaquilt.active-draft"), null);
});
