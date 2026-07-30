import type {
  CanonicalDocument,
  CanonicalFamily,
  CanonicalPerson,
  RecordedDate,
} from "./schema.ts";
import type { GenealogyProjection } from "./projection.ts";

interface CanonicalRecords {
  people: CanonicalPerson[];
  families: CanonicalFamily[];
}

export function canonicalDocumentToDerivedGedcom(document: CanonicalDocument): string {
  return recordsToDerivedGedcom(document);
}

export function projectionToDerivedGedcom(projection: GenealogyProjection): string {
  return recordsToDerivedGedcom(projection);
}

function recordsToDerivedGedcom(records: CanonicalRecords): string {
  const includedPeople = new Set(records.people.map((person) => person.id));
  const includedFamilies = new Set(records.families.map((family) => family.id));
  const lines = ["0 HEAD", "1 SOUR GeneaQuiltDerived", "1 GEDC", "2 VERS 5.5.1", "1 CHAR UTF-8"];

  for (const person of records.people) {
    lines.push(`0 ${person.id} INDI`);
    lines.push(`1 NAME ${sanitizeValue(person.display_name)}`);
    if (person.sex) {
      lines.push(`1 SEX ${sanitizeValue(person.sex)}`);
    }
    appendEvent(lines, "BIRT", person.birth_date ?? null, person.birth_place);
    appendEvent(lines, "DEAT", person.death_date ?? null);
    for (const parentFamily of person.parent_families) {
      if (!includedFamilies.has(parentFamily.family_id)) {
        continue;
      }
      lines.push(`1 FAMC ${parentFamily.family_id}`);
      if (parentFamily.relationship_was_explicit) {
        const relationship = parentFamily.relationship.replace(/^other:/, "");
        lines.push(`2 PEDI ${sanitizeValue(relationship)}`);
      }
    }
    for (const familyId of person.spouse_families) {
      if (includedFamilies.has(familyId)) {
        lines.push(`1 FAMS ${familyId}`);
      }
    }
  }

  for (const family of records.families) {
    lines.push(`0 ${family.id} FAM`);
    if (family.husband_id && includedPeople.has(family.husband_id)) {
      lines.push(`1 HUSB ${family.husband_id}`);
    }
    if (family.wife_id && includedPeople.has(family.wife_id)) {
      lines.push(`1 WIFE ${family.wife_id}`);
    }
    for (const childId of family.child_ids) {
      if (includedPeople.has(childId)) {
        lines.push(`1 CHIL ${childId}`);
      }
    }
    appendEvent(lines, "MARR", family.marriage_date ?? null);
    appendEvent(lines, "DIV", family.divorce_date ?? null);
  }
  lines.push("0 TRLR");
  return `${lines.join("\n")}\n`;
}

function appendEvent(
  lines: string[],
  tag: "BIRT" | "DEAT" | "MARR" | "DIV",
  date: RecordedDate | null,
  place: string | null = null,
): void {
  if (!date && !place) return;
  lines.push(`1 ${tag}`);
  if (date) lines.push(`2 DATE ${sanitizeValue(date.original_text)}`);
  if (place) lines.push(`2 PLAC ${sanitizeValue(place)}`);
}

function sanitizeValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
