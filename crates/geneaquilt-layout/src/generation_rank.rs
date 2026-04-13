use std::collections::{HashSet, VecDeque};

use geneaquilt_core::{GeneaGraph, model::VertexId};

#[derive(Debug, Clone, PartialEq)]
pub struct LayoutState {
    pub layers: Vec<usize>,
    pub x_positions: Vec<f64>,
    pub components: Vec<usize>,
    pub ordered_layers: Vec<Vec<VertexId>>,
    pub max_layer: usize,
}

pub fn assign_layers(graph: &GeneaGraph) -> LayoutState {
    let mut sources = graph.edges().iter().map(|edge| edge.from).collect::<Vec<_>>();
    let mut targets = graph.edges().iter().map(|edge| edge.to).collect::<Vec<_>>();

    for edge_index in cycle_edges(graph) {
        std::mem::swap(&mut sources[edge_index], &mut targets[edge_index]);
    }

    let (out_edges, in_edges) = oriented_adjacency(graph.vertex_count(), &sources, &targets);
    let components = graph.weak_components();
    let component_map = graph.component_index_map();
    let mut layers = vec![-1isize; graph.vertex_count()];

    for component in &components {
        assign_component_layers(graph, component, &sources, &targets, &out_edges, &in_edges, &mut layers);
    }

    tighten_edge_spans(&sources, &targets, &mut layers);
    fix_component_parity(graph, &components, &mut layers);

    let min_layer = layers.iter().copied().min().unwrap_or(0);
    if min_layer < 0 {
        for layer in &mut layers {
            *layer -= min_layer;
        }
    }

    let normalized_layers = layers
        .iter()
        .map(|layer| usize::try_from(*layer).expect("layers must be non-negative"))
        .collect::<Vec<_>>();
    let max_layer = normalized_layers.iter().copied().max().unwrap_or(0);

    LayoutState {
        x_positions: vec![0.0; graph.vertex_count()],
        ordered_layers: vec![Vec::new(); max_layer + 1],
        max_layer,
        layers: normalized_layers,
        components: component_map,
    }
}

fn tighten_edge_spans(sources: &[VertexId], targets: &[VertexId], layers: &mut [isize]) {
    let mut changed = true;
    let mut remaining = sources.len().saturating_mul(4).max(1);

    while changed && remaining > 0 {
        remaining -= 1;
        changed = false;

        for (from, to) in sources.iter().zip(targets.iter()) {
            let desired_target = layers[from.0] - 1;
            if layers[to.0] < desired_target {
                layers[to.0] = desired_target;
                changed = true;
            }
        }
    }
}

fn cycle_edges(graph: &GeneaGraph) -> HashSet<usize> {
    let mut colors = vec![0u8; graph.vertex_count()];
    let mut cycles = HashSet::<usize>::new();

    for vertex in graph.vertex_ids() {
        if colors[vertex.0] == 0 {
            dfs_cycle_edges(graph, vertex, &mut colors, &mut cycles);
        }
    }

    cycles
}

fn dfs_cycle_edges(
    graph: &GeneaGraph,
    vertex: VertexId,
    colors: &mut [u8],
    cycles: &mut HashSet<usize>,
) {
    colors[vertex.0] = 1;

    for edge_index in graph.outgoing_edge_indices(vertex) {
        let edge = graph.edge(*edge_index).expect("edge index must resolve");
        let next = edge.to;
        match colors[next.0] {
            0 => dfs_cycle_edges(graph, next, colors, cycles),
            1 => {
                cycles.insert(*edge_index);
            }
            _ => {}
        }
    }

    colors[vertex.0] = 2;
}

fn oriented_adjacency(
    vertex_count: usize,
    sources: &[VertexId],
    targets: &[VertexId],
) -> (Vec<Vec<usize>>, Vec<Vec<usize>>) {
    let mut out_edges = vec![Vec::<usize>::new(); vertex_count];
    let mut in_edges = vec![Vec::<usize>::new(); vertex_count];

    for (edge_index, (from, to)) in sources.iter().zip(targets.iter()).enumerate() {
        out_edges[from.0].push(edge_index);
        in_edges[to.0].push(edge_index);
    }

    (out_edges, in_edges)
}

fn assign_component_layers(
    graph: &GeneaGraph,
    component: &[VertexId],
    sources: &[VertexId],
    targets: &[VertexId],
    out_edges: &[Vec<usize>],
    in_edges: &[Vec<usize>],
    layers: &mut [isize],
) {
    init_rank(graph, component, sources, targets, out_edges, in_edges, layers);
    feasible_tree(component, sources, targets, out_edges, in_edges, layers);

    let mut min_layer = component.iter().map(|vertex| layers[vertex.0]).min().unwrap_or(0);
    if min_layer % 2 != 0 {
        min_layer -= 1;
    }

    if min_layer != 0 {
        for vertex in component {
            layers[vertex.0] -= min_layer;
        }
    }
}

fn init_rank(
    graph: &GeneaGraph,
    component: &[VertexId],
    sources: &[VertexId],
    targets: &[VertexId],
    out_edges: &[Vec<usize>],
    in_edges: &[Vec<usize>],
    layers: &mut [isize],
) {
    let component_set = component.iter().map(|vertex| vertex.0).collect::<HashSet<_>>();
    let mut queue = VecDeque::<VertexId>::new();
    let mut processed = HashSet::<usize>::new();

    for vertex in component {
        let outgoing = out_edges[vertex.0]
            .iter()
            .filter(|edge_index| component_set.contains(&targets[**edge_index].0))
            .count();
        if outgoing == 0 {
            queue.push_back(*vertex);
        }
    }

    while let Some(vertex) = queue.pop_front() {
        if !processed.insert(vertex.0) {
            continue;
        }

        let mut layer = if graph.is_family(vertex) { 1 } else { 0 };
        for edge_index in &out_edges[vertex.0] {
            let next = targets[*edge_index];
            if component_set.contains(&next.0) {
                layer = layer.max(layers[next.0] + 1);
            }
        }
        layers[vertex.0] = layer;

        for edge_index in &in_edges[vertex.0] {
            let descendant = sources[*edge_index];
            if !component_set.contains(&descendant.0) {
                continue;
            }

            let ready = out_edges[descendant.0]
                .iter()
                .filter(|candidate| component_set.contains(&targets[**candidate].0))
                .all(|candidate| processed.contains(&targets[*candidate].0));
            if ready {
                queue.push_back(descendant);
            }
        }
    }
}

fn feasible_tree(
    component: &[VertexId],
    sources: &[VertexId],
    targets: &[VertexId],
    out_edges: &[Vec<usize>],
    in_edges: &[Vec<usize>],
    layers: &mut [isize],
) {
    if component.len() <= 1 {
        return;
    }

    let component_set = component.iter().map(|vertex| vertex.0).collect::<HashSet<_>>();

    loop {
        let (tree_nodes, tree_edges) = tight_tree(component, &component_set, sources, targets, out_edges, in_edges, layers);
        if tree_nodes.len() >= component.len() {
            break;
        }

        let mut best_edge = None::<usize>;
        let mut best_slack = isize::MAX;

        for vertex in component {
            for edge_index in &in_edges[vertex.0] {
                if tree_edges.contains(edge_index) {
                    continue;
                }
                if incident_vertex(*edge_index, &tree_nodes, sources, targets).is_none() {
                    continue;
                }

                let slack = slack(*edge_index, layers, sources, targets);
                if slack < best_slack {
                    best_slack = slack;
                    best_edge = Some(*edge_index);
                }
            }
        }

        let Some(edge_index) = best_edge else {
            break;
        };

        let mut delta = slack(edge_index, layers, sources, targets);
        if delta != 0 {
            if incident_vertex(edge_index, &tree_nodes, sources, targets) == Some(sources[edge_index]) {
                delta = -delta;
            }
            for vertex in &tree_nodes {
                layers[vertex.0] += delta;
            }
        } else {
            break;
        }
    }
}

fn tight_tree(
    component: &[VertexId],
    component_set: &HashSet<usize>,
    sources: &[VertexId],
    targets: &[VertexId],
    out_edges: &[Vec<usize>],
    in_edges: &[Vec<usize>],
    layers: &[isize],
) -> (HashSet<VertexId>, HashSet<usize>) {
    let mut tree_nodes = HashSet::<VertexId>::new();
    let mut tree_edges = HashSet::<usize>::new();

    for vertex in component {
        tree_search(
            *vertex,
            component.len(),
            component_set,
            sources,
            targets,
            out_edges,
            in_edges,
            layers,
            &mut tree_nodes,
            &mut tree_edges,
        );
        if !tree_edges.is_empty() {
            break;
        }
    }

    (tree_nodes, tree_edges)
}

fn tree_search(
    vertex: VertexId,
    node_target: usize,
    component_set: &HashSet<usize>,
    sources: &[VertexId],
    targets: &[VertexId],
    out_edges: &[Vec<usize>],
    in_edges: &[Vec<usize>],
    layers: &[isize],
    tree_nodes: &mut HashSet<VertexId>,
    tree_edges: &mut HashSet<usize>,
) -> bool {
    tree_nodes.insert(vertex);

    for edge_index in &out_edges[vertex.0] {
        let head = targets[*edge_index];
        if !component_set.contains(&head.0) {
            continue;
        }
        if !tree_nodes.contains(&head) && slack(*edge_index, layers, sources, targets) == 0 {
            add_tree_edge(*edge_index, sources, targets, tree_nodes, tree_edges);
            if tree_edges.len() == node_target - 1
                || tree_search(
                    head,
                    node_target,
                    component_set,
                    sources,
                    targets,
                    out_edges,
                    in_edges,
                    layers,
                    tree_nodes,
                    tree_edges,
                )
            {
                return true;
            }
        }
    }

    for edge_index in &in_edges[vertex.0] {
        let tail = sources[*edge_index];
        if !component_set.contains(&tail.0) {
            continue;
        }
        if !tree_nodes.contains(&tail) && slack(*edge_index, layers, sources, targets) == 0 {
            add_tree_edge(*edge_index, sources, targets, tree_nodes, tree_edges);
            if tree_edges.len() == node_target - 1
                || tree_search(
                    tail,
                    node_target,
                    component_set,
                    sources,
                    targets,
                    out_edges,
                    in_edges,
                    layers,
                    tree_nodes,
                    tree_edges,
                )
            {
                return true;
            }
        }
    }

    false
}

fn add_tree_edge(
    edge_index: usize,
    sources: &[VertexId],
    targets: &[VertexId],
    tree_nodes: &mut HashSet<VertexId>,
    tree_edges: &mut HashSet<usize>,
) {
    tree_edges.insert(edge_index);
    tree_nodes.insert(sources[edge_index]);
    tree_nodes.insert(targets[edge_index]);
}

fn incident_vertex(
    edge_index: usize,
    tree_nodes: &HashSet<VertexId>,
    sources: &[VertexId],
    targets: &[VertexId],
) -> Option<VertexId> {
    let source = sources[edge_index];
    let target = targets[edge_index];

    if tree_nodes.contains(&source) {
        if !tree_nodes.contains(&target) {
            return Some(source);
        }
    } else if tree_nodes.contains(&target) {
        return Some(target);
    }

    None
}

fn slack(edge_index: usize, layers: &[isize], sources: &[VertexId], targets: &[VertexId]) -> isize {
    layers[sources[edge_index].0] - layers[targets[edge_index].0] - 1
}

fn fix_component_parity(graph: &GeneaGraph, components: &[Vec<VertexId>], layers: &mut [isize]) {
    if components.len() < 2 {
        return;
    }

    let mut deepest_index = 0usize;
    let mut deepest_depth = -1isize;
    let mut last_vertices = Vec::<VertexId>::with_capacity(components.len());

    for (index, component) in components.iter().enumerate() {
        let mut min_layer = isize::MAX;
        let mut max_layer = isize::MIN;
        let mut last_vertex = component[0];

        for vertex in component {
            let layer = layers[vertex.0];
            if layer > max_layer {
                max_layer = layer;
                last_vertex = *vertex;
            }
            min_layer = min_layer.min(layer);
        }

        let depth = max_layer - min_layer + 1;
        if depth > deepest_depth {
            deepest_depth = depth;
            deepest_index = index;
        }

        last_vertices.push(last_vertex);
    }

    let deepest_is_family = graph.is_family(last_vertices[deepest_index]);
    for (index, component) in components.iter().enumerate() {
        if index == deepest_index {
            continue;
        }

        if deepest_is_family != graph.is_family(last_vertices[index]) {
            for vertex in component {
                layers[vertex.0] -= 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use geneaquilt_core::parse_gedcom;

    use super::assign_layers;

    #[test]
    fn assigns_non_negative_layers() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME John /Doe/
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /Doe/
1 FAMC @F1@
0 @F1@ FAM
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let state = assign_layers(&graph);

        assert_eq!(state.layers.len(), graph.vertex_count());
        assert!(state.layers.iter().all(|layer| *layer <= state.max_layer));
    }

    #[test]
    fn aligns_spouse_without_parents_to_family_generation() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME Spouse /WithoutParents/
1 FAMS @F1@
0 @I2@ INDI
1 NAME Spouse /WithParents/
1 FAMS @F1@
1 FAMC @F0@
0 @I3@ INDI
1 NAME Parent /One/
1 FAMS @F0@
0 @I4@ INDI
1 NAME Parent /Two/
1 FAMS @F0@
0 @F0@ FAM
1 HUSB @I3@
1 WIFE @I4@
1 CHIL @I2@
0 @I5@ INDI
1 NAME Child /One/
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 CHIL @I5@
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let state = assign_layers(&graph);
        let spouse_without_parents = graph
            .vertex_id_by_external_id("@I1@")
            .expect("spouse should exist");
        let spouse_with_parents = graph
            .vertex_id_by_external_id("@I2@")
            .expect("partner should exist");

        assert_eq!(
            state.layers[spouse_without_parents.0],
            state.layers[spouse_with_parents.0]
        );
    }
}
