import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCanonicalDocumentJson } from "../domain/schemaValidation.ts";
import {
  cleanupExpiredLocalTreeDrafts,
  commitLocalTreeEdit,
  deleteLocalTree,
  getLocalTreeDraft,
  getLocalTree,
  listLocalTreeRevisions,
  listLocalTrees,
  markLocalTreeOpened,
  renameLocalTree,
  saveLocalTree,
  saveLocalTreeDraft,
} from "./database.ts";

test("Local Trees can be saved, renamed, opened, listed, and individually deleted", async () => {
  const document = parseCanonicalDocumentJson(
    await readFile(
      new URL("../../public/data/adam-harishon.document.json", import.meta.url),
      "utf8",
    ),
  );
  const saved = await saveLocalTree({
    title: "My family",
    sourceFileName: "my-family.ged",
    sourceGedcom: "0 HEAD\n1 SOUR Test\n0 TRLR\n",
    document,
  });

  assert.match(saved.id, /^local-/);
  assert.equal(saved.sourceSha256.length, 64);
  assert.equal((await listLocalTrees())[0]?.people, 535);

  const renamed = await renameLocalTree(saved.id, "Our family");
  assert.equal(renamed.title, "Our family");
  const opened = await markLocalTreeOpened(saved.id);
  assert.ok(opened.lastOpenedAt >= saved.lastOpenedAt);
  assert.equal((await getLocalTree(saved.id))?.sourceGedcom, saved.sourceGedcom);

  const committed = await commitLocalTreeEdit({
    id: saved.id,
    expectedRevision: 0,
    label: "Edited a person",
    sourceGedcom: "0 HEAD\n1 SOUR Test\n1 NOTE Edited\n0 TRLR\n",
    document,
  });
  assert.equal(committed.revision, 1);
  assert.equal((await listLocalTreeRevisions(saved.id)).length, 2);
  await assert.rejects(
    commitLocalTreeEdit({
      id: saved.id,
      expectedRevision: 0,
      label: "Stale edit",
      sourceGedcom: committed.sourceGedcom,
      document,
    }),
    /changed in another tab/,
  );

  const draft = await saveLocalTreeDraft({
    title: "Recovered family",
    sourceFileName: "recovered.ged",
    sourceGedcom: committed.sourceGedcom,
    document,
  });
  assert.equal((await getLocalTreeDraft(draft.token))?.title, "Recovered family");
  const expiringDraft = await saveLocalTreeDraft({
    title: "Expired family",
    sourceFileName: "expired.ged",
    sourceGedcom: committed.sourceGedcom,
    document,
    ttlMilliseconds: -1,
  });
  assert.equal(await cleanupExpiredLocalTreeDrafts(), 1);
  assert.equal(await getLocalTreeDraft(expiringDraft.token), null);

  await deleteLocalTree(saved.id);
  assert.equal(await getLocalTree(saved.id), null);
  assert.deepEqual(await listLocalTreeRevisions(saved.id), []);
});
