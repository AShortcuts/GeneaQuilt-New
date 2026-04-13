use std::collections::HashSet;
use std::fmt::{Display, Formatter};

use crate::graph::GeneaGraph;
use crate::model::{Family, Person};
use crate::timeline::DateRange;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GedcomError {
    InvalidLine(String),
    DuplicateId(String),
}

impl Display for GedcomError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidLine(line) => write!(f, "invalid GEDCOM line: {line}"),
            Self::DuplicateId(id) => write!(f, "duplicate GEDCOM identifier: {id}"),
        }
    }
}

impl std::error::Error for GedcomError {}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GedcomLine {
    level: usize,
    xref: Option<String>,
    tag: String,
    value: String,
}

enum CurrentRecord {
    Person(usize),
    Family(usize),
}

pub fn parse_gedcom(source: &str) -> Result<GeneaGraph, GedcomError> {
    let source = source.replace("\r\n", "\n").replace('\r', "\n");
    let mut people = Vec::<Person>::new();
    let mut families = Vec::<Family>::new();
    let mut seen_ids = HashSet::<String>::new();
    let mut current = None::<CurrentRecord>;
    let mut current_event = None::<String>;

    for raw in source.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }

        let parsed = parse_line(line)?;

        if parsed.level == 0 {
            current_event = None;
            current = match (parsed.xref.as_deref(), parsed.tag.as_str()) {
                (Some(id), "INDI") => {
                    let id = id.to_string();
                    if !seen_ids.insert(id.clone()) {
                        return Err(GedcomError::DuplicateId(id));
                    }
                    people.push(Person::new(id));
                    Some(CurrentRecord::Person(people.len() - 1))
                }
                (Some(id), "FAM") => {
                    let id = id.to_string();
                    if !seen_ids.insert(id.clone()) {
                        return Err(GedcomError::DuplicateId(id));
                    }
                    families.push(Family::new(id));
                    Some(CurrentRecord::Family(families.len() - 1))
                }
                _ => None,
            };
            continue;
        }

        match current {
            Some(CurrentRecord::Person(index)) => {
                let person = &mut people[index];
                apply_person_line(person, &parsed, &mut current_event);
            }
            Some(CurrentRecord::Family(index)) => {
                let family = &mut families[index];
                apply_family_line(family, &parsed, &mut current_event);
            }
            None => {}
        }
    }

    build_graph(people, families)
}

fn parse_line(line: &str) -> Result<GedcomLine, GedcomError> {
    let mut parts = line.split_whitespace();
    let level = parts
        .next()
        .ok_or_else(|| GedcomError::InvalidLine(line.to_string()))?
        .parse::<usize>()
        .map_err(|_| GedcomError::InvalidLine(line.to_string()))?;

    let second = parts
        .next()
        .ok_or_else(|| GedcomError::InvalidLine(line.to_string()))?;

    let (xref, tag) = if second.starts_with('@') && second.ends_with('@') {
        let tag = parts
            .next()
            .ok_or_else(|| GedcomError::InvalidLine(line.to_string()))?;
        (Some(second.to_string()), tag.to_string())
    } else {
        (None, second.to_string())
    };

    let value = parts.collect::<Vec<_>>().join(" ");
    Ok(GedcomLine {
        level,
        xref,
        tag,
        value,
    })
}

fn apply_person_line(person: &mut Person, line: &GedcomLine, current_event: &mut Option<String>) {
    match (line.level, line.tag.as_str()) {
        (1, "NAME") => {
            push_property(&mut person.properties, "NAME", &line.value);
            let (display_name, given, surname) = normalize_name(&line.value);
            if person.display_name.is_empty() {
                person.display_name = display_name;
            }
            if let Some(value) = given {
                push_property(&mut person.properties, "NAME.GIVN", &value);
            }
            if let Some(value) = surname {
                push_property(&mut person.properties, "NAME.SURN", &value);
            }
            *current_event = None;
        }
        (1, "SEX") => {
            if !line.value.is_empty() {
                person.sex = Some(line.value.clone());
                push_property(&mut person.properties, "SEX", &line.value);
            }
            *current_event = None;
        }
        (1, "FAMC") => {
            if !line.value.is_empty() && !person.famc.contains(&line.value) {
                person.famc.push(line.value.clone());
                push_property(&mut person.properties, "FAMC", &line.value);
            }
            *current_event = None;
        }
        (1, "FAMS") => {
            if !line.value.is_empty() && !person.fams.contains(&line.value) {
                person.fams.push(line.value.clone());
                push_property(&mut person.properties, "FAMS", &line.value);
            }
            *current_event = None;
        }
        (1, "BIRT" | "DEAT" | "CHR" | "BURI") => {
            if !line.value.is_empty() {
                push_property(&mut person.properties, &line.tag, &line.value);
            }
            *current_event = Some(line.tag.clone());
        }
        (2, "DATE") => {
            if let Some(event) = current_event.as_deref() {
                let key = format!("{event}.DATE");
                push_property(&mut person.properties, &key, &line.value);
                union_date(&mut person.date_range, parse_year_range(&line.value));
            }
        }
        (level, _) if level >= 1 => {
            let key = if line.level > 1 {
                if let Some(event) = current_event.as_deref() {
                    format!("{event}.{}", line.tag)
                } else {
                    line.tag.clone()
                }
            } else {
                line.tag.clone()
            };
            if !line.value.is_empty() {
                push_property(&mut person.properties, &key, &line.value);
            }
            if line.level == 1 {
                *current_event = None;
            }
        }
        _ => {}
    }
}

fn apply_family_line(family: &mut Family, line: &GedcomLine, current_event: &mut Option<String>) {
    match (line.level, line.tag.as_str()) {
        (1, "HUSB") => {
            if !line.value.is_empty() {
                family.husb = Some(line.value.clone());
                push_property(&mut family.properties, "HUSB", &line.value);
            }
            *current_event = None;
        }
        (1, "WIFE") => {
            if !line.value.is_empty() {
                family.wife = Some(line.value.clone());
                push_property(&mut family.properties, "WIFE", &line.value);
            }
            *current_event = None;
        }
        (1, "CHIL") => {
            if !line.value.is_empty() && !family.children.contains(&line.value) {
                family.children.push(line.value.clone());
                push_property(&mut family.properties, "CHIL", &line.value);
            }
            *current_event = None;
        }
        (1, "MARR") => {
            if !line.value.is_empty() {
                push_property(&mut family.properties, "MARR", &line.value);
            }
            *current_event = Some(line.tag.clone());
        }
        (2, "DATE") => {
            if let Some(event) = current_event.as_deref() {
                let key = format!("{event}.DATE");
                push_property(&mut family.properties, &key, &line.value);
                union_date(&mut family.date_range, parse_year_range(&line.value));
            }
        }
        (level, _) if level >= 1 => {
            let key = if line.level > 1 {
                if let Some(event) = current_event.as_deref() {
                    format!("{event}.{}", line.tag)
                } else {
                    line.tag.clone()
                }
            } else {
                line.tag.clone()
            };
            if !line.value.is_empty() {
                push_property(&mut family.properties, &key, &line.value);
            }
            if line.level == 1 {
                *current_event = None;
            }
        }
        _ => {}
    }
}

fn build_graph(people: Vec<Person>, families: Vec<Family>) -> Result<GeneaGraph, GedcomError> {
    let mut graph = GeneaGraph::new();

    for person in people {
        graph.add_person(person)?;
    }

    for family in families {
        graph.add_family(family)?;
    }

    let mut seen_edges = HashSet::<(usize, usize)>::new();

    let family_ids = graph.family_vertex_ids();
    for vertex_id in family_ids {
        let (husb, wife, children) = {
            let family = graph.family(vertex_id).expect("family vertex id must resolve");
            (family.husb.clone(), family.wife.clone(), family.children.clone())
        };

        if let Some(husb) = husb.as_ref()
            && let Some(person_id) = graph.vertex_id_by_external_id(husb)
        {
            insert_edge(&mut graph, &mut seen_edges, vertex_id, person_id);
        }

        if let Some(wife) = wife.as_ref()
            && let Some(person_id) = graph.vertex_id_by_external_id(wife)
        {
            insert_edge(&mut graph, &mut seen_edges, vertex_id, person_id);
        }

        for child in &children {
            if let Some(person_id) = graph.vertex_id_by_external_id(child) {
                insert_edge(&mut graph, &mut seen_edges, person_id, vertex_id);
            }
        }
    }

    let person_ids = graph.person_vertex_ids();
    for vertex_id in person_ids {
        let (famc, fams) = {
            let person = graph.person(vertex_id).expect("person vertex id must resolve");
            (person.famc.clone(), person.fams.clone())
        };

        for family_ref in &famc {
            if let Some(family_id) = graph.vertex_id_by_external_id(family_ref) {
                insert_edge(&mut graph, &mut seen_edges, vertex_id, family_id);
            }
        }

        for family_ref in &fams {
            if let Some(family_id) = graph.vertex_id_by_external_id(family_ref) {
                insert_edge(&mut graph, &mut seen_edges, family_id, vertex_id);
            }
        }
    }

    Ok(graph)
}

fn insert_edge(
    graph: &mut GeneaGraph,
    seen_edges: &mut HashSet<(usize, usize)>,
    from: crate::model::VertexId,
    to: crate::model::VertexId,
) {
    if seen_edges.insert((from.0, to.0)) {
        graph.add_edge(from, to);
    }
}

fn push_property(
    properties: &mut std::collections::BTreeMap<String, Vec<String>>,
    key: &str,
    value: &str,
) {
    if value.is_empty() {
        return;
    }
    properties
        .entry(key.to_string())
        .or_default()
        .push(value.to_string());
}

fn normalize_name(value: &str) -> (String, Option<String>, Option<String>) {
    let mut given = None;
    let mut surname = None;

    if let Some(first) = value.find('/') {
        if let Some(second_rel) = value[first + 1..].find('/') {
            let second = first + 1 + second_rel;
            let given_raw = value[..first].trim();
            let surname_raw = value[first + 1..second].trim();
            if !given_raw.is_empty() {
                given = Some(given_raw.to_string());
            }
            if !surname_raw.is_empty() {
                surname = Some(surname_raw.to_string());
            }
        }
    }

    let display = value.replace('/', "").split_whitespace().collect::<Vec<_>>().join(" ");
    (display, given, surname)
}

fn union_date(target: &mut Option<DateRange>, incoming: Option<DateRange>) {
    if let Some(incoming) = incoming {
        match target {
            Some(existing) => {
                existing.start_year = existing.start_year.min(incoming.start_year);
                existing.end_year = existing.end_year.max(incoming.end_year);
            }
            None => *target = Some(incoming),
        }
    }
}

fn parse_year_range(value: &str) -> Option<DateRange> {
    let years = value
        .split(|ch: char| !ch.is_ascii_digit())
        .filter_map(|part| {
            if part.len() < 3 {
                return None;
            }

            let year = part.parse::<i32>().ok()?;
            (1000..=2999).contains(&year).then_some(year)
        })
        .collect::<Vec<_>>();

    let start = *years.iter().min()?;
    let end = *years.iter().max()?;
    Some(DateRange {
        start_year: start,
        end_year: end,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_gedcom;

    #[test]
    fn parses_basic_gedcom_into_people_families_and_edges() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME John /Doe/
1 SEX M
1 FAMS @F1@
1 BIRT
2 DATE 1900
0 @I2@ INDI
1 NAME Jane /Smith/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /Doe/
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1920
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");

        assert_eq!(graph.person_count(), 3);
        assert_eq!(graph.family_count(), 1);
        assert_eq!(graph.edge_count(), 3);
    }

    #[test]
    fn preserves_multiple_parent_families_for_a_person() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME Child /Person/
1 FAMC @F1@
1 FAMC @F2@
0 @I2@ INDI
1 NAME Parent /One/
1 FAMS @F1@
0 @I3@ INDI
1 NAME Parent /Two/
1 FAMS @F1@
0 @I4@ INDI
1 NAME Adoptive /One/
1 FAMS @F2@
0 @I5@ INDI
1 NAME Adoptive /Two/
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 @F2@ FAM
1 HUSB @I4@
1 WIFE @I5@
1 CHIL @I1@
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let child = graph
            .vertex_id_by_external_id("@I1@")
            .expect("child should exist");

        assert_eq!(graph.person_parent_family_ids(child).len(), 2);
        assert_eq!(graph.person_parent_ids(child).len(), 4);
    }

    #[test]
    fn keeps_first_name_value_as_display_name() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME First /Name/
1 NAME Later /Alias/
0 @F1@ FAM
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let person_id = graph
            .vertex_id_by_external_id("@I1@")
            .expect("person should exist");
        let person = graph.person(person_id).expect("vertex should be a person");

        assert_eq!(person.display_name, "First Name");
        assert_eq!(
            person.properties.get("NAME"),
            Some(&vec!["First /Name/".to_string(), "Later /Alias/".to_string()])
        );
    }

    #[test]
    fn parses_mac_style_carriage_return_line_endings() {
        let gedcom = "0 @I1@ INDI\r1 NAME John /Doe/\r1 FAMS @F1@\r0 @I2@ INDI\r1 NAME Jane /Doe/\r1 FAMS @F1@\r0 @F1@ FAM\r1 HUSB @I1@\r1 WIFE @I2@\r";

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");

        assert_eq!(graph.person_count(), 2);
        assert_eq!(graph.family_count(), 1);
        assert_eq!(graph.edge_count(), 2);
    }
}
