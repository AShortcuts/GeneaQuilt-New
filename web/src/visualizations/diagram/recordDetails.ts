import { buildGenealogyIndexes, type CanonicalDocument } from "../../domain/schema.ts";
import type { SelectedRecordDetails } from "../adapter.ts";

export function recordDetails(
  document: CanonicalDocument,
  recordId: string,
): SelectedRecordDetails | null {
  const indexes = buildGenealogyIndexes(document);
  const person = indexes.peopleById.get(recordId);
  if (person) {
    const parents = new Set<string>();
    for (const link of person.parent_families) {
      const family = indexes.familiesById.get(link.family_id);
      if (family?.husband_id) {
        parents.add(indexes.peopleById.get(family.husband_id)?.display_name ?? family.husband_id);
      }
      if (family?.wife_id) {
        parents.add(indexes.peopleById.get(family.wife_id)?.display_name ?? family.wife_id);
      }
    }
    const spouses = new Set<string>();
    const children = new Set<string>();
    for (const familyId of person.spouse_families) {
      const family = indexes.familiesById.get(familyId);
      if (!family) {
        continue;
      }
      for (const spouseId of [family.husband_id, family.wife_id]) {
        if (spouseId && spouseId !== person.id) {
          spouses.add(indexes.peopleById.get(spouseId)?.display_name ?? spouseId);
        }
      }
      for (const childId of family.child_ids) {
        children.add(indexes.peopleById.get(childId)?.display_name ?? childId);
      }
    }
    return {
      id: person.id,
      label: person.display_name,
      kind: "person",
      parents: [...parents].sort(),
      spouses: [...spouses].sort(),
      children: [...children].sort(),
      date_start: person.date_range?.start_year ?? null,
      date_end: person.date_range?.end_year ?? null,
    };
  }

  const family = indexes.familiesById.get(recordId);
  if (!family) {
    return null;
  }
  const spouseNames = [family.husband_id, family.wife_id]
    .filter((id): id is string => Boolean(id))
    .map((id) => indexes.peopleById.get(id)?.display_name ?? id);
  return {
    id: family.id,
    label: spouseNames.join(" + ") || "Family",
    kind: "family",
    parents: [],
    spouses: spouseNames,
    children: family.child_ids.map((id) => indexes.peopleById.get(id)?.display_name ?? id),
    date_start: family.date_range?.start_year ?? null,
    date_end: family.date_range?.end_year ?? null,
  };
}
