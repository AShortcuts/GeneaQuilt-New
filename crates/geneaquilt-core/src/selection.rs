use std::collections::HashSet;

use crate::graph::GeneaGraph;
use crate::model::VertexId;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HighlightMode {
    All,
    None,
    Predecessors,
    Successors,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelectionState {
    pub selected: VertexId,
    pub mode: HighlightMode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TraceResult {
    pub vertices: Vec<VertexId>,
    pub edges: Vec<usize>,
}

pub fn trace(graph: &GeneaGraph, selection: SelectionState) -> TraceResult {
    let mut vertices = HashSet::<VertexId>::from([selection.selected]);
    let mut edges = HashSet::<usize>::new();

    match selection.mode {
        HighlightMode::All => {
            trace_predecessors(graph, selection.selected, &mut vertices, &mut edges);
            trace_successors(graph, selection.selected, &mut vertices, &mut edges);
        }
        HighlightMode::None => {}
        HighlightMode::Predecessors => {
            trace_predecessors(graph, selection.selected, &mut vertices, &mut edges);
        }
        HighlightMode::Successors => {
            trace_successors(graph, selection.selected, &mut vertices, &mut edges);
        }
    }

    let mut vertices = vertices.into_iter().collect::<Vec<_>>();
    vertices.sort_by_key(|vertex| vertex.0);

    let mut edges = edges.into_iter().collect::<Vec<_>>();
    edges.sort_unstable();

    TraceResult { vertices, edges }
}

fn trace_predecessors(
    graph: &GeneaGraph,
    vertex: VertexId,
    vertices: &mut HashSet<VertexId>,
    edges: &mut HashSet<usize>,
) {
    for edge_index in graph.incoming_edge_indices(vertex) {
        edges.insert(*edge_index);
        let Some(edge) = graph.edge(*edge_index) else {
            continue;
        };
        if vertices.insert(edge.from) {
            trace_predecessors(graph, edge.from, vertices, edges);
        }
    }
}

fn trace_successors(
    graph: &GeneaGraph,
    vertex: VertexId,
    vertices: &mut HashSet<VertexId>,
    edges: &mut HashSet<usize>,
) {
    for edge_index in graph.outgoing_edge_indices(vertex) {
        edges.insert(*edge_index);
        let Some(edge) = graph.edge(*edge_index) else {
            continue;
        };
        if vertices.insert(edge.to) {
            trace_successors(graph, edge.to, vertices, edges);
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::parse_gedcom;

    use super::{HighlightMode, SelectionState, trace};

    #[test]
    fn traces_predecessors_and_successors() {
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
        let selected = graph
            .vertex_id_by_external_id("@F1@")
            .expect("family vertex should exist");
        let result = trace(
            &graph,
            SelectionState {
                selected,
                mode: HighlightMode::All,
            },
        );

        assert!(result.vertices.len() >= 3);
        assert!(!result.edges.is_empty());
    }
}
