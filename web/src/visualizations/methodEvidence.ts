export type MethodEvidenceStatus = "verified" | "pending";

export interface MethodEvidence {
  status: MethodEvidenceStatus;
  checkedAgainst: string[];
  invariants: string[];
  webDifferences: string;
}

export interface MethodExportSupport {
  png: boolean;
  print: boolean;
  standaloneHtml: boolean;
  currentViewPdf: boolean;
  completeDiagramPdf: boolean;
  tiledPosterPdf: boolean;
}

const COMPLETE_LOCAL_EXPORTS: MethodExportSupport = {
  png: true,
  print: true,
  standaloneHtml: true,
  currentViewPdf: true,
  completeDiagramPdf: true,
  tiledPosterPdf: true,
};

export const METHOD_EVIDENCE: Readonly<Record<string, MethodEvidence>> = {
  geneaquilt: {
    status: "verified",
    checkedAgainst: [
      "GeneaQuilts paper",
      "Original Java source code and ordering grammar",
      "Deterministic whole-document fixtures, including reconvergence and disconnected groups",
      "Browser output compared with the source method's matrix structure",
    ],
    invariants: [
      "Every visible Person and Family is represented once.",
      "Family and Person bands alternate without recursive record duplication.",
      "All connected components remain in one coherent scene.",
    ],
    webDifferences:
      "The web version uses Canvas, browser fonts, and local Wasm instead of the original Java renderer. Text measurements and exact pixels differ, but the matrix grammar and record identity do not.",
  },
  pedigree: {
    status: "verified",
    checkedAgainst: [
      "Conventional binary pedigree-slot grammar",
      "PedVis discussion of familiar pedigree layouts",
      "Pedigree-collapse, missing-parent, and deterministic-slot fixtures",
      "Live desktop and mobile visual inspection",
    ],
    invariants: [
      "The focal Person occupies slot 0 and recorded ancestors occupy binary parent slots.",
      "A repeated ancestor is repeated in every required pedigree position.",
      "Missing parent roles stay empty; no unknown Person is invented.",
    ],
    webDifferences:
      "This is a bounded five-generation traditional pedigree, not a claim to reproduce one vendor's proprietary chart style.",
  },
  hourglass: {
    status: "verified",
    checkedAgainst: [
      "Conventional hourglass chart grammar",
      "Published ancestor-set A(x) and descendant-set D(x) definitions",
      "Multiple-spouse, pedigree-collapse, and reconvergent-descent fixtures",
      "Live desktop and mobile visual inspection",
    ],
    invariants: [
      "The focal Person is shared by the ancestor and descendant halves.",
      "Each spouse Family has its own junction and child set.",
      "Reconvergent descent remains visible through a dashed supplemental edge.",
    ],
    webDifferences:
      "The web view fixes the public projection to three generations in each direction and adds explicit Family junctions so multiple spouses and child ownership remain unambiguous.",
  },
  "dual-tree": {
    status: "verified",
    checkedAgainst: [
      "McGuffin and Balakrishnan's dual-tree paper and figures",
      "The published A(x) union D(y) construction and axis-position formula",
      "Axis, diamond-edge, deterministic-order, and focus-pair fixtures",
      "Live desktop and mobile visual inspection",
    ],
    invariants: [
      "The two rooted multitrees are built separately and share one recorded ancestor-to-descendant axis.",
      "Axis positions use the ancestor/descendant subtree-load weighted average.",
      "Edges skipped to form a multitree remain as dashed supplemental links.",
    ],
    webDifferences:
      "The paper permits several preliminary tree layouts. This version uses a documented deterministic leaf order and does not reproduce the paper application's animated browsing transitions.",
  },
  ore: {
    status: "verified",
    checkedAgainst: [
      "Mrvar and Batagelj's Ore-graph definition",
      "Exact person, marriage, and parent-to-child transformation fixtures",
      "Remarriage, half-sibling, and disconnected-component fixtures",
      "Live whole-document and focused visual inspection",
    ],
    invariants: [
      "Each Person is one vertex.",
      "Each marriage is one undirected edge.",
      "Each recorded parent contributes a separate directed arc to every child.",
    ],
    webDifferences:
      "The graph transformation is literal; generation bands and deterministic ordering are web layout choices because an Ore graph does not prescribe unique coordinates.",
  },
  pgraph: {
    status: "verified",
    checkedAgainst: [
      "Mrvar and Batagelj's p-graph definition",
      "Exact couple-vertex and child-to-parent-couple transformation fixtures",
      "Relinking, remarriage, and disconnected-component fixtures",
      "Live whole-document and focused visual inspection",
    ],
    invariants: [
      "A vertex represents one unmarried Person or one couple.",
      "A child representation points to each parent-couple representation.",
      "A remarried Person participates in more than one couple vertex by definition.",
    ],
    webDifferences:
      "The transformation follows the paper. Layer ranks, stable within-layer order, and son/daughter line styling are deterministic presentation choices.",
  },
  "bipartite-pgraph": {
    status: "verified",
    checkedAgainst: [
      "Mrvar and Batagelj's bipartite p-graph definition",
      "Exact Person/couple alternation and sex-shape transformation fixtures",
      "Remarriage, half-sibling, and relinking fixtures",
      "Live whole-document and focused visual inspection",
    ],
    invariants: [
      "Every Person remains one explicit Person vertex.",
      "Every couple is a separate couple vertex.",
      "Descent alternates couple to Person to that Person's parent couple.",
    ],
    webDifferences:
      "The graph transformation follows the paper. Stable layers and crossing order are deterministic web layout choices rather than properties of the abstract graph.",
  },
  "relationship-nodes": {
    status: "verified",
    checkedAgainst: [
      "Racine's relationship-node discussion and before/after figures",
      "Gramps Relationship Graph's documented Family-node option",
      "Exact one-Person/one-Family-junction transformation fixtures",
      "Remarriage, half-sibling, missing-parent, reconvergence, and disconnected-group fixtures",
    ],
    invariants: [
      "Every Person record appears once and every binary Family receives one auxiliary junction.",
      "Parents connect to the Family junction and only that junction connects to its recorded children.",
      "Nuclear-family four-cycles are removed without hiding consanguinity or other reconvergence.",
    ],
    webDifferences:
      "Gramps delegates coordinates to Graphviz. This web version uses stable generation layers and deterministic barycentric sweeps; the Family-node transformation and record ownership are the checked invariants, not Graphviz's exact pixels.",
  },
  bfs: {
    status: "verified",
    checkedAgainst: [
      "Racine Algorithm 3.1 and its Habsburg output figure",
      "Exact shortest-hop, equal-layer-spacing, and source-order fixtures",
      "Reconvergence, omitted-spouse, and bounded-descendant fixtures",
      "Live desktop and mobile inspection",
    ],
    invariants: [
      "Only people reachable by directed parent-to-child links from the chosen root are positioned.",
      "The row is shortest BFS hop count, and nodes in each row use equal horizontal spacing.",
      "Spouses and peripheral records are not added after the traversal.",
    ],
    webDifferences:
      "The paper leaves adjacency iteration order implicit. This version preserves Source GEDCOM Family and child order to make repeated runs deterministic and draws every recorded descent arc whose endpoints are in the projection.",
  },
  dfs: {
    status: "verified",
    checkedAgainst: [
      "Racine Algorithm 3.2 and its Habsburg output figure",
      "Exact first-visit x-order and traversal-depth y-coordinate fixtures",
      "Reconvergence, omitted-spouse, and bounded-descendant fixtures",
      "Live desktop and mobile inspection",
    ],
    invariants: [
      "Only people reached by directed depth-first descent from the chosen root are positioned.",
      "First-visit order increases monotonically from left to right.",
      "Vertical position is the depth of the first DFS path that visits a Person.",
    ],
    webDifferences:
      "The paper leaves adjacency iteration order implicit. This version uses Source GEDCOM Family and child order and an iterative stack so deep genealogies do not depend on the browser call stack.",
  },
  "sugiyama-default": {
    status: "verified",
    checkedAgainst: [
      "Racine Sections 3.3.1-3.3.2 and the four Sugiyama phases",
      "Layer, dummy-route, barycentric-order, and deterministic-coordinate fixtures",
      "Disconnected and long-edge genealogy fixtures",
    ],
    invariants: [
      "Only directed parent-child arcs define the generic graph; marriages are absent.",
      "Long arcs receive one routing point per crossed layer.",
      "Barycentric sweeps change within-layer order without changing assigned layers.",
    ],
    webDifferences:
      "Sugiyama is a framework rather than one unique coordinate output. This version uses longest-path layers, ten deterministic barycentric sweeps, fixed layer spacing, and no cycle reversal because impossible parent loops block Interactive Mode first.",
  },
  "sugiyama-genealogy": {
    status: "verified",
    checkedAgainst: [
      "Racine Section 3.3.2 and Figures 3.9-3.10",
      "Spouse-layer, spouse-block, sibling-order, and direct-parent-arc fixtures",
      "Remarriage, half-sibling, reconvergence, and disconnected-group fixtures",
    ],
    invariants: [
      "Parents remain above children and recorded spouses share one generation layer.",
      "Spouse-connected blocks remain contiguous during crossing reduction.",
      "Each recorded parent still contributes a direct child arc; no Family junction is invented.",
    ],
    webDifferences:
      "The thesis describes a family of domain constraints, not fixed pixels. This version makes marriage links visible, uses deterministic spouse blocks and barycentric sweeps, and deliberately retains the paper's direct-parent ambiguity.",
  },
  "force-default": {
    status: "verified",
    checkedAgainst: [
      "Racine Algorithm 3.3 and the Fruchterman-Reingold force equations",
      "Literal marriage/parent-edge, deterministic-start, and finite-coordinate fixtures",
      "Disconnected and nuclear-family fixtures",
    ],
    invariants: [
      "Every Person starts at a deterministic point on a circle.",
      "All pairs repel and every literal graph edge attracts under a cooling schedule.",
      "No generation, sibling, or family-block force gives the baseline a false hierarchy.",
    ],
    webDifferences:
      "Repulsion uses the Barnes-Hut approximation suggested by the thesis rather than exact all-pairs evaluation. Cooling constants and the deterministic circular phase are documented web parameters because the framework does not prescribe one final equilibrium.",
  },
  "force-genealogy": {
    status: "verified",
    checkedAgainst: [
      "Racine Algorithm 3.4 and the stated sibling and generation-force equations",
      "Generation ordering, spouse cohesion, sibling cohesion, and deterministic-layout fixtures",
      "Remarriage, half-sibling, reconvergence, and disconnected-group fixtures",
    ],
    invariants: [
      "Standard repulsion and edge attraction remain present.",
      "Sibling, spouse, generation, and centering terms are all applied before cooling.",
      "Literal marriage and two-parent child lines remain visible rather than being silently merged.",
    ],
    webDifferences:
      "The thesis leaves parameter tuning open. The web version uses fixed documented strengths, spouse-aligned topological ranks, deterministic circular initialization, and Barnes-Hut repulsion.",
  },
  "force-radial": {
    status: "verified",
    checkedAgainst: [
      "Racine's concentric-generation discussion and Figures 3.5 and 3.7",
      "The published r(g) >= s*n(g)/(2*pi) circumference bound",
      "Spouse-layer, deterministic family-order, and wide-generation fixtures",
    ],
    invariants: [
      "Every spouse-aligned generation occupies one concentric circle.",
      "Each circle satisfies the minimum circumference needed for its node count.",
      "All literal parent-child and marriage lines remain in the whole-genealogy graph.",
    ],
    webDifferences:
      "The web output uses deterministic family-aware angular ordering in place of an animated force relaxation. The generation circles and published radius bound are exact; final angles are a reproducible coordinate choice.",
  },
  fractal: {
    status: "verified",
    checkedAgainst: [
      "Racine Algorithm 5.1, Sections 5.2-5.4, and Figures 5.7-5.9",
      "Alternating split, subtree-weight, nested-bounds, and reconvergence-duplication fixtures",
      "Spouse omission and complete descendant-path coverage fixtures",
    ],
    invariants: [
      "Children receive weight-proportional subrectangles inside their parent rectangle.",
      "Horizontal and vertical subdivision alternate at each depth.",
      "A reconvergent Person repeats once per descendant path, while spouses outside those paths are absent.",
    ],
    webDifferences:
      "This implementation uses proportional padding so zoom can retain deep rectangles, the thesis's subtree-size weight and center-heavy ordering, and an iterative queue instead of recursive calls. It stops with an explicit error before pathological path unfolding exceeds 50,000 rectangles.",
  },
  "birthplace-cluster": {
    status: "verified",
    checkedAgainst: [
      "Racine Algorithm 4.1 and Sections 4.2.1-4.2.5",
      "Strict cluster-size and co-parent-link threshold fixtures",
      "Missing-place, normalized-place, and aggregate-node fixtures",
    ],
    invariants: [
      "Only exact recorded BIRT.PLAC values define clusters.",
      "A cross-place count increments once per child with parents in two distinct retained clusters.",
      "An edge appears only when the count is strictly greater than Tedges.",
    ],
    webDifferences:
      "The default thresholds match the thesis figure (Tsize=15, Tedges=3). Deterministic force coordinates and square-root node diameters are presentation choices; no country, migration path, or missing birthplace is inferred.",
  },
  fan: {
    status: "verified",
    checkedAgainst: [
      "PedVis's fan-chart definition and published comparison figures",
      "Conventional binary pedigree slot arithmetic through six generations",
      "Missing-parent and Pedigree Collapse fixtures",
      "Live desktop and mobile visual inspection",
    ],
    invariants: [
      "Pedigree depth d contains exactly 2^d stable angular slots.",
      "The husband/father role occupies the first half of a branch and wife/mother the second.",
      "Repeated ancestors occupy every required Person Placement and are visibly marked.",
    ],
    webDifferences:
      "The web version fixes the preview to six generations and leaves every unrecorded slot visibly empty. It uses readable curved text orientation instead of reproducing one vendor's typography.",
  },
  "h-tree": {
    status: "verified",
    checkedAgainst: [
      "Tuttle, Nonato, and Silva's PedVis paper and H-tree figures",
      "Published alternating horizontal/vertical parent-placement rules",
      "Complete, sparse, and Pedigree Collapse fixtures",
      "Live desktop and mobile visual inspection",
    ],
    invariants: [
      "The focal Person is centered and each parent pair occupies opposite sides of that Person Placement.",
      "Parent orientation alternates by depth while the outward offset doubles.",
      "Empty ancestry regions retain their reserved space, preserving the H-tree's self-similarity.",
    ],
    webDifferences:
      "The paper's interactive system supports animated rerooting and depth changes. This view preserves the published static geometry and supplies shared search, selection, pan, and zoom through the GeneaQuilt host.",
  },
  "local-radial": {
    status: "verified",
    checkedAgainst: [
      "The declared fixed-depth graph-neighborhood contract",
      "Exact shortest-hop BFS fixtures over parent, child, and husband-wife links",
      "Boundary Family, remarriage, half-sibling, and missing-parent fixtures",
      "Live desktop and mobile visual inspection",
    ],
    invariants: [
      "Every visible Person appears once on the ring for their shortest relationship distance.",
      "Only relationships whose endpoints are both in the two-hop neighborhood are drawn.",
      "A Family at the depth boundary is retained whenever it still connects two visible records.",
    ],
    webDifferences:
      "A fixed-depth radial neighborhood has no unique published angular solution. The web layout uses deterministic Family-aware order; crossings are retained and disclosed rather than hidden by a misleading tree projection.",
  },
  "dual-outline": {
    status: "verified",
    checkedAgainst: [
      "McGuffin and Balakrishnan's dual-tree paper and opposing indented-outline variant",
      "The same A(x), D(y), shared-axis, and multitree fixtures as the node-link dual tree",
      "Exact axis-gap stretching and L-shaped edge fixtures",
      "Live desktop and mobile visual inspection",
    ],
    invariants: [
      "The ancestor and descendant multitrees share one recorded axis without duplicating axis people.",
      "Each preliminary tree receives a deterministic indented-outline embedding.",
      "Every consecutive axis gap is stretched by the larger opposing outline requirement.",
    ],
    webDifferences:
      "The paper's application animates changes between dual-tree subsets. This version preserves the static outline construction and exposes supplemental multitree links as dashed edges.",
  },
  timenets: {
    status: "verified",
    checkedAgainst: [
      "Kim, Card, and Heer's TimeNets paper, figures, data model, and layout section",
      "Recorded, qualified, missing-date, marriage, divorce, remarriage, and half-sibling fixtures",
      "Spouse-block, chronological-order, metric-axis, and degree-of-interest fixtures",
      "Live desktop and mobile comparison against the paper's visual grammar",
    ],
    invariants: [
      "Horizontal position is metric time from birth to death; no structural rank is presented as a date.",
      "Lifelines converge at marriage, diverge at recorded divorce, and child drop lines terminate at birth.",
      "Recorded values are never replaced, while qualified and estimated values remain visibly uncertain.",
      "People connected directly or transitively by marriage form local blocks, and large views use deterministic degree-of-interest filtering.",
    ],
    webDifferences:
      "The paper permits editable estimation rules, annotations, interpolation choices, and partial stubs for every elided relative. This local web version fixes and discloses its deterministic rule chain, uses cubic splines, and reports the omitted DOI context instead of presenting editable source data.",
  },
  "column-tree": {
    status: "verified",
    checkedAgainst: [
      "Klawitter and Zink's column-tree definitions and V1 drawing convention",
      "Rooted-tree, facet-column, missing-value, and reconvergence-omission fixtures",
      "Target-border, unique-height, and one-bend rectangular-cladogram invariants",
      "Live desktop and mobile visual inspection",
    ],
    invariants: [
      "Every visible vertex belongs to exactly one categorical column and has a strictly lower height than its parent.",
      "Every edge is orthogonal with at most one bend at the parent's height.",
      "An incoming inter-column edge places its target column subtree at the source-facing border and does not intersect an intra-edge of that target subtree.",
    ],
    webDifferences:
      "The web version applies V1 to a deterministic descendant spanning tree and uses recorded birthplace, falling back explicitly to GEDCOM SEX when place has fewer than two values. It enforces the V1 drawing convention but does not claim the paper's factorial minimum-crossing optimization for high-degree trees.",
  },
  "area-adaptive": {
    status: "verified",
    checkedAgainst: [
      "Misue's published abstract and Area-adaptive Drawing of Rooted Trees definition",
      "University of Tsukuba's official research release and author figures at 1:3, 1:2, 2:3, and 1:1",
      "Leaf-only folding, non-leaf hierarchy, aspect-selection, collision, and reconvergence fixtures",
      "Live desktop inspection plus deterministic 420x900 responsive-scene validation",
    ],
    invariants: [
      "Only consecutive leaf siblings with the same parent and Family may occupy a folded serpentine line; internal subtrees keep hierarchical placement.",
      "Every child remains below its parent and every Person rectangle has a disjoint footprint.",
      "Fold height is selected from the monotone width-height search by fitted total-node-area use for the current drawing area.",
      "The input remains one rooted tree, so excluded spouses and omitted reconvergent edges are reported explicitly.",
    ],
    webDifferences:
      "The publication defines a generic uniform-node rooted tree. This web adapter first creates a deterministic descendant spanning tree, preserves GEDCOM Family groups during leaf folding, uses named Person rectangles instead of icon-sized network nodes, and exposes its fitted node-area estimate. It does not imply that omitted genealogy relationships are represented by the rooted-tree method.",
  },
};

export const METHOD_EXPORT_SUPPORT: Readonly<Record<string, MethodExportSupport>> = {
  geneaquilt: { ...COMPLETE_LOCAL_EXPORTS, standaloneHtml: true },
  pedigree: COMPLETE_LOCAL_EXPORTS,
  hourglass: COMPLETE_LOCAL_EXPORTS,
  "dual-tree": COMPLETE_LOCAL_EXPORTS,
  ore: COMPLETE_LOCAL_EXPORTS,
  pgraph: COMPLETE_LOCAL_EXPORTS,
  "bipartite-pgraph": COMPLETE_LOCAL_EXPORTS,
  "relationship-nodes": COMPLETE_LOCAL_EXPORTS,
  bfs: COMPLETE_LOCAL_EXPORTS,
  dfs: COMPLETE_LOCAL_EXPORTS,
  "sugiyama-default": COMPLETE_LOCAL_EXPORTS,
  "sugiyama-genealogy": COMPLETE_LOCAL_EXPORTS,
  "force-default": COMPLETE_LOCAL_EXPORTS,
  "force-genealogy": COMPLETE_LOCAL_EXPORTS,
  "force-radial": COMPLETE_LOCAL_EXPORTS,
  fractal: COMPLETE_LOCAL_EXPORTS,
  "birthplace-cluster": COMPLETE_LOCAL_EXPORTS,
  fan: COMPLETE_LOCAL_EXPORTS,
  "h-tree": COMPLETE_LOCAL_EXPORTS,
  "local-radial": COMPLETE_LOCAL_EXPORTS,
  "dual-outline": COMPLETE_LOCAL_EXPORTS,
  timenets: COMPLETE_LOCAL_EXPORTS,
  "column-tree": COMPLETE_LOCAL_EXPORTS,
  "area-adaptive": COMPLETE_LOCAL_EXPORTS,
};

export function getMethodEvidence(methodId: string): MethodEvidence | null {
  return METHOD_EVIDENCE[methodId] ?? null;
}

export function getMethodExportSupport(methodId: string): MethodExportSupport | null {
  return METHOD_EXPORT_SUPPORT[methodId] ?? null;
}
