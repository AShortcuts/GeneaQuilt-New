use std::collections::{BTreeSet, HashMap, VecDeque};

use crate::gedcom::GedcomError;
use crate::model::{Family, Person, VertexId, VertexKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EdgeRecord {
    pub from: VertexId,
    pub to: VertexId,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VertexRecord {
    Person(Person),
    Family(Family),
}

#[derive(Debug, Default)]
pub struct GeneaGraph {
    vertices: Vec<VertexRecord>,
    id_to_vertex: HashMap<String, VertexId>,
    edges: Vec<EdgeRecord>,
    out_edges: Vec<Vec<usize>>,
    in_edges: Vec<Vec<usize>>,
}

impl GeneaGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn person_count(&self) -> usize {
        self.vertices
            .iter()
            .filter(|vertex| matches!(vertex, VertexRecord::Person(_)))
            .count()
    }

    pub fn family_count(&self) -> usize {
        self.vertices
            .iter()
            .filter(|vertex| matches!(vertex, VertexRecord::Family(_)))
            .count()
    }

    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }

    pub fn vertex_count(&self) -> usize {
        self.vertices.len()
    }

    pub fn add_person(&mut self, person: Person) -> Result<VertexId, GedcomError> {
        let id = VertexId(self.vertices.len());
        if self.id_to_vertex.insert(person.id.clone(), id).is_some() {
            return Err(GedcomError::DuplicateId(person.id));
        }
        self.vertices.push(VertexRecord::Person(person));
        self.out_edges.push(Vec::new());
        self.in_edges.push(Vec::new());
        Ok(id)
    }

    pub fn add_family(&mut self, family: Family) -> Result<VertexId, GedcomError> {
        let id = VertexId(self.vertices.len());
        if self.id_to_vertex.insert(family.id.clone(), id).is_some() {
            return Err(GedcomError::DuplicateId(family.id));
        }
        self.vertices.push(VertexRecord::Family(family));
        self.out_edges.push(Vec::new());
        self.in_edges.push(Vec::new());
        Ok(id)
    }

    pub fn add_edge(&mut self, from: VertexId, to: VertexId) {
        let index = self.edges.len();
        self.edges.push(EdgeRecord { from, to });
        self.out_edges[from.0].push(index);
        self.in_edges[to.0].push(index);
    }

    pub fn vertex(&self, id: VertexId) -> Option<&VertexRecord> {
        self.vertices.get(id.0)
    }

    pub fn vertex_ids(&self) -> impl Iterator<Item = VertexId> + '_ {
        (0..self.vertices.len()).map(VertexId)
    }

    pub fn person_vertex_ids(&self) -> Vec<VertexId> {
        self.vertex_ids()
            .filter(|id| self.is_person(*id))
            .collect::<Vec<_>>()
    }

    pub fn family_vertex_ids(&self) -> Vec<VertexId> {
        self.vertex_ids()
            .filter(|id| self.is_family(*id))
            .collect::<Vec<_>>()
    }

    pub fn person(&self, id: VertexId) -> Option<&Person> {
        match self.vertex(id)? {
            VertexRecord::Person(person) => Some(person),
            VertexRecord::Family(_) => None,
        }
    }

    pub fn family(&self, id: VertexId) -> Option<&Family> {
        match self.vertex(id)? {
            VertexRecord::Family(family) => Some(family),
            VertexRecord::Person(_) => None,
        }
    }

    pub fn vertex_id_by_external_id(&self, id: &str) -> Option<VertexId> {
        self.id_to_vertex.get(id).copied()
    }

    pub fn edges(&self) -> &[EdgeRecord] {
        &self.edges
    }

    pub fn edge(&self, index: usize) -> Option<&EdgeRecord> {
        self.edges.get(index)
    }

    pub fn vertex_external_id(&self, id: VertexId) -> Option<&str> {
        match self.vertex(id)? {
            VertexRecord::Person(person) => Some(person.id.as_str()),
            VertexRecord::Family(family) => Some(family.id.as_str()),
        }
    }

    pub fn vertex_display_label(&self, id: VertexId) -> Option<String> {
        match self.vertex(id)? {
            VertexRecord::Person(person) => {
                if person.display_name.is_empty() {
                    Some(person.id.clone())
                } else {
                    Some(person.display_name.clone())
                }
            }
            VertexRecord::Family(family) => {
                let spouses = self
                    .successors(id)
                    .into_iter()
                    .filter_map(|vertex_id| self.person(vertex_id))
                    .map(|person| {
                        if person.display_name.is_empty() {
                            person.id.clone()
                        } else {
                            person.display_name.clone()
                        }
                    })
                    .collect::<Vec<_>>();
                if !spouses.is_empty() {
                    Some(spouses.join(" + "))
                } else {
                    Some(family.id.clone())
                }
            }
        }
    }

    pub fn outgoing_edge_indices(&self, id: VertexId) -> &[usize] {
        &self.out_edges[id.0]
    }

    pub fn incoming_edge_indices(&self, id: VertexId) -> &[usize] {
        &self.in_edges[id.0]
    }

    pub fn successors(&self, id: VertexId) -> Vec<VertexId> {
        self.outgoing_edge_indices(id)
            .iter()
            .map(|edge_index| self.edges[*edge_index].to)
            .collect::<Vec<_>>()
    }

    pub fn predecessors(&self, id: VertexId) -> Vec<VertexId> {
        self.incoming_edge_indices(id)
            .iter()
            .map(|edge_index| self.edges[*edge_index].from)
            .collect::<Vec<_>>()
    }

    pub fn successor_count(&self, id: VertexId) -> usize {
        self.out_edges[id.0].len()
    }

    pub fn predecessor_count(&self, id: VertexId) -> usize {
        self.in_edges[id.0].len()
    }

    pub fn ascendants(&self, id: VertexId) -> Vec<VertexId> {
        self.successors(id)
    }

    pub fn descendants(&self, id: VertexId) -> Vec<VertexId> {
        self.predecessors(id)
    }

    pub fn ascendant_count(&self, id: VertexId) -> usize {
        self.successor_count(id)
    }

    pub fn descendant_count(&self, id: VertexId) -> usize {
        self.predecessor_count(id)
    }

    pub fn is_orphan(&self, id: VertexId) -> bool {
        self.ascendant_count(id) == 0
    }

    pub fn is_sterile(&self, id: VertexId) -> bool {
        self.descendant_count(id) == 0
    }

    pub fn incident_edge_indices(&self, id: VertexId) -> Vec<usize> {
        self.out_edges[id.0]
            .iter()
            .chain(self.in_edges[id.0].iter())
            .copied()
            .collect::<Vec<_>>()
    }

    pub fn is_person(&self, id: VertexId) -> bool {
        matches!(self.vertex(id), Some(VertexRecord::Person(_)))
    }

    pub fn is_family(&self, id: VertexId) -> bool {
        matches!(self.vertex(id), Some(VertexRecord::Family(_)))
    }

    pub fn weak_components(&self) -> Vec<Vec<VertexId>> {
        let mut visited = vec![false; self.vertex_count()];
        let mut components = Vec::<Vec<VertexId>>::new();

        for start in self.vertex_ids() {
            if visited[start.0] {
                continue;
            }

            let mut queue = VecDeque::from([start]);
            let mut component = Vec::<VertexId>::new();
            visited[start.0] = true;

            while let Some(current) = queue.pop_front() {
                component.push(current);

                for neighbor in self
                    .successors(current)
                    .into_iter()
                    .chain(self.predecessors(current))
                {
                    if !visited[neighbor.0] {
                        visited[neighbor.0] = true;
                        queue.push_back(neighbor);
                    }
                }
            }

            components.push(component);
        }

        components.sort_by_key(|component| std::cmp::Reverse(component.len()));
        components
    }

    pub fn component_index_map(&self) -> Vec<usize> {
        let mut indices = vec![usize::MAX; self.vertex_count()];
        for (component_index, component) in self.weak_components().iter().enumerate() {
            for vertex in component {
                indices[vertex.0] = component_index;
            }
        }
        indices
    }

    pub fn vertex_kind(&self, id: VertexId) -> Option<VertexKind> {
        match self.vertices.get(id.0)? {
            VertexRecord::Person(_) => Some(VertexKind::Person),
            VertexRecord::Family(_) => Some(VertexKind::Family),
        }
    }

    pub fn person_parent_ids(&self, id: VertexId) -> Vec<VertexId> {
        if !self.is_person(id) {
            return Vec::new();
        }

        let mut parents = BTreeSet::<usize>::new();
        for family in self.ascendants(id) {
            if !self.is_family(family) {
                continue;
            }
            for parent in self.ascendants(family) {
                if self.is_person(parent) {
                    parents.insert(parent.0);
                }
            }
        }

        parents.into_iter().map(VertexId).collect::<Vec<_>>()
    }

    pub fn person_spouse_ids(&self, id: VertexId) -> Vec<VertexId> {
        if !self.is_person(id) {
            return Vec::new();
        }

        let mut spouses = BTreeSet::<usize>::new();
        for family in self.descendants(id) {
            if !self.is_family(family) {
                continue;
            }
            for spouse in self.ascendants(family) {
                if spouse != id && self.is_person(spouse) {
                    spouses.insert(spouse.0);
                }
            }
        }

        spouses.into_iter().map(VertexId).collect::<Vec<_>>()
    }

    pub fn person_child_ids(&self, id: VertexId) -> Vec<VertexId> {
        if !self.is_person(id) {
            return Vec::new();
        }

        let mut children = BTreeSet::<usize>::new();
        for family in self.descendants(id) {
            if !self.is_family(family) {
                continue;
            }
            for child in self.descendants(family) {
                if child != id && self.is_person(child) {
                    children.insert(child.0);
                }
            }
        }

        children.into_iter().map(VertexId).collect::<Vec<_>>()
    }

    pub fn person_sibling_ids(&self, id: VertexId) -> Vec<VertexId> {
        if !self.is_person(id) {
            return Vec::new();
        }

        let mut siblings = BTreeSet::<usize>::new();
        for family in self.ascendants(id) {
            if !self.is_family(family) {
                continue;
            }
            for sibling in self.descendants(family) {
                if sibling != id && self.is_person(sibling) {
                    siblings.insert(sibling.0);
                }
            }
        }

        siblings.into_iter().map(VertexId).collect::<Vec<_>>()
    }

    pub fn person_parent_family_ids(&self, id: VertexId) -> Vec<VertexId> {
        if !self.is_person(id) {
            return Vec::new();
        }
        self.ascendants(id)
            .into_iter()
            .filter(|vertex_id| self.is_family(*vertex_id))
            .collect::<Vec<_>>()
    }

    pub fn person_spouse_family_ids(&self, id: VertexId) -> Vec<VertexId> {
        if !self.is_person(id) {
            return Vec::new();
        }
        self.descendants(id)
            .into_iter()
            .filter(|vertex_id| self.is_family(*vertex_id))
            .collect::<Vec<_>>()
    }
}

#[cfg(test)]
mod tests {
    use crate::parse_gedcom;

    #[test]
    fn derives_person_semantic_relationships() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME Parent /One/
1 FAMS @F1@
0 @I2@ INDI
1 NAME Parent /Two/
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /One/
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let child = graph
            .vertex_id_by_external_id("@I3@")
            .expect("child should exist");
        let parent_one = graph
            .vertex_id_by_external_id("@I1@")
            .expect("parent should exist");

        assert_eq!(graph.person_parent_ids(child).len(), 2);
        assert_eq!(graph.person_spouse_ids(parent_one).len(), 1);
        assert_eq!(graph.person_child_ids(parent_one).len(), 1);
        assert_eq!(graph.person_sibling_ids(child).len(), 0);
    }

    #[test]
    fn derives_person_siblings() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME Parent /One/
1 FAMS @F1@
0 @I2@ INDI
1 NAME Parent /Two/
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /One/
1 FAMC @F1@
0 @I4@ INDI
1 NAME Child /Two/
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 CHIL @I4@
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let child_one = graph
            .vertex_id_by_external_id("@I3@")
            .expect("child should exist");

        assert_eq!(graph.person_sibling_ids(child_one).len(), 1);
    }
}
