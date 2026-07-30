import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseAdamManifest } from "./adamDocument.ts";

test("Adam HaRishon's manifest prohibits source and standalone-data exports", async () => {
  const source = await readFile(
    new URL("../../public/data/adam-harishon.manifest.json", import.meta.url),
    "utf8",
  );
  const manifest = parseAdamManifest(JSON.parse(source));

  assert.equal(manifest.source.includedInWebsite, false);
  assert.equal(manifest.publicArtifact.containsSourceGedcom, false);
  assert.equal(manifest.publicArtifact.containsNotes, false);
  assert.equal(manifest.publicArtifact.containsMedia, false);
  assert.equal(manifest.exportPolicy.sourceGedcom, false);
  assert.equal(manifest.exportPolicy.standaloneInteractiveHtml, false);
  assert.equal(manifest.exportPolicy.pdf, true);
  assert.equal(manifest.anchors.yaakovPersonId, "@88484800@");
  assert.equal(manifest.homeProjection.people, 58);
  assert.equal(manifest.homeProjection.families, 23);
});

test("Adam HaRishon's manifest rejects a source-download policy regression", () => {
  assert.throws(
    () =>
      parseAdamManifest({
        schemaVersion: 1,
        documentId: "adam-harishon",
        title: "Adam HaRishon's Tree",
        version: "test",
        source: { includedInWebsite: true },
      }),
    /privacy contract/i,
  );
});
