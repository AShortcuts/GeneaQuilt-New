use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};

use serde::{Deserialize, Serialize};

use crate::GeneaGraph;
use crate::gedcom::{GedcomError, parse_line};
use crate::model::{Family, ParentFamilyLink, Person, VertexId};
use crate::timeline::{DateRange, RecordedDate};

pub const CANONICAL_DOCUMENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceProfile {
    pub line_count: usize,
    pub person_records: usize,
    pub family_records: usize,
    pub note_records: usize,
    pub source_records: usize,
    pub object_records: usize,
    pub other_record_types: BTreeMap<String, usize>,
    pub custom_tag_counts: BTreeMap<String, usize>,
    pub media_files: Vec<String>,
    pub producer: Option<String>,
    pub producer_version: Option<String>,
    pub gedcom_version: Option<String>,
    pub character_encoding: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationSeverity {
    Error,
    Warning,
    Notice,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidationFinding {
    pub code: String,
    pub severity: ValidationSeverity,
    pub title: String,
    pub message: String,
    pub record_ids: Vec<String>,
    pub blocks_interactive: bool,
    pub corrective_action: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocumentAnalysis {
    pub people: usize,
    pub families: usize,
    pub relationship_links: usize,
    pub disconnected_family_groups: usize,
    pub generation_depth: Option<usize>,
    pub widest_generation: Option<usize>,
    pub largest_sibling_group: usize,
    pub people_with_multiple_spouses: usize,
    pub people_in_multiple_spouse_families: usize,
    pub half_sibling_structures: usize,
    pub pedigree_collapse_people: usize,
    pub reconvergence_points: usize,
    pub people_with_dates: usize,
    pub families_with_dates: usize,
    pub date_coverage_percent: f64,
    pub findings: Vec<ValidationFinding>,
    pub blocks_interactive: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanonicalParentFamilyLink {
    pub family_id: String,
    pub relationship: String,
    pub relationship_was_explicit: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanonicalPerson {
    pub id: String,
    pub display_name: String,
    pub sex: Option<String>,
    pub birth_place: Option<String>,
    pub parent_families: Vec<CanonicalParentFamilyLink>,
    pub spouse_families: Vec<String>,
    pub birth_date: Option<RecordedDate>,
    pub death_date: Option<RecordedDate>,
    pub date_range: Option<DateRange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanonicalFamily {
    pub id: String,
    pub husband_id: Option<String>,
    pub wife_id: Option<String>,
    pub child_ids: Vec<String>,
    pub marriage_date: Option<RecordedDate>,
    pub divorce_date: Option<RecordedDate>,
    pub date_range: Option<DateRange>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonicalDocument {
    pub schema_version: u32,
    pub people: Vec<CanonicalPerson>,
    pub families: Vec<CanonicalFamily>,
    pub analysis: DocumentAnalysis,
    pub source_profile: SourceProfile,
}

#[derive(Debug)]
struct LineageGraph {
    person_ids: Vec<VertexId>,
    parents: Vec<Vec<usize>>,
    children: Vec<Vec<usize>>,
}

#[derive(Debug)]
struct LineageOrder {
    topological: Vec<usize>,
    cyclic_core: Vec<usize>,
    cycles: Vec<Vec<usize>>,
}

pub fn profile_gedcom(source: &str) -> Result<SourceProfile, GedcomError> {
    let normalized = source.replace("\r\n", "\n").replace('\r', "\n");
    let mut profile = SourceProfile {
        line_count: 0,
        person_records: 0,
        family_records: 0,
        note_records: 0,
        source_records: 0,
        object_records: 0,
        other_record_types: BTreeMap::new(),
        custom_tag_counts: BTreeMap::new(),
        media_files: Vec::new(),
        producer: None,
        producer_version: None,
        gedcom_version: None,
        character_encoding: None,
    };
    let mut current_record = String::new();
    let mut header_section = String::new();

    for raw in normalized.lines() {
        let raw = raw.trim();
        if raw.is_empty() {
            continue;
        }
        profile.line_count += 1;
        let line = parse_line(raw)?;

        if line.tag.starts_with('_') {
            *profile
                .custom_tag_counts
                .entry(line.tag.clone())
                .or_default() += 1;
        }

        if line.level == 0 {
            current_record = line.tag.clone();
            header_section.clear();
            match line.tag.as_str() {
                "INDI" => profile.person_records += 1,
                "FAM" => profile.family_records += 1,
                "NOTE" => profile.note_records += 1,
                "SOUR" => profile.source_records += 1,
                "OBJE" => profile.object_records += 1,
                "HEAD" | "SUBM" | "TRLR" => {}
                tag => {
                    *profile
                        .other_record_types
                        .entry(tag.to_string())
                        .or_default() += 1
                }
            }
            continue;
        }

        if current_record == "HEAD" {
            match (line.level, line.tag.as_str()) {
                (1, "SOUR") => {
                    profile.producer = nonempty(line.value.clone());
                    header_section = "SOUR".to_string();
                }
                (1, "GEDC") => header_section = "GEDC".to_string(),
                (1, "CHAR") => profile.character_encoding = nonempty(line.value.clone()),
                (1, _) => header_section.clear(),
                (2, "VERS") if header_section == "SOUR" => {
                    profile.producer_version = nonempty(line.value.clone());
                }
                (2, "VERS") if header_section == "GEDC" => {
                    profile.gedcom_version = nonempty(line.value.clone());
                }
                _ => {}
            }
        }

        if current_record == "OBJE"
            && line.level == 1
            && line.tag == "FILE"
            && !line.value.is_empty()
        {
            profile.media_files.push(line.value);
        }
    }

    profile.media_files.sort();
    profile.media_files.dedup();
    Ok(profile)
}

pub fn analyze_document(graph: &GeneaGraph) -> DocumentAnalysis {
    let lineage = build_lineage_graph(graph);
    let order = order_lineage(&lineage);
    let mut findings = validate_document(graph, &lineage, &order);
    sort_findings(&mut findings);

    let (generation_depth, widest_generation) = generation_shape(&lineage, &order);
    let (pedigree_collapse_people, reconvergence_points) =
        collapse_and_reconvergence(&lineage, &order);
    let people_with_dates = graph
        .person_vertex_ids()
        .iter()
        .filter(|id| {
            graph
                .person(**id)
                .is_some_and(|person| person.date_range.is_some())
        })
        .count();
    let families_with_dates = graph
        .family_vertex_ids()
        .iter()
        .filter(|id| {
            graph
                .family(**id)
                .is_some_and(|family| family.date_range.is_some())
        })
        .count();
    let total_records = graph.person_count() + graph.family_count();
    let dated_records = people_with_dates + families_with_dates;

    DocumentAnalysis {
        people: graph.person_count(),
        families: graph.family_count(),
        relationship_links: graph.edge_count(),
        disconnected_family_groups: graph.weak_components().len(),
        generation_depth,
        widest_generation,
        largest_sibling_group: largest_sibling_group(graph),
        people_with_multiple_spouses: people_with_multiple_spouses(graph),
        people_in_multiple_spouse_families: people_in_multiple_spouse_families(graph),
        half_sibling_structures: half_sibling_structures(graph),
        pedigree_collapse_people,
        reconvergence_points,
        people_with_dates,
        families_with_dates,
        date_coverage_percent: if total_records == 0 {
            0.0
        } else {
            dated_records as f64 * 100.0 / total_records as f64
        },
        blocks_interactive: findings.iter().any(|finding| finding.blocks_interactive),
        findings,
    }
}

pub fn build_canonical_document(
    graph: &GeneaGraph,
    source_profile: SourceProfile,
) -> CanonicalDocument {
    let people = graph
        .person_vertex_ids()
        .iter()
        .filter_map(|id| graph.person(*id))
        .map(canonical_person)
        .collect::<Vec<_>>();
    let families = graph
        .family_vertex_ids()
        .iter()
        .filter_map(|id| graph.family(*id))
        .map(canonical_family)
        .collect::<Vec<_>>();

    CanonicalDocument {
        schema_version: CANONICAL_DOCUMENT_SCHEMA_VERSION,
        people,
        families,
        analysis: analyze_document(graph),
        source_profile,
    }
}

fn canonical_person(person: &Person) -> CanonicalPerson {
    CanonicalPerson {
        id: person.id.clone(),
        display_name: if person.display_name.is_empty() {
            person.id.clone()
        } else {
            person.display_name.clone()
        },
        sex: person.sex.clone(),
        birth_place: person
            .properties
            .get("BIRT.PLAC")
            .and_then(|values| values.iter().find(|value| !value.trim().is_empty()))
            .cloned(),
        parent_families: person
            .parent_family_links
            .iter()
            .map(canonical_parent_family_link)
            .collect(),
        spouse_families: person.fams.clone(),
        birth_date: person.birth_date.clone(),
        death_date: person.death_date.clone(),
        date_range: person.date_range,
    }
}

fn canonical_parent_family_link(link: &ParentFamilyLink) -> CanonicalParentFamilyLink {
    CanonicalParentFamilyLink {
        family_id: link.family_id.clone(),
        relationship: normalized_pedigree(link.pedigree.as_deref()),
        relationship_was_explicit: link.pedigree.is_some(),
    }
}

fn canonical_family(family: &Family) -> CanonicalFamily {
    CanonicalFamily {
        id: family.id.clone(),
        husband_id: family.husb.clone(),
        wife_id: family.wife.clone(),
        child_ids: family.children.clone(),
        marriage_date: family.marriage_date.clone(),
        divorce_date: family.divorce_date.clone(),
        date_range: family.date_range,
    }
}

fn normalized_pedigree(value: Option<&str>) -> String {
    let Some(value) = value else {
        return "birth".to_string();
    };
    match value.trim().to_ascii_lowercase().as_str() {
        "" | "birth" | "biological" => "birth".to_string(),
        "adopted" | "adoptive" => "adopted".to_string(),
        "foster" => "foster".to_string(),
        "sealing" => "sealing".to_string(),
        other => format!("other:{other}"),
    }
}

fn build_lineage_graph(graph: &GeneaGraph) -> LineageGraph {
    let person_ids = graph.person_vertex_ids();
    let compact_by_vertex = person_ids
        .iter()
        .enumerate()
        .map(|(compact, id)| (id.0, compact))
        .collect::<HashMap<_, _>>();
    let mut parents = vec![Vec::<usize>::new(); person_ids.len()];
    let mut children = vec![Vec::<usize>::new(); person_ids.len()];

    for (child_compact, child_id) in person_ids.iter().enumerate() {
        let mut compact_parents = graph
            .person_parent_ids(*child_id)
            .iter()
            .filter_map(|parent| compact_by_vertex.get(&parent.0).copied())
            .collect::<Vec<_>>();
        compact_parents.sort_unstable();
        compact_parents.dedup();
        for parent_compact in &compact_parents {
            children[*parent_compact].push(child_compact);
        }
        parents[child_compact] = compact_parents;
    }
    for child_list in &mut children {
        child_list.sort_unstable();
        child_list.dedup();
    }

    LineageGraph {
        person_ids,
        parents,
        children,
    }
}

fn order_lineage(lineage: &LineageGraph) -> LineageOrder {
    let mut remaining_parents = lineage.parents.iter().map(Vec::len).collect::<Vec<_>>();
    let mut queue = remaining_parents
        .iter()
        .enumerate()
        .filter_map(|(index, count)| (*count == 0).then_some(index))
        .collect::<VecDeque<_>>();
    let mut topological = Vec::with_capacity(lineage.person_ids.len());

    while let Some(parent) = queue.pop_front() {
        topological.push(parent);
        for child in &lineage.children[parent] {
            remaining_parents[*child] = remaining_parents[*child].saturating_sub(1);
            if remaining_parents[*child] == 0 {
                queue.push_back(*child);
            }
        }
    }

    let mut in_core = remaining_parents
        .iter()
        .map(|count| *count > 0)
        .collect::<Vec<_>>();
    let mut residual_children = lineage
        .children
        .iter()
        .map(|children| children.iter().filter(|child| in_core[**child]).count())
        .collect::<Vec<_>>();
    let mut sink_queue = residual_children
        .iter()
        .enumerate()
        .filter_map(|(index, count)| (in_core[index] && *count == 0).then_some(index))
        .collect::<VecDeque<_>>();

    while let Some(sink) = sink_queue.pop_front() {
        if !in_core[sink] {
            continue;
        }
        in_core[sink] = false;
        for parent in &lineage.parents[sink] {
            if in_core[*parent] {
                residual_children[*parent] = residual_children[*parent].saturating_sub(1);
                if residual_children[*parent] == 0 {
                    sink_queue.push_back(*parent);
                }
            }
        }
    }

    let cyclic_core = in_core
        .iter()
        .enumerate()
        .filter_map(|(index, active)| (*active).then_some(index))
        .collect::<Vec<_>>();
    let cycles = extract_cycles(lineage, &in_core);

    LineageOrder {
        topological,
        cyclic_core,
        cycles,
    }
}

fn extract_cycles(lineage: &LineageGraph, in_core: &[bool]) -> Vec<Vec<usize>> {
    let mut cycles = Vec::<Vec<usize>>::new();
    let mut covered = vec![false; in_core.len()];

    for start in 0..in_core.len() {
        if !in_core[start] || covered[start] {
            continue;
        }
        let mut path = Vec::<usize>::new();
        let mut positions = HashMap::<usize, usize>::new();
        let mut current = start;

        loop {
            if let Some(position) = positions.get(&current).copied() {
                let mut cycle = path[position..].to_vec();
                cycle.push(current);
                for node in &cycle {
                    covered[*node] = true;
                }
                cycles.push(cycle);
                break;
            }
            if covered[current] {
                break;
            }
            positions.insert(current, path.len());
            path.push(current);
            let next = lineage.children[current]
                .iter()
                .copied()
                .find(|child| in_core[*child]);
            let Some(next) = next else {
                break;
            };
            current = next;
        }
    }

    cycles
}

fn generation_shape(
    lineage: &LineageGraph,
    order: &LineageOrder,
) -> (Option<usize>, Option<usize>) {
    if !order.cyclic_core.is_empty() {
        return (None, None);
    }
    if lineage.person_ids.is_empty() {
        return (Some(0), Some(0));
    }

    let mut levels = vec![0usize; lineage.person_ids.len()];
    for parent in &order.topological {
        for child in &lineage.children[*parent] {
            levels[*child] = levels[*child].max(levels[*parent].saturating_add(1));
        }
    }
    let mut widths = vec![0usize; levels.iter().copied().max().unwrap_or(0) + 1];
    for level in &levels {
        widths[*level] += 1;
    }

    (
        Some(levels.iter().copied().max().unwrap_or(0) + 1),
        Some(widths.into_iter().max().unwrap_or(0)),
    )
}

fn collapse_and_reconvergence(lineage: &LineageGraph, order: &LineageOrder) -> (usize, usize) {
    if !order.cyclic_core.is_empty() {
        return (0, 0);
    }
    let mut root_paths = vec![BTreeMap::<usize, u8>::new(); lineage.person_ids.len()];
    let mut collapse_people = 0usize;
    let mut reconvergence_points = 0usize;

    for person in &order.topological {
        if lineage.parents[*person].is_empty() {
            root_paths[*person].insert(*person, 1);
            continue;
        }

        let mut parent_contributors = BTreeMap::<usize, usize>::new();
        let mut combined = BTreeMap::<usize, u8>::new();
        for parent in &lineage.parents[*person] {
            for (root, count) in &root_paths[*parent] {
                *parent_contributors.entry(*root).or_default() += 1;
                let entry = combined.entry(*root).or_default();
                *entry = entry.saturating_add(*count).min(2);
            }
        }
        if parent_contributors
            .values()
            .any(|contributors| *contributors > 1)
        {
            reconvergence_points += 1;
        }
        if combined.values().any(|count| *count > 1) {
            collapse_people += 1;
        }
        root_paths[*person] = combined;
    }

    (collapse_people, reconvergence_points)
}

fn validate_document(
    graph: &GeneaGraph,
    lineage: &LineageGraph,
    order: &LineageOrder,
) -> Vec<ValidationFinding> {
    let mut findings = Vec::<ValidationFinding>::new();
    let missing_reference_action = Some(
        "Correct the broken record reference in the genealogy program that created this GEDCOM."
            .to_string(),
    );

    for cycle in &order.cycles {
        let record_ids = cycle
            .iter()
            .filter_map(|index| graph.vertex_external_id(lineage.person_ids[*index]))
            .map(str::to_string)
            .collect::<Vec<_>>();
        findings.push(ValidationFinding {
            code: "impossible_parent_loop".to_string(),
            severity: ValidationSeverity::Error,
            title: "Impossible parent loop".to_string(),
            message: format!(
                "Following parent-to-child relationships returns to the same person: {}.",
                record_ids.join(" -> ")
            ),
            record_ids,
            blocks_interactive: true,
            corrective_action: Some(
                "Correct the parent relationship in the originating genealogy program; GeneaQuilt cannot safely guess which link to remove."
                    .to_string(),
            ),
        });
    }

    let mut duplicate_husband_roles = Vec::<String>::new();
    let mut duplicate_wife_roles = Vec::<String>::new();
    let mut child_families_without_parent = Vec::<String>::new();
    let mut missing_person_references = BTreeSet::<String>::new();
    let mut missing_family_references = BTreeSet::<String>::new();
    let mut reciprocal_mismatches = BTreeSet::<String>::new();

    for family_id in graph.family_vertex_ids() {
        let family = graph.family(family_id).expect("family id must resolve");
        if family
            .properties
            .get("HUSB")
            .is_some_and(|values| values.len() > 1)
        {
            duplicate_husband_roles.push(family.id.clone());
        }
        if family
            .properties
            .get("WIFE")
            .is_some_and(|values| values.len() > 1)
        {
            duplicate_wife_roles.push(family.id.clone());
        }

        let known_husband = family
            .husb
            .as_deref()
            .and_then(|id| graph.vertex_id_by_external_id(id))
            .is_some_and(|id| graph.is_person(id));
        let known_wife = family
            .wife
            .as_deref()
            .and_then(|id| graph.vertex_id_by_external_id(id))
            .is_some_and(|id| graph.is_person(id));
        if !family.children.is_empty() && !known_husband && !known_wife {
            child_families_without_parent.push(family.id.clone());
        }

        for person_ref in family
            .properties
            .get("HUSB")
            .into_iter()
            .flatten()
            .chain(family.properties.get("WIFE").into_iter().flatten())
            .chain(family.children.iter())
        {
            if graph
                .vertex_id_by_external_id(person_ref)
                .is_none_or(|id| !graph.is_person(id))
            {
                missing_person_references.insert(person_ref.clone());
            }
        }

        for child_ref in &family.children {
            if let Some(child_id) = graph.vertex_id_by_external_id(child_ref)
                && let Some(child) = graph.person(child_id)
                && !child.famc.contains(&family.id)
            {
                reciprocal_mismatches.insert(format!("{} / {}", family.id, child.id));
            }
        }
        for spouse_ref in family.husb.iter().chain(family.wife.iter()) {
            if let Some(spouse_id) = graph.vertex_id_by_external_id(spouse_ref)
                && let Some(spouse) = graph.person(spouse_id)
                && !spouse.fams.contains(&family.id)
            {
                reciprocal_mismatches.insert(format!("{} / {}", family.id, spouse.id));
            }
        }
    }

    let mut multiple_birth_families = Vec::<String>::new();
    let mut missing_names = Vec::<String>::new();
    for person_id in graph.person_vertex_ids() {
        let person = graph.person(person_id).expect("person id must resolve");
        if person.display_name.is_empty() {
            missing_names.push(person.id.clone());
        }
        let birth_family_count = person
            .parent_family_links
            .iter()
            .filter(|link| normalized_pedigree(link.pedigree.as_deref()) == "birth")
            .count();
        if birth_family_count > 1 {
            multiple_birth_families.push(person.id.clone());
        }

        for family_ref in person.famc.iter().chain(person.fams.iter()) {
            if graph
                .vertex_id_by_external_id(family_ref)
                .is_none_or(|id| !graph.is_family(id))
            {
                missing_family_references.insert(family_ref.clone());
            }
        }
        for family_ref in &person.famc {
            if let Some(family_id) = graph.vertex_id_by_external_id(family_ref)
                && let Some(family) = graph.family(family_id)
                && !family.children.contains(&person.id)
            {
                reciprocal_mismatches.insert(format!("{} / {}", family.id, person.id));
            }
        }
        for family_ref in &person.fams {
            if let Some(family_id) = graph.vertex_id_by_external_id(family_ref)
                && let Some(family) = graph.family(family_id)
                && family.husb.as_deref() != Some(&person.id)
                && family.wife.as_deref() != Some(&person.id)
            {
                reciprocal_mismatches.insert(format!("{} / {}", family.id, person.id));
            }
        }
    }

    push_group_finding(
        &mut findings,
        "duplicate_husband_role",
        ValidationSeverity::Error,
        "Family has more than one husband role",
        "Each binary Family can contain at most one HUSB role. The first value is retained for inspection, but the structure is not safe to visualize.",
        duplicate_husband_roles,
        true,
        Some(
            "Split simultaneous or subsequent spouses into separate Family records in the originating genealogy program.",
        ),
    );
    push_group_finding(
        &mut findings,
        "duplicate_wife_role",
        ValidationSeverity::Error,
        "Family has more than one wife role",
        "Each binary Family can contain at most one WIFE role. The first value is retained for inspection, but the structure is not safe to visualize.",
        duplicate_wife_roles,
        true,
        Some(
            "Split simultaneous or subsequent spouses into separate Family records in the originating genealogy program.",
        ),
    );
    push_group_finding(
        &mut findings,
        "children_without_known_parent",
        ValidationSeverity::Error,
        "Children are linked to a Family with no known parent",
        "A Family that contains children must identify at least one existing husband or wife record.",
        child_families_without_parent,
        true,
        Some(
            "Add at least one recorded parent to each affected Family in the originating genealogy program.",
        ),
    );
    push_group_finding(
        &mut findings,
        "missing_person_reference",
        ValidationSeverity::Warning,
        "Some Family links point to missing people",
        "The referenced Person Records do not exist in this GEDCOM, so those relationships cannot be shown.",
        missing_person_references.into_iter().collect(),
        false,
        missing_reference_action.as_deref(),
    );
    push_group_finding(
        &mut findings,
        "missing_family_reference",
        ValidationSeverity::Warning,
        "Some person links point to missing Families",
        "The referenced Family records do not exist in this GEDCOM, so those relationships cannot be shown.",
        missing_family_references.into_iter().collect(),
        false,
        missing_reference_action.as_deref(),
    );
    push_group_finding(
        &mut findings,
        "relationship_not_reciprocal",
        ValidationSeverity::Warning,
        "Some relationship links disagree",
        "A person names a Family that does not name that person back, or a Family names a person that does not name the Family back. GeneaQuilt preserves and reports both sides.",
        reciprocal_mismatches.into_iter().collect(),
        false,
        Some(
            "Review both affected records in the originating genealogy program and make their links agree.",
        ),
    );
    push_group_finding(
        &mut findings,
        "multiple_birth_families",
        ValidationSeverity::Warning,
        "A person has more than one birth Family",
        "GEDCOM treats an FAMC link with no PEDI value as a birth relationship. Additional adoptive or foster Families need an explicit PEDI value.",
        multiple_birth_families,
        false,
        Some(
            "Mark additional parent Families as adopted or foster, or correct the duplicate birth relationship.",
        ),
    );
    push_group_finding(
        &mut findings,
        "person_without_name",
        ValidationSeverity::Notice,
        "Some people have no recorded name",
        "Unnamed Person Records remain available by their stable GEDCOM identifiers.",
        missing_names,
        false,
        None,
    );

    findings
}

#[allow(clippy::too_many_arguments)]
fn push_group_finding(
    findings: &mut Vec<ValidationFinding>,
    code: &str,
    severity: ValidationSeverity,
    title: &str,
    message: &str,
    mut record_ids: Vec<String>,
    blocks_interactive: bool,
    corrective_action: Option<&str>,
) {
    if record_ids.is_empty() {
        return;
    }
    record_ids.sort();
    record_ids.dedup();
    findings.push(ValidationFinding {
        code: code.to_string(),
        severity,
        title: title.to_string(),
        message: message.to_string(),
        record_ids,
        blocks_interactive,
        corrective_action: corrective_action.map(str::to_string),
    });
}

fn sort_findings(findings: &mut [ValidationFinding]) {
    findings.sort_by(|left, right| {
        severity_rank(left.severity)
            .cmp(&severity_rank(right.severity))
            .then(left.code.cmp(&right.code))
            .then(left.record_ids.cmp(&right.record_ids))
    });
}

fn severity_rank(severity: ValidationSeverity) -> usize {
    match severity {
        ValidationSeverity::Error => 0,
        ValidationSeverity::Warning => 1,
        ValidationSeverity::Notice => 2,
    }
}

fn largest_sibling_group(graph: &GeneaGraph) -> usize {
    graph
        .family_vertex_ids()
        .iter()
        .filter_map(|id| graph.family(*id))
        .map(|family| family.children.len())
        .max()
        .unwrap_or(0)
}

fn people_with_multiple_spouses(graph: &GeneaGraph) -> usize {
    graph
        .person_vertex_ids()
        .iter()
        .filter(|id| graph.person_spouse_ids(**id).len() > 1)
        .count()
}

fn people_in_multiple_spouse_families(graph: &GeneaGraph) -> usize {
    graph
        .person_vertex_ids()
        .iter()
        .filter(|id| graph.person_spouse_family_ids(**id).len() > 1)
        .count()
}

fn half_sibling_structures(graph: &GeneaGraph) -> usize {
    graph
        .person_vertex_ids()
        .iter()
        .filter(|person_id| {
            let mut co_parents = BTreeSet::<String>::new();
            for family_id in graph.person_spouse_family_ids(**person_id) {
                let Some(family) = graph.family(family_id) else {
                    continue;
                };
                if family.children.is_empty() {
                    continue;
                }
                for spouse in family.husb.iter().chain(family.wife.iter()) {
                    if graph.vertex_external_id(**person_id) != Some(spouse.as_str()) {
                        co_parents.insert(spouse.clone());
                    }
                }
            }
            co_parents.len() > 1
        })
        .count()
}

fn nonempty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

#[cfg(test)]
mod tests {
    use crate::{parse_gedcom, profile_gedcom};

    use super::{ValidationSeverity, analyze_document, build_canonical_document};

    #[test]
    fn profiles_source_records_without_including_note_contents() {
        let source = r#"0 HEAD
1 SOUR ExampleApp
2 VERS 4.2
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Person /One/
1 _CUSTOM value
0 @N1@ NOTE
1 CONT private note
0 @O1@ OBJE
1 FILE portrait.jpg
0 TRLR"#;

        let profile = profile_gedcom(source).expect("profile should parse");
        assert_eq!(profile.person_records, 1);
        assert_eq!(profile.note_records, 1);
        assert_eq!(profile.object_records, 1);
        assert_eq!(profile.media_files, vec!["portrait.jpg"]);
        assert_eq!(profile.producer.as_deref(), Some("ExampleApp"));
        assert_eq!(profile.gedcom_version.as_deref(), Some("5.5.1"));
        assert_eq!(profile.custom_tag_counts.get("_CUSTOM"), Some(&1));
    }

    #[test]
    fn uses_missing_pedi_as_the_gedcom_birth_default() {
        let source = r#"0 @I1@ INDI
1 NAME Child /One/
1 FAMC @F1@
1 FAMC @F2@
2 PEDI adopted
0 @I2@ INDI
1 NAME Parent /One/
0 @F1@ FAM
1 HUSB @I2@
1 CHIL @I1@
0 @F2@ FAM
1 HUSB @I2@
1 CHIL @I1@"#;
        let graph = parse_gedcom(source).expect("document should parse");
        let canonical = build_canonical_document(
            &graph,
            profile_gedcom(source).expect("profile should parse"),
        );

        assert_eq!(canonical.people[0].parent_families[0].relationship, "birth");
        assert!(!canonical.people[0].parent_families[0].relationship_was_explicit);
        assert_eq!(
            canonical.people[0].parent_families[1].relationship,
            "adopted"
        );
    }

    #[test]
    fn keeps_a_recorded_birthplace_in_the_canonical_document() {
        let source = r#"0 @I1@ INDI
1 NAME Person /One/
1 BIRT
2 PLAC Vienna, Austria"#;
        let graph = parse_gedcom(source).expect("document should parse");
        let canonical = build_canonical_document(
            &graph,
            profile_gedcom(source).expect("profile should parse"),
        );

        assert_eq!(
            canonical.people[0].birth_place.as_deref(),
            Some("Vienna, Austria")
        );
    }

    #[test]
    fn detects_and_blocks_an_impossible_parent_loop() {
        let source = r#"0 @I1@ INDI
1 NAME Person /One/
1 FAMC @F2@
1 FAMS @F1@
0 @I2@ INDI
1 NAME Person /Two/
1 FAMC @F1@
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
0 @F2@ FAM
1 HUSB @I2@
1 CHIL @I1@"#;
        let graph = parse_gedcom(source).expect("document should parse");
        let analysis = analyze_document(&graph);

        assert!(analysis.blocks_interactive);
        assert!(analysis.generation_depth.is_none());
        assert!(analysis.findings.iter().any(|finding| {
            finding.code == "impossible_parent_loop"
                && finding.severity == ValidationSeverity::Error
                && finding.blocks_interactive
        }));
    }

    #[test]
    fn reports_binary_family_violations_without_overwriting_the_first_role() {
        let source = r#"0 @I1@ INDI
1 NAME First /Husband/
0 @I2@ INDI
1 NAME Second /Husband/
0 @I3@ INDI
1 NAME Child /One/
0 @F1@ FAM
1 HUSB @I1@
1 HUSB @I2@
1 CHIL @I3@"#;
        let graph = parse_gedcom(source).expect("document should parse");
        let analysis = analyze_document(&graph);
        let family = graph
            .family(
                graph
                    .vertex_id_by_external_id("@F1@")
                    .expect("family should exist"),
            )
            .expect("family should resolve");

        assert_eq!(family.husb.as_deref(), Some("@I1@"));
        assert!(analysis.blocks_interactive);
        assert!(
            analysis
                .findings
                .iter()
                .any(|finding| finding.code == "duplicate_husband_role")
        );
    }

    #[test]
    fn distinguishes_reconvergence_from_an_impossible_cycle() {
        let source = r#"0 @I1@ INDI
1 NAME Root /Person/
1 FAMS @F1@
0 @I2@ INDI
1 NAME Child /Left/
1 FAMC @F1@
1 FAMS @F2@
0 @I3@ INDI
1 NAME Child /Right/
1 FAMC @F1@
1 FAMS @F2@
0 @I4@ INDI
1 NAME Grandchild /Joined/
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
1 CHIL @I3@
0 @F2@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I4@"#;
        let graph = parse_gedcom(source).expect("document should parse");
        let analysis = analyze_document(&graph);

        assert!(!analysis.blocks_interactive);
        assert_eq!(analysis.reconvergence_points, 1);
        assert_eq!(analysis.pedigree_collapse_people, 1);
    }
}
