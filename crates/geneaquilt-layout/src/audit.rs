use std::collections::HashSet;

use geneaquilt_core::{GeneaGraph, model::VertexId};

use crate::{LayoutState, generation_rank::cycle_edges};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LayeredVertex {
    pub id: String,
    pub label: String,
    pub layer: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FamilyGenerationMismatch {
    pub family_id: String,
    pub family_label: String,
    pub family_layer: usize,
    pub spouse_layers: Vec<LayeredVertex>,
    pub child_layers: Vec<LayeredVertex>,
    pub spouse_mismatch: bool,
    pub child_mismatch: bool,
    pub cycle_component: bool,
    pub anchored_spouse_count: usize,
    pub max_gap: usize,
}

pub fn audit_family_generation_mismatches(
    graph: &GeneaGraph,
    state: &LayoutState,
) -> Vec<FamilyGenerationMismatch> {
    let cycle_components = cycle_component_indices(graph);
    let mut mismatches = Vec::<FamilyGenerationMismatch>::new();

    for family_id in graph.family_vertex_ids() {
        let family_layer = state.layers[family_id.0];
        let spouse_ids = graph.ascendants(family_id);
        let child_ids = graph.descendants(family_id);

        let spouse_layers = spouse_ids
            .iter()
            .map(|vertex_id| layered_vertex(graph, *vertex_id, state.layers[vertex_id.0]))
            .collect::<Vec<_>>();
        let child_layers = child_ids
            .iter()
            .map(|vertex_id| layered_vertex(graph, *vertex_id, state.layers[vertex_id.0]))
            .collect::<Vec<_>>();

        let spouse_mismatch = spouse_layers
            .iter()
            .any(|spouse| spouse.layer + 1 != family_layer);
        let child_mismatch = child_layers
            .iter()
            .any(|child| child.layer != family_layer + 1);

        if !spouse_mismatch && !child_mismatch {
            continue;
        }

        let anchored_spouse_count = spouse_ids
            .iter()
            .filter(|vertex_id| {
                graph
                    .person(**vertex_id)
                    .is_some_and(|person| !person.famc.is_empty())
            })
            .count();
        let component_index = graph.component_index_map()[family_id.0];
        let cycle_component = cycle_components.contains(&component_index);

        let max_gap = spouse_layers
            .iter()
            .map(|spouse| spouse.layer.abs_diff(family_layer.saturating_sub(1)))
            .chain(
                child_layers
                    .iter()
                    .map(|child| child.layer.abs_diff(family_layer + 1)),
            )
            .max()
            .unwrap_or(0);

        mismatches.push(FamilyGenerationMismatch {
            family_id: graph
                .vertex_external_id(family_id)
                .expect("family should have external id")
                .to_string(),
            family_label: graph
                .vertex_display_label(family_id)
                .expect("family should have display label"),
            family_layer,
            spouse_layers,
            child_layers,
            spouse_mismatch,
            child_mismatch,
            cycle_component,
            anchored_spouse_count,
            max_gap,
        });
    }

    mismatches.sort_by(|left, right| {
        right
            .max_gap
            .cmp(&left.max_gap)
            .then_with(|| right.anchored_spouse_count.cmp(&left.anchored_spouse_count))
            .then_with(|| left.family_id.cmp(&right.family_id))
    });
    mismatches
}

fn layered_vertex(graph: &GeneaGraph, vertex_id: VertexId, layer: usize) -> LayeredVertex {
    LayeredVertex {
        id: graph
            .vertex_external_id(vertex_id)
            .expect("vertex should have external id")
            .to_string(),
        label: graph
            .vertex_display_label(vertex_id)
            .expect("vertex should have display label"),
        layer,
    }
}

fn cycle_component_indices(graph: &GeneaGraph) -> HashSet<usize> {
    let components = graph.component_index_map();
    let mut cycle_components = HashSet::<usize>::new();
    for edge_index in cycle_edges(graph) {
        let edge = graph.edge(edge_index).expect("cycle edge should resolve");
        cycle_components.insert(components[edge.from.0]);
        cycle_components.insert(components[edge.to.0]);
    }
    cycle_components
}

#[cfg(test)]
mod tests {
    use geneaquilt_core::parse_gedcom;

    use crate::assign_layers;

    use super::audit_family_generation_mismatches;

    #[test]
    fn reports_no_mismatch_for_simple_family() {
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
        let state = assign_layers(&graph);

        assert!(audit_family_generation_mismatches(&graph, &state).is_empty());
    }

    #[test]
    fn flags_spouse_only_mismatch_in_cycle_shaped_family() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME Father /One/
1 FAMS @F1@
1 FAMS @F2@
0 @I2@ INDI
1 NAME Mother /One/
1 FAMS @F1@
0 @I3@ INDI
1 NAME Daughter /One/
1 FAMC @F1@
1 FAMS @F2@
0 @I4@ INDI
1 NAME Child /Cycle/
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 @F2@ FAM
1 HUSB @I1@
1 WIFE @I3@
1 CHIL @I4@
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let state = assign_layers(&graph);
        let mismatches = audit_family_generation_mismatches(&graph, &state);

        assert_eq!(mismatches.len(), 1);
        assert_eq!(mismatches[0].family_id, "@F1@");
        assert!(mismatches[0].spouse_mismatch);
        assert!(!mismatches[0].child_mismatch);
        assert_eq!(mismatches[0].max_gap, 2);
    }
}
