use std::cmp::Ordering;

use geneaquilt_core::{GeneaGraph, model::VertexId};

use crate::generation_rank::LayoutState;

#[derive(Debug, Clone, PartialEq)]
pub struct OrderedLayer {
    pub index: usize,
    pub vertices: Vec<VertexId>,
}

impl OrderedLayer {
    pub fn new(index: usize, vertices: Vec<VertexId>) -> Self {
        Self { index, vertices }
    }
}

pub fn order_layers(graph: &GeneaGraph, layout: &mut LayoutState) {
    let mut layers = vec![Vec::<VertexId>::new(); layout.max_layer + 1];
    for vertex in graph.vertex_ids() {
        layers[layout.layers[vertex.0]].push(vertex);
    }

    seed_layer_order(graph, &mut layers);

    init_positions(&mut layers, &mut layout.x_positions);

    let mut changed = true;
    let mut remaining = 100usize;

    while changed && remaining > 0 {
        remaining -= 1;

        if layout.max_layer >= 1 {
            for layer_index in 0..layout.max_layer {
                update_barycenter_up(graph, &layers[layer_index], &mut layout.x_positions);
            }
        }

        if layout.max_layer >= 2 {
            for layer_index in (2..=layout.max_layer).rev() {
                update_barycenter_down(graph, &layers[layer_index], &mut layout.x_positions);
            }
        }

        changed = false;
        for layer in &mut layers {
            let before = layer.clone();
            layer.sort_by(|left, right| {
                compare_vertices(
                    graph,
                    *left,
                    *right,
                    &layout.components,
                    &layout.x_positions,
                )
            });
            if *layer != before {
                changed = true;
            }
        }

        init_positions(&mut layers, &mut layout.x_positions);
    }

    layout.ordered_layers = layers;
}

fn seed_layer_order(graph: &GeneaGraph, layers: &mut [Vec<VertexId>]) {
    for layer in layers {
        layer.sort_by(|left, right| seed_vertex_order(graph, *left).cmp(&seed_vertex_order(graph, *right)));
    }
}

fn init_positions(layers: &mut [Vec<VertexId>], x_positions: &mut [f64]) {
    for layer in layers {
        for (index, vertex) in layer.iter().enumerate() {
            x_positions[vertex.0] = index as f64;
        }
    }
}

fn update_barycenter_up(graph: &GeneaGraph, layer: &[VertexId], x_positions: &mut [f64]) {
    for vertex in layer {
        if let Some(barycenter) = barycenter(graph.predecessors(*vertex), x_positions) {
            x_positions[vertex.0] = barycenter;
        }
    }
}

fn update_barycenter_down(graph: &GeneaGraph, layer: &[VertexId], x_positions: &mut [f64]) {
    for vertex in layer {
        if let Some(barycenter) = barycenter(graph.successors(*vertex), x_positions) {
            x_positions[vertex.0] = barycenter;
        }
    }
}

fn barycenter(vertices: Vec<VertexId>, x_positions: &[f64]) -> Option<f64> {
    if vertices.is_empty() {
        return None;
    }

    let total = vertices.iter().map(|vertex| x_positions[vertex.0]).sum::<f64>();
    Some(total / vertices.len() as f64)
}

fn compare_vertices(
    graph: &GeneaGraph,
    left: VertexId,
    right: VertexId,
    components: &[usize],
    x_positions: &[f64],
) -> Ordering {
    match components[left.0].cmp(&components[right.0]) {
        Ordering::Equal => x_positions[left.0]
            .partial_cmp(&x_positions[right.0])
            .unwrap_or(Ordering::Equal)
            .then_with(|| seed_vertex_order(graph, left).cmp(&seed_vertex_order(graph, right))),
        other => other,
    }
}

fn seed_vertex_order(graph: &GeneaGraph, vertex: VertexId) -> (usize, usize, String) {
    let primary_edge = graph
        .incoming_edge_indices(vertex)
        .iter()
        .chain(graph.outgoing_edge_indices(vertex).iter())
        .copied()
        .min()
        .unwrap_or(usize::MAX);
    let edge_degree = graph.incident_edge_indices(vertex).len();
    let external_id = graph.vertex_external_id(vertex).unwrap_or("").to_string();
    (primary_edge, edge_degree, external_id)
}

#[cfg(test)]
mod tests {
    use geneaquilt_core::parse_gedcom;

    use crate::generation_rank::assign_layers;

    use super::order_layers;

    #[test]
    fn orders_all_vertices_into_layers() {
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
        let mut state = assign_layers(&graph);
        order_layers(&graph, &mut state);

        let ordered_count = state
            .ordered_layers
            .iter()
            .map(|layer| layer.len())
            .sum::<usize>();
        assert_eq!(ordered_count, graph.vertex_count());
    }

    #[test]
    fn does_not_bias_parent_order_toward_person_parse_order() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME Child /Person/
1 FAMC @F1@
0 @I2@ INDI
1 NAME Wife /Parent/
1 FAMS @F1@
0 @I3@ INDI
1 NAME Husband /Parent/
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I3@
1 WIFE @I2@
1 CHIL @I1@
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let mut state = assign_layers(&graph);
        order_layers(&graph, &mut state);

        let top_layer = &state.ordered_layers[0];
        let top_ids = top_layer
            .iter()
            .filter_map(|vertex| graph.vertex_external_id(*vertex))
            .collect::<Vec<_>>();

        assert_eq!(top_ids, vec!["@I3@", "@I2@"]);
    }
}
