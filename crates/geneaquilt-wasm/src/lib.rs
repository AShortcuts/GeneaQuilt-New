use std::collections::{HashMap, HashSet};

use geneaquilt_core::{
    Family, GeneaGraph, Person, VertexRecord, compute_selection_doi, parse_gedcom, trace,
};
use geneaquilt_core::{
    HighlightMode, SelectionState,
    timeline::{DateRange, accumulate_year_range, union_ranges},
};
use geneaquilt_layout::{LayoutState, assign_layers, assign_layers_v2, order_layers};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EngineStatus {
    pub website_target: bool,
    pub parser_ready: bool,
    pub layout_ready: bool,
    pub graph_counts: (usize, usize, usize),
}

#[derive(Debug, Clone, Serialize)]
struct LayoutSummary {
    people: usize,
    families: usize,
    edges: usize,
    layers: usize,
    components: usize,
    ordered_layer_sizes: Vec<usize>,
}

#[derive(Debug, Clone, Serialize)]
struct SceneBounds {
    width_slots: usize,
    height_layers: usize,
}

#[derive(Debug, Clone, Serialize)]
struct VertexSnapshot {
    id: String,
    label: String,
    kind: String,
    sex: Option<String>,
    layer: usize,
    order: usize,
    component: usize,
    date_start: Option<i32>,
    date_end: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
struct EdgeSnapshot {
    index: usize,
    from: String,
    to: String,
}

#[derive(Debug, Clone, Serialize)]
struct SceneSnapshot {
    summary: LayoutSummary,
    bounds: SceneBounds,
    vertices: Vec<VertexSnapshot>,
    edges: Vec<EdgeSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
struct InteractionSummary {
    selected_id: String,
    mode: String,
    highlighted_vertices: Vec<String>,
    highlighted_edges: Vec<usize>,
    connector_highlights: Vec<ConnectorHighlight>,
    doi: Vec<(String, usize)>,
    max_distance: usize,
}

#[derive(Debug, Clone, Serialize)]
struct ConnectorHighlight {
    edge_index: usize,
    show_from_connector: bool,
    show_to_connector: bool,
}

#[derive(Debug, Clone, Serialize)]
struct HighlightGroup {
    selected_id: String,
    color_index: usize,
    highlighted_vertices: Vec<String>,
    highlighted_edges: Vec<usize>,
    connector_highlights: Vec<ConnectorHighlight>,
}

#[derive(Debug, Clone, Serialize)]
struct MergedHighlightVertex {
    id: String,
    color_indices: Vec<usize>,
}

#[derive(Debug, Clone, Serialize)]
struct MergedHighlightEdge {
    edge_index: usize,
    color_indices: Vec<usize>,
}

#[derive(Debug, Clone, Serialize)]
struct MergedHighlightConnector {
    edge_index: usize,
    color_indices: Vec<usize>,
    show_from_connector: bool,
    show_to_connector: bool,
}

#[derive(Debug, Clone, Serialize)]
struct HighlightSummary {
    mode: String,
    groups: Vec<HighlightGroup>,
    merged_vertices: Vec<MergedHighlightVertex>,
    merged_edges: Vec<MergedHighlightEdge>,
    merged_connectors: Vec<MergedHighlightConnector>,
}

#[derive(Debug, Clone, Serialize)]
struct SearchHit {
    id: String,
    label: String,
    kind: String,
    layer: usize,
    order: usize,
}

#[derive(Debug, Clone, Serialize)]
struct PropertyEntry {
    key: String,
    values: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
struct VertexDetails {
    id: String,
    label: String,
    kind: String,
    layer: usize,
    order: usize,
    component: usize,
    parents: Vec<String>,
    spouses: Vec<String>,
    children: Vec<String>,
    parent_families: Vec<String>,
    spouse_families: Vec<String>,
    predecessors: Vec<String>,
    successors: Vec<String>,
    properties: Vec<PropertyEntry>,
    date_start: Option<i32>,
    date_end: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
struct BringAndSlideCandidate {
    id: String,
    label: String,
    relation: String,
    layer: usize,
    order: usize,
}

#[derive(Debug, Clone, Serialize)]
struct BringAndSlideSummary {
    focus_id: String,
    direction: String,
    candidates: Vec<BringAndSlideCandidate>,
}

#[derive(Debug, Clone, Serialize)]
struct TimelineBin {
    year: i32,
    total: u32,
    people: u32,
    families: u32,
    active_total: u32,
    active_people: u32,
    active_families: u32,
}

#[derive(Debug, Clone, Serialize)]
struct TimelineSummary {
    scope: String,
    start_year: i32,
    end_year: i32,
    total_vertices_with_dates: usize,
    active_vertices_with_dates: usize,
    active_range: Option<(i32, i32)>,
    selected_range: Option<(i32, i32)>,
    bins: Vec<TimelineBin>,
}

#[derive(Debug, Clone, Serialize)]
struct TimelineFocusSummary {
    scope: String,
    start_year: i32,
    end_year: i32,
    matching_vertices_with_dates: usize,
    matching_people: usize,
    matching_families: usize,
    vertex_ids: Vec<String>,
}

#[derive(Clone, Copy)]
enum RankerStrategy {
    Original,
    V2,
}

fn engine_status() -> EngineStatus {
    let graph = GeneaGraph::new();

    EngineStatus {
        website_target: true,
        parser_ready: true,
        layout_ready: true,
        graph_counts: (graph.person_count(), graph.family_count(), graph.edge_count()),
    }
}

#[wasm_bindgen]
pub fn engine_status_json() -> String {
    serde_json::to_string(&engine_status()).expect("engine status should serialize")
}

#[wasm_bindgen]
pub struct GeneaQuiltEngine {
    graph: GeneaGraph,
    layout: LayoutState,
}

#[wasm_bindgen]
impl GeneaQuiltEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(source: &str) -> Result<GeneaQuiltEngine, JsValue> {
        Self::with_ranker(source, "original")
    }

    pub fn with_ranker(source: &str, ranker: &str) -> Result<GeneaQuiltEngine, JsValue> {
        let graph = parse_gedcom(source).map_err(|error| JsValue::from_str(&error.to_string()))?;
        let mut layout = match parse_ranker(ranker).map_err(JsValue::from_str)? {
            RankerStrategy::Original => assign_layers(&graph),
            RankerStrategy::V2 => assign_layers_v2(&graph),
        };
        order_layers(&graph, &mut layout);

        Ok(Self { graph, layout })
    }

    pub fn summary_json(&self) -> String {
        serde_json::to_string(&self.layout_summary()).expect("layout summary should serialize")
    }

    pub fn scene_json(&self) -> String {
        let orders = order_lookup(&self.layout);
        let vertices = self
            .graph
            .vertex_ids()
            .map(|vertex_id| {
                let (id, label, kind, sex, date_range) = match self.graph.vertex(vertex_id) {
                    Some(VertexRecord::Person(person)) => {
                        person_snapshot_parts(person, date_range_of_person(person))
                    }
                    Some(VertexRecord::Family(family)) => {
                        family_snapshot_parts(
                            &self.graph,
                            vertex_id,
                            family,
                            date_range_of_family(family),
                        )
                    }
                    None => unreachable!("vertex ids come from graph"),
                };

                VertexSnapshot {
                    id,
                    label,
                    kind,
                    sex,
                    layer: self.layout.layers[vertex_id.0],
                    order: orders[vertex_id.0],
                    component: self.layout.components[vertex_id.0],
                    date_start: date_range.map(|range| range.start_year),
                    date_end: date_range.map(|range| range.end_year),
                }
            })
            .collect::<Vec<_>>();
        let edges = self
            .graph
            .edges()
            .iter()
            .enumerate()
            .map(|(index, edge)| EdgeSnapshot {
                index,
                from: self
                    .graph
                    .vertex_external_id(edge.from)
                    .expect("edge vertices should exist")
                    .to_string(),
                to: self
                    .graph
                    .vertex_external_id(edge.to)
                    .expect("edge vertices should exist")
                    .to_string(),
            })
            .collect::<Vec<_>>();
        let max_order = orders.iter().copied().max().unwrap_or(0).saturating_add(1);
        let snapshot = SceneSnapshot {
            summary: self.layout_summary(),
            bounds: SceneBounds {
                width_slots: max_order,
                height_layers: self.layout.max_layer.saturating_add(1),
            },
            vertices,
            edges,
        };

        serde_json::to_string(&snapshot).expect("scene snapshot should serialize")
    }

    pub fn interaction_json(&self, external_id: &str, mode: &str) -> Result<String, JsValue> {
        let selected = self.selected_vertex(external_id)?;
        let mode = parse_mode(mode)?;
        let connector_highlights =
            collect_connector_highlights(&self.graph, &self.layout, selected, mode);
        let trace_result = trace(
            &self.graph,
            SelectionState {
                selected,
                mode,
            },
        );
        let doi = compute_selection_doi(
            &self.graph,
            SelectionState {
                selected,
                mode,
            },
        );

        let doi_distances = doi
            .iter()
            .enumerate()
            .filter_map(|(index, value)| {
                let distance = match value {
                    Some(distance) => *distance,
                    None => return None,
                };
                let vertex_id = geneaquilt_core::model::VertexId(index);
                Some((
                    self.graph.vertex_external_id(vertex_id)?.to_string(),
                    distance.0,
                ))
            })
            .collect::<Vec<_>>();
        let max_distance = doi_distances.iter().map(|(_, distance)| *distance).max().unwrap_or(0);

        let summary = InteractionSummary {
            selected_id: external_id.to_string(),
            mode: mode_name(mode).to_string(),
            highlighted_vertices: trace_result
                .vertices
                .iter()
                .filter_map(|vertex_id| self.graph.vertex_external_id(*vertex_id).map(str::to_string))
                .collect::<Vec<_>>(),
            highlighted_edges: trace_result.edges,
            connector_highlights,
            doi: doi_distances,
            max_distance,
        };

        Ok(serde_json::to_string(&summary).expect("interaction summary should serialize"))
    }

    pub fn trace_json(&self, external_id: &str, mode: &str) -> Result<String, JsValue> {
        self.interaction_json(external_id, mode)
    }

    pub fn doi_json(&self, external_id: &str, mode: &str) -> Result<String, JsValue> {
        self.interaction_json(external_id, mode)
    }

    pub fn search_json(&self, query: &str, scope: &str) -> Result<String, JsValue> {
        let orders = order_lookup(&self.layout);
        let scope = parse_search_scope(scope)?;
        let terms = query
            .split_whitespace()
            .map(|term| term.trim().to_lowercase())
            .filter(|term| !term.is_empty())
            .collect::<Vec<_>>();

        let mut results = self
            .graph
            .vertex_ids()
            .filter_map(|vertex_id| {
                let id = self.graph.vertex_external_id(vertex_id)?;
                let label = self.graph.vertex_display_label(vertex_id)?;
                let kind = kind_name_from_graph(&self.graph, vertex_id)?;
                let haystack = search_haystack(&self.graph, vertex_id, id, &label, scope);
                if !terms.iter().all(|term| haystack.contains(term)) {
                    return None;
                }
                Some(SearchHit {
                    id: id.to_string(),
                    label,
                    kind: kind.to_string(),
                    layer: self.layout.layers[vertex_id.0],
                    order: orders[vertex_id.0],
                })
            })
            .collect::<Vec<_>>();

        results.sort_by(|left, right| left.label.cmp(&right.label).then(left.id.cmp(&right.id)));
        results.truncate(24);

        Ok(serde_json::to_string(&results).expect("search results should serialize"))
    }

    pub fn vertex_details_json(&self, external_id: &str) -> Result<String, JsValue> {
        let selected = self.selected_vertex(external_id)?;
        let orders = order_lookup(&self.layout);
        let (label, kind, properties, date_range) = match self.graph.vertex(selected) {
            Some(VertexRecord::Person(person)) => (
                self.graph
                    .vertex_display_label(selected)
                    .unwrap_or_else(|| person.id.clone()),
                "person".to_string(),
                property_entries(&person.properties),
                date_range_of_person(person),
            ),
            Some(VertexRecord::Family(family)) => (
                self.graph
                    .vertex_display_label(selected)
                    .unwrap_or_else(|| family.id.clone()),
                "family".to_string(),
                property_entries(&family.properties),
                date_range_of_family(family),
            ),
            None => unreachable!("selected vertex must exist"),
        };

        let (parents, spouses, children, parent_families, spouse_families) = if self.graph.is_person(selected)
        {
            (
                ids_to_labels(&self.graph, self.graph.person_parent_ids(selected)),
                ids_to_labels(&self.graph, self.graph.person_spouse_ids(selected)),
                ids_to_labels(&self.graph, self.graph.person_child_ids(selected)),
                ids_to_labels(&self.graph, self.graph.person_parent_family_ids(selected)),
                ids_to_labels(&self.graph, self.graph.person_spouse_family_ids(selected)),
            )
        } else {
            (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new())
        };

        let details = VertexDetails {
            id: external_id.to_string(),
            label,
            kind,
            layer: self.layout.layers[selected.0],
            order: orders[selected.0],
            component: self.layout.components[selected.0],
            parents,
            spouses,
            children,
            parent_families,
            spouse_families,
            predecessors: self
                .graph
                .descendants(selected)
                .iter()
                .filter_map(|vertex_id| self.graph.vertex_display_label(*vertex_id))
                .collect::<Vec<_>>(),
            successors: self
                .graph
                .ascendants(selected)
                .iter()
                .filter_map(|vertex_id| self.graph.vertex_display_label(*vertex_id))
                .collect::<Vec<_>>(),
            properties,
            date_start: date_range.map(|range| range.start_year),
            date_end: date_range.map(|range| range.end_year),
        };

        Ok(serde_json::to_string(&details).expect("vertex details should serialize"))
    }

    pub fn bring_and_slide_json(
        &self,
        external_id: &str,
        direction: &str,
    ) -> Result<String, JsValue> {
        let selected = self.selected_vertex(external_id)?;
        if !self.graph.is_person(selected) {
            let summary = BringAndSlideSummary {
                focus_id: external_id.to_string(),
                direction: direction.to_string(),
                candidates: Vec::new(),
            };
            return Ok(
                serde_json::to_string(&summary).expect("bring-and-slide summary should serialize"),
            );
        }

        let orders = order_lookup(&self.layout);
        let candidate_ids = match direction {
            "left" => self
                .graph
                .person_parent_ids(selected)
                .into_iter()
                .map(|vertex_id| (vertex_id, "parent"))
                .chain(
                    self.graph
                        .person_sibling_ids(selected)
                        .into_iter()
                        .map(|vertex_id| (vertex_id, "sibling")),
                )
                .collect::<Vec<_>>(),
            "right" => self
                .graph
                .person_spouse_ids(selected)
                .into_iter()
                .map(|vertex_id| (vertex_id, "spouse"))
                .chain(
                    self.graph
                        .person_child_ids(selected)
                        .into_iter()
                        .map(|vertex_id| (vertex_id, "child")),
                )
                .collect::<Vec<_>>(),
            _ => return Err(JsValue::from_str("invalid bring-and-slide direction")),
        };

        let mut candidates = candidate_ids
            .into_iter()
            .filter_map(|(vertex_id, relation)| {
                Some(BringAndSlideCandidate {
                    id: self.graph.vertex_external_id(vertex_id)?.to_string(),
                    label: self.graph.vertex_display_label(vertex_id)?,
                    relation: relation.to_string(),
                    layer: self.layout.layers[vertex_id.0],
                    order: orders[vertex_id.0],
                })
            })
            .collect::<Vec<_>>();

        candidates.sort_by(|left, right| {
            relation_rank(&left.relation)
                .cmp(&relation_rank(&right.relation))
                .then(
                    left.order
                .cmp(&right.order)
                .then(left.layer.cmp(&right.layer))
                .then(left.label.cmp(&right.label)))
        });

        let summary = BringAndSlideSummary {
            focus_id: external_id.to_string(),
            direction: direction.to_string(),
            candidates,
        };

        Ok(serde_json::to_string(&summary).expect("bring-and-slide summary should serialize"))
    }

    pub fn highlight_summary_json(
        &self,
        external_ids_json: &str,
        mode: &str,
    ) -> Result<String, JsValue> {
        let mode = parse_mode(mode)?;
        let external_ids = parse_external_ids_json(external_ids_json)?;
        let summary = build_highlight_summary(&self.graph, &self.layout, &external_ids, mode)?;
        Ok(serde_json::to_string(&summary).expect("highlight summary should serialize"))
    }

    pub fn timeline_json(
        &self,
        external_ids_json: &str,
        selected_id: Option<String>,
        scope: &str,
    ) -> Result<String, JsValue> {
        let external_ids = parse_external_ids_json(external_ids_json)?;
        let scope = parse_timeline_scope(scope)?;
        let summary =
            build_timeline_summary(&self.graph, &external_ids, selected_id.as_deref(), scope)?;
        Ok(serde_json::to_string(&summary).expect("timeline summary should serialize"))
    }

    pub fn timeline_focus_json(
        &self,
        start_year: i32,
        end_year: i32,
        scope: &str,
    ) -> Result<String, JsValue> {
        let scope = parse_timeline_scope(scope)?;
        let summary = build_timeline_focus_summary(&self.graph, start_year, end_year, scope)?;
        Ok(serde_json::to_string(&summary).expect("timeline focus summary should serialize"))
    }
}

impl GeneaQuiltEngine {
    fn layout_summary(&self) -> LayoutSummary {
        LayoutSummary {
            people: self.graph.person_count(),
            families: self.graph.family_count(),
            edges: self.graph.edge_count(),
            layers: self.layout.max_layer + 1,
            components: self.graph.weak_components().len(),
            ordered_layer_sizes: self
                .layout
                .ordered_layers
                .iter()
                .map(|layer| layer.len())
                .collect::<Vec<_>>(),
        }
    }

    fn selected_vertex(&self, external_id: &str) -> Result<geneaquilt_core::model::VertexId, JsValue> {
        self.graph
            .vertex_id_by_external_id(external_id)
            .ok_or_else(|| JsValue::from_str("vertex id not found"))
    }
}

fn property_entries(properties: &geneaquilt_core::model::PropertyMap) -> Vec<PropertyEntry> {
    properties
        .iter()
        .map(|(key, values)| PropertyEntry {
            key: key.clone(),
            values: values.clone(),
        })
        .collect::<Vec<_>>()
}

fn search_haystack(
    graph: &GeneaGraph,
    vertex_id: geneaquilt_core::VertexId,
    id: &str,
    label: &str,
    scope: SearchScope,
) -> String {
    let mut parts = Vec::<String>::new();

    if matches!(scope, SearchScope::All | SearchScope::Ids) {
        parts.push(id.to_lowercase());
    }
    if matches!(scope, SearchScope::All | SearchScope::Names) {
        parts.push(label.to_lowercase());
    }
    if !matches!(scope, SearchScope::Attributes | SearchScope::All) {
        return parts.join(" ");
    }

    match graph.vertex(vertex_id) {
        Some(VertexRecord::Person(person)) => {
            for (key, values) in &person.properties {
                parts.push(key.to_lowercase());
                parts.extend(values.iter().map(|value| value.to_lowercase()));
            }
        }
        Some(VertexRecord::Family(family)) => {
            for (key, values) in &family.properties {
                parts.push(key.to_lowercase());
                parts.extend(values.iter().map(|value| value.to_lowercase()));
            }
        }
        None => {}
    }

    parts.join(" ")
}

#[derive(Clone, Copy)]
enum SearchScope {
    All,
    Names,
    Ids,
    Attributes,
}

#[derive(Clone, Copy)]
enum TimelineScope {
    All,
    People,
    Families,
}

fn parse_search_scope(scope: &str) -> Result<SearchScope, JsValue> {
    match scope {
        "" | "all" => Ok(SearchScope::All),
        "names" => Ok(SearchScope::Names),
        "ids" => Ok(SearchScope::Ids),
        "attributes" => Ok(SearchScope::Attributes),
        _ => Err(JsValue::from_str("invalid search scope")),
    }
}

fn parse_timeline_scope(scope: &str) -> Result<TimelineScope, JsValue> {
    match scope {
        "" | "all" => Ok(TimelineScope::All),
        "people" => Ok(TimelineScope::People),
        "families" => Ok(TimelineScope::Families),
        _ => Err(JsValue::from_str("invalid timeline scope")),
    }
}

fn relation_rank(relation: &str) -> usize {
    match relation {
        "parent" => 0,
        "sibling" => 1,
        "spouse" => 0,
        "child" => 1,
        _ => 2,
    }
}

fn parse_ranker(ranker: &str) -> Result<RankerStrategy, &'static str> {
    match ranker {
        "" | "original" => Ok(RankerStrategy::Original),
        "v2" => Ok(RankerStrategy::V2),
        _ => Err("invalid ranker"),
    }
}

fn ids_to_labels(
    graph: &GeneaGraph,
    vertices: Vec<geneaquilt_core::model::VertexId>,
) -> Vec<String> {
    vertices
        .iter()
        .filter_map(|vertex_id| graph.vertex_display_label(*vertex_id))
        .collect::<Vec<_>>()
}

fn vertex_date_range(graph: &GeneaGraph, vertex_id: geneaquilt_core::model::VertexId) -> Option<DateRange> {
    match graph.vertex(vertex_id)? {
        VertexRecord::Person(person) => person.date_range,
        VertexRecord::Family(family) => family.date_range,
    }
}

fn person_snapshot_parts(
    person: &Person,
    date_range: Option<DateRange>,
) -> (String, String, String, Option<String>, Option<DateRange>) {
    (
        person.id.clone(),
        if person.display_name.is_empty() {
            person.id.clone()
        } else {
            person.display_name.clone()
        },
        "person".to_string(),
        person.sex.clone(),
        date_range,
    )
}

fn family_snapshot_parts(
    graph: &GeneaGraph,
    vertex_id: geneaquilt_core::model::VertexId,
    family: &Family,
    date_range: Option<DateRange>,
) -> (String, String, String, Option<String>, Option<DateRange>) {
    (
        family.id.clone(),
        graph
            .vertex_display_label(vertex_id)
            .unwrap_or_else(|| family.id.clone()),
        "family".to_string(),
        None,
        date_range,
    )
}

fn date_range_of_person(person: &Person) -> Option<DateRange> {
    person.date_range
}

fn date_range_of_family(family: &Family) -> Option<DateRange> {
    family.date_range
}

fn order_lookup(layout: &LayoutState) -> Vec<usize> {
    let mut orders = vec![0usize; layout.layers.len()];

    for layer in &layout.ordered_layers {
        for (order, vertex_id) in layer.iter().enumerate() {
            orders[vertex_id.0] = order;
        }
    }

    orders
}

fn kind_name_from_graph(graph: &GeneaGraph, vertex_id: geneaquilt_core::model::VertexId) -> Option<&'static str> {
    match graph.vertex(vertex_id)? {
        VertexRecord::Person(_) => Some("person"),
        VertexRecord::Family(_) => Some("family"),
    }
}

fn build_highlight_summary(
    graph: &GeneaGraph,
    layout: &LayoutState,
    external_ids: &[String],
    mode: HighlightMode,
) -> Result<HighlightSummary, JsValue> {
    let mut groups = Vec::<HighlightGroup>::new();
    let mut merged_vertices = HashMap::<String, Vec<usize>>::new();
    let mut merged_edges = HashMap::<usize, Vec<usize>>::new();
    let mut merged_connectors = HashMap::<usize, MergedHighlightConnector>::new();

    for (color_index, external_id) in external_ids.iter().enumerate() {
        let selected = graph
            .vertex_id_by_external_id(external_id)
            .ok_or_else(|| JsValue::from_str("vertex id not found"))?;
        let trace_result = trace(graph, SelectionState { selected, mode });
        let connector_highlights = collect_connector_highlights(graph, layout, selected, mode);

        let highlighted_vertices = trace_result
            .vertices
            .iter()
            .filter_map(|vertex_id| graph.vertex_external_id(*vertex_id).map(str::to_string))
            .collect::<Vec<_>>();
        for vertex_id in &highlighted_vertices {
            push_unique_color_index(merged_vertices.entry(vertex_id.clone()).or_default(), color_index);
        }

        for edge_index in &trace_result.edges {
            push_unique_color_index(merged_edges.entry(*edge_index).or_default(), color_index);
        }

        for connector in &connector_highlights {
            let entry = merged_connectors
                .entry(connector.edge_index)
                .or_insert(MergedHighlightConnector {
                    edge_index: connector.edge_index,
                    color_indices: Vec::new(),
                    show_from_connector: false,
                    show_to_connector: false,
                });
            push_unique_color_index(&mut entry.color_indices, color_index);
            entry.show_from_connector |= connector.show_from_connector;
            entry.show_to_connector |= connector.show_to_connector;
        }

        groups.push(HighlightGroup {
            selected_id: external_id.clone(),
            color_index,
            highlighted_vertices,
            highlighted_edges: trace_result.edges,
            connector_highlights,
        });
    }

    let mut merged_vertices = merged_vertices
        .into_iter()
        .map(|(id, color_indices)| MergedHighlightVertex { id, color_indices })
        .collect::<Vec<_>>();
    merged_vertices.sort_by(|left, right| left.id.cmp(&right.id));

    let mut merged_edges = merged_edges
        .into_iter()
        .map(|(edge_index, color_indices)| MergedHighlightEdge {
            edge_index,
            color_indices,
        })
        .collect::<Vec<_>>();
    merged_edges.sort_by_key(|edge| edge.edge_index);

    let mut merged_connectors = merged_connectors.into_values().collect::<Vec<_>>();
    merged_connectors.sort_by_key(|connector| connector.edge_index);

    Ok(HighlightSummary {
        mode: mode_name(mode).to_string(),
        groups,
        merged_vertices,
        merged_edges,
        merged_connectors,
    })
}

fn build_timeline_summary(
    graph: &GeneaGraph,
    active_external_ids: &[String],
    selected_id: Option<&str>,
    scope: TimelineScope,
) -> Result<TimelineSummary, JsValue> {
    let dated_vertices = graph
        .vertex_ids()
        .filter_map(|vertex_id| {
            let is_person = graph.is_person(vertex_id);
            if !timeline_scope_matches(scope, is_person) {
                return None;
            }
            vertex_date_range(graph, vertex_id).map(|range| (vertex_id, is_person, range))
        })
        .collect::<Vec<_>>();
    let Some(bounds) = union_ranges(dated_vertices.iter().map(|(_, _, range)| range)) else {
        return Ok(TimelineSummary {
            scope: timeline_scope_name(scope).to_string(),
            start_year: 0,
            end_year: 0,
            total_vertices_with_dates: 0,
            active_vertices_with_dates: 0,
            active_range: None,
            selected_range: None,
            bins: Vec::new(),
        });
    };
    let span = usize::try_from(bounds.end_year - bounds.start_year + 1)
        .expect("timeline span should be non-negative");

    let active_set = active_external_ids.iter().cloned().collect::<HashSet<_>>();
    let selected_range = selected_id
        .and_then(|id| graph.vertex_id_by_external_id(id))
        .and_then(|vertex_id| vertex_date_range(graph, vertex_id))
        .map(|range| (range.start_year, range.end_year));

    let mut total = vec![0u32; span];
    let mut people = vec![0u32; span];
    let mut families = vec![0u32; span];
    let mut active_total = vec![0u32; span];
    let mut active_people = vec![0u32; span];
    let mut active_families = vec![0u32; span];
    let mut active_ranges = Vec::<DateRange>::new();
    let mut active_vertices_with_dates = 0usize;

    for (vertex_id, is_person, range) in &dated_vertices {
        accumulate_year_range(&mut total, bounds, *range);
        if *is_person {
            accumulate_year_range(&mut people, bounds, *range);
        } else {
            accumulate_year_range(&mut families, bounds, *range);
        }

        if let Some(external_id) = graph.vertex_external_id(*vertex_id)
            && active_set.contains(external_id)
        {
            active_vertices_with_dates += 1;
            active_ranges.push(*range);
            accumulate_year_range(&mut active_total, bounds, *range);
            if *is_person {
                accumulate_year_range(&mut active_people, bounds, *range);
            } else {
                accumulate_year_range(&mut active_families, bounds, *range);
            }
        }
    }

    let bins = (0..span)
        .map(|index| TimelineBin {
            year: bounds.start_year + i32::try_from(index).expect("index should fit in i32"),
            total: total[index],
            people: people[index],
            families: families[index],
            active_total: active_total[index],
            active_people: active_people[index],
            active_families: active_families[index],
        })
        .collect::<Vec<_>>();

    Ok(TimelineSummary {
        scope: timeline_scope_name(scope).to_string(),
        start_year: bounds.start_year,
        end_year: bounds.end_year,
        total_vertices_with_dates: dated_vertices.len(),
        active_vertices_with_dates,
        active_range: union_ranges(active_ranges.iter()).map(|range| (range.start_year, range.end_year)),
        selected_range,
        bins,
    })
}

fn build_timeline_focus_summary(
    graph: &GeneaGraph,
    start_year: i32,
    end_year: i32,
    scope: TimelineScope,
) -> Result<TimelineFocusSummary, JsValue> {
    if start_year > end_year {
        return Err(JsValue::from_str("timeline focus range is invalid"));
    }

    let mut vertex_ids = Vec::<String>::new();
    let mut matching_people = 0usize;
    let mut matching_families = 0usize;

    for vertex_id in graph.vertex_ids() {
        let is_person = graph.is_person(vertex_id);
        if !timeline_scope_matches(scope, is_person) {
            continue;
        }
        let Some(range) = vertex_date_range(graph, vertex_id) else {
            continue;
        };
        if range.end_year < start_year || range.start_year > end_year {
            continue;
        }

        let Some(external_id) = graph.vertex_external_id(vertex_id) else {
            continue;
        };
        vertex_ids.push(external_id.to_string());
        if graph.is_person(vertex_id) {
            matching_people += 1;
        } else {
            matching_families += 1;
        }
    }

    vertex_ids.sort();

    Ok(TimelineFocusSummary {
        scope: timeline_scope_name(scope).to_string(),
        start_year,
        end_year,
        matching_vertices_with_dates: vertex_ids.len(),
        matching_people,
        matching_families,
        vertex_ids,
    })
}

fn timeline_scope_matches(scope: TimelineScope, is_person: bool) -> bool {
    match scope {
        TimelineScope::All => true,
        TimelineScope::People => is_person,
        TimelineScope::Families => !is_person,
    }
}

fn timeline_scope_name(scope: TimelineScope) -> &'static str {
    match scope {
        TimelineScope::All => "all",
        TimelineScope::People => "people",
        TimelineScope::Families => "families",
    }
}

fn collect_connector_highlights(
    graph: &GeneaGraph,
    layout: &LayoutState,
    selected: geneaquilt_core::model::VertexId,
    mode: HighlightMode,
) -> Vec<ConnectorHighlight> {
    let orders = order_lookup(layout);
    let mut connectors = HashMap::<usize, ConnectorHighlight>::new();

    match mode {
        HighlightMode::All => {
            let mut predecessor_visited = HashSet::<usize>::new();
            collect_predecessor_connector_highlights(
                graph,
                &orders,
                selected,
                &mut predecessor_visited,
                &mut connectors,
            );

            let mut successor_visited = HashSet::<usize>::new();
            collect_successor_connector_highlights(
                graph,
                &orders,
                selected,
                &mut successor_visited,
                &mut connectors,
            );
        }
        HighlightMode::None => {}
        HighlightMode::Predecessors => {
            let mut predecessor_visited = HashSet::<usize>::new();
            collect_predecessor_connector_highlights(
                graph,
                &orders,
                selected,
                &mut predecessor_visited,
                &mut connectors,
            );
        }
        HighlightMode::Successors => {
            let mut successor_visited = HashSet::<usize>::new();
            collect_successor_connector_highlights(
                graph,
                &orders,
                selected,
                &mut successor_visited,
                &mut connectors,
            );
        }
    }

    let mut connector_highlights = connectors.into_values().collect::<Vec<_>>();
    connector_highlights.sort_by_key(|connector| connector.edge_index);
    connector_highlights
}

fn collect_predecessor_connector_highlights(
    graph: &GeneaGraph,
    orders: &[usize],
    vertex: geneaquilt_core::model::VertexId,
    visited: &mut HashSet<usize>,
    connectors: &mut HashMap<usize, ConnectorHighlight>,
) {
    if !visited.insert(vertex.0) {
        return;
    }

    let incoming = graph.incoming_edge_indices(vertex);
    let unique_edge =
        choose_unique_connector_edge(graph, orders, vertex, incoming, TraversalDirection::Predecessors);

    for edge_index in incoming {
        let show_to_connector = unique_edge.is_none_or(|unique| unique == *edge_index);
        merge_connector_highlight(connectors, *edge_index, true, show_to_connector);

        if let Some(edge) = graph.edge(*edge_index) {
            collect_predecessor_connector_highlights(graph, orders, edge.from, visited, connectors);
        }
    }
}

fn collect_successor_connector_highlights(
    graph: &GeneaGraph,
    orders: &[usize],
    vertex: geneaquilt_core::model::VertexId,
    visited: &mut HashSet<usize>,
    connectors: &mut HashMap<usize, ConnectorHighlight>,
) {
    if !visited.insert(vertex.0) {
        return;
    }

    let outgoing = graph.outgoing_edge_indices(vertex);
    let unique_edge =
        choose_unique_connector_edge(graph, orders, vertex, outgoing, TraversalDirection::Successors);

    for edge_index in outgoing {
        let show_from_connector = unique_edge.is_none_or(|unique| unique == *edge_index);
        merge_connector_highlight(connectors, *edge_index, show_from_connector, true);

        if let Some(edge) = graph.edge(*edge_index) {
            collect_successor_connector_highlights(graph, orders, edge.to, visited, connectors);
        }
    }
}

#[derive(Clone, Copy)]
enum TraversalDirection {
    Predecessors,
    Successors,
}

fn choose_unique_connector_edge(
    graph: &GeneaGraph,
    orders: &[usize],
    vertex: geneaquilt_core::model::VertexId,
    edges: &[usize],
    direction: TraversalDirection,
) -> Option<usize> {
    match direction {
        TraversalDirection::Predecessors => {
            if graph.is_family(vertex) {
                edges.iter().max_by_key(|edge_index| {
                    graph
                        .edge(**edge_index)
                        .map(|edge| orders[edge.from.0])
                        .unwrap_or(0)
                })
            } else if graph.is_person(vertex) {
                edges.iter().max_by_key(|edge_index| {
                    graph
                        .edge(**edge_index)
                        .map(|edge| orders[edge.from.0])
                        .unwrap_or(0)
                })
            } else {
                None
            }
        }
        TraversalDirection::Successors => {
            if graph.is_family(vertex) {
                edges.iter().min_by_key(|edge_index| {
                    graph
                        .edge(**edge_index)
                        .map(|edge| orders[edge.to.0])
                        .unwrap_or(usize::MAX)
                })
            } else if graph.is_person(vertex) {
                edges.iter().min_by_key(|edge_index| {
                    graph
                        .edge(**edge_index)
                        .map(|edge| orders[edge.to.0])
                        .unwrap_or(usize::MAX)
                })
            } else {
                None
            }
        }
    }
    .copied()
}

fn merge_connector_highlight(
    connectors: &mut HashMap<usize, ConnectorHighlight>,
    edge_index: usize,
    show_from_connector: bool,
    show_to_connector: bool,
) {
    let entry = connectors.entry(edge_index).or_insert(ConnectorHighlight {
        edge_index,
        show_from_connector: false,
        show_to_connector: false,
    });
    entry.show_from_connector |= show_from_connector;
    entry.show_to_connector |= show_to_connector;
}

fn push_unique_color_index(indices: &mut Vec<usize>, color_index: usize) {
    if !indices.contains(&color_index) {
        indices.push(color_index);
    }
}

fn parse_external_ids_json(external_ids_json: &str) -> Result<Vec<String>, JsValue> {
    serde_json::from_str(external_ids_json).map_err(|_| JsValue::from_str("invalid highlight id payload"))
}

fn parse_mode(mode: &str) -> Result<HighlightMode, JsValue> {
    match mode {
        "all" => Ok(HighlightMode::All),
        "none" => Ok(HighlightMode::None),
        "predecessors" => Ok(HighlightMode::Predecessors),
        "successors" => Ok(HighlightMode::Successors),
        _ => Err(JsValue::from_str("invalid trace mode")),
    }
}

fn mode_name(mode: HighlightMode) -> &'static str {
    match mode {
        HighlightMode::All => "all",
        HighlightMode::None => "none",
        HighlightMode::Predecessors => "predecessors",
        HighlightMode::Successors => "successors",
    }
}

#[cfg(test)]
mod tests {
    use super::{
        TraversalDirection, build_highlight_summary, build_timeline_focus_summary,
        build_timeline_summary, TimelineScope,
        choose_unique_connector_edge,
        collect_connector_highlights,
    };
    use geneaquilt_core::{HighlightMode, parse_gedcom};
    use geneaquilt_layout::{assign_layers, order_layers};

    #[test]
    fn engine_accepts_ranker_selection() {
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

        let original = super::GeneaQuiltEngine::with_ranker(gedcom, "original")
            .expect("original ranker should build");
        let v2 = super::GeneaQuiltEngine::with_ranker(gedcom, "v2")
            .expect("v2 ranker should build");

        assert_eq!(original.layout.layers.len(), v2.layout.layers.len());
        assert!(super::parse_ranker("bogus").is_err());
    }

    #[test]
    fn family_predecessor_highlights_only_one_terminal_connector() {
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
        let mut layout = assign_layers(&graph);
        order_layers(&graph, &mut layout);
        let family = graph
            .vertex_id_by_external_id("@F1@")
            .expect("family vertex should exist");

        let connector_highlights =
            collect_connector_highlights(&graph, &layout, family, HighlightMode::Predecessors);
        let terminal_connector_count = connector_highlights
            .iter()
            .filter(|connector| connector.show_to_connector)
            .count();

        assert_eq!(terminal_connector_count, 1);
        assert_eq!(connector_highlights.len(), 2);
    }

    #[test]
    fn family_successor_highlights_only_one_origin_connector() {
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
        let mut layout = assign_layers(&graph);
        order_layers(&graph, &mut layout);
        let family = graph
            .vertex_id_by_external_id("@F1@")
            .expect("family vertex should exist");

        let connector_highlights =
            collect_connector_highlights(&graph, &layout, family, HighlightMode::Successors);
        let origin_connector_count = connector_highlights
            .iter()
            .filter(|connector| connector.show_from_connector)
            .count();

        assert_eq!(origin_connector_count, 1);
        assert_eq!(connector_highlights.len(), 2);
    }

    #[test]
    fn unique_successor_edge_uses_lowest_order_neighbor() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME Alpha /Parent/
1 FAMS @F1@
0 @I2@ INDI
1 NAME Zeta /Parent/
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
        let mut layout = assign_layers(&graph);
        order_layers(&graph, &mut layout);
        let orders = super::order_lookup(&layout);
        let family = graph
            .vertex_id_by_external_id("@F1@")
            .expect("family vertex should exist");

        let chosen = choose_unique_connector_edge(
            &graph,
            &orders,
            family,
            graph.outgoing_edge_indices(family),
            TraversalDirection::Successors,
        )
        .expect("family should have outgoing edges");

        let chosen_neighbor_order = graph
            .edge(chosen)
            .map(|edge| orders[edge.to.0])
            .expect("edge should exist");
        let minimum_neighbor_order = graph
            .outgoing_edge_indices(family)
            .iter()
            .filter_map(|edge_index| graph.edge(*edge_index).map(|edge| orders[edge.to.0]))
            .min()
            .expect("there should be outgoing edges");

        assert_eq!(chosen_neighbor_order, minimum_neighbor_order);
    }

    #[test]
    fn bring_and_slide_candidates_follow_person_semantics() {
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
1 FAMS @F2@
0 @I4@ INDI
1 NAME Grandchild /One/
1 FAMC @F2@
0 @I5@ INDI
1 NAME Partner /One/
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 @F2@ FAM
1 HUSB @I3@
1 WIFE @I5@
1 CHIL @I4@
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let mut layout = assign_layers(&graph);
        order_layers(&graph, &mut layout);
        let engine = super::GeneaQuiltEngine { graph, layout };

        let left = engine
            .bring_and_slide_json("@I3@", "left")
            .expect("left summary should serialize");
        let right = engine
            .bring_and_slide_json("@I3@", "right")
            .expect("right summary should serialize");

        assert!(left.contains("Parent One"));
        assert!(left.contains("Parent Two"));
        assert!(left.contains("parent"));
        assert!(right.contains("spouse"));
        assert!(right.contains("Grandchild One"));
    }

    #[test]
    fn merged_highlight_summary_tracks_overlaps() {
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
1 FAMS @F2@
0 @I4@ INDI
1 NAME Grandchild /One/
1 FAMC @F2@
0 @I5@ INDI
1 NAME Partner /One/
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 @F2@ FAM
1 HUSB @I3@
1 WIFE @I5@
1 CHIL @I4@
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let mut layout = assign_layers(&graph);
        order_layers(&graph, &mut layout);
        let summary = build_highlight_summary(
            &graph,
            &layout,
            &["@I3@".to_string(), "@I4@".to_string()],
            HighlightMode::Successors,
        )
        .expect("summary should build");

        assert_eq!(summary.groups.len(), 2);
        let overlapping_vertex = summary
            .merged_vertices
            .iter()
            .find(|vertex| vertex.id == "@I3@")
            .expect("child should be highlighted in both traces");
        assert_eq!(overlapping_vertex.color_indices.len(), 2);
    }

    #[test]
    fn timeline_summary_includes_active_and_selected_ranges() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME Parent /One/
1 BIRT
2 DATE 1900
1 FAMS @F1@
0 @I2@ INDI
1 NAME Parent /Two/
1 BIRT
2 DATE 1904
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /One/
1 BIRT
2 DATE 1930
1 FAMC @F1@
0 @F1@ FAM
1 MARR
2 DATE 1920
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let summary = build_timeline_summary(
            &graph,
            &["@I3@".to_string()],
            Some("@I3@"),
            TimelineScope::All,
        )
            .expect("timeline summary should build");

        assert_eq!(summary.scope, "all");
        assert_eq!(summary.start_year, 1900);
        assert_eq!(summary.end_year, 1930);
        assert_eq!(summary.selected_range, Some((1930, 1930)));
        assert_eq!(summary.active_range, Some((1930, 1930)));
        assert!(!summary.bins.is_empty());
    }

    #[test]
    fn timeline_focus_summary_filters_overlapping_vertices() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME Parent /One/
1 BIRT
2 DATE 1900
1 FAMS @F1@
0 @I2@ INDI
1 NAME Parent /Two/
1 BIRT
2 DATE 1904
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /One/
1 BIRT
2 DATE 1930
1 FAMC @F1@
0 @F1@ FAM
1 MARR
2 DATE 1920
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let summary = build_timeline_focus_summary(&graph, 1910, 1925, TimelineScope::All)
            .expect("timeline focus should build");

        assert_eq!(summary.scope, "all");
        assert_eq!(summary.start_year, 1910);
        assert_eq!(summary.end_year, 1925);
        assert_eq!(summary.matching_vertices_with_dates, 1);
        assert_eq!(summary.matching_people, 0);
        assert_eq!(summary.matching_families, 1);
        assert_eq!(summary.vertex_ids, vec!["@F1@".to_string()]);
    }

    #[test]
    fn search_matches_attributes_and_multiple_terms() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME Esther /Person/
1 BIRT
2 DATE 3400
1 SEX F
0 @F1@ FAM
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let mut layout = assign_layers(&graph);
        order_layers(&graph, &mut layout);
        let engine = super::GeneaQuiltEngine { graph, layout };

        assert!(
            engine
                .search_json("BIRT 3400", "attributes")
                .expect("attribute search should serialize")
                .contains("@I1@")
        );
        assert!(
            engine
                .search_json("Esther SEX", "all")
                .expect("combined search should serialize")
                .contains("@I1@")
        );
    }

    #[test]
    fn timeline_scope_filters_people_only() {
        let gedcom = r#"
0 @I1@ INDI
1 NAME Parent /One/
1 BIRT
2 DATE 1900
1 FAMS @F1@
0 @I2@ INDI
1 NAME Parent /Two/
1 BIRT
2 DATE 1904
1 FAMS @F1@
0 @F1@ FAM
1 MARR
2 DATE 1920
1 HUSB @I1@
1 WIFE @I2@
"#;

        let graph = parse_gedcom(gedcom).expect("gedcom should parse");
        let summary = build_timeline_focus_summary(&graph, 1890, 1950, TimelineScope::People)
            .expect("timeline focus should build");

        assert_eq!(summary.scope, "people");
        assert_eq!(summary.matching_people, 2);
        assert_eq!(summary.matching_families, 0);
    }
}
