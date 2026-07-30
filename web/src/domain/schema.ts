export const CANONICAL_DOCUMENT_SCHEMA_VERSION = 1 as const;

export interface DateRange {
  start_year: number;
  end_year: number;
}

export type RecordedDatePrecision =
  | "exact"
  | "approximate"
  | "calculated"
  | "estimated"
  | "before"
  | "after"
  | "range"
  | "period"
  | "phrase";

export interface RecordedDate {
  original_text: string;
  start_year: number | null;
  end_year: number | null;
  precision: RecordedDatePrecision;
}

export type ValidationSeverity = "error" | "warning" | "notice";

export interface ValidationFinding {
  code: string;
  severity: ValidationSeverity;
  title: string;
  message: string;
  record_ids: string[];
  blocks_interactive: boolean;
  corrective_action: string | null;
}

export interface DocumentAnalysis {
  people: number;
  families: number;
  relationship_links: number;
  disconnected_family_groups: number;
  generation_depth: number | null;
  widest_generation: number | null;
  largest_sibling_group: number;
  people_with_multiple_spouses: number;
  people_in_multiple_spouse_families: number;
  half_sibling_structures: number;
  pedigree_collapse_people: number;
  reconvergence_points: number;
  people_with_dates: number;
  families_with_dates: number;
  date_coverage_percent: number;
  findings: ValidationFinding[];
  blocks_interactive: boolean;
}

export interface SourceProfile {
  line_count: number;
  person_records: number;
  family_records: number;
  note_records: number;
  source_records: number;
  object_records: number;
  other_record_types: Record<string, number>;
  custom_tag_counts: Record<string, number>;
  media_files: string[];
  producer: string | null;
  producer_version: string | null;
  gedcom_version: string | null;
  character_encoding: string | null;
}

export interface CanonicalParentFamilyLink {
  family_id: string;
  relationship: string;
  relationship_was_explicit: boolean;
}

export interface CanonicalPerson {
  id: string;
  display_name: string;
  sex: string | null;
  birth_place: string | null;
  parent_families: CanonicalParentFamilyLink[];
  spouse_families: string[];
  birth_date?: RecordedDate | null;
  death_date?: RecordedDate | null;
  date_range: DateRange | null;
}

export interface CanonicalFamily {
  id: string;
  husband_id: string | null;
  wife_id: string | null;
  child_ids: string[];
  marriage_date?: RecordedDate | null;
  divorce_date?: RecordedDate | null;
  date_range: DateRange | null;
}

export interface CanonicalDocument {
  schema_version: typeof CANONICAL_DOCUMENT_SCHEMA_VERSION;
  people: CanonicalPerson[];
  families: CanonicalFamily[];
  analysis: DocumentAnalysis;
  source_profile: SourceProfile;
}

export interface GenealogyIndexes {
  peopleById: ReadonlyMap<string, CanonicalPerson>;
  familiesById: ReadonlyMap<string, CanonicalFamily>;
}

export function buildGenealogyIndexes(document: CanonicalDocument): GenealogyIndexes {
  return {
    peopleById: new Map(document.people.map((person) => [person.id, person])),
    familiesById: new Map(document.families.map((family) => [family.id, family])),
  };
}
