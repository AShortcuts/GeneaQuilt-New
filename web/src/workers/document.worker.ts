/// <reference lib="webworker" />

import initWasm, {
  canonical_document_json,
  GenealogyDocumentEngine,
} from "../../pkg/geneaquilt_wasm.js";
import {
  parseEditableDocumentSnapshotJson,
  parseEditableGedcomExportJson,
  parseEditablePersonJson,
} from "../domain/editableDocument.ts";
import { parseCanonicalDocumentJson } from "../domain/schemaValidation.ts";
import type { DocumentWorkerRequest, DocumentWorkerResponse } from "./documentProtocol.ts";

const workerScope: DedicatedWorkerGlobalScope = self;
const wasmReady = initWasm();
const editableDocuments = new Map<number, GenealogyDocumentEngine>();
let nextDocumentHandle = 1;

workerScope.addEventListener("message", (event: MessageEvent<DocumentWorkerRequest>) => {
  void handleRequest(event.data);
});

async function handleRequest(request: DocumentWorkerRequest): Promise<void> {
  try {
    await wasmReady;
    switch (request.type) {
      case "analyze_document": {
        const document = parseCanonicalDocumentJson(canonical_document_json(request.source));
        post({ id: request.id, ok: true, result: { type: "analysis", document } });
        break;
      }
      case "open_editable_document": {
        const engine = new GenealogyDocumentEngine(request.source);
        const handle = nextDocumentHandle++;
        editableDocuments.set(handle, engine);
        const snapshot = parseEditableDocumentSnapshotJson(engine.snapshot_json());
        post({
          id: request.id,
          ok: true,
          result: { type: "session_opened", handle, snapshot },
        });
        break;
      }
      case "create_editable_document": {
        const engine = GenealogyDocumentEngine.create(JSON.stringify(request.firstPerson));
        const handle = nextDocumentHandle++;
        editableDocuments.set(handle, engine);
        const snapshot = parseEditableDocumentSnapshotJson(engine.snapshot_json());
        post({
          id: request.id,
          ok: true,
          result: { type: "session_opened", handle, snapshot },
        });
        break;
      }
      case "get_editable_person": {
        const engine = requireEditableDocument(request.handle);
        const person = parseEditablePersonJson(engine.person_json(request.personId));
        post({ id: request.id, ok: true, result: { type: "person", person } });
        break;
      }
      case "apply_document_command": {
        const engine = requireEditableDocument(request.handle);
        const snapshot = parseEditableDocumentSnapshotJson(
          engine.apply_command_json(JSON.stringify(request.command), request.expectedRevision),
        );
        post({ id: request.id, ok: true, result: { type: "snapshot", snapshot } });
        break;
      }
      case "undo_document": {
        const engine = requireEditableDocument(request.handle);
        const snapshot = parseEditableDocumentSnapshotJson(
          engine.undo_json(request.expectedRevision),
        );
        post({ id: request.id, ok: true, result: { type: "snapshot", snapshot } });
        break;
      }
      case "redo_document": {
        const engine = requireEditableDocument(request.handle);
        const snapshot = parseEditableDocumentSnapshotJson(
          engine.redo_json(request.expectedRevision),
        );
        post({ id: request.id, ok: true, result: { type: "snapshot", snapshot } });
        break;
      }
      case "export_editable_document": {
        const engine = requireEditableDocument(request.handle);
        const exportResult = parseEditableGedcomExportJson(engine.export_json(request.version));
        post({
          id: request.id,
          ok: true,
          result: { type: "export", export: exportResult },
        });
        break;
      }
      case "close_editable_document": {
        const engine = editableDocuments.get(request.handle);
        if (engine) {
          editableDocuments.delete(request.handle);
          engine.free();
        }
        post({ id: request.id, ok: true, result: { type: "closed" } });
        break;
      }
    }
  } catch (error) {
    post({ id: request.id, ok: false, error: formatError(error) });
  }
}

function requireEditableDocument(handle: number): GenealogyDocumentEngine {
  const engine = editableDocuments.get(handle);
  if (!engine) {
    throw new Error("This editable Genealogy Document session is no longer open.");
  }
  return engine;
}

function post(response: DocumentWorkerResponse): void {
  workerScope.postMessage(response);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export {};
