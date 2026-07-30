use std::collections::BTreeSet;
use std::fmt::{Display, Formatter};
use std::ops::Range;

use serde::{Deserialize, Serialize};

use crate::analysis::{
    CanonicalDocument, analyze_document, build_canonical_document, profile_gedcom,
};
use crate::gedcom::{GedcomError, parse_gedcom, parse_line};

const HISTORY_LIMIT: usize = 50;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GedcomVersion {
    V7,
    V551,
}

impl GedcomVersion {
    pub fn parse(value: &str) -> Result<Self, DocumentError> {
        match value.trim().to_ascii_lowercase().as_str() {
            "7" | "7.0" | "7.0.0" | "gedcom_7" | "v7" => Ok(Self::V7),
            "5.5.1" | "gedcom_5_5_1" | "v551" => Ok(Self::V551),
            _ => Err(DocumentError::UnsupportedVersion(value.to_string())),
        }
    }

    pub fn header_value(self) -> &'static str {
        match self {
            Self::V7 => "7.0",
            Self::V551 => "5.5.1",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EditablePerson {
    pub id: String,
    pub given_names: String,
    pub surname: String,
    pub display_name: String,
    pub sex: Option<String>,
    pub birth_date: String,
    pub birth_place: String,
    pub death_date: String,
    pub death_place: String,
    pub parent_family_ids: Vec<String>,
    pub spouse_family_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersonInput {
    #[serde(default)]
    pub given_names: String,
    #[serde(default)]
    pub surname: String,
    #[serde(default)]
    pub sex: Option<String>,
    #[serde(default)]
    pub birth_date: String,
    #[serde(default)]
    pub birth_place: String,
    #[serde(default)]
    pub death_date: String,
    #[serde(default)]
    pub death_place: String,
}

impl PersonInput {
    fn normalized(mut self) -> Result<Self, DocumentError> {
        self.given_names = single_line(&self.given_names);
        self.surname = single_line(&self.surname);
        self.birth_date = single_line(&self.birth_date);
        self.birth_place = single_line(&self.birth_place);
        self.death_date = single_line(&self.death_date);
        self.death_place = single_line(&self.death_place);
        self.sex = self
            .sex
            .map(|value| single_line(&value).to_ascii_uppercase())
            .filter(|value| !value.is_empty());
        if self.given_names.is_empty() && self.surname.is_empty() {
            return Err(DocumentError::InvalidCommand(
                "A Person Record needs given names, a surname, or both.".to_string(),
            ));
        }
        if let Some(sex) = self.sex.as_deref()
            && !matches!(sex, "M" | "F" | "X" | "U")
        {
            return Err(DocumentError::InvalidCommand(
                "Sex must be M, F, X, U, or left blank.".to_string(),
            ));
        }
        Ok(self)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelativeKind {
    Parent,
    Spouse,
    Child,
    Sibling,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FamilyRole {
    Husband,
    Wife,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DocumentCommand {
    UpdatePerson {
        person_id: String,
        person: PersonInput,
    },
    AddRelative {
        person_id: String,
        relationship: RelativeKind,
        person: PersonInput,
        #[serde(default)]
        pedigree: Option<String>,
        #[serde(default)]
        family_id: Option<String>,
        #[serde(default)]
        primary_role: Option<FamilyRole>,
    },
    DeletePerson {
        person_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DocumentSnapshot {
    pub revision: u64,
    pub source_gedcom: String,
    pub document: CanonicalDocument,
    pub can_undo: bool,
    pub can_redo: bool,
    pub last_change: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GedcomExport {
    pub revision: u64,
    pub version: GedcomVersion,
    pub source_gedcom: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DocumentError {
    InvalidSource(String),
    InvalidCommand(String),
    RecordNotFound(String),
    RevisionConflict { expected: u64, actual: u64 },
    NothingToUndo,
    NothingToRedo,
    UnsupportedVersion(String),
}

impl Display for DocumentError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidSource(message) => write!(f, "invalid Genealogy Document: {message}"),
            Self::InvalidCommand(message) => write!(f, "invalid genealogy edit: {message}"),
            Self::RecordNotFound(id) => write!(f, "Person Record {id} does not exist"),
            Self::RevisionConflict { expected, actual } => write!(
                f,
                "this Local Tree changed in another session (expected revision {expected}, found {actual})"
            ),
            Self::NothingToUndo => write!(f, "there is no genealogy edit to undo"),
            Self::NothingToRedo => write!(f, "there is no genealogy edit to redo"),
            Self::UnsupportedVersion(value) => {
                write!(f, "unsupported GEDCOM export version: {value}")
            }
        }
    }
}

impl std::error::Error for DocumentError {}

impl From<GedcomError> for DocumentError {
    fn from(value: GedcomError) -> Self {
        Self::InvalidSource(value.to_string())
    }
}

#[derive(Debug, Clone)]
struct HistoryEntry {
    syntax: GedcomSyntax,
    label: String,
}

#[derive(Debug, Clone)]
pub struct GenealogyDocument {
    syntax: GedcomSyntax,
    revision: u64,
    history: Vec<HistoryEntry>,
    future: Vec<HistoryEntry>,
    reserved_ids: BTreeSet<String>,
    last_change: Option<String>,
}

impl GenealogyDocument {
    pub fn import(source: &str) -> Result<Self, DocumentError> {
        let syntax = GedcomSyntax::parse(source)?;
        validate_source(&syntax.serialize())?;
        let reserved_ids = syntax.xrefs();
        Ok(Self {
            syntax,
            revision: 0,
            history: Vec::new(),
            future: Vec::new(),
            reserved_ids,
            last_change: None,
        })
    }

    pub fn create(first_person: PersonInput) -> Result<Self, DocumentError> {
        let first_person = first_person.normalized()?;
        let syntax = GedcomSyntax::new_v7();
        let mut document = Self {
            syntax,
            revision: 0,
            history: Vec::new(),
            future: Vec::new(),
            reserved_ids: BTreeSet::new(),
            last_change: None,
        };
        let person_id = document.allocate_xref("I");
        document
            .syntax
            .insert_person_record(&person_id, &first_person)?;
        validate_source(&document.syntax.serialize())?;
        document.reserved_ids.insert(person_id);
        Ok(document)
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn snapshot(&self) -> Result<DocumentSnapshot, DocumentError> {
        let source_gedcom = self.syntax.serialize();
        let source_profile = profile_gedcom(&source_gedcom)?;
        let graph = parse_gedcom(&source_gedcom)?;
        Ok(DocumentSnapshot {
            revision: self.revision,
            source_gedcom,
            document: build_canonical_document(&graph, source_profile),
            can_undo: !self.history.is_empty(),
            can_redo: !self.future.is_empty(),
            last_change: self.last_change.clone(),
        })
    }

    pub fn person(&self, person_id: &str) -> Result<EditablePerson, DocumentError> {
        self.syntax
            .editable_person(person_id)
            .ok_or_else(|| DocumentError::RecordNotFound(person_id.to_string()))
    }

    pub fn apply(
        &mut self,
        command: DocumentCommand,
        expected_revision: u64,
    ) -> Result<DocumentSnapshot, DocumentError> {
        self.assert_revision(expected_revision)?;
        let mut next = self.syntax.clone();
        let label = match command {
            DocumentCommand::UpdatePerson { person_id, person } => {
                let person = person.normalized()?;
                next.update_person(&person_id, &person)?;
                format!("Edited {}", display_name(&person))
            }
            DocumentCommand::AddRelative {
                person_id,
                relationship,
                person,
                pedigree,
                family_id,
                primary_role,
            } => {
                if !next.has_record(&person_id, "INDI") {
                    return Err(DocumentError::RecordNotFound(person_id));
                }
                let person = person.normalized()?;
                let relative_id = self.allocate_xref("I");
                next.insert_person_record(&relative_id, &person)?;
                let family_id = next.add_relative(
                    RelativeLink {
                        primary_id: &person_id,
                        relative_id: &relative_id,
                        relationship,
                        pedigree: normalized_pedigree(pedigree.as_deref()),
                        requested_family_id: family_id.as_deref(),
                        primary_role,
                    },
                    || self.allocate_xref("F"),
                )?;
                self.reserved_ids.insert(relative_id);
                self.reserved_ids.insert(family_id);
                format!(
                    "Added {} as a {}",
                    display_name(&person),
                    relative_label(relationship)
                )
            }
            DocumentCommand::DeletePerson { person_id } => {
                let person = next
                    .editable_person(&person_id)
                    .ok_or_else(|| DocumentError::RecordNotFound(person_id.clone()))?;
                next.delete_person(&person_id)?;
                format!("Deleted {}", person.display_name)
            }
        };
        let source = next.serialize();
        validate_source(&source)?;
        if source == self.syntax.serialize() {
            return Err(DocumentError::InvalidCommand(
                "This edit would not change the Genealogy Document.".to_string(),
            ));
        }
        self.push_history(HistoryEntry {
            syntax: self.syntax.clone(),
            label: label.clone(),
        });
        self.syntax = next;
        self.future.clear();
        self.revision = self.revision.saturating_add(1);
        self.last_change = Some(label);
        self.snapshot()
    }

    pub fn undo(&mut self, expected_revision: u64) -> Result<DocumentSnapshot, DocumentError> {
        self.assert_revision(expected_revision)?;
        let previous = self.history.pop().ok_or(DocumentError::NothingToUndo)?;
        let undone_label = previous.label.clone();
        self.future.push(HistoryEntry {
            syntax: self.syntax.clone(),
            label: undone_label.clone(),
        });
        self.syntax = previous.syntax;
        self.revision = self.revision.saturating_add(1);
        self.last_change = Some(format!("Undid {undone_label}"));
        self.snapshot()
    }

    pub fn redo(&mut self, expected_revision: u64) -> Result<DocumentSnapshot, DocumentError> {
        self.assert_revision(expected_revision)?;
        let next = self.future.pop().ok_or(DocumentError::NothingToRedo)?;
        let redone_label = next.label.clone();
        self.push_history(HistoryEntry {
            syntax: self.syntax.clone(),
            label: redone_label.clone(),
        });
        self.syntax = next.syntax;
        self.revision = self.revision.saturating_add(1);
        self.last_change = Some(format!("Redid {redone_label}"));
        self.snapshot()
    }

    pub fn export(&self, version: GedcomVersion) -> Result<GedcomExport, DocumentError> {
        let mut syntax = self.syntax.clone();
        syntax.set_header_version(version)?;
        let mut warnings = Vec::new();
        if version == GedcomVersion::V551
            && self
                .syntax
                .header_version()
                .is_some_and(|source| source.starts_with('7'))
        {
            warnings.push(
                "GEDCOM 5.5.1 has fewer standard structures than GEDCOM 7. GeneaQuilt preserved extension and unsupported records instead of silently discarding them."
                    .to_string(),
            );
        }
        Ok(GedcomExport {
            revision: self.revision,
            version,
            source_gedcom: syntax.serialize(),
            warnings,
        })
    }

    fn assert_revision(&self, expected_revision: u64) -> Result<(), DocumentError> {
        if self.revision != expected_revision {
            return Err(DocumentError::RevisionConflict {
                expected: expected_revision,
                actual: self.revision,
            });
        }
        Ok(())
    }

    fn allocate_xref(&mut self, prefix: &str) -> String {
        let source = self.syntax.serialize();
        for salt in 0_u64.. {
            let hash =
                stable_hash(format!("{prefix}\0{}\0{salt}\0{source}", self.revision).as_bytes());
            let candidate = format!("@{prefix}{hash:016X}@");
            if !self.reserved_ids.contains(&candidate) && !self.syntax.has_xref(&candidate) {
                return candidate;
            }
        }
        unreachable!("the xref namespace is effectively unbounded")
    }

    fn push_history(&mut self, entry: HistoryEntry) {
        self.history.push(entry);
        if self.history.len() > HISTORY_LIMIT {
            self.history.remove(0);
        }
    }
}

fn validate_source(source: &str) -> Result<(), DocumentError> {
    let graph = parse_gedcom(source)?;
    let analysis = analyze_document(&graph);
    if analysis.blocks_interactive {
        let message = analysis
            .findings
            .iter()
            .filter(|finding| finding.blocks_interactive)
            .map(|finding| finding.message.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        return Err(DocumentError::InvalidCommand(message));
    }
    Ok(())
}

#[derive(Debug, Clone)]
struct GedcomSyntax {
    lines: Vec<SyntaxLine>,
    preferred_ending: String,
}

struct RelativeLink<'a> {
    primary_id: &'a str,
    relative_id: &'a str,
    relationship: RelativeKind,
    pedigree: Option<String>,
    requested_family_id: Option<&'a str>,
    primary_role: Option<FamilyRole>,
}

#[derive(Debug, Clone)]
struct SyntaxLine {
    content: String,
    ending: String,
    parsed: Option<OwnedGedcomLine>,
}

#[derive(Debug, Clone)]
struct OwnedGedcomLine {
    level: usize,
    xref: Option<String>,
    tag: String,
    value: String,
}

impl GedcomSyntax {
    fn parse(source: &str) -> Result<Self, DocumentError> {
        if source.trim().is_empty() {
            return Err(DocumentError::InvalidSource(
                "Choose a non-empty GEDCOM family tree file.".to_string(),
            ));
        }
        let pieces = source_lines(source);
        let preferred_ending = pieces
            .iter()
            .find_map(|(_, ending)| (!ending.is_empty()).then_some(ending.clone()))
            .unwrap_or_else(|| "\n".to_string());
        let mut lines = Vec::with_capacity(pieces.len());
        for (content, ending) in pieces {
            let trimmed = content.trim();
            let parsed = if trimmed.is_empty() {
                None
            } else {
                let line = parse_line(trimmed)?;
                Some(OwnedGedcomLine {
                    level: line.level,
                    xref: line.xref,
                    tag: line.tag,
                    value: line.value,
                })
            };
            lines.push(SyntaxLine {
                content,
                ending,
                parsed,
            });
        }
        Ok(Self {
            lines,
            preferred_ending,
        })
    }

    fn new_v7() -> Self {
        Self {
            preferred_ending: "\n".to_string(),
            lines: [
                (0, None, "HEAD", ""),
                (1, None, "SOUR", "GeneaQuilt"),
                (2, None, "VERS", env!("CARGO_PKG_VERSION")),
                (2, None, "NAME", "GeneaQuilt"),
                (1, None, "GEDC", ""),
                (2, None, "VERS", "7.0"),
                (1, None, "CHAR", "UTF-8"),
                (0, None, "TRLR", ""),
            ]
            .into_iter()
            .map(|(level, xref, tag, value)| {
                SyntaxLine::new(level, xref, tag, value, "\n".to_string())
            })
            .collect(),
        }
    }

    fn serialize(&self) -> String {
        let mut output = String::new();
        for line in &self.lines {
            output.push_str(&line.content);
            output.push_str(&line.ending);
        }
        output
    }

    fn xrefs(&self) -> BTreeSet<String> {
        self.lines
            .iter()
            .filter_map(|line| line.parsed.as_ref()?.xref.clone())
            .collect()
    }

    fn has_xref(&self, id: &str) -> bool {
        self.lines.iter().any(|line| {
            line.parsed
                .as_ref()
                .is_some_and(|parsed| parsed.xref.as_deref() == Some(id))
        })
    }

    fn has_record(&self, id: &str, tag: &str) -> bool {
        self.record_range(Some(id), tag).is_some()
    }

    fn record_range(&self, xref: Option<&str>, tag: &str) -> Option<Range<usize>> {
        let start = self.lines.iter().position(|line| {
            line.parsed.as_ref().is_some_and(|parsed| {
                parsed.level == 0 && parsed.xref.as_deref() == xref && parsed.tag == tag
            })
        })?;
        let end = self.lines[start + 1..]
            .iter()
            .position(|line| line.parsed.as_ref().is_some_and(|parsed| parsed.level == 0))
            .map_or(self.lines.len(), |offset| start + 1 + offset);
        Some(start..end)
    }

    fn editable_person(&self, person_id: &str) -> Option<EditablePerson> {
        let range = self.record_range(Some(person_id), "INDI")?;
        let name_range = self.first_level_one_range(range.clone(), "NAME");
        let name_value = name_range
            .as_ref()
            .and_then(|name| self.lines.get(name.start))
            .and_then(|line| line.parsed.as_ref())
            .map(|line| line.value.as_str())
            .unwrap_or("");
        let (fallback_given, fallback_surname) = split_name(name_value);
        let given_names = name_range
            .as_ref()
            .and_then(|name| self.child_value(name.clone(), "GIVN"))
            .unwrap_or(fallback_given);
        let surname = name_range
            .as_ref()
            .and_then(|name| self.child_value(name.clone(), "SURN"))
            .unwrap_or(fallback_surname);
        let display_name = [given_names.as_str(), surname.as_str()]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        Some(EditablePerson {
            id: person_id.to_string(),
            given_names,
            surname,
            display_name: if display_name.is_empty() {
                person_id.to_string()
            } else {
                display_name
            },
            sex: self.level_one_value(range.clone(), "SEX"),
            birth_date: self.event_child_value(range.clone(), "BIRT", "DATE"),
            birth_place: self.event_child_value(range.clone(), "BIRT", "PLAC"),
            death_date: self.event_child_value(range.clone(), "DEAT", "DATE"),
            death_place: self.event_child_value(range.clone(), "DEAT", "PLAC"),
            parent_family_ids: self.level_one_values(range.clone(), "FAMC"),
            spouse_family_ids: self.level_one_values(range, "FAMS"),
        })
    }

    fn update_person(
        &mut self,
        person_id: &str,
        person: &PersonInput,
    ) -> Result<(), DocumentError> {
        if !self.has_record(person_id, "INDI") {
            return Err(DocumentError::RecordNotFound(person_id.to_string()));
        }
        self.set_name(person_id, &person.given_names, &person.surname)?;
        self.set_simple_value(person_id, "INDI", "SEX", person.sex.as_deref())?;
        self.set_event(
            person_id,
            "INDI",
            "BIRT",
            &person.birth_date,
            &person.birth_place,
        )?;
        self.set_event(
            person_id,
            "INDI",
            "DEAT",
            &person.death_date,
            &person.death_place,
        )?;
        Ok(())
    }

    fn insert_person_record(
        &mut self,
        person_id: &str,
        person: &PersonInput,
    ) -> Result<(), DocumentError> {
        if self.has_xref(person_id) {
            return Err(DocumentError::InvalidCommand(format!(
                "Record identifier {person_id} is already in use."
            )));
        }
        let mut record = vec![SyntaxLine::new(
            0,
            Some(person_id),
            "INDI",
            "",
            self.preferred_ending.clone(),
        )];
        record.extend(name_lines(
            &person.given_names,
            &person.surname,
            &self.preferred_ending,
        ));
        if let Some(sex) = person.sex.as_deref() {
            record.push(SyntaxLine::new(
                1,
                None,
                "SEX",
                sex,
                self.preferred_ending.clone(),
            ));
        }
        record.extend(event_lines(
            "BIRT",
            &person.birth_date,
            &person.birth_place,
            &self.preferred_ending,
        ));
        record.extend(event_lines(
            "DEAT",
            &person.death_date,
            &person.death_place,
            &self.preferred_ending,
        ));
        self.insert_record(record);
        Ok(())
    }

    fn add_relative(
        &mut self,
        link: RelativeLink<'_>,
        mut allocate_family_id: impl FnMut() -> String,
    ) -> Result<String, DocumentError> {
        let RelativeLink {
            primary_id,
            relative_id,
            relationship,
            pedigree,
            requested_family_id,
            primary_role,
        } = link;
        match relationship {
            RelativeKind::Spouse => {
                let family_id = allocate_family_id();
                let (primary_tag, relative_tag) =
                    self.pair_roles(primary_id, relative_id, primary_role);
                self.insert_family_record(
                    &family_id,
                    Some((primary_tag, primary_id)),
                    Some((relative_tag, relative_id)),
                    &[],
                );
                self.add_level_one_link(primary_id, "INDI", "FAMS", &family_id, None)?;
                self.add_level_one_link(relative_id, "INDI", "FAMS", &family_id, None)?;
                Ok(family_id)
            }
            RelativeKind::Parent => {
                let parent_families = self.level_one_values(
                    self.record_range(Some(primary_id), "INDI")
                        .ok_or_else(|| DocumentError::RecordNotFound(primary_id.to_string()))?,
                    "FAMC",
                );
                let family_id = requested_family_id
                    .filter(|id| parent_families.iter().any(|candidate| candidate == id))
                    .and_then(|id| self.family_with_available_role(id, relative_id))
                    .or_else(|| {
                        parent_families
                            .iter()
                            .find_map(|id| self.family_with_available_role(id, relative_id))
                    });
                if let Some((family_id, role)) = family_id {
                    self.set_simple_value(&family_id, "FAM", role, Some(relative_id))?;
                    self.add_level_one_link(relative_id, "INDI", "FAMS", &family_id, None)?;
                    return Ok(family_id);
                }
                let family_id = allocate_family_id();
                let role = self.preferred_role(relative_id, None);
                self.insert_family_record(
                    &family_id,
                    Some((role, relative_id)),
                    None,
                    &[primary_id],
                );
                self.add_level_one_link(relative_id, "INDI", "FAMS", &family_id, None)?;
                self.add_level_one_link(
                    primary_id,
                    "INDI",
                    "FAMC",
                    &family_id,
                    pedigree.as_deref(),
                )?;
                Ok(family_id)
            }
            RelativeKind::Child => {
                let spouse_families = self.level_one_values(
                    self.record_range(Some(primary_id), "INDI")
                        .ok_or_else(|| DocumentError::RecordNotFound(primary_id.to_string()))?,
                    "FAMS",
                );
                let existing = requested_family_id
                    .filter(|id| spouse_families.iter().any(|candidate| candidate == id))
                    .map(str::to_string)
                    .or_else(|| (spouse_families.len() == 1).then(|| spouse_families[0].clone()));
                let family_id = if let Some(family_id) = existing {
                    self.add_level_one_link(&family_id, "FAM", "CHIL", relative_id, None)?;
                    family_id
                } else {
                    let family_id = allocate_family_id();
                    let role = primary_role
                        .map(role_tag)
                        .unwrap_or_else(|| self.preferred_role(primary_id, None));
                    self.insert_family_record(
                        &family_id,
                        Some((role, primary_id)),
                        None,
                        &[relative_id],
                    );
                    self.add_level_one_link(primary_id, "INDI", "FAMS", &family_id, None)?;
                    family_id
                };
                self.add_level_one_link(
                    relative_id,
                    "INDI",
                    "FAMC",
                    &family_id,
                    pedigree.as_deref(),
                )?;
                Ok(family_id)
            }
            RelativeKind::Sibling => {
                let parent_families = self.level_one_values(
                    self.record_range(Some(primary_id), "INDI")
                        .ok_or_else(|| DocumentError::RecordNotFound(primary_id.to_string()))?,
                    "FAMC",
                );
                if parent_families.is_empty() {
                    return Err(DocumentError::InvalidCommand(
                        "Add a parent before adding a sibling.".to_string(),
                    ));
                }
                let family_id = match requested_family_id {
                    Some(id) if parent_families.iter().any(|candidate| candidate == id) => {
                        id.to_string()
                    }
                    Some(_) => {
                        return Err(DocumentError::InvalidCommand(
                            "The selected parent family does not belong to this person."
                                .to_string(),
                        ));
                    }
                    None if parent_families.len() == 1 => parent_families[0].clone(),
                    None => {
                        return Err(DocumentError::InvalidCommand(
                            "Choose which parent family the sibling belongs to.".to_string(),
                        ));
                    }
                };
                self.add_level_one_link(&family_id, "FAM", "CHIL", relative_id, None)?;
                self.add_level_one_link(
                    relative_id,
                    "INDI",
                    "FAMC",
                    &family_id,
                    pedigree.as_deref(),
                )?;
                Ok(family_id)
            }
        }
    }

    fn delete_person(&mut self, person_id: &str) -> Result<(), DocumentError> {
        let person_range = self
            .record_range(Some(person_id), "INDI")
            .ok_or_else(|| DocumentError::RecordNotFound(person_id.to_string()))?;
        self.lines.drain(person_range);

        let family_ids = self
            .lines
            .iter()
            .filter_map(|line| {
                let parsed = line.parsed.as_ref()?;
                (parsed.level == 0 && parsed.tag == "FAM")
                    .then(|| parsed.xref.clone())
                    .flatten()
            })
            .collect::<Vec<_>>();
        let mut deleted_families = Vec::new();
        for family_id in family_ids {
            for tag in ["HUSB", "WIFE", "CHIL"] {
                self.remove_level_one_link(&family_id, "FAM", tag, person_id)?;
            }
            let range = self
                .record_range(Some(&family_id), "FAM")
                .ok_or_else(|| DocumentError::InvalidSource(family_id.clone()))?;
            let has_parent = ["HUSB", "WIFE"]
                .iter()
                .any(|tag| self.level_one_value(range.clone(), tag).is_some());
            if !has_parent {
                deleted_families.push(family_id);
            }
        }
        for family_id in &deleted_families {
            if let Some(range) = self.record_range(Some(family_id), "FAM") {
                self.lines.drain(range);
            }
        }

        let person_ids = self
            .lines
            .iter()
            .filter_map(|line| {
                let parsed = line.parsed.as_ref()?;
                (parsed.level == 0 && parsed.tag == "INDI")
                    .then(|| parsed.xref.clone())
                    .flatten()
            })
            .collect::<Vec<_>>();
        for id in person_ids {
            for family_id in &deleted_families {
                self.remove_level_one_link(&id, "INDI", "FAMC", family_id)?;
                self.remove_level_one_link(&id, "INDI", "FAMS", family_id)?;
            }
        }
        Ok(())
    }

    fn set_header_version(&mut self, version: GedcomVersion) -> Result<(), DocumentError> {
        let head = self.record_range(None, "HEAD").ok_or_else(|| {
            DocumentError::InvalidSource("The GEDCOM header is missing.".to_string())
        })?;
        let gedc = self
            .first_level_one_range(head.clone(), "GEDC")
            .unwrap_or_else(|| {
                let index = head.end;
                self.lines.insert(
                    index,
                    SyntaxLine::new(1, None, "GEDC", "", self.preferred_ending.clone()),
                );
                index..index + 1
            });
        self.set_child_value(gedc, "VERS", Some(version.header_value()));
        let refreshed = self.record_range(None, "HEAD").ok_or_else(|| {
            DocumentError::InvalidSource("The GEDCOM header is missing.".to_string())
        })?;
        self.set_level_one_value_in_range(refreshed, "CHAR", Some("UTF-8"));
        Ok(())
    }

    fn header_version(&self) -> Option<String> {
        let head = self.record_range(None, "HEAD")?;
        let gedc = self.first_level_one_range(head, "GEDC")?;
        self.child_value(gedc, "VERS")
    }

    fn set_name(
        &mut self,
        person_id: &str,
        given_names: &str,
        surname: &str,
    ) -> Result<(), DocumentError> {
        let record = self
            .record_range(Some(person_id), "INDI")
            .ok_or_else(|| DocumentError::RecordNotFound(person_id.to_string()))?;
        let display = gedcom_name(given_names, surname);
        let name_range = if let Some(range) = self.first_level_one_range(record.clone(), "NAME") {
            self.replace_line(range.start, 1, None, "NAME", &display);
            range
        } else {
            let index = record.start + 1;
            self.lines.insert(
                index,
                SyntaxLine::new(1, None, "NAME", &display, self.preferred_ending.clone()),
            );
            index..index + 1
        };
        self.set_child_value(
            name_range.clone(),
            "GIVN",
            (!given_names.is_empty()).then_some(given_names),
        );
        let refreshed = self
            .first_level_one_range(
                self.record_range(Some(person_id), "INDI")
                    .ok_or_else(|| DocumentError::RecordNotFound(person_id.to_string()))?,
                "NAME",
            )
            .ok_or_else(|| DocumentError::InvalidSource(person_id.to_string()))?;
        self.set_child_value(refreshed, "SURN", (!surname.is_empty()).then_some(surname));
        Ok(())
    }

    fn set_simple_value(
        &mut self,
        record_id: &str,
        record_tag: &str,
        tag: &str,
        value: Option<&str>,
    ) -> Result<(), DocumentError> {
        let range = self
            .record_range(Some(record_id), record_tag)
            .ok_or_else(|| DocumentError::InvalidSource(record_id.to_string()))?;
        self.set_level_one_value_in_range(range, tag, value);
        Ok(())
    }

    fn set_level_one_value_in_range(
        &mut self,
        record: Range<usize>,
        tag: &str,
        value: Option<&str>,
    ) {
        if let Some(existing) = self.first_level_one_range(record.clone(), tag) {
            if let Some(value) = value.filter(|value| !value.is_empty()) {
                self.replace_line(existing.start, 1, None, tag, value);
            } else {
                self.lines.drain(existing);
            }
            return;
        }
        let Some(value) = value.filter(|value| !value.is_empty()) else {
            return;
        };
        self.lines.insert(
            record.end,
            SyntaxLine::new(1, None, tag, value, self.preferred_ending.clone()),
        );
    }

    fn set_event(
        &mut self,
        record_id: &str,
        record_tag: &str,
        event_tag: &str,
        date: &str,
        place: &str,
    ) -> Result<(), DocumentError> {
        let record = self
            .record_range(Some(record_id), record_tag)
            .ok_or_else(|| DocumentError::InvalidSource(record_id.to_string()))?;
        let has_value = !date.is_empty() || !place.is_empty();
        let event = self.first_level_one_range(record.clone(), event_tag);
        if !has_value {
            if let Some(event) = event {
                self.remove_child_tag(event.clone(), "DATE");
                let refreshed = self
                    .record_range(Some(record_id), record_tag)
                    .and_then(|range| self.first_level_one_range(range, event_tag));
                if let Some(refreshed) = refreshed {
                    self.remove_child_tag(refreshed.clone(), "PLAC");
                    let still_has_children = self.lines[refreshed.start + 1..refreshed.end]
                        .iter()
                        .any(|line| line.parsed.is_some());
                    let has_event_value = self.lines[refreshed.start]
                        .parsed
                        .as_ref()
                        .is_some_and(|line| !line.value.is_empty());
                    if !still_has_children && !has_event_value {
                        self.lines.drain(refreshed);
                    }
                }
            }
            return Ok(());
        }
        let event = if let Some(event) = event {
            event
        } else {
            let index = record.end;
            self.lines.insert(
                index,
                SyntaxLine::new(1, None, event_tag, "", self.preferred_ending.clone()),
            );
            index..index + 1
        };
        self.set_child_value(event.clone(), "DATE", (!date.is_empty()).then_some(date));
        let refreshed = self
            .record_range(Some(record_id), record_tag)
            .and_then(|range| self.first_level_one_range(range, event_tag))
            .ok_or_else(|| DocumentError::InvalidSource(record_id.to_string()))?;
        self.set_child_value(refreshed, "PLAC", (!place.is_empty()).then_some(place));
        Ok(())
    }

    fn set_child_value(&mut self, parent: Range<usize>, tag: &str, value: Option<&str>) {
        let existing = (parent.start + 1..parent.end).find(|index| {
            self.lines[*index]
                .parsed
                .as_ref()
                .is_some_and(|line| line.level == 2 && line.tag == tag)
        });
        match (existing, value.filter(|value| !value.is_empty())) {
            (Some(index), Some(value)) => self.replace_line(index, 2, None, tag, value),
            (Some(index), None) => {
                let end = self.subtree_end(index, parent.end);
                self.lines.drain(index..end);
            }
            (None, Some(value)) => self.lines.insert(
                parent.end,
                SyntaxLine::new(2, None, tag, value, self.preferred_ending.clone()),
            ),
            (None, None) => {}
        }
    }

    fn remove_child_tag(&mut self, parent: Range<usize>, tag: &str) {
        if let Some(index) = (parent.start + 1..parent.end).find(|index| {
            self.lines[*index]
                .parsed
                .as_ref()
                .is_some_and(|line| line.level == 2 && line.tag == tag)
        }) {
            let end = self.subtree_end(index, parent.end);
            self.lines.drain(index..end);
        }
    }

    fn child_value(&self, parent: Range<usize>, tag: &str) -> Option<String> {
        self.lines[parent.start + 1..parent.end]
            .iter()
            .filter_map(|line| line.parsed.as_ref())
            .find(|line| line.level == 2 && line.tag == tag)
            .map(|line| line.value.clone())
    }

    fn event_child_value(&self, record: Range<usize>, event: &str, child: &str) -> String {
        self.first_level_one_range(record, event)
            .and_then(|range| self.child_value(range, child))
            .unwrap_or_default()
    }

    fn first_level_one_range(&self, record: Range<usize>, tag: &str) -> Option<Range<usize>> {
        let start = (record.start + 1..record.end).find(|index| {
            self.lines[*index]
                .parsed
                .as_ref()
                .is_some_and(|line| line.level == 1 && line.tag == tag)
        })?;
        Some(start..self.subtree_end(start, record.end))
    }

    fn subtree_end(&self, start: usize, limit: usize) -> usize {
        let level = self.lines[start]
            .parsed
            .as_ref()
            .map_or(usize::MAX, |line| line.level);
        (start + 1..limit)
            .find(|index| {
                self.lines[*index]
                    .parsed
                    .as_ref()
                    .is_some_and(|line| line.level <= level)
            })
            .unwrap_or(limit)
    }

    fn level_one_value(&self, record: Range<usize>, tag: &str) -> Option<String> {
        self.lines[record.start + 1..record.end]
            .iter()
            .filter_map(|line| line.parsed.as_ref())
            .find(|line| line.level == 1 && line.tag == tag)
            .map(|line| line.value.clone())
    }

    fn level_one_values(&self, record: Range<usize>, tag: &str) -> Vec<String> {
        self.lines[record.start + 1..record.end]
            .iter()
            .filter_map(|line| line.parsed.as_ref())
            .filter(|line| line.level == 1 && line.tag == tag && !line.value.is_empty())
            .map(|line| line.value.clone())
            .collect()
    }

    fn add_level_one_link(
        &mut self,
        record_id: &str,
        record_tag: &str,
        tag: &str,
        value: &str,
        child_value: Option<&str>,
    ) -> Result<(), DocumentError> {
        let record = self
            .record_range(Some(record_id), record_tag)
            .ok_or_else(|| DocumentError::InvalidSource(record_id.to_string()))?;
        if self.lines[record.start + 1..record.end]
            .iter()
            .filter_map(|line| line.parsed.as_ref())
            .any(|line| line.level == 1 && line.tag == tag && line.value == value)
        {
            return Ok(());
        }
        let index = record.end;
        self.lines.insert(
            index,
            SyntaxLine::new(1, None, tag, value, self.preferred_ending.clone()),
        );
        if let Some(child_value) = child_value.filter(|value| !value.is_empty()) {
            self.lines.insert(
                index + 1,
                SyntaxLine::new(2, None, "PEDI", child_value, self.preferred_ending.clone()),
            );
        }
        Ok(())
    }

    fn remove_level_one_link(
        &mut self,
        record_id: &str,
        record_tag: &str,
        tag: &str,
        value: &str,
    ) -> Result<(), DocumentError> {
        let Some(record) = self.record_range(Some(record_id), record_tag) else {
            return Ok(());
        };
        let starts = (record.start + 1..record.end)
            .filter(|index| {
                self.lines[*index]
                    .parsed
                    .as_ref()
                    .is_some_and(|line| line.level == 1 && line.tag == tag && line.value == value)
            })
            .collect::<Vec<_>>();
        for start in starts.into_iter().rev() {
            let end = self.subtree_end(start, self.lines.len());
            self.lines.drain(start..end);
        }
        Ok(())
    }

    fn insert_family_record(
        &mut self,
        family_id: &str,
        first_parent: Option<(&str, &str)>,
        second_parent: Option<(&str, &str)>,
        children: &[&str],
    ) {
        let mut record = vec![SyntaxLine::new(
            0,
            Some(family_id),
            "FAM",
            "",
            self.preferred_ending.clone(),
        )];
        for (tag, id) in first_parent.into_iter().chain(second_parent) {
            record.push(SyntaxLine::new(
                1,
                None,
                tag,
                id,
                self.preferred_ending.clone(),
            ));
        }
        for child in children {
            record.push(SyntaxLine::new(
                1,
                None,
                "CHIL",
                child,
                self.preferred_ending.clone(),
            ));
        }
        self.insert_record(record);
    }

    fn insert_record(&mut self, record: Vec<SyntaxLine>) {
        let index = self
            .record_range(None, "TRLR")
            .map_or(self.lines.len(), |range| range.start);
        self.lines.splice(index..index, record);
    }

    fn pair_roles(
        &self,
        primary_id: &str,
        relative_id: &str,
        primary_role: Option<FamilyRole>,
    ) -> (&'static str, &'static str) {
        let primary = primary_role
            .map(role_tag)
            .unwrap_or_else(|| self.preferred_role(primary_id, Some(relative_id)));
        if primary == "WIFE" {
            ("WIFE", "HUSB")
        } else {
            ("HUSB", "WIFE")
        }
    }

    fn preferred_role(&self, person_id: &str, other_id: Option<&str>) -> &'static str {
        let sex = self
            .record_range(Some(person_id), "INDI")
            .and_then(|range| self.level_one_value(range, "SEX"));
        if sex.as_deref() == Some("F") {
            return "WIFE";
        }
        if sex.as_deref() == Some("M") {
            return "HUSB";
        }
        let other_sex = other_id
            .and_then(|id| self.record_range(Some(id), "INDI"))
            .and_then(|range| self.level_one_value(range, "SEX"));
        if other_sex.as_deref() == Some("M") {
            "WIFE"
        } else {
            "HUSB"
        }
    }

    fn family_with_available_role(
        &self,
        family_id: &str,
        person_id: &str,
    ) -> Option<(String, &'static str)> {
        let range = self.record_range(Some(family_id), "FAM")?;
        let husband = self.level_one_value(range.clone(), "HUSB");
        let wife = self.level_one_value(range, "WIFE");
        let preferred = self.preferred_role(person_id, None);
        let role = match (preferred, husband.is_none(), wife.is_none()) {
            ("HUSB", true, _) => "HUSB",
            ("WIFE", _, true) => "WIFE",
            (_, true, _) => "HUSB",
            (_, _, true) => "WIFE",
            _ => return None,
        };
        Some((family_id.to_string(), role))
    }

    fn replace_line(
        &mut self,
        index: usize,
        level: usize,
        xref: Option<&str>,
        tag: &str,
        value: &str,
    ) {
        let ending = self.lines[index].ending.clone();
        self.lines[index] = SyntaxLine::new(level, xref, tag, value, ending);
    }
}

impl SyntaxLine {
    fn new(level: usize, xref: Option<&str>, tag: &str, value: &str, ending: String) -> Self {
        let parsed = OwnedGedcomLine {
            level,
            xref: xref.map(str::to_string),
            tag: tag.to_string(),
            value: value.to_string(),
        };
        let content = render_line(&parsed);
        Self {
            content,
            ending,
            parsed: Some(parsed),
        }
    }
}

fn source_lines(source: &str) -> Vec<(String, String)> {
    let bytes = source.as_bytes();
    let mut result = Vec::new();
    let mut start = 0;
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'\n' {
            result.push((source[start..index].to_string(), "\n".to_string()));
            index += 1;
            start = index;
            continue;
        }
        if bytes[index] == b'\r' {
            let end = index;
            index += 1;
            let ending = if index < bytes.len() && bytes[index] == b'\n' {
                index += 1;
                "\r\n"
            } else {
                "\r"
            };
            result.push((source[start..end].to_string(), ending.to_string()));
            start = index;
            continue;
        }
        index += 1;
    }
    if start < source.len() {
        result.push((source[start..].to_string(), String::new()));
    }
    if result.is_empty() {
        result.push((String::new(), String::new()));
    }
    result
}

fn render_line(line: &OwnedGedcomLine) -> String {
    let mut parts = vec![line.level.to_string()];
    if let Some(xref) = &line.xref {
        parts.push(xref.clone());
    }
    parts.push(line.tag.clone());
    if !line.value.is_empty() {
        parts.push(line.value.clone());
    }
    parts.join(" ")
}

fn name_lines(given_names: &str, surname: &str, ending: &str) -> Vec<SyntaxLine> {
    let mut lines = vec![SyntaxLine::new(
        1,
        None,
        "NAME",
        &gedcom_name(given_names, surname),
        ending.to_string(),
    )];
    if !given_names.is_empty() {
        lines.push(SyntaxLine::new(
            2,
            None,
            "GIVN",
            given_names,
            ending.to_string(),
        ));
    }
    if !surname.is_empty() {
        lines.push(SyntaxLine::new(
            2,
            None,
            "SURN",
            surname,
            ending.to_string(),
        ));
    }
    lines
}

fn event_lines(tag: &str, date: &str, place: &str, ending: &str) -> Vec<SyntaxLine> {
    if date.is_empty() && place.is_empty() {
        return Vec::new();
    }
    let mut lines = vec![SyntaxLine::new(1, None, tag, "", ending.to_string())];
    if !date.is_empty() {
        lines.push(SyntaxLine::new(2, None, "DATE", date, ending.to_string()));
    }
    if !place.is_empty() {
        lines.push(SyntaxLine::new(2, None, "PLAC", place, ending.to_string()));
    }
    lines
}

fn gedcom_name(given_names: &str, surname: &str) -> String {
    match (given_names.is_empty(), surname.is_empty()) {
        (false, false) => format!("{given_names} /{surname}/"),
        (false, true) => given_names.to_string(),
        (true, false) => format!("/{surname}/"),
        (true, true) => "Unnamed".to_string(),
    }
}

fn split_name(value: &str) -> (String, String) {
    if let Some(first) = value.find('/')
        && let Some(second_relative) = value[first + 1..].find('/')
    {
        let second = first + 1 + second_relative;
        return (
            value[..first].trim().to_string(),
            value[first + 1..second].trim().to_string(),
        );
    }
    (value.trim().to_string(), String::new())
}

fn display_name(person: &PersonInput) -> String {
    [person.given_names.as_str(), person.surname.as_str()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn single_line(value: &str) -> String {
    value
        .replace(['\r', '\n'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalized_pedigree(value: Option<&str>) -> Option<String> {
    let value = value.map(single_line)?.to_ascii_lowercase();
    match value.as_str() {
        "" | "birth" | "biological" => None,
        "adopted" | "adoptive" => Some("adopted".to_string()),
        "foster" => Some("foster".to_string()),
        "sealing" => Some("sealing".to_string()),
        other => Some(other.to_string()),
    }
}

fn role_tag(role: FamilyRole) -> &'static str {
    match role {
        FamilyRole::Husband => "HUSB",
        FamilyRole::Wife => "WIFE",
    }
}

fn relative_label(kind: RelativeKind) -> &'static str {
    match kind {
        RelativeKind::Parent => "parent",
        RelativeKind::Spouse => "spouse",
        RelativeKind::Child => "child",
        RelativeKind::Sibling => "sibling",
    }
}

fn stable_hash(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::{
        DocumentCommand, FamilyRole, GedcomVersion, GenealogyDocument, PersonInput, RelativeKind,
    };

    fn person(given_names: &str, surname: &str, sex: &str) -> PersonInput {
        PersonInput {
            given_names: given_names.to_string(),
            surname: surname.to_string(),
            sex: (!sex.is_empty()).then(|| sex.to_string()),
            birth_date: String::new(),
            birth_place: String::new(),
            death_date: String::new(),
            death_place: String::new(),
        }
    }

    #[test]
    fn creates_edits_and_exports_a_gedcom_7_document() {
        let mut document = GenealogyDocument::create(person("Miriam", "Cohen", "F")).unwrap();
        let first = document.snapshot().unwrap();
        assert!(first.source_gedcom.contains("2 VERS 7.0"));
        let person_id = first.document.people[0].id.clone();

        let edited = document
            .apply(
                DocumentCommand::UpdatePerson {
                    person_id: person_id.clone(),
                    person: PersonInput {
                        birth_date: "12 MAY 1915".to_string(),
                        birth_place: "New York, New York, USA".to_string(),
                        ..person("Miriam", "Cohen", "F")
                    },
                },
                0,
            )
            .unwrap();
        assert!(edited.source_gedcom.contains("2 DATE 12 MAY 1915"));
        assert!(
            edited
                .source_gedcom
                .contains("2 PLAC New York, New York, USA")
        );
        assert_eq!(
            edited.document.people[0].birth_place.as_deref(),
            Some("New York, New York, USA")
        );

        let legacy = document.export(GedcomVersion::V551).unwrap();
        assert!(legacy.source_gedcom.contains("2 VERS 5.5.1"));
        assert_eq!(legacy.warnings.len(), 1);
    }

    #[test]
    fn adds_reciprocal_spouse_and_child_relationships_and_undoes_them() {
        let mut document = GenealogyDocument::create(person("Miriam", "Cohen", "F")).unwrap();
        let miriam = document.snapshot().unwrap().document.people[0].id.clone();
        let spouse_snapshot = document
            .apply(
                DocumentCommand::AddRelative {
                    person_id: miriam.clone(),
                    relationship: RelativeKind::Spouse,
                    person: person("Joseph", "Stein", "M"),
                    pedigree: None,
                    family_id: None,
                    primary_role: Some(FamilyRole::Wife),
                },
                0,
            )
            .unwrap();
        assert_eq!(spouse_snapshot.document.people.len(), 2);
        assert_eq!(spouse_snapshot.document.families.len(), 1);
        let family = &spouse_snapshot.document.families[0];
        assert_eq!(family.wife_id.as_deref(), Some(miriam.as_str()));
        let joseph = spouse_snapshot
            .document
            .people
            .iter()
            .find(|candidate| candidate.id != miriam)
            .unwrap()
            .id
            .clone();
        assert_eq!(family.husband_id.as_deref(), Some(joseph.as_str()));

        let child_snapshot = document
            .apply(
                DocumentCommand::AddRelative {
                    person_id: miriam.clone(),
                    relationship: RelativeKind::Child,
                    person: person("Susan", "Stein", "F"),
                    pedigree: Some("birth".to_string()),
                    family_id: Some(family.id.clone()),
                    primary_role: None,
                },
                1,
            )
            .unwrap();
        assert_eq!(child_snapshot.document.people.len(), 3);
        assert_eq!(child_snapshot.document.families[0].child_ids.len(), 1);

        let undone = document.undo(2).unwrap();
        assert_eq!(undone.document.people.len(), 2);
        let redone = document.redo(3).unwrap();
        assert_eq!(redone.document.people.len(), 3);
    }

    #[test]
    fn adds_a_sibling_to_an_existing_parent_family() {
        let mut document = GenealogyDocument::create(person("Miriam", "Cohen", "F")).unwrap();
        let miriam = document.snapshot().unwrap().document.people[0].id.clone();
        let with_parent = document
            .apply(
                DocumentCommand::AddRelative {
                    person_id: miriam.clone(),
                    relationship: RelativeKind::Parent,
                    person: person("Rebecca", "Levy", "F"),
                    pedigree: Some("birth".to_string()),
                    family_id: None,
                    primary_role: None,
                },
                0,
            )
            .unwrap();
        let parent_family_id = with_parent.document.families[0].id.clone();

        let with_sibling = document
            .apply(
                DocumentCommand::AddRelative {
                    person_id: miriam.clone(),
                    relationship: RelativeKind::Sibling,
                    person: person("David", "Cohen", "M"),
                    pedigree: Some("birth".to_string()),
                    family_id: Some(parent_family_id.clone()),
                    primary_role: None,
                },
                1,
            )
            .unwrap();
        let david = with_sibling
            .document
            .people
            .iter()
            .find(|candidate| candidate.display_name == "David Cohen")
            .unwrap();
        let parent_family = with_sibling
            .document
            .families
            .iter()
            .find(|family| family.id == parent_family_id)
            .unwrap();

        assert!(parent_family.child_ids.contains(&miriam));
        assert!(parent_family.child_ids.contains(&david.id));
        assert_eq!(
            document.person(&david.id).unwrap().parent_family_ids,
            vec![parent_family.id.clone()]
        );
    }

    #[test]
    fn preserves_unknown_records_and_original_lines_while_editing() {
        let source = concat!(
            "0 HEAD\r\n",
            "1 SOUR MacFamilyTree\r\n",
            "1 GEDC\r\n",
            "2 VERS 7.0\r\n",
            "1 CHAR UTF-8\r\n",
            "0 @I1@ INDI\r\n",
            "1 NAME Miriam /Cohen/\r\n",
            "1 _PRIVATE keep exactly\r\n",
            "0 @S1@ SOUR\r\n",
            "1 TITL Family notebook\r\n",
            "0 TRLR\r\n",
        );
        let mut document = GenealogyDocument::import(source).unwrap();
        document
            .apply(
                DocumentCommand::UpdatePerson {
                    person_id: "@I1@".to_string(),
                    person: PersonInput {
                        birth_date: "1915".to_string(),
                        ..person("Miriam", "Cohen", "F")
                    },
                },
                0,
            )
            .unwrap();
        let output = document.snapshot().unwrap().source_gedcom;
        assert!(output.contains("1 _PRIVATE keep exactly\r\n"));
        assert!(output.contains("0 @S1@ SOUR\r\n1 TITL Family notebook\r\n"));
    }

    #[test]
    fn deletion_removes_orphaned_families_without_reusing_identifiers() {
        let mut document = GenealogyDocument::create(person("Miriam", "Cohen", "F")).unwrap();
        let miriam = document.snapshot().unwrap().document.people[0].id.clone();
        let added = document
            .apply(
                DocumentCommand::AddRelative {
                    person_id: miriam.clone(),
                    relationship: RelativeKind::Child,
                    person: person("Susan", "Cohen", "F"),
                    pedigree: None,
                    family_id: None,
                    primary_role: Some(FamilyRole::Wife),
                },
                0,
            )
            .unwrap();
        let child = added
            .document
            .people
            .iter()
            .find(|person| person.id != miriam)
            .unwrap()
            .id
            .clone();
        let deleted = document
            .apply(DocumentCommand::DeletePerson { person_id: miriam }, 1)
            .unwrap();
        assert_eq!(deleted.document.families.len(), 0);
        assert_eq!(deleted.document.people[0].id, child);
    }
}
