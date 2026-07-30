import type { CanonicalDocument } from "../domain/schema.ts";
import type {
  EditableDocumentSnapshot,
  EditableGedcomExport,
  EditablePerson,
  GedcomExportVersion,
  GenealogyEditCommand,
  PersonInput,
} from "../domain/editableDocument.ts";
import type {
  DocumentWorkerRequest,
  DocumentWorkerRequestPayload,
  DocumentWorkerResponse,
  DocumentWorkerResult,
} from "./documentProtocol.ts";

interface PendingRequest {
  resolve(result: DocumentWorkerResult): void;
  reject(error: Error): void;
}

export interface OpenEditableDocument {
  handle: number;
  snapshot: EditableDocumentSnapshot;
}

export class DocumentWorkerClient {
  readonly #worker: Worker;
  readonly #pending = new Map<number, PendingRequest>();
  #nextRequestId = 1;
  #disposed = false;

  constructor() {
    this.#worker = new Worker(new URL("./document.worker.ts", import.meta.url), { type: "module" });
    this.#worker.addEventListener("message", (event: MessageEvent<DocumentWorkerResponse>) => {
      this.#handleResponse(event.data);
    });
    this.#worker.addEventListener("error", (event) => {
      this.#failAll(new Error(event.message || "The local genealogy worker stopped unexpectedly."));
    });
  }

  analyze(source: string, signal?: AbortSignal): Promise<CanonicalDocument> {
    if (this.#disposed) {
      return Promise.reject(new Error("The genealogy worker has been disposed."));
    }
    if (!source.trim()) {
      return Promise.reject(new Error("Choose a non-empty GEDCOM family tree file."));
    }

    return this.#request({ type: "analyze_document", source }, signal).then((result) => {
      if (result.type !== "analysis") {
        throw new Error("The genealogy worker returned an unexpected analysis result.");
      }
      return result.document;
    });
  }

  openEditable(source: string, signal?: AbortSignal): Promise<OpenEditableDocument> {
    return this.#request({ type: "open_editable_document", source }, signal).then((result) => {
      if (result.type !== "session_opened") {
        throw new Error("The genealogy worker did not open the editable document.");
      }
      return { handle: result.handle, snapshot: result.snapshot };
    });
  }

  createEditable(firstPerson: PersonInput, signal?: AbortSignal): Promise<OpenEditableDocument> {
    return this.#request({ type: "create_editable_document", firstPerson }, signal).then(
      (result) => {
        if (result.type !== "session_opened") {
          throw new Error("The genealogy worker did not create the editable document.");
        }
        return { handle: result.handle, snapshot: result.snapshot };
      },
    );
  }

  editablePerson(handle: number, personId: string, signal?: AbortSignal): Promise<EditablePerson> {
    return this.#request({ type: "get_editable_person", handle, personId }, signal).then(
      (result) => {
        if (result.type !== "person") {
          throw new Error("The genealogy worker returned an unexpected Person Record.");
        }
        return result.person;
      },
    );
  }

  applyEdit(
    handle: number,
    expectedRevision: number,
    command: GenealogyEditCommand,
    signal?: AbortSignal,
  ): Promise<EditableDocumentSnapshot> {
    return this.#request(
      { type: "apply_document_command", handle, expectedRevision, command },
      signal,
    ).then(expectSnapshot);
  }

  undo(
    handle: number,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<EditableDocumentSnapshot> {
    return this.#request({ type: "undo_document", handle, expectedRevision }, signal).then(
      expectSnapshot,
    );
  }

  redo(
    handle: number,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<EditableDocumentSnapshot> {
    return this.#request({ type: "redo_document", handle, expectedRevision }, signal).then(
      expectSnapshot,
    );
  }

  exportEditable(
    handle: number,
    version: GedcomExportVersion,
    signal?: AbortSignal,
  ): Promise<EditableGedcomExport> {
    return this.#request({ type: "export_editable_document", handle, version }, signal).then(
      (result) => {
        if (result.type !== "export") {
          throw new Error("The genealogy worker returned an unexpected GEDCOM export.");
        }
        return result.export;
      },
    );
  }

  closeEditable(handle: number): Promise<void> {
    return this.#request({ type: "close_editable_document", handle }).then((result) => {
      if (result.type !== "closed") {
        throw new Error("The genealogy worker did not close the editable document.");
      }
    });
  }

  #request(
    payload: DocumentWorkerRequestPayload,
    signal?: AbortSignal,
  ): Promise<DocumentWorkerResult> {
    if (this.#disposed) {
      return Promise.reject(new Error("The genealogy worker has been disposed."));
    }
    const id = this.#nextRequestId++;
    return new Promise<DocumentWorkerResult>((resolve, reject) => {
      const abort = (): void => {
        if (this.#pending.delete(id)) {
          reject(new DOMException("The local genealogy operation was cancelled.", "AbortError"));
        }
      };
      if (signal?.aborted) {
        abort();
        return;
      }

      this.#pending.set(id, {
        resolve: (document) => {
          signal?.removeEventListener("abort", abort);
          resolve(document);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", abort);
          reject(error);
        },
      });
      signal?.addEventListener("abort", abort, { once: true });
      const request: DocumentWorkerRequest = { id, ...payload };
      this.#worker.postMessage(request);
    });
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#worker.terminate();
    this.#failAll(new Error("The genealogy worker was disposed before analysis completed."));
  }

  #handleResponse(response: DocumentWorkerResponse): void {
    const pending = this.#pending.get(response.id);
    if (!pending) {
      return;
    }
    this.#pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error));
    }
  }

  #failAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

function expectSnapshot(result: DocumentWorkerResult): EditableDocumentSnapshot {
  if (result.type !== "snapshot") {
    throw new Error("The genealogy worker returned an unexpected document snapshot.");
  }
  return result.snapshot;
}
