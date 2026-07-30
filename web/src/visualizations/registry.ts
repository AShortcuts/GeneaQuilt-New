export type MethodAvailability = "available" | "in-development";
export type MethodScope = "whole" | "focus" | "projection" | "aggregate";
export type MethodSupport = "none" | "limited" | "strong";
export type PracticalScale = "small" | "medium" | "large" | "very-large";

export interface ResearchSource {
  label: string;
  url: string;
  kind: "paper" | "code" | "project";
}

export interface MethodTraits {
  ancestors: MethodSupport;
  descendants: MethodSupport;
  siblings: MethodSupport;
  partners: MethodSupport;
  multipleMarriages: MethodSupport;
  halfSiblings: MethodSupport;
  pedigreeCollapse: MethodSupport;
  disconnectedGroups: MethodSupport;
  chronology: MethodSupport;
  printing: MethodSupport;
  availableSpace: MethodSupport;
  interactiveExploration: MethodSupport;
}

export interface VisualizationMethodDefinition {
  id: string;
  name: string;
  shortName: string;
  category: "primary" | "focused" | "graph" | "research" | "thoroughness";
  availability: MethodAvailability;
  scope: MethodScope;
  practicalScale: PracticalScale;
  familiarity: MethodSupport;
  bestUse: string;
  limitations: string;
  traits: MethodTraits;
  sources: ResearchSource[];
}

const NONE: MethodTraits = {
  ancestors: "none",
  descendants: "none",
  siblings: "none",
  partners: "none",
  multipleMarriages: "none",
  halfSiblings: "none",
  pedigreeCollapse: "none",
  disconnectedGroups: "none",
  chronology: "none",
  printing: "none",
  availableSpace: "none",
  interactiveExploration: "none",
};

const SOURCES = {
  geneaquilt: {
    label: "Bezerianos et al., GeneaQuilts (2010)",
    url: "https://aviz.fr/old/geneaquilts/geneaquilt.pdf",
    kind: "paper",
  },
  geneaquiltCode: {
    label: "Original GeneaQuilt source code",
    url: "https://github.com/jdfekete/geneaquilt",
    kind: "code",
  },
  pgraphs: {
    label: "Mrvar and Batagelj, Relinking Marriages in Genealogies (2004)",
    url: "https://www.dlib.si/details/URN%3ANBN%3ASI%3Adoc-7VRCE0CW",
    kind: "paper",
  },
  dualTree: {
    label: "McGuffin and Balakrishnan, Interactive Visualization of Genealogical Graphs (2005)",
    url: "https://www.dgp.utoronto.ca/~ravin/papers/infovis2005_geneology.pdf",
    kind: "paper",
  },
  thesis: {
    label: "Racine, Efficient Algorithms for Drawing Large Genealogy Trees (2025)",
    url: "https://repositum.tuwien.at/bitstream/20.500.12708/220457/1/Racine%20Florian%20-%202025%20-%20Efficient%20Algorithms%20for%20Drawing%20Large%20Genealogy%20Trees.pdf",
    kind: "paper",
  },
  pedvis: {
    label: "Tuttle, Nonato, and Silva, PedVis (2010)",
    url: "https://doi.org/10.1109/TVCG.2010.185",
    kind: "paper",
  },
  timenets: {
    label: "Kim, Card, and Heer, TimeNets (2010)",
    url: "https://idl.uw.edu/papers/timenets",
    kind: "project",
  },
  columns: {
    label: "Klawitter and Zink, Tree Drawings with Columns (2023)",
    url: "https://arxiv.org/abs/2308.10811",
    kind: "paper",
  },
  areaAdaptive: {
    label: "Misue, Area-adaptive Drawing of Rooted Trees (2024)",
    url: "https://doi.org/10.1109/PacificVis60374.2024.00025",
    kind: "paper",
  },
  grampsRelationship: {
    label: "Gramps Relationship Graph documentation",
    url: "https://www.gramps-project.org/wiki/index.php/Gramps_6.0_Wiki_Manual_-_Reports_-_part_5#Relationship_Graph",
    kind: "project",
  },
} as const satisfies Record<string, ResearchSource>;

function traits(overrides: Partial<MethodTraits>): MethodTraits {
  return { ...NONE, ...overrides };
}

export const VISUALIZATION_METHODS: readonly VisualizationMethodDefinition[] = [
  {
    id: "geneaquilt",
    name: "GeneaQuilt matrix",
    shortName: "GeneaQuilt",
    category: "primary",
    availability: "available",
    scope: "whole",
    practicalScale: "very-large",
    familiarity: "limited",
    bestUse: "Seeing one coherent map of a large or structurally complicated genealogy.",
    limitations:
      "The row-and-column grammar takes some learning, and names need zoom at extreme scale.",
    traits: traits({
      ancestors: "strong",
      descendants: "strong",
      siblings: "strong",
      partners: "strong",
      multipleMarriages: "strong",
      halfSiblings: "strong",
      pedigreeCollapse: "strong",
      disconnectedGroups: "strong",
      chronology: "limited",
      printing: "strong",
      availableSpace: "strong",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.geneaquilt, SOURCES.geneaquiltCode],
  },
  {
    id: "pedigree",
    name: "Traditional pedigree",
    shortName: "Pedigree",
    category: "focused",
    availability: "available",
    scope: "focus",
    practicalScale: "small",
    familiarity: "strong",
    bestUse: "Answering who one person's recorded ancestors are.",
    limitations:
      "Width doubles by generation, and repeated ancestors appear in more than one position.",
    traits: traits({
      ancestors: "strong",
      siblings: "limited",
      partners: "limited",
      pedigreeCollapse: "limited",
      printing: "strong",
      availableSpace: "limited",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.pedvis],
  },
  {
    id: "hourglass",
    name: "Hourglass chart",
    shortName: "Hourglass",
    category: "focused",
    availability: "available",
    scope: "focus",
    practicalScale: "small",
    familiarity: "strong",
    bestUse: "A focused before-and-after story around one person.",
    limitations:
      "Side relatives, disconnected groups, and relinking structures fall outside its two rooted trees.",
    traits: traits({
      ancestors: "strong",
      descendants: "strong",
      siblings: "limited",
      partners: "strong",
      pedigreeCollapse: "limited",
      printing: "strong",
      availableSpace: "limited",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.dualTree],
  },
  {
    id: "dual-tree",
    name: "Dual tree: node-link",
    shortName: "Dual tree",
    category: "focused",
    availability: "available",
    scope: "focus",
    practicalScale: "medium",
    familiarity: "limited",
    bestUse: "Browsing between an ancestor focus and a descendant focus along a shared path.",
    limitations: "Sibling coverage depends on the selected multitree and is not automatic.",
    traits: traits({
      ancestors: "strong",
      descendants: "strong",
      siblings: "limited",
      partners: "limited",
      pedigreeCollapse: "limited",
      printing: "strong",
      availableSpace: "strong",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.dualTree],
  },
  {
    id: "pgraph",
    name: "p-graph",
    shortName: "p-graph",
    category: "graph",
    availability: "available",
    scope: "whole",
    practicalScale: "large",
    familiarity: "limited",
    bestUse: "Marriage rings, relinking patterns, and structural analysis.",
    limitations:
      "A remarried person participates in more than one couple vertex, so identity is less immediate.",
    traits: traits({
      ancestors: "strong",
      descendants: "strong",
      siblings: "strong",
      partners: "strong",
      multipleMarriages: "strong",
      halfSiblings: "limited",
      pedigreeCollapse: "strong",
      disconnectedGroups: "strong",
      printing: "limited",
      availableSpace: "strong",
      interactiveExploration: "limited",
    }),
    sources: [SOURCES.pgraphs],
  },
  {
    id: "bipartite-pgraph",
    name: "Bipartite p-graph",
    shortName: "Bipartite p-graph",
    category: "graph",
    availability: "available",
    scope: "whole",
    practicalScale: "large",
    familiarity: "limited",
    bestUse: "Explicit remarriage, half-sibling, and relinking analysis.",
    limitations:
      "The two-mode graph is node-rich and its crossings depend heavily on layer ordering.",
    traits: traits({
      ancestors: "strong",
      descendants: "strong",
      siblings: "strong",
      partners: "strong",
      multipleMarriages: "strong",
      halfSiblings: "strong",
      pedigreeCollapse: "strong",
      disconnectedGroups: "strong",
      printing: "limited",
      availableSpace: "limited",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.pgraphs],
  },
  {
    id: "ore",
    name: "Ore graph",
    shortName: "Ore graph",
    category: "graph",
    availability: "available",
    scope: "whole",
    practicalScale: "medium",
    familiarity: "limited",
    bestUse: "Direct person-level kinship paths.",
    limitations:
      "Separate arcs from both parents repeat descent lines and quickly make the graph messy.",
    traits: traits({
      ancestors: "strong",
      descendants: "strong",
      siblings: "strong",
      partners: "strong",
      multipleMarriages: "strong",
      halfSiblings: "strong",
      pedigreeCollapse: "strong",
      disconnectedGroups: "strong",
      printing: "limited",
      availableSpace: "none",
      interactiveExploration: "limited",
    }),
    sources: [SOURCES.pgraphs],
  },
  {
    id: "area-adaptive",
    name: "Area-adaptive rooted tree",
    shortName: "Area-adaptive tree",
    category: "research",
    availability: "available",
    scope: "projection",
    practicalScale: "large",
    familiarity: "limited",
    bestUse:
      "Fitting a rooted descendant branch with large terminal sibling groups to a screen or print shape.",
    limitations:
      "It excludes spouses, ancestors, disconnected groups, and reconvergent edges; folding helps terminal siblings much more than deeply branching internal subtrees.",
    traits: traits({
      descendants: "strong",
      siblings: "strong",
      pedigreeCollapse: "none",
      printing: "strong",
      availableSpace: "strong",
      interactiveExploration: "limited",
    }),
    sources: [SOURCES.areaAdaptive],
  },
  {
    id: "relationship-nodes",
    name: "Relationship-node hierarchy",
    shortName: "Family tree",
    category: "research",
    availability: "available",
    scope: "whole",
    practicalScale: "large",
    familiarity: "strong",
    bestUse:
      "Conventional genealogy with explicit nuclear-family junctions and fewer repeated line segments.",
    limitations: "Wide generations still spread, and relinking paths can cross.",
    traits: traits({
      ancestors: "strong",
      descendants: "strong",
      siblings: "strong",
      partners: "strong",
      multipleMarriages: "strong",
      halfSiblings: "strong",
      pedigreeCollapse: "strong",
      disconnectedGroups: "strong",
      printing: "strong",
      availableSpace: "limited",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.thesis, SOURCES.grampsRelationship],
  },
  {
    id: "timenets",
    name: "TimeNets",
    shortName: "TimeNets",
    category: "research",
    availability: "available",
    scope: "projection",
    practicalScale: "large",
    familiarity: "limited",
    bestUse: "Lifespan overlap, marriage, divorce, remarriage, and other chronological patterns.",
    limitations:
      "Tracing generations is less direct, and large data relies on degree-of-interest filtering.",
    traits: traits({
      ancestors: "limited",
      descendants: "limited",
      siblings: "limited",
      partners: "strong",
      multipleMarriages: "strong",
      halfSiblings: "limited",
      pedigreeCollapse: "limited",
      disconnectedGroups: "strong",
      chronology: "strong",
      printing: "limited",
      availableSpace: "limited",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.timenets],
  },
  {
    id: "fan",
    name: "Fan chart",
    shortName: "Fan chart",
    category: "focused",
    availability: "available",
    scope: "focus",
    practicalScale: "small",
    familiarity: "strong",
    bestUse: "A compact ancestry overview around one person.",
    limitations: "Outer labels and repeated ancestors still multiply as generations expand.",
    traits: traits({
      ancestors: "strong",
      pedigreeCollapse: "limited",
      printing: "strong",
      availableSpace: "strong",
      interactiveExploration: "limited",
    }),
    sources: [SOURCES.pedvis],
  },
  {
    id: "h-tree",
    name: "PedVis H-tree pedigree",
    shortName: "H-tree pedigree",
    category: "focused",
    availability: "available",
    scope: "focus",
    practicalScale: "medium",
    familiarity: "none",
    bestUse: "Dense, mostly complete binary ancestor pedigrees.",
    limitations:
      "Bloodlines zigzag, generations are harder to scan, and descendants do not fit the binary pattern.",
    traits: traits({
      ancestors: "strong",
      pedigreeCollapse: "limited",
      printing: "strong",
      availableSpace: "strong",
      interactiveExploration: "limited",
    }),
    sources: [SOURCES.pedvis],
  },
  {
    id: "local-radial",
    name: "Fixed-depth radial neighborhood",
    shortName: "Local radial",
    category: "focused",
    availability: "available",
    scope: "focus",
    practicalScale: "small",
    familiarity: "limited",
    bestUse: "Person-by-person exploration of a bounded relationship neighborhood.",
    limitations:
      "The depth limit hides the rest of the genealogy and does not guarantee a crossing-free local view.",
    traits: traits({
      ancestors: "limited",
      descendants: "limited",
      siblings: "limited",
      partners: "limited",
      multipleMarriages: "limited",
      halfSiblings: "limited",
      pedigreeCollapse: "limited",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.thesis],
  },
  {
    id: "dual-outline",
    name: "Dual tree: indented outline",
    shortName: "Dual outline",
    category: "focused",
    availability: "available",
    scope: "focus",
    practicalScale: "medium",
    familiarity: "none",
    bestUse: "Reading many names in a deep dual-tree subset.",
    limitations:
      "Generation comparison is less immediate and the opposing outline grammar is unfamiliar.",
    traits: traits({
      ancestors: "strong",
      descendants: "strong",
      siblings: "limited",
      partners: "limited",
      printing: "strong",
      availableSpace: "strong",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.dualTree],
  },
  {
    id: "fractal",
    name: "Fractal rectangle subdivision",
    shortName: "Fractal subdivision",
    category: "research",
    availability: "available",
    scope: "projection",
    practicalScale: "very-large",
    familiarity: "none",
    bestUse: "Space-filling branch-size and descendant-density overview.",
    limitations:
      "It excludes spouses and duplicates reconvergent people because it requires a descendant tree.",
    traits: traits({
      descendants: "strong",
      siblings: "limited",
      availableSpace: "strong",
      printing: "strong",
      interactiveExploration: "limited",
    }),
    sources: [SOURCES.thesis],
  },
  {
    id: "column-tree",
    name: "Tree drawing with columns",
    shortName: "Column tree",
    category: "research",
    availability: "available",
    scope: "projection",
    practicalScale: "medium",
    familiarity: "limited",
    bestUse: "Comparing a rooted branch by place or another category.",
    limitations:
      "The genealogy must first become a tree, so relinking and disconnected structure remain unresolved.",
    traits: traits({
      ancestors: "none",
      descendants: "strong",
      pedigreeCollapse: "none",
      printing: "strong",
      availableSpace: "limited",
      interactiveExploration: "limited",
    }),
    sources: [SOURCES.columns],
  },
  {
    id: "birthplace-cluster",
    name: "Birthplace cluster graph",
    shortName: "Birthplace clusters",
    category: "research",
    availability: "available",
    scope: "aggregate",
    practicalScale: "very-large",
    familiarity: "none",
    bestUse: "Regional patterns, migration, and high-level alliance structure.",
    limitations:
      "People, generations, exact marriages, and individual paths are intentionally aggregated away.",
    traits: traits({
      disconnectedGroups: "strong",
      availableSpace: "strong",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.thesis],
  },
  {
    id: "force-radial",
    name: "Radial genealogy force layout",
    shortName: "Radial force",
    category: "research",
    availability: "available",
    scope: "whole",
    practicalScale: "very-large",
    familiarity: "limited",
    bestUse: "Generational density in wide, shallow genealogies.",
    limitations:
      "Literal relationship lines still cross, and wide generations exhaust circumference for names.",
    traits: traits({
      ancestors: "limited",
      descendants: "limited",
      siblings: "limited",
      partners: "limited",
      multipleMarriages: "limited",
      halfSiblings: "limited",
      pedigreeCollapse: "strong",
      disconnectedGroups: "strong",
      availableSpace: "limited",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.thesis],
  },
  {
    id: "force-genealogy",
    name: "Genealogy-adapted force layout",
    shortName: "Genealogy force",
    category: "research",
    availability: "available",
    scope: "whole",
    practicalScale: "large",
    familiarity: "limited",
    bestUse: "A hierarchy-aware overview when a force-directed grammar is desired.",
    limitations: "Redundant spouse and two-parent lines remain and can still become messy.",
    traits: traits({
      ancestors: "limited",
      descendants: "limited",
      siblings: "limited",
      partners: "limited",
      multipleMarriages: "limited",
      halfSiblings: "limited",
      pedigreeCollapse: "strong",
      disconnectedGroups: "strong",
      availableSpace: "limited",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.thesis],
  },
  {
    id: "sugiyama-genealogy",
    name: "Genealogy-adapted Sugiyama layout",
    shortName: "Genealogy Sugiyama",
    category: "research",
    availability: "available",
    scope: "whole",
    practicalScale: "very-large",
    familiarity: "limited",
    bestUse: "A fast direct-edge hierarchy with spouse grouping.",
    limitations: "Without explicit Family nodes it can still be hard to tell whose child is whose.",
    traits: traits({
      ancestors: "strong",
      descendants: "strong",
      siblings: "limited",
      partners: "limited",
      multipleMarriages: "limited",
      halfSiblings: "limited",
      pedigreeCollapse: "strong",
      disconnectedGroups: "strong",
      printing: "limited",
      availableSpace: "limited",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.thesis],
  },
  {
    id: "bfs",
    name: "Breadth-first layered tree",
    shortName: "BFS layered",
    category: "research",
    availability: "available",
    scope: "projection",
    practicalScale: "medium",
    familiarity: "limited",
    bestUse: "A quick structural sketch from one starting person in a small family.",
    limitations:
      "It has no spouse relation, and retained non-tree arcs can cross and become unclear.",
    traits: traits({
      descendants: "strong",
      siblings: "limited",
      pedigreeCollapse: "limited",
      printing: "limited",
      interactiveExploration: "limited",
    }),
    sources: [SOURCES.thesis],
  },
  {
    id: "dfs",
    name: "Depth-first traversal tree",
    shortName: "DFS traversal",
    category: "research",
    availability: "available",
    scope: "projection",
    practicalScale: "medium",
    familiarity: "none",
    bestUse: "Inspecting traversal and branch order as an algorithmic baseline.",
    limitations:
      "Visit order dominates the picture and related generations no longer align cleanly.",
    traits: traits({ descendants: "strong", pedigreeCollapse: "limited" }),
    sources: [SOURCES.thesis],
  },
  {
    id: "sugiyama-default",
    name: "Generic Sugiyama layout",
    shortName: "Generic Sugiyama",
    category: "thoroughness",
    availability: "available",
    scope: "whole",
    practicalScale: "very-large",
    familiarity: "limited",
    bestUse: "An efficient general hierarchical-layout baseline.",
    limitations:
      "It does not encode spouse relationships, so you cannot tell who is married to whom.",
    traits: traits({
      ancestors: "strong",
      descendants: "strong",
      siblings: "limited",
      pedigreeCollapse: "strong",
      disconnectedGroups: "strong",
      availableSpace: "limited",
      interactiveExploration: "limited",
    }),
    sources: [SOURCES.thesis],
  },
  {
    id: "force-default",
    name: "Generic force-directed graph",
    shortName: "Generic force",
    category: "thoroughness",
    availability: "available",
    scope: "whole",
    practicalScale: "large",
    familiarity: "limited",
    bestUse: "Discovering local clusters without a fixed reading order.",
    limitations:
      "It is a graph-layout baseline, not a genealogy hierarchy, and is not intuitive to read as lineage.",
    traits: traits({
      partners: "limited",
      multipleMarriages: "limited",
      halfSiblings: "limited",
      pedigreeCollapse: "strong",
      disconnectedGroups: "strong",
      interactiveExploration: "strong",
    }),
    sources: [SOURCES.thesis],
  },
];

export const METHODS_BY_ID: ReadonlyMap<string, VisualizationMethodDefinition> = new Map(
  VISUALIZATION_METHODS.map((method) => [method.id, method]),
);

export function getVisualizationMethod(id: string): VisualizationMethodDefinition {
  const method = METHODS_BY_ID.get(id);
  if (!method) {
    throw new Error(`Unknown Visualization Method: ${id}`);
  }
  return method;
}
