use std::collections::VecDeque;

use crate::graph::GeneaGraph;
use crate::model::VertexId;
use crate::selection::{SelectionState, trace};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DoiValue(pub usize);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DoiNode {
    Vertex(VertexId),
    Edge(usize),
}

pub fn compute_selection_doi(graph: &GeneaGraph, selection: SelectionState) -> Vec<Option<DoiValue>> {
    let trace_result = trace(graph, selection);
    let mut vertex_distances = vec![usize::MAX; graph.vertex_count()];
    let mut edge_distances = vec![usize::MAX; graph.edge_count()];
    let mut queue = VecDeque::<DoiNode>::new();

    for vertex in trace_result.vertices {
        if vertex_distances[vertex.0] > 0 {
            vertex_distances[vertex.0] = 0;
            queue.push_back(DoiNode::Vertex(vertex));
        }
    }

    while let Some(node) = queue.pop_front() {
        match node {
            DoiNode::Vertex(vertex) => {
                let next_distance = vertex_distances[vertex.0].saturating_add(1);
                for edge_index in graph.incident_edge_indices(vertex) {
                    if edge_distances[edge_index] > next_distance {
                        edge_distances[edge_index] = next_distance;
                        queue.push_back(DoiNode::Edge(edge_index));
                    }
                }
            }
            DoiNode::Edge(edge_index) => {
                let Some(edge) = graph.edge(edge_index) else {
                    continue;
                };
                let next_distance = edge_distances[edge_index].saturating_add(1);
                for vertex in [edge.from, edge.to] {
                    if vertex_distances[vertex.0] > next_distance {
                        vertex_distances[vertex.0] = next_distance;
                        queue.push_back(DoiNode::Vertex(vertex));
                    }
                }
            }
        }
    }

    vertex_distances
        .into_iter()
        .map(|distance| {
            if distance == usize::MAX {
                None
            } else {
                Some(DoiValue(distance))
            }
        })
        .collect::<Vec<_>>()
}

#[cfg(test)]
mod tests {
    use crate::{model::VertexId, parse_gedcom, selection::HighlightMode};

    use super::{DoiValue, compute_selection_doi};

    #[test]
    fn computes_doi_from_selection_trace() {
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
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let doi = compute_selection_doi(
            &graph,
            crate::selection::SelectionState {
                selected: VertexId(0),
                mode: HighlightMode::Successors,
            },
        );

        assert_eq!(doi[0], Some(DoiValue(0)));
    }
}
