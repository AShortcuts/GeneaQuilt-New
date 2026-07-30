import type {
  EditablePerson,
  FamilyRole,
  PersonInput,
  PersonSex,
  RelativeKind,
} from "../domain/editableDocument.ts";
import { icon } from "../ui/icons.ts";

const PRESERVE_IMPORTED_SEX = "__preserve_imported__";

export interface FamilyChoice {
  id: string;
  label: string;
}

export function emptyPersonInput(): PersonInput {
  return {
    given_names: "",
    surname: "",
    sex: null,
    birth_date: "",
    birth_place: "",
    death_date: "",
    death_place: "",
  };
}

export function renderNewTreeForm(): string {
  return `
    <form class="genealogy-form new-tree-form">
      <label class="editor-field editor-field-wide">
        <span>Tree title</span>
        <input name="tree-title" autocomplete="off" value="My family tree" required />
      </label>
      <div class="editor-section-heading">
        <span>Starting person</span>
        <p>Begin with yourself or anyone you know. You can add relatives next.</p>
      </div>
      ${renderPersonFields(emptyPersonInput())}
      <p class="editor-form-error" role="alert" aria-live="assertive" hidden></p>
      <div class="dialog-actions">
        <button class="button" value="cancel" type="button">Cancel</button>
        <button class="button button-primary" type="submit">Create family tree</button>
      </div>
    </form>
  `;
}

export function renderPersonEditor(person: EditablePerson): string {
  return `
    <form class="genealogy-form person-editor-form" data-person-id="${escapeAttribute(person.id)}">
      <header class="editor-heading">
        <span class="record-kind">Edit person</span>
        <h2>${escapeHtml(person.display_name)}</h2>
      </header>
      ${renderPersonFields(person, false)}
      ${renderRelativeActions(person.parent_family_ids.length > 0)}
      <p class="editor-form-error" role="alert" aria-live="assertive" hidden></p>
      <div class="drawer-actions editor-actions">
        <button class="button button-primary" type="submit">Save person</button>
        <button class="button editor-cancel" type="button">Cancel</button>
      </div>
      <button class="text-button danger-text delete-person" type="button">Delete this person</button>
    </form>
  `;
}

export function renderRelativeActions(canAddSibling: boolean): string {
  const actions: Array<{ relationship: RelativeKind; label: string }> = [
    { relationship: "parent", label: "Add parent" },
    { relationship: "spouse", label: "Add spouse" },
    { relationship: "child", label: "Add child" },
  ];
  if (canAddSibling) {
    actions.push({ relationship: "sibling", label: "Add sibling" });
  }
  return `
    <section class="relative-actions ${canAddSibling ? "has-sibling" : ""}" aria-label="Add relatives">
      <h3>Add relatives</h3>
      <div>
        ${actions
          .map(
            (action) =>
              `<button class="button add-relative" data-relationship="${action.relationship}" type="button">${icon("plus")}<span>${action.label}</span></button>`,
          )
          .join("")}
      </div>
    </section>
  `;
}

export function renderRelativeEditor(input: {
  relationship: RelativeKind;
  primaryPerson: EditablePerson;
  familyChoices: FamilyChoice[];
}): string {
  const relationshipLabel = relativeLabel(input.relationship);
  const automaticFamilyLabel =
    input.relationship === "child"
      ? input.familyChoices.length === 1
        ? `Use ${input.familyChoices[0]?.label ?? "the recorded parent family"}`
        : "Create a new parent family"
      : input.relationship === "sibling" && input.familyChoices.length === 1
        ? `Use ${input.familyChoices[0]?.label ?? "the recorded parent family"}`
        : "Choose automatically";
  const familyPicker =
    input.relationship === "spouse" || input.familyChoices.length === 0
      ? ""
      : `
        <label class="editor-field editor-field-wide">
          <span>${input.relationship === "child" ? "Parents" : "Parent family"}</span>
          <select name="family-id">
            <option value="">${escapeHtml(automaticFamilyLabel)}</option>
            ${input.familyChoices
              .map(
                (family) =>
                  `<option value="${escapeAttribute(family.id)}">${escapeHtml(family.label)}</option>`,
              )
              .join("")}
          </select>
        </label>
      `;
  const pedigreePicker =
    input.relationship === "spouse"
      ? ""
      : `
        <label class="editor-field">
          <span>Relationship type</span>
          <select name="pedigree">
            <option value="">Not specified</option>
            <option value="birth">Birth</option>
            <option value="adopted">Adopted</option>
            <option value="foster">Foster</option>
            <option value="sealing">Sealing</option>
          </select>
        </label>
      `;
  const primaryRole =
    input.relationship === "parent" || input.relationship === "sibling"
      ? ""
      : `
        <label class="editor-field">
          <span>${input.relationship === "child" ? `${escapeHtml(input.primaryPerson.display_name)}'s family role` : "Existing person's family role"}</span>
          <select name="primary-role">
            <option value="">Choose automatically</option>
            <option value="husband">Husband</option>
            <option value="wife">Wife</option>
          </select>
        </label>
      `;
  return `
    <form class="genealogy-form relative-editor-form" data-relationship="${input.relationship}">
      <header class="editor-heading">
        <span class="record-kind">Add ${relationshipLabel}</span>
        <h2>New ${relationshipLabel}</h2>
        <p>Connect this person to ${escapeHtml(input.primaryPerson.display_name)}.</p>
      </header>
      ${renderPersonFields(emptyPersonInput())}
      <fieldset class="editor-relationship-fields">
        <legend>Relationship details</legend>
        <div class="editor-grid">
          ${familyPicker}
          ${pedigreePicker}
          ${primaryRole}
        </div>
      </fieldset>
      <p class="editor-form-error" role="alert" aria-live="assertive" hidden></p>
      <div class="drawer-actions editor-actions">
        <button class="button editor-cancel" type="button">Cancel</button>
        <button class="button button-primary" type="submit">Add ${relationshipLabel}</button>
      </div>
    </form>
  `;
}

export function readPersonInput(form: HTMLFormElement): PersonInput {
  const data = new FormData(form);
  const givenNames = formValue(data, "given-names");
  const surname = formValue(data, "surname");
  if (!givenNames && !surname) {
    throw new Error("Enter given names, a surname, or both.");
  }
  const sexValue = formValue(data, "sex");
  let sex: PersonSex | null = null;
  if (sexValue === PRESERVE_IMPORTED_SEX) {
    const preservedSex = formValue(data, "preserved-sex");
    if (preservedSex !== "X" && preservedSex !== "U") {
      throw new Error("The imported sex value could not be preserved.");
    }
    sex = preservedSex;
  } else if (sexValue) {
    if (!isPersonSex(sexValue)) {
      throw new Error("Choose a supported sex value.");
    }
    sex = sexValue;
  }
  return {
    given_names: givenNames,
    surname,
    sex,
    birth_date: formValue(data, "birth-date"),
    birth_place: formValue(data, "birth-place"),
    death_date: formValue(data, "death-date"),
    death_place: formValue(data, "death-place"),
  };
}

export function readRelativeOptions(form: HTMLFormElement): {
  pedigree: string | null;
  familyId: string | null;
  primaryRole: FamilyRole | null;
} {
  const data = new FormData(form);
  const primaryRole = formValue(data, "primary-role");
  let parsedPrimaryRole: FamilyRole | null = null;
  if (primaryRole) {
    if (primaryRole !== "husband" && primaryRole !== "wife") {
      throw new Error("Choose a supported family role.");
    }
    parsedPrimaryRole = primaryRole;
  }
  return {
    pedigree: formValue(data, "pedigree") || null,
    familyId: formValue(data, "family-id") || null,
    primaryRole: parsedPrimaryRole,
  };
}

export function showEditorError(form: HTMLFormElement, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const errorNode = form.querySelector<HTMLElement>(".editor-form-error");
  if (errorNode) {
    errorNode.textContent = message;
    errorNode.hidden = false;
  }
}

function renderPersonFields(person: PersonInput, showDateHint = true): string {
  const preservesImportedSex = person.sex === "X" || person.sex === "U";
  return `
    <div class="editor-grid">
      <label class="editor-field">
        <span>Given names</span>
        <input name="given-names" autocomplete="given-name" value="${escapeAttribute(person.given_names)}" />
      </label>
      <label class="editor-field">
        <span>Surname</span>
        <input name="surname" autocomplete="family-name" value="${escapeAttribute(person.surname)}" />
      </label>
      <label class="editor-field">
        <span>Sex</span>
        <select name="sex">
          ${
            preservesImportedSex
              ? `<option value="${PRESERVE_IMPORTED_SEX}" selected>Imported GEDCOM value (kept)</option>`
              : ""
          }
          ${sexOption("", "Not recorded", person.sex)}
          ${sexOption("F", "Female", person.sex)}
          ${sexOption("M", "Male", person.sex)}
        </select>
        ${
          preservesImportedSex
            ? `<input name="preserved-sex" type="hidden" value="${person.sex}" />`
            : ""
        }
      </label>
      ${
        showDateHint
          ? `<span class="editor-field editor-field-note">
              <span>GEDCOM dates</span>
              <small>Exact or approximate, such as 14 MAR 1942 or ABT 1942.</small>
            </span>`
          : ""
      }
      <label class="editor-field">
        <span>Birth date</span>
        <input name="birth-date" autocomplete="off" value="${escapeAttribute(person.birth_date)}" placeholder="e.g. 14 MAR 1942" />
      </label>
      <label class="editor-field">
        <span>Birth place</span>
        <input name="birth-place" autocomplete="off" value="${escapeAttribute(person.birth_place)}" />
      </label>
      <label class="editor-field">
        <span>Death date</span>
        <input name="death-date" autocomplete="off" value="${escapeAttribute(person.death_date)}" />
      </label>
      <label class="editor-field">
        <span>Death place</span>
        <input name="death-place" autocomplete="off" value="${escapeAttribute(person.death_place)}" />
      </label>
    </div>
  `;
}

function sexOption(value: string, label: string, selected: PersonSex | null): string {
  return `<option value="${value}" ${selected === value || (!selected && !value) ? "selected" : ""}>${label}</option>`;
}

function formValue(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isPersonSex(value: string): value is PersonSex {
  return value === "M" || value === "F" || value === "X" || value === "U";
}

function relativeLabel(relationship: RelativeKind): string {
  switch (relationship) {
    case "parent":
      return "parent";
    case "spouse":
      return "spouse";
    case "child":
      return "child";
    case "sibling":
      return "sibling";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("\n", " ").replaceAll("\r", " ");
}
