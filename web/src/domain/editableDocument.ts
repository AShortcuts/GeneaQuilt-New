import { parseCanonicalDocument } from "./schemaValidation.ts";
import type { CanonicalDocument } from "./schema.ts";

export type GedcomExportVersion = "v7" | "v551";
export type PersonSex = "M" | "F" | "X" | "U";
export type RelativeKind = "parent" | "spouse" | "child" | "sibling";
export type FamilyRole = "husband" | "wife";

export interface PersonInput {
  given_names: string;
  surname: string;
  sex: PersonSex | null;
  birth_date: string;
  birth_place: string;
  death_date: string;
  death_place: string;
}

export interface EditablePerson extends PersonInput {
  id: string;
  display_name: string;
  parent_family_ids: string[];
  spouse_family_ids: string[];
}

export type GenealogyEditCommand =
  | {
      type: "update_person";
      person_id: string;
      person: PersonInput;
    }
  | {
      type: "add_relative";
      person_id: string;
      relationship: RelativeKind;
      person: PersonInput;
      pedigree?: string | null;
      family_id?: string | null;
      primary_role?: FamilyRole | null;
    }
  | {
      type: "delete_person";
      person_id: string;
    };

export interface EditableDocumentSnapshot {
  revision: number;
  source_gedcom: string;
  document: CanonicalDocument;
  can_undo: boolean;
  can_redo: boolean;
  last_change: string | null;
}

export interface EditableGedcomExport {
  revision: number;
  version: GedcomExportVersion;
  source_gedcom: string;
  warnings: string[];
}

export function parseEditableDocumentSnapshotJson(json: string): EditableDocumentSnapshot {
  return parseEditableDocumentSnapshot(JSON.parse(json) as unknown);
}

export function parseEditablePersonJson(json: string): EditablePerson {
  return parseEditablePerson(JSON.parse(json) as unknown);
}

export function parseEditableGedcomExportJson(json: string): EditableGedcomExport {
  const record = expectRecord(JSON.parse(json) as unknown, "GEDCOM export");
  const version = expectString(record.version, "GEDCOM export.version");
  if (version !== "v7" && version !== "v551") {
    throw new Error(`GEDCOM export.version must be v7 or v551; received ${version}.`);
  }
  return {
    revision: expectNonnegativeInteger(record.revision, "GEDCOM export.revision"),
    version,
    source_gedcom: expectString(record.source_gedcom, "GEDCOM export.source_gedcom"),
    warnings: expectStringArray(record.warnings, "GEDCOM export.warnings"),
  };
}

function parseEditableDocumentSnapshot(value: unknown): EditableDocumentSnapshot {
  const record = expectRecord(value, "editable document snapshot");
  return {
    revision: expectNonnegativeInteger(record.revision, "editable document snapshot.revision"),
    source_gedcom: expectString(record.source_gedcom, "editable document snapshot.source_gedcom"),
    document: parseCanonicalDocument(record.document),
    can_undo: expectBoolean(record.can_undo, "editable document snapshot.can_undo"),
    can_redo: expectBoolean(record.can_redo, "editable document snapshot.can_redo"),
    last_change: expectNullableString(record.last_change, "editable document snapshot.last_change"),
  };
}

function parseEditablePerson(value: unknown): EditablePerson {
  const record = expectRecord(value, "editable Person Record");
  const sexValue = expectNullableString(record.sex, "editable Person Record.sex");
  if (sexValue !== null && !isPersonSex(sexValue)) {
    throw new Error(`editable Person Record.sex has an unsupported value: ${sexValue}.`);
  }
  return {
    id: expectString(record.id, "editable Person Record.id"),
    given_names: expectString(record.given_names, "editable Person Record.given_names"),
    surname: expectString(record.surname, "editable Person Record.surname"),
    display_name: expectString(record.display_name, "editable Person Record.display_name"),
    sex: sexValue,
    birth_date: expectString(record.birth_date, "editable Person Record.birth_date"),
    birth_place: expectString(record.birth_place, "editable Person Record.birth_place"),
    death_date: expectString(record.death_date, "editable Person Record.death_date"),
    death_place: expectString(record.death_place, "editable Person Record.death_place"),
    parent_family_ids: expectStringArray(
      record.parent_family_ids,
      "editable Person Record.parent_family_ids",
    ),
    spouse_family_ids: expectStringArray(
      record.spouse_family_ids,
      "editable Person Record.spouse_family_ids",
    ),
  };
}

function isPersonSex(value: string): value is PersonSex {
  return value === "M" || value === "F" || value === "X" || value === "U";
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string.`);
  }
  return value;
}

function expectNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }
  return expectString(value, path);
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be true or false.`);
  }
  return value;
}

function expectNonnegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative safe integer.`);
  }
  return value;
}

function expectStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${path} must be an array of strings.`);
  }
  return [...value];
}
