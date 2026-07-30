export interface MethodPerformanceEvidence {
  people: number;
  milliseconds: number;
  nodes: number;
  edges: number;
  runs: number;
  interpretation: string;
}

const WHOLE_SVG_CAVEAT =
  "Scene construction is fast, but thousands of SVG marks still affect browser paint, memory, labels, and human readability.";

export const METHOD_PERFORMANCE: Readonly<Record<string, MethodPerformanceEvidence>> = {
  geneaquilt: evidence(
    50_000,
    849.64,
    66_667,
    66_666,
    1,
    "The Wasm engine completed parsing, ranking, ordering, and scene serialization in under one second. Canvas avoids one DOM element per mark; browser interaction remains device-dependent.",
  ),
  pedigree: evidence(
    10_000,
    4.95,
    11,
    10,
    1,
    "Only the fixed-depth ancestry projection is drawn. Its practical limit is exponential pedigree-slot growth, not the size of the source GEDCOM.",
  ),
  hourglass: evidence(
    10_000,
    5.91,
    29,
    28,
    1,
    "The fixed ancestor-and-descendant window stays quick on a large source file, but widening either rooted side rapidly consumes space.",
  ),
  "dual-tree": evidence(
    10_000,
    12.27,
    6_679,
    6_678,
    1,
    `The multitree construction scales well on this fixture. ${WHOLE_SVG_CAVEAT}`,
  ),
  ore: evidence(
    10_000,
    58,
    10_000,
    16_665,
    1,
    `Literal two-parent arcs make visual clutter the binding limit. ${WHOLE_SVG_CAVEAT}`,
  ),
  pgraph: evidence(
    10_000,
    72.89,
    6_667,
    6_666,
    1,
    `Couple compression reduces marks compared with Ore graphs. ${WHOLE_SVG_CAVEAT}`,
  ),
  "bipartite-pgraph": evidence(
    10_000,
    123.57,
    13_333,
    13_332,
    1,
    `Explicit Person and couple vertices improve semantics while increasing mark count. ${WHOLE_SVG_CAVEAT}`,
  ),
  "relationship-nodes": evidence(
    10_000,
    67.8,
    13_333,
    13_332,
    1,
    `Family junctions remove redundant nuclear-family cycles but add one node per Family. ${WHOLE_SVG_CAVEAT}`,
  ),
  bfs: evidence(
    10_000,
    8.78,
    6_667,
    6_666,
    1,
    "Traversal is inexpensive; crossings, omitted spouses, and a wide SVG make this a structural overview rather than a large readable family chart.",
  ),
  dfs: evidence(
    10_000,
    9.07,
    6_667,
    6_666,
    1,
    "Traversal is inexpensive; first-visit depth and a wide SVG limit the method's value before computation becomes a problem.",
  ),
  "sugiyama-default": evidence(
    10_000,
    510.59,
    10_000,
    13_332,
    1,
    `The deterministic dummy-route and crossing passes remain subsecond. ${WHOLE_SVG_CAVEAT}`,
  ),
  "sugiyama-genealogy": evidence(
    10_000,
    97.21,
    10_000,
    16_665,
    1,
    `Spouse blocks and direct parent arcs remain subsecond on the fixture. ${WHOLE_SVG_CAVEAT}`,
  ),
  "force-default": evidence(
    10_000,
    630.42,
    10_000,
    16_665,
    1,
    `Barnes-Hut repulsion keeps the deterministic force solve subsecond. ${WHOLE_SVG_CAVEAT}`,
  ),
  "force-genealogy": evidence(
    10_000,
    658.74,
    10_000,
    16_665,
    1,
    `Genealogy forces add hierarchy without changing the measured order of growth. ${WHOLE_SVG_CAVEAT}`,
  ),
  "force-radial": evidence(
    10_000,
    30.35,
    10_000,
    16_665,
    1,
    `Direct concentric placement is fast. At this scale it is an overview; names and literal edges require zoom. ${WHOLE_SVG_CAVEAT}`,
  ),
  fractal: evidence(
    10_000,
    17,
    6_667,
    0,
    1,
    "Space-filling placement is fast and dense, but reconvergence can multiply Person Placements; the implementation stops before 50,000 unfolded rectangles.",
  ),
  "birthplace-cluster": evidence(
    10_000,
    3.55,
    5,
    7,
    1,
    "Aggregation reduced 10,000 people to five qualifying birthplace clusters. This is a structural summary, not a Person-level whole-tree view.",
  ),
  fan: evidence(
    10_000,
    3.56,
    73,
    0,
    1,
    "The fixed six-generation fan is independent of source size. Deeper fans grow by binary pedigree slots and quickly lose readable label space.",
  ),
  "h-tree": evidence(
    10_000,
    3.04,
    11,
    10,
    1,
    "The fixed-depth H-tree is quick on a large source file. Empty and repeated ancestry slots still reserve geometric space, which is its practical limit.",
  ),
  "local-radial": evidence(
    10_000,
    12,
    10,
    15,
    1,
    "Only the two-hop relationship neighborhood is drawn, so source size has little effect after indexes are built; the method is intentionally local.",
  ),
  "dual-outline": evidence(
    10_000,
    18.83,
    6_679,
    6_678,
    1,
    `The indented-outline multitrees scale well computationally. ${WHOLE_SVG_CAVEAT}`,
  ),
  timenets: evidence(
    10_000,
    34.06,
    34,
    32,
    1,
    "Date estimation and degree-of-interest selection scan the large document, then deliberately show a small readable temporal neighborhood.",
  ),
  "column-tree": evidence(
    10_000,
    18.86,
    6_672,
    6_666,
    1,
    "V1 placement is fast, but categorical columns become extremely wide; its medium practical scale reflects navigation and print width rather than compute time.",
  ),
  "area-adaptive": evidence(
    10_000,
    26.74,
    6_667,
    6_666,
    1,
    "Monotone leaf-fold dimensions permit a logarithmic candidate search instead of the prototype's exhaustive generation-width scan. The SVG remains navigation-heavy for deep internal branching, while large terminal sibling groups are its strongest case.",
  ),
};

export function getMethodPerformance(methodId: string): MethodPerformanceEvidence | null {
  return METHOD_PERFORMANCE[methodId] ?? null;
}

function evidence(
  people: number,
  milliseconds: number,
  nodes: number,
  edges: number,
  runs: number,
  interpretation: string,
): MethodPerformanceEvidence {
  return { people, milliseconds, nodes, edges, runs, interpretation };
}
