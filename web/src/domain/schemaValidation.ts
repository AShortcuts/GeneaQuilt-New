import {
  CANONICAL_DOCUMENT_SCHEMA_VERSION,
  type CanonicalDocument,
  type CanonicalFamily,
  type CanonicalParentFamilyLink,
  type CanonicalPerson,
  type DateRange,
  type DocumentAnalysis,
  type RecordedDate,
  type RecordedDatePrecision,
  type SourceProfile,
  type ValidationFinding,
  type ValidationSeverity,
} from "./schema.ts";

export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

export function parseCanonicalDocumentJson(json: string): CanonicalDocument {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SchemaValidationError(`The genealogy document is not valid JSON: ${detail}`);
  }
  return parseCanonicalDocument(value);
}

export function parseCanonicalDocument(value: unknown): CanonicalDocument {
  const record = expectRecord(value, "document");
  const schemaVersion = expectInteger(record.schema_version, "document.schema_version");
  if (schemaVersion !== CANONICAL_DOCUMENT_SCHEMA_VERSION) {
    throw new SchemaValidationError(
      `Unsupported genealogy document schema ${schemaVersion}; expected ${CANONICAL_DOCUMENT_SCHEMA_VERSION}.`,
    );
  }

  const people = expectArray(record.people, "document.people").map((person, index) =>
    parsePerson(person, `document.people[${index}]`),
  );
  const families = expectArray(record.families, "document.families").map((family, index) =>
    parseFamily(family, `document.families[${index}]`),
  );
  assertUniqueIds(
    people.map((person) => person.id),
    "Person",
  );
  assertUniqueIds(
    families.map((family) => family.id),
    "Family",
  );

  const analysis = parseAnalysis(record.analysis, "document.analysis");
  if (analysis.people !== people.length || analysis.families !== families.length) {
    throw new SchemaValidationError(
      "Tree Analysis record counts do not match the canonical Person and Family arrays.",
    );
  }

  return {
    schema_version: CANONICAL_DOCUMENT_SCHEMA_VERSION,
    people,
    families,
    analysis,
    source_profile: parseSourceProfile(record.source_profile, "document.source_profile"),
  };
}

function parsePerson(value: unknown, path: string): CanonicalPerson {
  const record = expectRecord(value, path);
  return {
    id: expectNonemptyString(record.id, `${path}.id`),
    display_name: expectNonemptyString(record.display_name, `${path}.display_name`),
    sex: expectNullableString(record.sex, `${path}.sex`),
    // Schema 1 files created before birthplace-aware methods remain valid.
    birth_place:
      record.birth_place === undefined
        ? null
        : expectNullableString(record.birth_place, `${path}.birth_place`),
    parent_families: expectArray(record.parent_families, `${path}.parent_families`).map(
      (link, index) => parseParentFamilyLink(link, `${path}.parent_families[${index}]`),
    ),
    spouse_families: expectStringArray(record.spouse_families, `${path}.spouse_families`),
    birth_date: parseOptionalRecordedDate(record.birth_date, `${path}.birth_date`),
    death_date: parseOptionalRecordedDate(record.death_date, `${path}.death_date`),
    date_range: parseNullableDateRange(record.date_range, `${path}.date_range`),
  };
}

function parseParentFamilyLink(value: unknown, path: string): CanonicalParentFamilyLink {
  const record = expectRecord(value, path);
  return {
    family_id: expectNonemptyString(record.family_id, `${path}.family_id`),
    relationship: expectNonemptyString(record.relationship, `${path}.relationship`),
    relationship_was_explicit: expectBoolean(
      record.relationship_was_explicit,
      `${path}.relationship_was_explicit`,
    ),
  };
}

function parseFamily(value: unknown, path: string): CanonicalFamily {
  const record = expectRecord(value, path);
  return {
    id: expectNonemptyString(record.id, `${path}.id`),
    husband_id: expectNullableString(record.husband_id, `${path}.husband_id`),
    wife_id: expectNullableString(record.wife_id, `${path}.wife_id`),
    child_ids: expectStringArray(record.child_ids, `${path}.child_ids`),
    marriage_date: parseOptionalRecordedDate(record.marriage_date, `${path}.marriage_date`),
    divorce_date: parseOptionalRecordedDate(record.divorce_date, `${path}.divorce_date`),
    date_range: parseNullableDateRange(record.date_range, `${path}.date_range`),
  };
}

function parseAnalysis(value: unknown, path: string): DocumentAnalysis {
  const record = expectRecord(value, path);
  return {
    people: expectCount(record.people, `${path}.people`),
    families: expectCount(record.families, `${path}.families`),
    relationship_links: expectCount(record.relationship_links, `${path}.relationship_links`),
    disconnected_family_groups: expectCount(
      record.disconnected_family_groups,
      `${path}.disconnected_family_groups`,
    ),
    generation_depth: expectNullableCount(record.generation_depth, `${path}.generation_depth`),
    widest_generation: expectNullableCount(record.widest_generation, `${path}.widest_generation`),
    largest_sibling_group: expectCount(
      record.largest_sibling_group,
      `${path}.largest_sibling_group`,
    ),
    people_with_multiple_spouses: expectCount(
      record.people_with_multiple_spouses,
      `${path}.people_with_multiple_spouses`,
    ),
    people_in_multiple_spouse_families: expectCount(
      record.people_in_multiple_spouse_families,
      `${path}.people_in_multiple_spouse_families`,
    ),
    half_sibling_structures: expectCount(
      record.half_sibling_structures,
      `${path}.half_sibling_structures`,
    ),
    pedigree_collapse_people: expectCount(
      record.pedigree_collapse_people,
      `${path}.pedigree_collapse_people`,
    ),
    reconvergence_points: expectCount(record.reconvergence_points, `${path}.reconvergence_points`),
    people_with_dates: expectCount(record.people_with_dates, `${path}.people_with_dates`),
    families_with_dates: expectCount(record.families_with_dates, `${path}.families_with_dates`),
    date_coverage_percent: expectPercentage(
      record.date_coverage_percent,
      `${path}.date_coverage_percent`,
    ),
    findings: expectArray(record.findings, `${path}.findings`).map((finding, index) =>
      parseFinding(finding, `${path}.findings[${index}]`),
    ),
    blocks_interactive: expectBoolean(record.blocks_interactive, `${path}.blocks_interactive`),
  };
}

function parseFinding(value: unknown, path: string): ValidationFinding {
  const record = expectRecord(value, path);
  return {
    code: expectNonemptyString(record.code, `${path}.code`),
    severity: expectSeverity(record.severity, `${path}.severity`),
    title: expectNonemptyString(record.title, `${path}.title`),
    message: expectNonemptyString(record.message, `${path}.message`),
    record_ids: expectStringArray(record.record_ids, `${path}.record_ids`),
    blocks_interactive: expectBoolean(record.blocks_interactive, `${path}.blocks_interactive`),
    corrective_action: expectNullableString(record.corrective_action, `${path}.corrective_action`),
  };
}

function parseSourceProfile(value: unknown, path: string): SourceProfile {
  const record = expectRecord(value, path);
  return {
    line_count: expectCount(record.line_count, `${path}.line_count`),
    person_records: expectCount(record.person_records, `${path}.person_records`),
    family_records: expectCount(record.family_records, `${path}.family_records`),
    note_records: expectCount(record.note_records, `${path}.note_records`),
    source_records: expectCount(record.source_records, `${path}.source_records`),
    object_records: expectCount(record.object_records, `${path}.object_records`),
    other_record_types: expectCountRecord(record.other_record_types, `${path}.other_record_types`),
    custom_tag_counts: expectCountRecord(record.custom_tag_counts, `${path}.custom_tag_counts`),
    media_files: expectStringArray(record.media_files, `${path}.media_files`),
    producer: expectNullableString(record.producer, `${path}.producer`),
    producer_version: expectNullableString(record.producer_version, `${path}.producer_version`),
    gedcom_version: expectNullableString(record.gedcom_version, `${path}.gedcom_version`),
    character_encoding: expectNullableString(
      record.character_encoding,
      `${path}.character_encoding`,
    ),
  };
}

function parseNullableDateRange(value: unknown, path: string): DateRange | null {
  if (value === null) {
    return null;
  }
  const record = expectRecord(value, path);
  const startYear = expectInteger(record.start_year, `${path}.start_year`);
  const endYear = expectInteger(record.end_year, `${path}.end_year`);
  if (startYear > endYear) {
    throw new SchemaValidationError(`${path} starts after it ends.`);
  }
  return { start_year: startYear, end_year: endYear };
}

function parseOptionalRecordedDate(value: unknown, path: string): RecordedDate | null {
  if (value === undefined || value === null) return null;
  const record = expectRecord(value, path);
  const startYear = expectNullableInteger(record.start_year, `${path}.start_year`);
  const endYear = expectNullableInteger(record.end_year, `${path}.end_year`);
  if (startYear !== null && endYear !== null && startYear > endYear) {
    throw new SchemaValidationError(`${path} starts after it ends.`);
  }
  return {
    original_text: expectNonemptyString(record.original_text, `${path}.original_text`),
    start_year: startYear,
    end_year: endYear,
    precision: expectRecordedDatePrecision(record.precision, `${path}.precision`),
  };
}

function expectRecordedDatePrecision(value: unknown, path: string): RecordedDatePrecision {
  if (
    value === "exact" ||
    value === "approximate" ||
    value === "calculated" ||
    value === "estimated" ||
    value === "before" ||
    value === "after" ||
    value === "range" ||
    value === "period" ||
    value === "phrase"
  ) {
    return value;
  }
  throw new SchemaValidationError(`${path} is not a supported GEDCOM date precision.`);
}

function expectSeverity(value: unknown, path: string): ValidationSeverity {
  if (value === "error" || value === "warning" || value === "notice") {
    return value;
  }
  throw new SchemaValidationError(`${path} must be error, warning, or notice.`);
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SchemaValidationError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new SchemaValidationError(`${path} must be an array.`);
  }
  return value;
}

function expectStringArray(value: unknown, path: string): string[] {
  return expectArray(value, path).map((entry, index) =>
    expectNonemptyString(entry, `${path}[${index}]`),
  );
}

function expectNonemptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SchemaValidationError(`${path} must be a non-empty string.`);
  }
  return value;
}

function expectNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }
  return expectNonemptyString(value, path);
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new SchemaValidationError(`${path} must be a boolean.`);
  }
  return value;
}

function expectInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new SchemaValidationError(`${path} must be a safe integer.`);
  }
  return value;
}

function expectNullableInteger(value: unknown, path: string): number | null {
  return value === null ? null : expectInteger(value, path);
}

function expectCount(value: unknown, path: string): number {
  const count = expectInteger(value, path);
  if (count < 0) {
    throw new SchemaValidationError(`${path} must not be negative.`);
  }
  return count;
}

function expectNullableCount(value: unknown, path: string): number | null {
  return value === null ? null : expectCount(value, path);
}

function expectPercentage(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new SchemaValidationError(`${path} must be a finite percentage from 0 to 100.`);
  }
  return value;
}

function expectCountRecord(value: unknown, path: string): Record<string, number> {
  const record = expectRecord(value, path);
  return Object.fromEntries(
    Object.entries(record).map(([key, count]) => [key, expectCount(count, `${path}.${key}`)]),
  );
}

function assertUniqueIds(ids: string[], recordKind: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new SchemaValidationError(`${recordKind} identifier ${id} appears more than once.`);
    }
    seen.add(id);
  }
}
