import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  EditableDocumentSnapshot,
  EditableGedcomExport,
  EditablePerson,
  GedcomExportVersion,
  PersonInput,
} from "../domain/editableDocument.ts";
import { parseCanonicalDocumentJson } from "../domain/schemaValidation.ts";
import { LocalTreeSession, type EditableDocumentWorker } from "./localTreeSession.ts";

test("a Local Tree session autosaves commands and history as revisions", async () => {
  const document = parseCanonicalDocumentJson(
    await readFile(
      new URL("../../public/data/adam-harishon.document.json", import.meta.url),
      "utf8",
    ),
  );
  const worker = new FakeEditableWorker({
    revision: 0,
    source_gedcom:
      "0 HEAD\n1 GEDC\n2 VERS 7.0\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Ada /Example/\n0 TRLR\n",
    document,
    can_undo: false,
    can_redo: false,
    last_change: null,
  });
  const session = await LocalTreeSession.createLocal(
    {
      title: "Session family",
      sourceFileName: "session-family.ged",
      firstPerson: personInput("Ada", "Example"),
    },
    worker,
  );
  const statuses: string[] = [];
  session.subscribe((status) => statuses.push(status.status));

  await session.apply({
    type: "update_person",
    person_id: "@I1@",
    person: personInput("Ada", "Lovelace"),
  });

  assert.equal(session.record?.revision, 1);
  assert.equal(session.status.status, "saved");
  assert.equal(session.canUndo, true);
  assert.deepEqual(statuses.slice(-2), ["saving", "saved"]);

  await session.undo();
  assert.equal(session.record?.revision, 2);
  assert.equal(session.canRedo, true);

  const exported = await session.export("v7");
  assert.equal(exported.version, "v7");
  assert.match(exported.source_gedcom, /2 VERS 7\.0/);

  await session.close();
  await assert.rejects(async () => session.person("@I1@"), /closed/);
});

class FakeEditableWorker implements EditableDocumentWorker {
  #snapshot: EditableDocumentSnapshot;

  constructor(snapshot: EditableDocumentSnapshot) {
    this.#snapshot = snapshot;
  }

  async openEditable(): Promise<{ handle: number; snapshot: EditableDocumentSnapshot }> {
    return { handle: 1, snapshot: this.#snapshot };
  }

  async createEditable(): Promise<{ handle: number; snapshot: EditableDocumentSnapshot }> {
    return { handle: 1, snapshot: this.#snapshot };
  }

  async editablePerson(_handle: number, personId: string): Promise<EditablePerson> {
    return {
      id: personId,
      display_name: "Ada Example",
      ...personInput("Ada", "Example"),
      parent_family_ids: [],
      spouse_family_ids: [],
    };
  }

  async applyEdit(_handle: number, expectedRevision: number): Promise<EditableDocumentSnapshot> {
    assert.equal(expectedRevision, this.#snapshot.revision);
    this.#snapshot = {
      ...this.#snapshot,
      revision: expectedRevision + 1,
      source_gedcom: this.#snapshot.source_gedcom.replace("Ada /Example/", "Ada /Lovelace/"),
      can_undo: true,
      can_redo: false,
      last_change: "Edited Ada Lovelace",
    };
    return this.#snapshot;
  }

  async undo(_handle: number, expectedRevision: number): Promise<EditableDocumentSnapshot> {
    assert.equal(expectedRevision, this.#snapshot.revision);
    this.#snapshot = {
      ...this.#snapshot,
      revision: expectedRevision + 1,
      can_undo: false,
      can_redo: true,
      last_change: "Undid Edited Ada Lovelace",
    };
    return this.#snapshot;
  }

  async redo(_handle: number, expectedRevision: number): Promise<EditableDocumentSnapshot> {
    this.#snapshot = {
      ...this.#snapshot,
      revision: expectedRevision + 1,
      can_undo: true,
      can_redo: false,
      last_change: "Redid Edited Ada Lovelace",
    };
    return this.#snapshot;
  }

  async exportEditable(
    _handle: number,
    version: GedcomExportVersion,
  ): Promise<EditableGedcomExport> {
    return {
      revision: this.#snapshot.revision,
      version,
      source_gedcom: this.#snapshot.source_gedcom,
      warnings: [],
    };
  }

  async closeEditable(): Promise<void> {}
}

function personInput(givenNames: string, surname: string): PersonInput {
  return {
    given_names: givenNames,
    surname,
    sex: null,
    birth_date: "",
    birth_place: "",
    death_date: "",
    death_place: "",
  };
}
