use std::collections::{BTreeSet, HashSet, VecDeque};

use geneaquilt_core::{GeneaGraph, model::VertexId};

use crate::generation_rank::{LayoutState, assign_layers};

const CHILD_WEIGHT: i64 = 1_000;
const SPOUSE_WEIGHT: i64 = 120;
const FAMILY_WEIGHT: i64 = 80;
const DATE_WEIGHT: i64 = 40;
const STABILITY_WEIGHT: i64 = 15;
const SPAN_WEIGHT: i64 = 10;
const CLUSTER_SEARCH_DEPTH: usize = 3;
const CLUSTER_SEARCH_WIDTH: usize = 24;

#[derive(Debug, Clone)]
struct MoveBlock {
    vertices: Vec<VertexId>,
}

#[derive(Debug)]
struct ComponentContext<'a> {
    graph: &'a GeneaGraph,
    vertices: Vec<VertexId>,
    vertex_set: HashSet<usize>,
    family_vertices: Vec<VertexId>,
    seed_mismatched_families: HashSet<usize>,
    edge_indices: Vec<usize>,
    dated_vertices: Vec<VertexId>,
    mismatch_clusters: Vec<Vec<VertexId>>,
    seed_layers: &'a [isize],
    blocks: Vec<MoveBlock>,
}

#[derive(Debug, Clone)]
struct SearchState {
    layers: Vec<isize>,
    profile: Vec<usize>,
    cost: i64,
}

pub fn assign_layers_v2(graph: &GeneaGraph) -> LayoutState {
    let mut state = assign_layers(graph);
    let seed_layers = state
        .layers
        .iter()
        .map(|layer| *layer as isize)
        .collect::<Vec<_>>();
    let mut layers = seed_layers.clone();

    for component in graph.weak_components() {
        let context = ComponentContext::new(graph, component, &seed_layers);
        optimize_component(&context, &mut layers);
    }

    normalize_layers(&mut layers);
    let normalized_layers = layers
        .iter()
        .map(|layer| usize::try_from(*layer).expect("optimized layers must be non-negative"))
        .collect::<Vec<_>>();
    let max_layer = normalized_layers.iter().copied().max().unwrap_or(0);

    state.layers = normalized_layers;
    state.max_layer = max_layer;
    state.ordered_layers = vec![Vec::new(); max_layer + 1];
    state.x_positions.fill(0.0);
    state
}

impl<'a> ComponentContext<'a> {
    fn new(graph: &'a GeneaGraph, vertices: Vec<VertexId>, seed_layers: &'a [isize]) -> Self {
        let vertex_set = vertices
            .iter()
            .map(|vertex| vertex.0)
            .collect::<HashSet<_>>();
        let family_vertices = vertices
            .iter()
            .copied()
            .filter(|vertex| graph.is_family(*vertex))
            .collect::<Vec<_>>();
        let seed_mismatched_families = family_vertices
            .iter()
            .filter(|family_id| family_has_mismatch(graph, seed_layers, **family_id))
            .map(|family_id| family_id.0)
            .collect::<HashSet<_>>();
        let edge_indices = collect_component_edges(graph, &vertex_set);
        let dated_vertices = vertices
            .iter()
            .copied()
            .filter(|vertex| vertex_has_dates(graph, *vertex))
            .collect::<Vec<_>>();
        let mismatch_clusters = mismatch_clusters(graph, &vertex_set, &seed_mismatched_families);
        let blocks = build_move_blocks(graph, &vertices, &vertex_set, &seed_mismatched_families);

        Self {
            graph,
            vertices,
            vertex_set,
            family_vertices,
            seed_mismatched_families,
            edge_indices,
            dated_vertices,
            mismatch_clusters,
            seed_layers,
            blocks,
        }
    }
}

fn optimize_component(context: &ComponentContext<'_>, layers: &mut [isize]) {
    if context.vertices.len() <= 1 || context.blocks.is_empty() {
        return;
    }

    let mut current_cost = component_cost(context, layers);
    let mut current_profile = mismatch_profile(context, layers);
    let mut remaining = context.blocks.len().saturating_mul(8).max(16);

    while remaining > 0 {
        remaining -= 1;

        let mut best = None::<(usize, isize, Vec<usize>, i64, usize)>;
        for (index, block) in context.blocks.iter().enumerate() {
            for delta in [-2isize, 2isize] {
                if !is_move_feasible(context, layers, block, delta) {
                    continue;
                }

                apply_move(layers, block, delta);
                let candidate_profile = mismatch_profile(context, layers);
                let candidate_cost = component_cost(context, layers);
                apply_move(layers, block, -delta);

                let improves_profile = profile_is_better(&candidate_profile, &current_profile);
                let same_profile = candidate_profile == current_profile;
                if !improves_profile && (!same_profile || candidate_cost >= current_cost) {
                    continue;
                }

                let size = block.vertices.len();
                match best {
                    None => best = Some((index, delta, candidate_profile, candidate_cost, size)),
                    Some((_, _, ref best_profile, best_cost, best_size)) => {
                        if profile_is_better(&candidate_profile, best_profile)
                            || (candidate_profile == *best_profile
                                && (candidate_cost < best_cost
                                    || (candidate_cost == best_cost && size < best_size)))
                        {
                            best = Some((index, delta, candidate_profile, candidate_cost, size));
                        }
                    }
                }
            }
        }

        let Some((best_index, best_delta, best_profile, best_cost, _)) = best else {
            break;
        };
        apply_move(layers, &context.blocks[best_index], best_delta);
        current_profile = best_profile;
        current_cost = best_cost;
    }

    optimize_mismatch_clusters(context, layers, &mut current_profile, &mut current_cost);
}

fn optimize_mismatch_clusters(
    context: &ComponentContext<'_>,
    layers: &mut [isize],
    current_profile: &mut Vec<usize>,
    current_cost: &mut i64,
) {
    for cluster in &context.mismatch_clusters {
        if cluster.len() <= 1 {
            continue;
        }

        let cluster_set = cluster
            .iter()
            .map(|vertex| vertex.0)
            .collect::<HashSet<_>>();
        let cluster_blocks = context
            .blocks
            .iter()
            .filter(|block| {
                !block.vertices.is_empty()
                    && block
                        .vertices
                        .iter()
                        .all(|vertex| cluster_set.contains(&vertex.0))
            })
            .cloned()
            .collect::<Vec<_>>();

        if cluster_blocks.is_empty() {
            continue;
        }

        let base_state = SearchState {
            layers: layers.to_vec(),
            profile: current_profile.clone(),
            cost: *current_cost,
        };

        let best = beam_search_cluster(context, cluster, &cluster_blocks, &base_state);
        if is_state_better(&best, &base_state) {
            layers.copy_from_slice(&best.layers);
            *current_profile = best.profile;
            *current_cost = best.cost;
        }
    }
}

fn beam_search_cluster(
    context: &ComponentContext<'_>,
    cluster: &[VertexId],
    cluster_blocks: &[MoveBlock],
    base_state: &SearchState,
) -> SearchState {
    let cluster_order = cluster.iter().map(|vertex| vertex.0).collect::<Vec<_>>();
    let mut best = base_state.clone();
    let mut frontier = vec![base_state.clone()];

    for _ in 0..CLUSTER_SEARCH_DEPTH {
        let mut candidates = Vec::<SearchState>::new();
        let mut seen = HashSet::<Vec<isize>>::new();

        for state in &frontier {
            for block in cluster_blocks {
                for delta in [-2isize, 2isize] {
                    if !is_move_feasible(context, &state.layers, block, delta) {
                        continue;
                    }

                    let mut next_layers = state.layers.clone();
                    apply_move(&mut next_layers, block, delta);
                    let signature = cluster_signature(&next_layers, &cluster_order);
                    if !seen.insert(signature) {
                        continue;
                    }

                    let next_state = SearchState {
                        profile: mismatch_profile(context, &next_layers),
                        cost: component_cost(context, &next_layers),
                        layers: next_layers,
                    };

                    if is_state_better(&next_state, &best) {
                        best = next_state.clone();
                    }
                    candidates.push(next_state);
                }
            }
        }

        if candidates.is_empty() {
            break;
        }

        candidates.sort_by(compare_states);
        candidates.truncate(CLUSTER_SEARCH_WIDTH);
        frontier = candidates;
    }

    best
}

fn cluster_signature(layers: &[isize], cluster_order: &[usize]) -> Vec<isize> {
    cluster_order
        .iter()
        .map(|index| layers[*index])
        .collect::<Vec<_>>()
}

fn is_state_better(candidate: &SearchState, current: &SearchState) -> bool {
    profile_is_better(&candidate.profile, &current.profile)
        || (candidate.profile == current.profile && candidate.cost < current.cost)
}

fn compare_states(left: &SearchState, right: &SearchState) -> std::cmp::Ordering {
    if profile_is_better(&left.profile, &right.profile) {
        std::cmp::Ordering::Less
    } else if profile_is_better(&right.profile, &left.profile) {
        std::cmp::Ordering::Greater
    } else {
        left.cost.cmp(&right.cost)
    }
}

fn mismatch_profile(context: &ComponentContext<'_>, layers: &[isize]) -> Vec<usize> {
    let mut gaps = context
        .seed_mismatched_families
        .iter()
        .copied()
        .map(VertexId)
        .map(|family_id| family_gap(context.graph, layers, family_id))
        .collect::<Vec<_>>();
    gaps.sort_unstable_by(|left, right| right.cmp(left));
    gaps
}

fn profile_is_better(candidate: &[usize], current: &[usize]) -> bool {
    for (candidate_gap, current_gap) in candidate.iter().zip(current.iter()) {
        if candidate_gap < current_gap {
            return true;
        }
        if candidate_gap > current_gap {
            return false;
        }
    }
    false
}

fn component_cost(context: &ComponentContext<'_>, layers: &[isize]) -> i64 {
    let child_generation_cost = child_generation_cost(context, layers);
    let spouse_alignment_cost = spouse_alignment_cost(context, layers);
    let family_compactness_cost = family_compactness_cost(context, layers);
    let date_anchor_cost = date_anchor_cost(context, layers);
    let stability_cost = stability_cost(context, layers);
    let edge_span_cost = edge_span_cost(context, layers);

    CHILD_WEIGHT * child_generation_cost
        + SPOUSE_WEIGHT * spouse_alignment_cost
        + FAMILY_WEIGHT * family_compactness_cost
        + DATE_WEIGHT * date_anchor_cost
        + STABILITY_WEIGHT * stability_cost
        + SPAN_WEIGHT * edge_span_cost
}

fn child_generation_cost(context: &ComponentContext<'_>, layers: &[isize]) -> i64 {
    let mut total = 0i64;

    for family_id in &context.family_vertices {
        let family_layer = layers[family_id.0];
        for child_id in context.graph.descendants(*family_id) {
            if !context.vertex_set.contains(&child_id.0) {
                continue;
            }
            let expected = family_layer + 1;
            let gap = (layers[child_id.0] - expected).abs() as i64;
            total += gap * gap;
        }
    }

    total
}

fn spouse_alignment_cost(context: &ComponentContext<'_>, layers: &[isize]) -> i64 {
    let mut total = 0i64;

    for family_id in &context.family_vertices {
        let spouses = context
            .graph
            .ascendants(*family_id)
            .into_iter()
            .filter(|vertex| context.vertex_set.contains(&vertex.0))
            .collect::<Vec<_>>();
        if spouses.is_empty() {
            continue;
        }

        let expected = layers[family_id.0] - 1;
        let anchored_spouses = spouses
            .iter()
            .filter(|vertex| {
                context
                    .graph
                    .person(**vertex)
                    .is_some_and(|person| !person.famc.is_empty())
            })
            .count() as i64;
        let spouse_gap_sum = spouses
            .iter()
            .map(|vertex| (layers[vertex.0] - expected).abs() as i64)
            .sum::<i64>();
        let spouse_gap_square_sum = spouses
            .iter()
            .map(|vertex| {
                let gap = (layers[vertex.0] - expected).abs() as i64;
                gap * gap
            })
            .sum::<i64>();
        let mismatch_presence = i64::from(spouse_gap_sum > 0);

        total += spouse_gap_square_sum * (1 + anchored_spouses);
        total += mismatch_presence * (4 + anchored_spouses * 2);

        if spouses.len() >= 2 {
            let min_layer = spouses
                .iter()
                .map(|vertex| layers[vertex.0])
                .min()
                .unwrap_or(0);
            let max_layer = spouses
                .iter()
                .map(|vertex| layers[vertex.0])
                .max()
                .unwrap_or(0);
            let pair_gap = (max_layer - min_layer).abs() as i64;
            total += pair_gap * pair_gap;
        }
    }

    total
}

fn family_compactness_cost(context: &ComponentContext<'_>, layers: &[isize]) -> i64 {
    let mut total = 0i64;

    for family_id in &context.family_vertices {
        let family_layer = layers[family_id.0];
        for spouse_id in context.graph.ascendants(*family_id) {
            if !context.vertex_set.contains(&spouse_id.0) {
                continue;
            }

            let expected = family_layer - 1;
            let gap = (layers[spouse_id.0] - expected).abs() as i64;
            let hardness = spouse_hardness(context.graph, spouse_id);
            total += hardness * gap * gap;
        }

        for child_id in context.graph.descendants(*family_id) {
            if !context.vertex_set.contains(&child_id.0) {
                continue;
            }

            let expected = family_layer + 1;
            let gap = (layers[child_id.0] - expected).abs() as i64;
            total += gap;
        }
    }

    total
}

fn date_anchor_cost(context: &ComponentContext<'_>, layers: &[isize]) -> i64 {
    if context.dated_vertices.is_empty() {
        return 0;
    }

    let mut shifts = context
        .dated_vertices
        .iter()
        .map(|vertex| layers[vertex.0] - context.seed_layers[vertex.0])
        .collect::<Vec<_>>();
    shifts.sort_unstable();
    let anchor_shift = shifts[shifts.len() / 2];

    let divergence = context
        .dated_vertices
        .iter()
        .map(|vertex| {
            let shift = layers[vertex.0] - context.seed_layers[vertex.0];
            (shift - anchor_shift).abs() as i64
        })
        .sum::<i64>();

    divergence + anchor_shift.abs() as i64 * context.dated_vertices.len() as i64
}

fn stability_cost(context: &ComponentContext<'_>, layers: &[isize]) -> i64 {
    context
        .vertices
        .iter()
        .map(|vertex| (layers[vertex.0] - context.seed_layers[vertex.0]).abs() as i64)
        .sum::<i64>()
}

fn edge_span_cost(context: &ComponentContext<'_>, layers: &[isize]) -> i64 {
    context
        .edge_indices
        .iter()
        .map(|edge_index| {
            let edge = context
                .graph
                .edge(*edge_index)
                .expect("component edge should resolve");
            (layers[edge.from.0] - layers[edge.to.0] - 1).max(0) as i64
        })
        .sum::<i64>()
}

fn spouse_hardness(graph: &GeneaGraph, spouse_id: VertexId) -> i64 {
    let Some(person) = graph.person(spouse_id) else {
        return 1;
    };

    if !person.famc.is_empty() {
        4
    } else if person.fams.len() > 1 {
        2
    } else {
        1
    }
}

fn is_move_feasible(
    context: &ComponentContext<'_>,
    layers: &[isize],
    block: &MoveBlock,
    delta: isize,
) -> bool {
    for vertex in &block.vertices {
        if layers[vertex.0] + delta < 0 {
            return false;
        }
    }

    let block_set = block
        .vertices
        .iter()
        .map(|vertex| vertex.0)
        .collect::<HashSet<_>>();
    for edge_index in &context.edge_indices {
        let edge = context
            .graph
            .edge(*edge_index)
            .expect("component edge should resolve");
        let from_layer = moved_layer(layers, &block_set, edge.from, delta);
        let to_layer = moved_layer(layers, &block_set, edge.to, delta);

        if from_layer < to_layer + 1 {
            return false;
        }
    }

    for family_id in &context.family_vertices {
        let family_layer = if block_set.contains(&family_id.0) {
            layers[family_id.0] + delta
        } else {
            layers[family_id.0]
        };

        for child_id in context.graph.descendants(*family_id) {
            if !context.vertex_set.contains(&child_id.0) {
                continue;
            }
            let child_layer = if block_set.contains(&child_id.0) {
                layers[child_id.0] + delta
            } else {
                layers[child_id.0]
            };
            if child_layer != family_layer + 1 {
                return false;
            }
        }
    }

    for family_id in &context.family_vertices {
        if single_spouse_family_gap_worsens(context, layers, &block_set, *family_id, delta) {
            return false;
        }
        if !context.seed_mismatched_families.contains(&family_id.0)
            && family_has_mismatch_after_move(context, layers, &block_set, *family_id, delta)
        {
            return false;
        }
    }

    true
}

fn moved_layer(
    layers: &[isize],
    block_set: &HashSet<usize>,
    vertex: VertexId,
    delta: isize,
) -> isize {
    if block_set.contains(&vertex.0) {
        layers[vertex.0] + delta
    } else {
        layers[vertex.0]
    }
}

fn single_spouse_family_gap_worsens(
    context: &ComponentContext<'_>,
    layers: &[isize],
    block_set: &HashSet<usize>,
    family_id: VertexId,
    delta: isize,
) -> bool {
    let spouses = context
        .graph
        .ascendants(family_id)
        .into_iter()
        .filter(|vertex| context.vertex_set.contains(&vertex.0))
        .collect::<Vec<_>>();
    let children = context
        .graph
        .descendants(family_id)
        .into_iter()
        .filter(|vertex| context.vertex_set.contains(&vertex.0))
        .collect::<Vec<_>>();

    if spouses.len() != 1 || children.is_empty() {
        return false;
    }

    let spouse_id = spouses[0];
    let Some(person) = context.graph.person(spouse_id) else {
        return false;
    };
    if person.famc.is_empty() {
        return false;
    }

    let old_family_layer = layers[family_id.0];
    let old_spouse_layer = layers[spouse_id.0];
    let new_family_layer = moved_layer(layers, block_set, family_id, delta);
    let new_spouse_layer = moved_layer(layers, block_set, spouse_id, delta);

    let old_gap = (old_family_layer - (old_spouse_layer + 1)).abs();
    let new_gap = (new_family_layer - (new_spouse_layer + 1)).abs();
    new_gap > old_gap
}

fn family_has_mismatch_after_move(
    context: &ComponentContext<'_>,
    layers: &[isize],
    block_set: &HashSet<usize>,
    family_id: VertexId,
    delta: isize,
) -> bool {
    let family_layer = moved_layer(layers, block_set, family_id, delta);
    let spouse_mismatch = context
        .graph
        .ascendants(family_id)
        .into_iter()
        .filter(|vertex| context.vertex_set.contains(&vertex.0))
        .any(|spouse_id| moved_layer(layers, block_set, spouse_id, delta) + 1 != family_layer);
    if spouse_mismatch {
        return true;
    }

    context
        .graph
        .descendants(family_id)
        .into_iter()
        .filter(|vertex| context.vertex_set.contains(&vertex.0))
        .any(|child_id| moved_layer(layers, block_set, child_id, delta) != family_layer + 1)
}

fn family_has_mismatch(graph: &GeneaGraph, layers: &[isize], family_id: VertexId) -> bool {
    family_gap(graph, layers, family_id) > 0
}

fn family_gap(graph: &GeneaGraph, layers: &[isize], family_id: VertexId) -> usize {
    let family_layer = layers[family_id.0];
    graph
        .ascendants(family_id)
        .into_iter()
        .map(|spouse_id| layers[spouse_id.0].abs_diff(family_layer - 1))
        .chain(
            graph
                .descendants(family_id)
                .into_iter()
                .map(|child_id| layers[child_id.0].abs_diff(family_layer + 1)),
        )
        .max()
        .unwrap_or(0)
}

fn apply_move(layers: &mut [isize], block: &MoveBlock, delta: isize) {
    for vertex in &block.vertices {
        layers[vertex.0] += delta;
    }
}

fn normalize_layers(layers: &mut [isize]) {
    let min_layer = layers.iter().copied().min().unwrap_or(0);
    if min_layer < 0 {
        for layer in layers {
            *layer -= min_layer;
        }
    }
}

fn build_move_blocks(
    graph: &GeneaGraph,
    vertices: &[VertexId],
    vertex_set: &HashSet<usize>,
    seed_mismatched_families: &HashSet<usize>,
) -> Vec<MoveBlock> {
    let mut unique = BTreeSet::<Vec<usize>>::new();

    for vertex in vertices {
        unique.insert(vec![vertex.0]);
    }

    for family_id in vertices
        .iter()
        .copied()
        .filter(|vertex| graph.is_family(*vertex))
    {
        let spouses = graph
            .ascendants(family_id)
            .into_iter()
            .filter(|vertex| vertex_set.contains(&vertex.0))
            .collect::<Vec<_>>();
        let children = graph
            .descendants(family_id)
            .into_iter()
            .filter(|vertex| vertex_set.contains(&vertex.0))
            .collect::<Vec<_>>();

        insert_block(
            &mut unique,
            std::iter::once(family_id).chain(spouses.iter().copied()),
        );
        insert_block(
            &mut unique,
            std::iter::once(family_id).chain(children.iter().copied()),
        );
        insert_block(
            &mut unique,
            std::iter::once(family_id)
                .chain(spouses.iter().copied())
                .chain(children.iter().copied()),
        );
    }

    for vertex in vertices {
        insert_block(
            &mut unique,
            transitive_closure(graph, *vertex, Direction::Ascendants)
                .into_iter()
                .filter(|candidate| vertex_set.contains(&candidate.0)),
        );
        if graph.is_person(*vertex) {
            insert_block(
                &mut unique,
                ancestry_branch_closure(graph, *vertex)
                    .into_iter()
                    .filter(|candidate| vertex_set.contains(&candidate.0)),
            );
        }
    }

    for cluster in mismatch_clusters(graph, vertex_set, seed_mismatched_families) {
        insert_block(&mut unique, cluster.into_iter());
    }

    unique
        .into_iter()
        .filter(|vertices| !vertices.is_empty())
        .map(|vertices| MoveBlock {
            vertices: vertices.into_iter().map(VertexId).collect::<Vec<_>>(),
        })
        .collect::<Vec<_>>()
}

fn insert_block(unique: &mut BTreeSet<Vec<usize>>, vertices: impl Iterator<Item = VertexId>) {
    let mut block = vertices.map(|vertex| vertex.0).collect::<Vec<_>>();
    if block.is_empty() {
        return;
    }
    block.sort_unstable();
    block.dedup();
    unique.insert(block);
}

#[derive(Clone, Copy)]
enum Direction {
    Ascendants,
}

fn transitive_closure(graph: &GeneaGraph, start: VertexId, direction: Direction) -> Vec<VertexId> {
    let mut visited = HashSet::<usize>::new();
    let mut queue = VecDeque::<VertexId>::new();
    let mut closure = Vec::<VertexId>::new();

    visited.insert(start.0);
    queue.push_back(start);

    while let Some(vertex) = queue.pop_front() {
        closure.push(vertex);
        let neighbors = match direction {
            Direction::Ascendants => graph.ascendants(vertex),
        };

        for next in neighbors {
            if visited.insert(next.0) {
                queue.push_back(next);
            }
        }
    }

    closure
}

fn mismatch_clusters(
    graph: &GeneaGraph,
    vertex_set: &HashSet<usize>,
    seed_mismatched_families: &HashSet<usize>,
) -> Vec<Vec<VertexId>> {
    if seed_mismatched_families.is_empty() {
        return Vec::new();
    }

    let family_ids = seed_mismatched_families
        .iter()
        .copied()
        .map(VertexId)
        .collect::<Vec<_>>();
    let family_clusters = family_ids
        .iter()
        .map(|family_id| mismatch_family_cluster(graph, *family_id, vertex_set))
        .collect::<Vec<_>>();
    let mut visited = HashSet::<usize>::new();
    let mut clusters = Vec::<Vec<VertexId>>::new();

    for family_id in &family_ids {
        if !visited.insert(family_id.0) {
            continue;
        }

        let mut queue = VecDeque::<VertexId>::from([*family_id]);
        let mut cluster_vertices = BTreeSet::<usize>::new();

        while let Some(current_family) = queue.pop_front() {
            let current_cluster = &family_clusters[family_ids
                .iter()
                .position(|family| family == &current_family)
                .expect("mismatch family should have a cluster")];
            for vertex in current_cluster {
                cluster_vertices.insert(vertex.0);
            }

            for other_family in &family_ids {
                if visited.contains(&other_family.0) {
                    continue;
                }
                let other_cluster = &family_clusters[family_ids
                    .iter()
                    .position(|family| family == other_family)
                    .expect("mismatch family should have a cluster")];
                if clusters_overlap(current_cluster, other_cluster) {
                    visited.insert(other_family.0);
                    queue.push_back(*other_family);
                }
            }
        }

        clusters.push(
            cluster_vertices
                .into_iter()
                .map(VertexId)
                .collect::<Vec<_>>(),
        );
    }

    clusters
}

fn mismatch_family_cluster(
    graph: &GeneaGraph,
    family_id: VertexId,
    vertex_set: &HashSet<usize>,
) -> Vec<VertexId> {
    let max_family_hops = 2usize;
    let mut seen = HashSet::<usize>::new();
    let mut queue = VecDeque::<(VertexId, usize)>::from([(family_id, 0usize)]);
    let mut cluster = Vec::<VertexId>::new();

    while let Some((vertex, family_hops)) = queue.pop_front() {
        if !vertex_set.contains(&vertex.0) || !seen.insert(vertex.0) {
            continue;
        }
        cluster.push(vertex);

        match graph.vertex(vertex) {
            Some(geneaquilt_core::VertexRecord::Family(_)) => {
                for person_id in graph
                    .ascendants(vertex)
                    .into_iter()
                    .chain(graph.descendants(vertex).into_iter())
                {
                    queue.push_back((person_id, family_hops));
                }
            }
            Some(geneaquilt_core::VertexRecord::Person(_)) => {
                if family_hops >= max_family_hops {
                    continue;
                }
                for next_family in graph
                    .ascendants(vertex)
                    .into_iter()
                    .chain(graph.descendants(vertex).into_iter())
                {
                    queue.push_back((next_family, family_hops + 1));
                }
            }
            None => {}
        }
    }

    cluster
}

fn clusters_overlap(left: &[VertexId], right: &[VertexId]) -> bool {
    let left_ids = left.iter().map(|vertex| vertex.0).collect::<HashSet<_>>();
    right.iter().any(|vertex| left_ids.contains(&vertex.0))
}

fn ancestry_branch_closure(graph: &GeneaGraph, start: VertexId) -> Vec<VertexId> {
    let mut visited = HashSet::<usize>::new();
    let mut queue = VecDeque::<VertexId>::new();
    let mut closure = Vec::<VertexId>::new();

    visited.insert(start.0);
    queue.push_back(start);

    while let Some(vertex) = queue.pop_front() {
        closure.push(vertex);

        match graph.vertex(vertex) {
            Some(geneaquilt_core::VertexRecord::Person(_)) => {
                for family_id in graph.ascendants(vertex) {
                    if visited.insert(family_id.0) {
                        queue.push_back(family_id);
                    }
                }
            }
            Some(geneaquilt_core::VertexRecord::Family(_)) => {
                for parent_id in graph.ascendants(vertex) {
                    if visited.insert(parent_id.0) {
                        queue.push_back(parent_id);
                    }
                }
                for child_id in graph.descendants(vertex) {
                    if visited.insert(child_id.0) {
                        queue.push_back(child_id);
                    }
                }
            }
            None => {}
        }
    }

    closure
}

fn collect_component_edges(graph: &GeneaGraph, vertex_set: &HashSet<usize>) -> Vec<usize> {
    graph
        .edges()
        .iter()
        .enumerate()
        .filter_map(|(edge_index, edge)| {
            if vertex_set.contains(&edge.from.0) && vertex_set.contains(&edge.to.0) {
                Some(edge_index)
            } else {
                None
            }
        })
        .collect::<Vec<_>>()
}

fn vertex_has_dates(graph: &GeneaGraph, vertex_id: VertexId) -> bool {
    match graph.vertex(vertex_id) {
        Some(geneaquilt_core::VertexRecord::Person(person)) => person.date_range.is_some(),
        Some(geneaquilt_core::VertexRecord::Family(family)) => family.date_range.is_some(),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use geneaquilt_core::parse_gedcom;

    use crate::audit::audit_family_generation_mismatches;

    use super::assign_layers_v2;

    #[test]
    fn v2_preserves_simple_family_structure() {
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
        let state = assign_layers_v2(&graph);

        assert!(audit_family_generation_mismatches(&graph, &state).is_empty());
    }

    #[test]
    fn v2_does_not_introduce_child_mismatches_in_cycle_case() {
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
        let mismatches = audit_family_generation_mismatches(&graph, &assign_layers_v2(&graph));

        assert!(mismatches.iter().all(|mismatch| !mismatch.child_mismatch));
    }
}
