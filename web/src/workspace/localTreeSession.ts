import type {
  EditableDocumentSnapshot,
  EditableGedcomExport,
  EditablePerson,
  GedcomExportVersion,
  GenealogyEditCommand,
  PersonInput,
} from "../domain/editableDocument.ts";
import {
  commitLocalTreeEdit,
  listLocalTreeRevisions,
  saveLocalTree,
  saveLocalTreeDraft,
} from "./database.ts";
import type { LocalTreeDraftRecord, LocalTreeRecord, LocalTreeRevisionRecord } from "./models.ts";

export type SessionSaveStatus = "saved" | "saving" | "unsaved" | "error";

export interface LocalTreeSessionStatus {
  status: SessionSaveStatus;
  lastSavedAt: string | null;
  error: Error | null;
}

interface RecoverySnapshot {
  sourceGedcom: string;
  label: string;
}

export interface EditableDocumentWorker {
  openEditable(source: string): Promise<{
    handle: number;
    snapshot: EditableDocumentSnapshot;
  }>;
  createEditable(firstPerson: PersonInput): Promise<{
    handle: number;
    snapshot: EditableDocumentSnapshot;
  }>;
  editablePerson(handle: number, personId: string): Promise<EditablePerson>;
  applyEdit(
    handle: number,
    expectedRevision: number,
    command: GenealogyEditCommand,
  ): Promise<EditableDocumentSnapshot>;
  undo(handle: number, expectedRevision: number): Promise<EditableDocumentSnapshot>;
  redo(handle: number, expectedRevision: number): Promise<EditableDocumentSnapshot>;
  exportEditable(handle: number, version: GedcomExportVersion): Promise<EditableGedcomExport>;
  closeEditable(handle: number): Promise<void>;
}

export class LocalTreeSession {
  readonly #worker: EditableDocumentWorker;
  readonly #listeners = new Set<(status: LocalTreeSessionStatus) => void>();
  #handle: number;
  #snapshot: EditableDocumentSnapshot;
  #record: LocalTreeRecord | null;
  #draft: LocalTreeDraftRecord | null;
  #status: LocalTreeSessionStatus;
  #recoveryUndo: RecoverySnapshot[];
  #recoveryRedo: RecoverySnapshot[] = [];
  #closed = false;

  private constructor(input: {
    worker: EditableDocumentWorker;
    handle: number;
    snapshot: EditableDocumentSnapshot;
    record: LocalTreeRecord | null;
    draft: LocalTreeDraftRecord | null;
    revisions?: LocalTreeRevisionRecord[];
  }) {
    this.#worker = input.worker;
    this.#handle = input.handle;
    this.#snapshot = input.snapshot;
    this.#record = input.record;
    this.#draft = input.draft;
    this.#status = {
      status: input.record ? "saved" : "unsaved",
      lastSavedAt: input.record?.lastSavedAt ?? input.draft?.updatedAt ?? null,
      error: null,
    };
    this.#recoveryUndo = (input.revisions ?? [])
      .filter((revision) => revision.sourceGedcom !== input.snapshot.source_gedcom)
      .map((revision) => ({
        sourceGedcom: revision.sourceGedcom,
        label: revision.label,
      }));
  }

  static async openLocal(
    record: LocalTreeRecord,
    worker: EditableDocumentWorker,
  ): Promise<LocalTreeSession> {
    const [opened, revisions] = await Promise.all([
      worker.openEditable(record.sourceGedcom),
      listLocalTreeRevisions(record.id),
    ]);
    return new LocalTreeSession({
      worker,
      handle: opened.handle,
      snapshot: opened.snapshot,
      record,
      draft: null,
      revisions,
    });
  }

  static async createLocal(
    input: {
      title: string;
      sourceFileName: string;
      firstPerson: PersonInput;
    },
    worker: EditableDocumentWorker,
  ): Promise<LocalTreeSession> {
    const opened = await worker.createEditable(input.firstPerson);
    const record = await saveLocalTree({
      title: input.title,
      sourceFileName: input.sourceFileName,
      sourceGedcom: opened.snapshot.source_gedcom,
      document: opened.snapshot.document,
      gedcomVersion: "7.0",
    });
    return new LocalTreeSession({
      worker,
      handle: opened.handle,
      snapshot: opened.snapshot,
      record,
      draft: null,
    });
  }

  static async openTemporary(
    input: {
      title: string;
      sourceFileName: string;
      sourceGedcom: string;
      draftToken?: string;
    },
    worker: EditableDocumentWorker,
  ): Promise<LocalTreeSession> {
    const opened = await worker.openEditable(input.sourceGedcom);
    const draft = await saveLocalTreeDraft({
      ...(input.draftToken ? { token: input.draftToken } : {}),
      title: input.title,
      sourceFileName: input.sourceFileName,
      sourceGedcom: opened.snapshot.source_gedcom,
      document: opened.snapshot.document,
    });
    return new LocalTreeSession({
      worker,
      handle: opened.handle,
      snapshot: opened.snapshot,
      record: null,
      draft,
    });
  }

  get snapshot(): EditableDocumentSnapshot {
    return this.#snapshot;
  }

  get record(): LocalTreeRecord | null {
    return this.#record;
  }

  get draft(): LocalTreeDraftRecord | null {
    return this.#draft;
  }

  get status(): LocalTreeSessionStatus {
    return this.#status;
  }

  get canUndo(): boolean {
    return this.#snapshot.can_undo || this.#recoveryUndo.length > 0;
  }

  get canRedo(): boolean {
    return this.#snapshot.can_redo || this.#recoveryRedo.length > 0;
  }

  subscribe(listener: (status: LocalTreeSessionStatus) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#status);
    return () => this.#listeners.delete(listener);
  }

  person(personId: string): Promise<EditablePerson> {
    this.#assertOpen();
    return this.#worker.editablePerson(this.#handle, personId);
  }

  async apply(command: GenealogyEditCommand): Promise<EditableDocumentSnapshot> {
    this.#assertOpen();
    this.#setStatus("saving");
    const previous = this.#snapshot;
    try {
      const next = await this.#worker.applyEdit(this.#handle, previous.revision, command);
      this.#snapshot = next;
      this.#recoveryRedo = [];
      await this.#persist(next.last_change ?? "Updated Local Tree");
      return next;
    } catch (error) {
      this.#setStatus("error", asError(error));
      throw error;
    }
  }

  async undo(): Promise<EditableDocumentSnapshot> {
    this.#assertOpen();
    this.#setStatus("saving");
    try {
      if (this.#snapshot.can_undo) {
        this.#snapshot = await this.#worker.undo(this.#handle, this.#snapshot.revision);
      } else {
        const previous = this.#recoveryUndo.pop();
        if (!previous) {
          throw new Error("There is no genealogy edit to undo.");
        }
        this.#recoveryRedo.push({
          sourceGedcom: this.#snapshot.source_gedcom,
          label: this.#snapshot.last_change ?? "Current Local Tree",
        });
        await this.#replaceEngine(previous.sourceGedcom);
        this.#snapshot = {
          ...this.#snapshot,
          last_change: `Restored before ${previous.label}`,
        };
      }
      await this.#persist(this.#snapshot.last_change ?? "Undid genealogy edit");
      return this.#snapshot;
    } catch (error) {
      this.#setStatus("error", asError(error));
      throw error;
    }
  }

  async redo(): Promise<EditableDocumentSnapshot> {
    this.#assertOpen();
    this.#setStatus("saving");
    try {
      if (this.#snapshot.can_redo) {
        this.#snapshot = await this.#worker.redo(this.#handle, this.#snapshot.revision);
      } else {
        const next = this.#recoveryRedo.pop();
        if (!next) {
          throw new Error("There is no genealogy edit to redo.");
        }
        this.#recoveryUndo.push({
          sourceGedcom: this.#snapshot.source_gedcom,
          label: this.#snapshot.last_change ?? "Previous Local Tree",
        });
        await this.#replaceEngine(next.sourceGedcom);
        this.#snapshot = {
          ...this.#snapshot,
          last_change: `Restored ${next.label}`,
        };
      }
      await this.#persist(this.#snapshot.last_change ?? "Redid genealogy edit");
      return this.#snapshot;
    } catch (error) {
      this.#setStatus("error", asError(error));
      throw error;
    }
  }

  export(version: GedcomExportVersion): Promise<EditableGedcomExport> {
    this.#assertOpen();
    return this.#worker.exportEditable(this.#handle, version);
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#listeners.clear();
    await this.#worker.closeEditable(this.#handle);
  }

  async #persist(label: string): Promise<void> {
    if (this.#record) {
      this.#record = await commitLocalTreeEdit({
        id: this.#record.id,
        expectedRevision: this.#record.revision,
        label,
        sourceGedcom: this.#snapshot.source_gedcom,
        document: this.#snapshot.document,
      });
      this.#setStatus("saved");
      return;
    }
    this.#draft = await saveLocalTreeDraft({
      ...(this.#draft?.token ? { token: this.#draft.token } : {}),
      title: this.#draft?.title ?? "Untitled family tree",
      sourceFileName: this.#draft?.sourceFileName ?? "untitled.ged",
      sourceGedcom: this.#snapshot.source_gedcom,
      document: this.#snapshot.document,
    });
    this.#setStatus("unsaved");
  }

  async #replaceEngine(sourceGedcom: string): Promise<void> {
    const previousHandle = this.#handle;
    const opened = await this.#worker.openEditable(sourceGedcom);
    this.#handle = opened.handle;
    this.#snapshot = opened.snapshot;
    await this.#worker.closeEditable(previousHandle);
  }

  #setStatus(status: SessionSaveStatus, error: Error | null = null): void {
    this.#status = {
      status,
      lastSavedAt:
        status === "saved"
          ? (this.#record?.lastSavedAt ?? new Date().toISOString())
          : (this.#status.lastSavedAt ?? this.#draft?.updatedAt ?? null),
      error,
    };
    for (const listener of this.#listeners) {
      listener(this.#status);
    }
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error("This Local Tree editing session is closed.");
    }
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
