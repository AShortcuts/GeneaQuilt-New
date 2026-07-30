import type { CanonicalDocument } from "../domain/schema.ts";
import type {
  EditableDocumentSnapshot,
  EditableGedcomExport,
  EditablePerson,
  GedcomExportVersion,
  GenealogyEditCommand,
  PersonInput,
} from "../domain/editableDocument.ts";

export interface AnalyzeDocumentRequest {
  type: "analyze_document";
  source: string;
}

export interface OpenEditableDocumentRequest {
  type: "open_editable_document";
  source: string;
}

export interface CreateEditableDocumentRequest {
  type: "create_editable_document";
  firstPerson: PersonInput;
}

export interface GetEditablePersonRequest {
  type: "get_editable_person";
  handle: number;
  personId: string;
}

export interface ApplyDocumentCommandRequest {
  type: "apply_document_command";
  handle: number;
  expectedRevision: number;
  command: GenealogyEditCommand;
}

export interface UndoDocumentRequest {
  type: "undo_document";
  handle: number;
  expectedRevision: number;
}

export interface RedoDocumentRequest {
  type: "redo_document";
  handle: number;
  expectedRevision: number;
}

export interface ExportEditableDocumentRequest {
  type: "export_editable_document";
  handle: number;
  version: GedcomExportVersion;
}

export interface CloseEditableDocumentRequest {
  type: "close_editable_document";
  handle: number;
}

export type DocumentWorkerRequestPayload =
  | AnalyzeDocumentRequest
  | OpenEditableDocumentRequest
  | CreateEditableDocumentRequest
  | GetEditablePersonRequest
  | ApplyDocumentCommandRequest
  | UndoDocumentRequest
  | RedoDocumentRequest
  | ExportEditableDocumentRequest
  | CloseEditableDocumentRequest;

export type DocumentWorkerRequest = DocumentWorkerRequestPayload & { id: number };

export type DocumentWorkerResult =
  | { type: "analysis"; document: CanonicalDocument }
  | { type: "session_opened"; handle: number; snapshot: EditableDocumentSnapshot }
  | { type: "person"; person: EditablePerson }
  | { type: "snapshot"; snapshot: EditableDocumentSnapshot }
  | { type: "export"; export: EditableGedcomExport }
  | { type: "closed" };

export interface DocumentWorkerSuccess {
  id: number;
  ok: true;
  result: DocumentWorkerResult;
}

export interface DocumentWorkerFailure {
  id: number;
  ok: false;
  error: string;
}

export type DocumentWorkerResponse = DocumentWorkerSuccess | DocumentWorkerFailure;
