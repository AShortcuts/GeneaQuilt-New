export type RatingCriterionId =
  | "familiarity"
  | "wholeDataset"
  | "ancestors"
  | "descendants"
  | "siblings"
  | "partners"
  | "multipleMarriages"
  | "halfSiblings"
  | "pedigreeCollapse"
  | "disconnectedGroups"
  | "availableSpace"
  | "generationClarity"
  | "chronologicalClarity"
  | "nameReadability"
  | "interactiveExploration"
  | "printing"
  | "practicalScale";

export interface RatingCriterion {
  id: RatingCriterionId;
  label: string;
  description: string;
}

export interface MethodRating {
  score: 0 | 1 | 2 | 3 | 4 | 5;
  note: string;
}

export type MethodRatingSet = Readonly<Record<RatingCriterionId, MethodRating>>;

export const SCORE_RUBRIC = [
  "0: The method does not represent or support this criterion.",
  "1: Only a trace is present, or the criterion is usually misleading without outside help.",
  "2: Limited support works for narrow cases and has substantial omissions.",
  "3: Useful support works with visible qualifications or moderate scale limits.",
  "4: Strong support is clear in most relevant cases, with a specific tradeoff.",
  "5: The criterion is a defining strength and remains explicit under difficult genealogy structures.",
] as const;

export const RATING_CRITERIA: readonly RatingCriterion[] = [
  {
    id: "familiarity",
    label: "Familiar to people",
    description:
      "How close the reading grammar is to family-tree forms a first-time viewer is likely to know.",
  },
  {
    id: "wholeDataset",
    label: "Whole-dataset view",
    description:
      "Whether one view can retain every Person, Family, and disconnected group without a focal projection.",
  },
  {
    id: "ancestors",
    label: "Ancestors",
    description: "How clearly recorded ancestors can be found and followed.",
  },
  {
    id: "descendants",
    label: "Descendants",
    description: "How clearly recorded descendants can be found and followed.",
  },
  {
    id: "siblings",
    label: "Siblings",
    description: "How clearly people sharing a recorded parent Family appear together.",
  },
  {
    id: "partners",
    label: "Husbands and wives",
    description: "How explicitly each recorded husband-wife Family is represented.",
  },
  {
    id: "multipleMarriages",
    label: "Multiple marriages",
    description:
      "How well separate simultaneous or successive spouse Families remain distinguishable.",
  },
  {
    id: "halfSiblings",
    label: "Half-sibling parentage",
    description:
      "How clearly each child remains attached to the correct one- or two-parent Family.",
  },
  {
    id: "pedigreeCollapse",
    label: "Pedigree Collapse",
    description: "How well one real Person stays identifiable when ancestral paths reconverge.",
  },
  {
    id: "disconnectedGroups",
    label: "Disconnected Family Groups",
    description:
      "Whether unrelated or currently unlinked components remain present and understandable.",
  },
  {
    id: "availableSpace",
    label: "Use of available space",
    description:
      "How effectively the layout uses a given viewport or page shape without changing relationship meaning.",
  },
  {
    id: "generationClarity",
    label: "Generation clarity",
    description: "How consistently parent and child generations can be compared.",
  },
  {
    id: "chronologicalClarity",
    label: "Chronological clarity",
    description:
      "How directly dates, lifespan overlap, and relationship timing are expressed by the layout.",
  },
  {
    id: "nameReadability",
    label: "Name readability",
    description: "How readily individual names can remain legible at the method's practical scale.",
  },
  {
    id: "interactiveExploration",
    label: "Interactive exploration",
    description: "How well search, selection, focus, and spatial navigation support investigation.",
  },
  {
    id: "printing",
    label: "Printing",
    description: "How naturally the output works on a page or assembled poster.",
  },
  {
    id: "practicalScale",
    label: "Practical scale",
    description:
      "The largest scale at which both structure and the intended reading task remain useful, not merely computable.",
  },
] as const;

type ReviewedMethodId =
  | "geneaquilt"
  | "pedigree"
  | "hourglass"
  | "dual-tree"
  | "ore"
  | "pgraph"
  | "bipartite-pgraph"
  | "relationship-nodes"
  | "bfs"
  | "dfs"
  | "sugiyama-default"
  | "sugiyama-genealogy"
  | "force-default"
  | "force-genealogy"
  | "force-radial"
  | "fractal"
  | "birthplace-cluster"
  | "fan"
  | "h-tree"
  | "local-radial"
  | "dual-outline"
  | "timenets"
  | "column-tree"
  | "area-adaptive";

const rating = (score: MethodRating["score"], note: string): MethodRating => ({ score, note });

export const METHOD_RATINGS: Readonly<Record<ReviewedMethodId, MethodRatingSet>> = {
  geneaquilt: {
    familiarity: rating(
      2,
      "The matrix grammar must be learned before it reads like a family tree.",
    ),
    wholeDataset: rating(
      5,
      "All Person, Family, and disconnected records share one non-recursive scene.",
    ),
    ancestors: rating(
      5,
      "Connected bands support continuous ancestor tracing without duplicated people.",
    ),
    descendants: rating(
      5,
      "Connected bands support continuous descendant tracing without pruning.",
    ),
    siblings: rating(5, "Children of the same Family remain grouped by the same family band."),
    partners: rating(5, "Each binary Family is explicit and selectable."),
    multipleMarriages: rating(
      5,
      "One Person can connect to several distinct Family records without being copied.",
    ),
    halfSiblings: rating(5, "Children remain tied to their exact recorded Family."),
    pedigreeCollapse: rating(
      5,
      "Reconvergent paths reuse one Person record instead of multiplying boxes.",
    ),
    disconnectedGroups: rating(5, "Every component is retained in the same overview."),
    availableSpace: rating(5, "The quilt packs the full record set densely and coherently."),
    generationClarity: rating(
      4,
      "Ranks are stable, though tracing a line is less familiar than reading a pedigree row.",
    ),
    chronologicalClarity: rating(
      2,
      "Dates can filter or annotate the view, but time is not the primary layout axis.",
    ),
    nameReadability: rating(
      3,
      "Names are clear when zoomed; a huge fitted overview cannot keep every label readable.",
    ),
    interactiveExploration: rating(
      5,
      "Search, focus, selection, timeline, minimap, and pan/zoom reinforce the matrix.",
    ),
    printing: rating(
      4,
      "Complete posters work well, but large trees need scale or tiling for readable names.",
    ),
    practicalScale: rating(
      5,
      "The method is designed for coherent overviews in the 10,000-plus range.",
    ),
  },
  pedigree: {
    familiarity: rating(5, "The left-to-right binary ancestor grammar is immediately familiar."),
    wholeDataset: rating(0, "A pedigree is a focal ancestor projection, not a whole genealogy."),
    ancestors: rating(5, "Recorded ancestors and parent slots are the method's defining task."),
    descendants: rating(0, "Descendants are outside this view."),
    siblings: rating(1, "The focal person's siblings and collateral branches are not shown."),
    partners: rating(
      1,
      "Parent pairs are implied by slots, but spouse histories are not represented.",
    ),
    multipleMarriages: rating(0, "Multiple spouse Families are outside the ancestor-slot grammar."),
    halfSiblings: rating(
      1,
      "A selected birth Family can be followed, but half-sibling structure is absent.",
    ),
    pedigreeCollapse: rating(
      1,
      "The same ancestor is deliberately repeated in every pedigree slot.",
    ),
    disconnectedGroups: rating(0, "Unconnected groups are outside the focal projection."),
    availableSpace: rating(1, "Required width or height doubles with each complete generation."),
    generationClarity: rating(5, "Each ancestor depth has a fixed, unmistakable position."),
    chronologicalClarity: rating(
      1,
      "Dates may be labels, but chronology does not control placement.",
    ),
    nameReadability: rating(5, "Small pedigrees give each name generous, predictable space."),
    interactiveExploration: rating(
      3,
      "Search and focus work well, but exploration is confined to one ancestor tree.",
    ),
    printing: rating(4, "A shallow pedigree is a strong conventional print format."),
    practicalScale: rating(1, "Exponential slot growth makes deep pedigrees impractical."),
  },
  hourglass: {
    familiarity: rating(
      5,
      "Ancestors above and descendants below one person are easy to recognize.",
    ),
    wholeDataset: rating(
      1,
      "Only the two rooted projections around the chosen person are present.",
    ),
    ancestors: rating(5, "The upper half gives a direct ancestor view."),
    descendants: rating(5, "The lower half gives a direct descendant view."),
    siblings: rating(2, "Siblings appear only when they fall inside the chosen rooted halves."),
    partners: rating(5, "Explicit Family junctions keep each spouse beside the correct branch."),
    multipleMarriages: rating(
      4,
      "Separate spouse Families are clear, though many branches spread rapidly.",
    ),
    halfSiblings: rating(
      4,
      "Separate Family junctions preserve which children belong to which parents.",
    ),
    pedigreeCollapse: rating(1, "Ancestor slots repeat a reconvergent Person."),
    disconnectedGroups: rating(0, "Unconnected groups are outside the chosen hourglass."),
    availableSpace: rating(2, "The two halves can become extremely wide even at modest depth."),
    generationClarity: rating(5, "Depth is explicit above and below the center."),
    chronologicalClarity: rating(1, "The vertical axis means generation, not elapsed time."),
    nameReadability: rating(
      4,
      "Names are strong at shallow depth but shrink quickly in broad families.",
    ),
    interactiveExploration: rating(
      4,
      "Changing the center makes the familiar projection useful for local exploration.",
    ),
    printing: rating(
      3,
      "Compact families print cleanly; wide descendant generations require tiling.",
    ),
    practicalScale: rating(2, "It is best for a few generations around one person."),
  },
  "dual-tree": {
    familiarity: rating(
      2,
      "The shared-axis construction is less familiar than a pedigree or hourglass.",
    ),
    wholeDataset: rating(1, "Only A(x) union D(y) is included."),
    ancestors: rating(5, "The complete recorded ancestor multitree of one end is retained."),
    descendants: rating(
      5,
      "The complete recorded descendant multitree of the other end is retained.",
    ),
    siblings: rating(2, "Siblings appear only when they belong to the selected multitree."),
    partners: rating(0, "Partners are not automatically added in this node-link form."),
    multipleMarriages: rating(0, "Spouse histories are not represented directly."),
    halfSiblings: rating(
      1,
      "Shared parentage may be inferred from links but Family ownership is not explicit.",
    ),
    pedigreeCollapse: rating(
      3,
      "Relinking edges remain visible, but the multitree embedding still needs skipped links.",
    ),
    disconnectedGroups: rating(0, "Unconnected groups are outside the two roots."),
    availableSpace: rating(4, "The opposing preliminary trees can share space along their axis."),
    generationClarity: rating(5, "Both halves align to common generation levels."),
    chronologicalClarity: rating(1, "Generation alignment does not encode elapsed time."),
    nameReadability: rating(
      3,
      "Focused trees read well; a prolific ancestor still creates a very wide drawing.",
    ),
    interactiveExploration: rating(
      4,
      "Changing either endpoint supports purposeful path-centered browsing.",
    ),
    printing: rating(4, "The aligned axis makes a bounded dual tree print cleanly."),
    practicalScale: rating(
      3,
      "Medium projections remain useful; prolific descendant roots become dense.",
    ),
  },
  ore: {
    familiarity: rating(2, "People are familiar nodes, but the redundant arrow grammar is not."),
    wholeDataset: rating(5, "The literal graph can retain every record and component."),
    ancestors: rating(4, "Direct parent arcs are traceable until crossing density becomes high."),
    descendants: rating(4, "Direct child arcs are traceable until crossing density becomes high."),
    siblings: rating(
      3,
      "Common parents can be found, but no shared Family junction groups siblings.",
    ),
    partners: rating(5, "Marriage edges are explicit at the Person level."),
    multipleMarriages: rating(
      5,
      "Several marriage edges can meet the same Person without duplication.",
    ),
    halfSiblings: rating(
      4,
      "Literal parent arcs preserve parentage, though repeated lines add clutter.",
    ),
    pedigreeCollapse: rating(5, "One Person vertex naturally preserves reconvergence."),
    disconnectedGroups: rating(5, "Every graph component can remain present."),
    availableSpace: rating(1, "Redundant parent arcs and crossings consume space quickly."),
    generationClarity: rating(3, "Added layers help, but generation is not inherent to the graph."),
    chronologicalClarity: rating(0, "The representation has no time axis."),
    nameReadability: rating(
      3,
      "Person nodes are direct, but line density crowds labels at moderate scale.",
    ),
    interactiveExploration: rating(
      3,
      "Direct graph selection is useful, while the overall reading order remains weak.",
    ),
    printing: rating(2, "Dense crossings and repeated lines make larger prints messy."),
    practicalScale: rating(
      2,
      "The transformation is linear, but readable scale is much lower than compute scale.",
    ),
  },
  pgraph: {
    familiarity: rating(
      1,
      "A couple-as-vertex grammar is efficient but unfamiliar to most viewers.",
    ),
    wholeDataset: rating(5, "All components can be represented in one directed graph."),
    ancestors: rating(5, "Child representations point consistently toward parent couples."),
    descendants: rating(5, "Reversing the same arcs traces descendants without losing structure."),
    siblings: rating(4, "Children sharing a parent-couple vertex are structurally grouped."),
    partners: rating(
      4,
      "Couple vertices encode partnership strongly, but individual identity is compressed.",
    ),
    multipleMarriages: rating(
      5,
      "A remarried Person deliberately participates in multiple couple vertices.",
    ),
    halfSiblings: rating(
      3,
      "Parent-couple ownership is present, while repeated identity requires care.",
    ),
    pedigreeCollapse: rating(
      5,
      "Relinking becomes an analyzable semicycle rather than duplicate ancestry.",
    ),
    disconnectedGroups: rating(5, "Every component can remain present."),
    availableSpace: rating(4, "Couple compression removes many redundant Ore arcs."),
    generationClarity: rating(3, "Directed layers help, but vertices can mix one or two people."),
    chronologicalClarity: rating(0, "The abstract graph does not encode time."),
    nameReadability: rating(
      3,
      "Fewer vertices help, but couple labels can be longer and repeated.",
    ),
    interactiveExploration: rating(3, "Structural tracing is strong after the grammar is learned."),
    printing: rating(
      3,
      "Moderate structural diagrams print well; large layered graphs still cross.",
    ),
    practicalScale: rating(4, "Compression gives it a strong practical network-analysis scale."),
  },
  "bipartite-pgraph": {
    familiarity: rating(1, "Alternating Person and couple vertices require explanation."),
    wholeDataset: rating(5, "All people, couples, and components can remain present."),
    ancestors: rating(5, "Alternating arcs preserve complete ancestry paths."),
    descendants: rating(5, "Alternating arcs preserve complete descendant paths."),
    siblings: rating(5, "Children link through the same explicit couple vertex."),
    partners: rating(5, "Each Person and each couple are separate, explicit vertices."),
    multipleMarriages: rating(
      5,
      "One Person can connect to several couple vertices without identity duplication.",
    ),
    halfSiblings: rating(5, "Each child-to-couple link keeps parentage unambiguous."),
    pedigreeCollapse: rating(
      5,
      "One Person vertex preserves identity through every reconvergent path.",
    ),
    disconnectedGroups: rating(5, "Every component can remain present."),
    availableSpace: rating(
      2,
      "Explicitness adds more vertices and can produce wide layered crossings.",
    ),
    generationClarity: rating(
      3,
      "Two-mode layers are consistent but not identical to familiar generations.",
    ),
    chronologicalClarity: rating(0, "The representation has no time axis."),
    nameReadability: rating(
      3,
      "Individual names are explicit, but the added couple nodes reduce room.",
    ),
    interactiveExploration: rating(
      4,
      "Selecting a Person or couple exposes remarriage and half-sibling structure precisely.",
    ),
    printing: rating(2, "Node-rich graphs need generous paper or tiling."),
    practicalScale: rating(
      4,
      "It remains structurally useful at large scale, though less compact than a p-graph.",
    ),
  },
  "relationship-nodes": {
    familiarity: rating(
      5,
      "People, couples, and shared child junctions resemble conventional family charts.",
    ),
    wholeDataset: rating(
      5,
      "Every Person, Family, and disconnected component can stay in one graph.",
    ),
    ancestors: rating(5, "Parent paths remain explicit through one Family junction at each step."),
    descendants: rating(
      5,
      "Children branch from their exact Family junction without duplicate parent lines.",
    ),
    siblings: rating(5, "Children of the same Family share one unmistakable junction."),
    partners: rating(5, "Both recorded spouse roles meet at a selectable Family node."),
    multipleMarriages: rating(
      5,
      "One Person can connect to several distinct Family junctions without duplication.",
    ),
    halfSiblings: rating(
      5,
      "Each child remains attached to the exact one- or two-parent Family that records it.",
    ),
    pedigreeCollapse: rating(5, "A real Person stays one node when paths reconverge."),
    disconnectedGroups: rating(
      5,
      "Unlinked components remain present rather than being discarded by a root choice.",
    ),
    availableSpace: rating(
      2,
      "Wide generations and relinking paths still spread and cross despite merged parent lines.",
    ),
    generationClarity: rating(
      5,
      "Stable Person rows alternate with explicit Family-junction rows.",
    ),
    chronologicalClarity: rating(
      1,
      "Dates may be labels, but the hierarchy does not use elapsed time as an axis.",
    ),
    nameReadability: rating(
      4,
      "Conventional Person boxes keep names direct until whole-tree width becomes large.",
    ),
    interactiveExploration: rating(
      4,
      "Search and selection work naturally on both Person and Family records.",
    ),
    printing: rating(4, "The conventional grammar prints well when wide generations are tiled."),
    practicalScale: rating(
      4,
      "The transform is linear and useful for large trees, but crossings limit readable scale.",
    ),
  },
  bfs: {
    familiarity: rating(
      3,
      "Layered parent-to-child lines are approachable, although a row means hop count rather than generation.",
    ),
    wholeDataset: rating(
      0,
      "The method intentionally keeps only descendants reachable from one root.",
    ),
    ancestors: rating(0, "Ancestors of the chosen root are outside the directed traversal."),
    descendants: rating(
      4,
      "Shortest-hop layers give a quick structural view of the reachable descendants.",
    ),
    siblings: rating(
      3,
      "Children often share a row, but no Family junction or spouse grouping identifies sibling sets.",
    ),
    partners: rating(0, "Spouse relationships are omitted by the traversal."),
    multipleMarriages: rating(0, "Separate spouse Families are not represented."),
    halfSiblings: rating(
      1,
      "Literal descent arcs can survive when both parents are reached, but spouse context is usually absent.",
    ),
    pedigreeCollapse: rating(
      3,
      "Each reached Person is drawn once, while the first shortest path controls placement.",
    ),
    disconnectedGroups: rating(
      0,
      "Components outside the root's descendant reachability are absent.",
    ),
    availableSpace: rating(
      2,
      "A broad hop layer quickly becomes very wide even though the algorithm is linear.",
    ),
    generationClarity: rating(
      3,
      "Rows are clear, but shortest graph distance can differ from biological generation.",
    ),
    chronologicalClarity: rating(0, "The layout has no date or lifespan axis."),
    nameReadability: rating(3, "Small projections read cleanly; wide rows squeeze names."),
    interactiveExploration: rating(
      3,
      "Changing the root is useful for quick local structure, but omitted context remains hidden.",
    ),
    printing: rating(
      2,
      "Small families print simply; broad layers and crossing lines need a poster.",
    ),
    practicalScale: rating(
      2,
      "Computation scales well, but the view is mainly useful for small to medium projections.",
    ),
  },
  dfs: {
    familiarity: rating(
      2,
      "The diagonal visit trace looks algorithmic rather than like a familiar family chart.",
    ),
    wholeDataset: rating(0, "Only one root's directed descendant traversal is present."),
    ancestors: rating(0, "Ancestors of the root are not traversed."),
    descendants: rating(
      3,
      "Every reached descendant is present, but branch order dominates the reading.",
    ),
    siblings: rating(2, "Siblings follow visit order without a shared Family cue."),
    partners: rating(0, "Spouses are omitted."),
    multipleMarriages: rating(0, "Spouse Families are omitted."),
    halfSiblings: rating(
      1,
      "Parentage is carried only by retained descent lines and lacks Family ownership.",
    ),
    pedigreeCollapse: rating(
      2,
      "One first visit prevents duplicate nodes, but later paths are visually secondary.",
    ),
    disconnectedGroups: rating(0, "Unreachable components are absent."),
    availableSpace: rating(
      1,
      "One new x-position per visit produces an exceptionally wide drawing.",
    ),
    generationClarity: rating(
      1,
      "People at the same depth may be separated by long stretches of traversal order.",
    ),
    chronologicalClarity: rating(0, "The layout contains no time axis."),
    nameReadability: rating(
      3,
      "Individual names have room, but the overall chart becomes too wide quickly.",
    ),
    interactiveExploration: rating(
      2,
      "Changing the root exposes branch order, not a rich family neighborhood.",
    ),
    printing: rating(1, "The long left-to-right trace is awkward on ordinary pages."),
    practicalScale: rating(
      2,
      "The traversal is fast, while the drawing is mainly an algorithmic baseline.",
    ),
  },
  "sugiyama-default": {
    familiarity: rating(
      2,
      "The layered direction is recognizable, but it is not a complete family-chart grammar.",
    ),
    wholeDataset: rating(
      5,
      "Every Person and disconnected component can remain in one layered graph.",
    ),
    ancestors: rating(
      4,
      "Upward directed paths support ancestry tracing despite crossing and long-edge routes.",
    ),
    descendants: rating(
      4,
      "Downward directed paths support descent tracing without choosing a root.",
    ),
    siblings: rating(
      2,
      "Common parents can place children nearby, but no Family cue defines a sibling set.",
    ),
    partners: rating(0, "The generic baseline intentionally has no marriage relationship."),
    multipleMarriages: rating(0, "Without marriage edges, multiple spouse Families are invisible."),
    halfSiblings: rating(
      1,
      "Direct parent arcs exist, but Family ownership and spouse context are absent.",
    ),
    pedigreeCollapse: rating(5, "Each Person remains one vertex when paths reconverge."),
    disconnectedGroups: rating(
      5,
      "Every disconnected component receives layers in the same scene.",
    ),
    availableSpace: rating(
      2,
      "Wide layers and long routed arcs consume substantial horizontal space.",
    ),
    generationClarity: rating(
      4,
      "Parent-child direction is strongly layered, although spouses do not share a defined row.",
    ),
    chronologicalClarity: rating(0, "Layers are graph depth, not elapsed time."),
    nameReadability: rating(
      2,
      "Names are clear locally but dense whole-tree layers shrink rapidly.",
    ),
    interactiveExploration: rating(
      3,
      "Search and selection help trace the hierarchy, but family semantics stay thin.",
    ),
    printing: rating(2, "Small hierarchies print cleanly; large layers require wide tiling."),
    practicalScale: rating(
      4,
      "The layered computation scales well, while edge density limits readable size.",
    ),
  },
  "sugiyama-genealogy": {
    familiarity: rating(
      3,
      "Generation rows and spouse links resemble a family chart, but direct child arcs need interpretation.",
    ),
    wholeDataset: rating(
      5,
      "All people, relationships, and disconnected groups can remain in one hierarchy.",
    ),
    ancestors: rating(
      5,
      "Parents stay above children and every recorded parent arc remains traceable.",
    ),
    descendants: rating(
      4,
      "Descendant direction is clear, though overlapping two-parent arcs can become ambiguous.",
    ),
    siblings: rating(
      3,
      "Sibling-aware ordering usually keeps children together without an explicit shared junction.",
    ),
    partners: rating(
      4,
      "A thick horizontal link and contiguous block identify each recorded couple.",
    ),
    multipleMarriages: rating(
      3,
      "All marriage links remain, but a large spouse block can be visually crowded.",
    ),
    halfSiblings: rating(
      2,
      "Literal parent arcs preserve the data but can obscure which pair owns a child.",
    ),
    pedigreeCollapse: rating(5, "Reconvergent paths reuse one Person vertex."),
    disconnectedGroups: rating(
      5,
      "Independent Family Groups remain present in the same layered scene.",
    ),
    availableSpace: rating(
      2,
      "Wide generations and direct two-parent arcs still demand a broad canvas.",
    ),
    generationClarity: rating(
      5,
      "Spouses share a layer and parents remain above children by construction.",
    ),
    chronologicalClarity: rating(1, "Generation layers are not a metric timeline."),
    nameReadability: rating(
      3,
      "Names remain conventional until broad generations force a small fit.",
    ),
    interactiveExploration: rating(
      4,
      "Search and selection pair well with the stable hierarchy and spouse blocks.",
    ),
    printing: rating(
      3,
      "The hierarchy is printable with tiling, but crossing density can remain high.",
    ),
    practicalScale: rating(
      4,
      "The algorithm is efficient for large graphs, though visual density arrives before compute limits.",
    ),
  },
  "force-default": {
    familiarity: rating(1, "It looks like a general network, not a familiar family tree."),
    wholeDataset: rating(
      5,
      "Every Person, literal relationship edge, and disconnected component can be retained.",
    ),
    ancestors: rating(
      1,
      "Arrow direction exists, but arbitrary position makes ancestry difficult to follow.",
    ),
    descendants: rating(1, "Descendant arcs exist without a stable reading direction."),
    siblings: rating(1, "Siblings may cluster locally but have no explicit Family grouping."),
    partners: rating(
      2,
      "Marriage edges are literal, yet their position carries no special meaning.",
    ),
    multipleMarriages: rating(2, "Multiple marriage edges survive but can blend into the network."),
    halfSiblings: rating(
      2,
      "Literal arcs retain parentage while the absence of hierarchy makes it hard to parse.",
    ),
    pedigreeCollapse: rating(5, "Each real Person remains one graph vertex."),
    disconnectedGroups: rating(5, "Independent components remain in the same force simulation."),
    availableSpace: rating(2, "The unconstrained equilibrium sprawls in all directions."),
    generationClarity: rating(0, "Vertical or radial position has no generation meaning."),
    chronologicalClarity: rating(0, "Dates do not control position."),
    nameReadability: rating(1, "Labels collide and rotate around dense network regions quickly."),
    interactiveExploration: rating(
      3,
      "Selection can reveal local clusters even when the global graph is hard to read.",
    ),
    printing: rating(1, "An irregular, sprawling equilibrium is awkward on fixed pages."),
    practicalScale: rating(
      2,
      "Approximate repulsion remains computable, but lineage readability degrades at modest size.",
    ),
  },
  "force-genealogy": {
    familiarity: rating(
      2,
      "Generation bands help, but the result still reads as a relationship network.",
    ),
    wholeDataset: rating(
      5,
      "All people, literal edges, and disconnected groups remain in one graph.",
    ),
    ancestors: rating(
      3,
      "Generation alignment helps upward tracing, with crossings still interrupting paths.",
    ),
    descendants: rating(3, "Downward tracing is improved but remains line-dense."),
    siblings: rating(
      3,
      "The sibling force clusters exact Family children without drawing a shared junction.",
    ),
    partners: rating(
      3,
      "Spouse attraction and marriage edges make couples visible in most local regions.",
    ),
    multipleMarriages: rating(
      3,
      "Every spouse edge remains, although several simultaneous pulls create crowded hubs.",
    ),
    halfSiblings: rating(
      2,
      "Literal parent arcs preserve the distinction but redundant lines can obscure it.",
    ),
    pedigreeCollapse: rating(5, "Reconvergent paths reuse one Person node."),
    disconnectedGroups: rating(
      5,
      "Independent components remain present under the shared simulation.",
    ),
    availableSpace: rating(2, "The force equilibrium still spreads and leaves uneven empty areas."),
    generationClarity: rating(
      4,
      "Generation springs produce a real hierarchy with some local drift.",
    ),
    chronologicalClarity: rating(1, "The bands use structural rank rather than elapsed time."),
    nameReadability: rating(
      2,
      "Semantic clustering helps locally, while dense bands still overlap names.",
    ),
    interactiveExploration: rating(
      4,
      "Search and selection work well for exploring clusters and reconvergent paths.",
    ),
    printing: rating(
      2,
      "A settled overview can print, but redundant lines and irregular width remain.",
    ),
    practicalScale: rating(
      3,
      "Barnes-Hut repulsion helps computation; crossing density limits useful scale.",
    ),
  },
  "force-radial": {
    familiarity: rating(
      2,
      "Concentric generations are learnable but unlike a conventional family chart.",
    ),
    wholeDataset: rating(
      5,
      "All people, relationships, and disconnected groups can share the concentric scene.",
    ),
    ancestors: rating(2, "Inward tracing is possible but many literal lines cross other circles."),
    descendants: rating(
      2,
      "Outward tracing is possible without a single root, but crossings interfere.",
    ),
    siblings: rating(3, "Family-aware angular ordering tends to keep siblings together."),
    partners: rating(3, "Spouses share a circle and remain in the same angular block."),
    multipleMarriages: rating(
      3,
      "Multiple spouse links remain explicit but can form dense same-circle chords.",
    ),
    halfSiblings: rating(
      2,
      "Exact parent arcs remain, while overlapping chords can hide Family ownership.",
    ),
    pedigreeCollapse: rating(5, "Each Person is one node even when paths reconverge."),
    disconnectedGroups: rating(
      5,
      "All components remain represented on shared generation circles.",
    ),
    availableSpace: rating(
      3,
      "Wide shallow data uses two dimensions well, but circumference grows with every wide layer.",
    ),
    generationClarity: rating(5, "Concentric radius is the defining generation encoding."),
    chronologicalClarity: rating(1, "Radius is structural generation, not time."),
    nameReadability: rating(2, "Names compete for circumference in wide layers."),
    interactiveExploration: rating(
      4,
      "Pan, zoom, search, and selection help follow dense radial paths.",
    ),
    printing: rating(
      2,
      "The circular footprint wastes corners and large circles require poster pages.",
    ),
    practicalScale: rating(
      3,
      "Placement scales well, but line crossing and circumference limit readable scale.",
    ),
  },
  fractal: {
    familiarity: rating(1, "Nested space partitioning is unfamiliar as a family-tree grammar."),
    wholeDataset: rating(
      0,
      "The view is one rooted descendant tree rather than the whole Genealogy Document.",
    ),
    ancestors: rating(0, "Ancestors of the selected root are outside the projection."),
    descendants: rating(4, "Every unfolded descendant path is represented by containment."),
    siblings: rating(
      3,
      "Sibling rectangles share one parent enclosure but have no marriage context.",
    ),
    partners: rating(0, "Spouses are excluded unless independently reached as descendants."),
    multipleMarriages: rating(0, "Spouse Families are not represented."),
    halfSiblings: rating(
      1,
      "Each parent path unfolds separately, so shared Family ownership is weak.",
    ),
    pedigreeCollapse: rating(1, "Reconvergent people are deliberately duplicated once per path."),
    disconnectedGroups: rating(0, "Only the chosen root's descendant component is present."),
    availableSpace: rating(5, "Alternating weighted subdivision fills the entire rectangle."),
    generationClarity: rating(
      2,
      "Containment communicates depth, but generations do not share aligned rows.",
    ),
    chronologicalClarity: rating(0, "The layout has no date axis."),
    nameReadability: rating(2, "Large branches read well; deep small rectangles require zoom."),
    interactiveExploration: rating(
      4,
      "Progressive zoom into nested branches is the method's strongest interaction.",
    ),
    printing: rating(
      3,
      "It fills a page efficiently, while deep labels become too small in static output.",
    ),
    practicalScale: rating(
      3,
      "Large trees pack densely, but reconvergent path duplication can grow exponentially.",
    ),
  },
  fan: {
    familiarity: rating(4, "The circular pedigree is a recognizable ancestry-chart form."),
    wholeDataset: rating(0, "It is a bounded ancestry projection around one Person."),
    ancestors: rating(5, "Binary angular slots make recorded ancestor paths the entire view."),
    descendants: rating(0, "Descendants are outside the fan projection."),
    siblings: rating(0, "Siblings of the focus and of ancestors are not represented."),
    partners: rating(
      1,
      "Father and mother roles occupy paired slots, but no marriage relationship is drawn.",
    ),
    multipleMarriages: rating(0, "An ancestor slot has one parent pair and no spouse history."),
    halfSiblings: rating(0, "Sibling parentage is outside the ancestry-slot model."),
    pedigreeCollapse: rating(
      2,
      "Repeated ancestors are marked, but every ancestral path still needs another placement.",
    ),
    disconnectedGroups: rating(0, "Unrelated components are outside the selected pedigree."),
    availableSpace: rating(
      4,
      "Rings use two dimensions compactly, though the square corners stay empty.",
    ),
    generationClarity: rating(5, "Every concentric ring is exactly one ancestor generation."),
    chronologicalClarity: rating(0, "Radius encodes generation, not elapsed time."),
    nameReadability: rating(
      2,
      "Outer-ring names become small and densely rotated after a few generations.",
    ),
    interactiveExploration: rating(
      3,
      "Pan, zoom, search, and selection help, but the projection remains ancestry-only.",
    ),
    printing: rating(4, "A modest-generation fan is compact and familiar on a page."),
    practicalScale: rating(
      2,
      "The number of slots doubles each generation even when many are empty.",
    ),
  },
  "h-tree": {
    familiarity: rating(1, "The alternating H grammar is unfamiliar to most family-tree readers."),
    wholeDataset: rating(0, "It is a bounded binary ancestry projection."),
    ancestors: rating(5, "Every reserved parent slot follows the published binary H-tree grammar."),
    descendants: rating(0, "The method does not represent descendants."),
    siblings: rating(0, "Siblings are outside the selected Person's ancestry."),
    partners: rating(
      1,
      "Opposing father and mother slots imply a pair without showing a Family relationship.",
    ),
    multipleMarriages: rating(0, "Spouse histories do not fit the binary parent-slot model."),
    halfSiblings: rating(0, "Sibling parentage is outside the projection."),
    pedigreeCollapse: rating(
      2,
      "Repeated ancestors are visibly marked but occupy every required path position.",
    ),
    disconnectedGroups: rating(0, "Disconnected groups are outside one focal pedigree."),
    availableSpace: rating(
      4,
      "Alternating direction delays the extreme width of a conventional pedigree.",
    ),
    generationClarity: rating(
      2,
      "Depth is exact, but generations zigzag instead of sharing an easy row or ring.",
    ),
    chronologicalClarity: rating(0, "Position has no date meaning."),
    nameReadability: rating(
      3,
      "Reserved space protects local labels, while deep fitted views still shrink them.",
    ),
    interactiveExploration: rating(
      3,
      "The self-similar layout supports zoom and selection, but this view has no animated rerooting.",
    ),
    printing: rating(3, "It prints compact pedigrees well but is not a familiar handoff format."),
    practicalScale: rating(
      3,
      "It delays crowding better than a binary tree, yet placements still double.",
    ),
  },
  "local-radial": {
    familiarity: rating(2, "Relationship rings are learnable but not a conventional family chart."),
    wholeDataset: rating(
      0,
      "The fixed two-hop boundary intentionally hides the rest of the document.",
    ),
    ancestors: rating(
      2,
      "Parents and grandparents can appear, but radius means hop count, not ancestry.",
    ),
    descendants: rating(2, "Children can appear without a dedicated outward descendant grammar."),
    siblings: rating(2, "Siblings share nearby edges but are not grouped by a Family junction."),
    partners: rating(2, "Marriage edges remain visible among many equal-weight local links."),
    multipleMarriages: rating(
      2,
      "Every local spouse edge survives, but several spokes can blend together.",
    ),
    halfSiblings: rating(
      2,
      "Exact parent edges remain, while crossings make Family ownership laborious to trace.",
    ),
    pedigreeCollapse: rating(
      5,
      "Each visible Person appears once even when local paths reconverge.",
    ),
    disconnectedGroups: rating(0, "Only the focus's connected neighborhood is represented."),
    availableSpace: rating(2, "Rings leave gaps and dense outer neighborhoods become line-heavy."),
    generationClarity: rating(0, "Rings encode shortest relationship distance, not generation."),
    chronologicalClarity: rating(0, "The layout does not use dates."),
    nameReadability: rating(
      2,
      "Names fit around small neighborhoods but compete with crossing spokes.",
    ),
    interactiveExploration: rating(
      4,
      "A bounded one-Person neighborhood is useful for step-by-step browsing.",
    ),
    printing: rating(1, "The local web of crossings is weak as a static family chart."),
    practicalScale: rating(1, "The method is intentionally useful only for a small neighborhood."),
  },
  "dual-outline": {
    familiarity: rating(1, "Opposing indented outlines are not a familiar family-tree convention."),
    wholeDataset: rating(0, "The view contains two selected multitrees, not the whole document."),
    ancestors: rating(4, "The ancestor outline and shared axis support deep upward tracing."),
    descendants: rating(4, "The opposing descendant outline supports deep downward tracing."),
    siblings: rating(2, "Only siblings admitted by the selected multitrees appear."),
    partners: rating(1, "Spouses are peripheral context rather than an explicit Family grammar."),
    multipleMarriages: rating(
      1,
      "Multitree selection can omit or separate alternate spouse Families.",
    ),
    halfSiblings: rating(
      1,
      "The outline does not make exact half-sibling Family ownership immediate.",
    ),
    pedigreeCollapse: rating(
      2,
      "Multitree construction omits repeated structural edges and shows them as supplemental links.",
    ),
    disconnectedGroups: rating(0, "Components outside the selected dual-tree subset are omitted."),
    availableSpace: rating(
      4,
      "Indented outlines pack many readable names into narrow opposing regions.",
    ),
    generationClarity: rating(
      3,
      "Generation columns remain aligned, though outline indentation competes with them.",
    ),
    chronologicalClarity: rating(0, "The layout does not encode time."),
    nameReadability: rating(5, "Readable aligned names are the outline variant's main strength."),
    interactiveExploration: rating(
      4,
      "Search, selection, and changing the focus pair suit the dual-tree subset.",
    ),
    printing: rating(
      4,
      "The narrow name-forward outline prints cleanly for a selected relationship story.",
    ),
    practicalScale: rating(
      3,
      "It handles a substantial selected multitree, not an unrestricted genealogy.",
    ),
  },
  timenets: {
    familiarity: rating(
      2,
      "Lifelines are familiar, but converging family timelines require a short reading key.",
    ),
    wholeDataset: rating(
      1,
      "Small documents can fit, while the defining large-data behavior deliberately filters by interest.",
    ),
    ancestors: rating(
      2,
      "Directional drop lines retain ancestry without a simple generational path.",
    ),
    descendants: rating(
      2,
      "Descendants remain traceable, but distant drop lines require careful following.",
    ),
    siblings: rating(
      2,
      "Birth order is visible while sibling grouping is weaker than a shared Family junction.",
    ),
    partners: rating(
      5,
      "Converging and diverging lifelines make marriage and divorce primary marks.",
    ),
    multipleMarriages: rating(
      5,
      "Chronological convergence, divergence, and remarriage are defining strengths.",
    ),
    halfSiblings: rating(
      4,
      "One drop per recorded parent preserves exact parentage, with crossings as the cost.",
    ),
    pedigreeCollapse: rating(
      4,
      "Each visible Person has one lifeline even when relationship paths reconverge.",
    ),
    disconnectedGroups: rating(
      3,
      "Independent blocks can be laid out, but degree-of-interest filtering may elide distant groups.",
    ),
    availableSpace: rating(
      3,
      "Interest filtering protects legibility, while long time spans create horizontal space.",
    ),
    generationClarity: rating(
      1,
      "Vertical order aids family blocks but is not a uniform generation band.",
    ),
    chronologicalClarity: rating(
      5,
      "Metric time, lifespan overlap, and relationship events define the layout.",
    ),
    nameReadability: rating(
      3,
      "Filtered views keep labels readable; complete dense timelines cannot.",
    ),
    interactiveExploration: rating(
      4,
      "Search, focus filtering, selection, and pan/zoom support chronological inquiry.",
    ),
    printing: rating(
      2,
      "A focused timeline prints well, but wide spans and drop lines do not suit every page.",
    ),
    practicalScale: rating(
      4,
      "Degree-of-interest filtering keeps large sources interactive without claiming all-name overview.",
    ),
  },
  "column-tree": {
    familiarity: rating(2, "It resembles a rooted tree, but category strips are an added grammar."),
    wholeDataset: rating(0, "The input is one rooted descendant spanning tree."),
    ancestors: rating(0, "Ancestors of the selected root are outside this descendant projection."),
    descendants: rating(4, "Every retained tree edge follows a clear downward rectangular path."),
    siblings: rating(
      3,
      "Children share a parent height, though category columns can separate them widely.",
    ),
    partners: rating(0, "Spouses outside the descendant tree are excluded."),
    multipleMarriages: rating(0, "Spouse Families are not represented as relationships."),
    halfSiblings: rating(
      1,
      "The spanning tree keeps one parent edge and cannot fully express exact multi-Family parentage.",
    ),
    pedigreeCollapse: rating(
      1,
      "Reconvergent edges are omitted because the method requires a tree.",
    ),
    disconnectedGroups: rating(0, "Only descendants reachable from the selected root are shown."),
    availableSpace: rating(2, "Category strips can become extremely wide or unbalanced."),
    generationClarity: rating(
      4,
      "Every child is strictly below its parent with stable depth separation.",
    ),
    chronologicalClarity: rating(0, "The current assigned height is structural depth, not time."),
    nameReadability: rating(
      3,
      "Names remain boxed and aligned, but wide fitted columns require zoom.",
    ),
    interactiveExploration: rating(
      3,
      "Search and selection help inspect categories and rooted paths.",
    ),
    printing: rating(
      3,
      "Moderate trees make useful category comparisons; wide columns need poster pages.",
    ),
    practicalScale: rating(
      3,
      "The V1 layout is stable for moderate rooted trees; category width limits readability.",
    ),
  },
  "area-adaptive": {
    familiarity: rating(
      3,
      "The top-down tree is familiar, but vertically folded terminal siblings require a short reading key.",
    ),
    wholeDataset: rating(0, "The input is one rooted descendant spanning tree."),
    ancestors: rating(0, "Ancestors of the selected root are outside this descendant projection."),
    descendants: rating(
      4,
      "Every retained tree edge remains downward and traceable through the folded layout.",
    ),
    siblings: rating(
      4,
      "Terminal siblings stay together in Family-preserving serpentine runs; internal siblings remain hierarchical.",
    ),
    partners: rating(0, "Spouses outside the descendant tree are explicitly excluded."),
    multipleMarriages: rating(
      0,
      "Separate spouse relationships are not part of this rooted-tree grammar.",
    ),
    halfSiblings: rating(
      1,
      "Family groups are not interleaved, but the one-parent spanning tree cannot fully show half-sibling parentage.",
    ),
    pedigreeCollapse: rating(
      1,
      "A reconvergent Person keeps one stable placement and later parent edges are omitted.",
    ),
    disconnectedGroups: rating(0, "Only descendants reachable from the selected root are shown."),
    availableSpace: rating(
      5,
      "Adapting large terminal sibling groups to the drawing area's aspect ratio is the method's defining strength.",
    ),
    generationClarity: rating(
      3,
      "Parent-before-child direction remains clear, while folded leaves at one depth no longer share one row.",
    ),
    chronologicalClarity: rating(0, "Placement is structural and does not encode dates."),
    nameReadability: rating(
      4,
      "Every Person receives a separate fixed-size card, though very large fitted views still require zoom.",
    ),
    interactiveExploration: rating(
      3,
      "Search, selection, root changes, and responsive relayout support a focused descendant investigation.",
    ),
    printing: rating(
      5,
      "The layout explicitly adapts a rooted tree to a chosen page or poster shape.",
    ),
    practicalScale: rating(
      4,
      "Large terminal-heavy trees lay out quickly; deeply branching internal trees can still become wide.",
    ),
  },
  "birthplace-cluster": {
    familiarity: rating(
      1,
      "It is a geographic aggregate network, not a person-by-person family chart.",
    ),
    wholeDataset: rating(
      2,
      "It summarizes qualifying birthplace groups while pruning people and places below thresholds.",
    ),
    ancestors: rating(0, "Individual ancestral paths are intentionally aggregated away."),
    descendants: rating(0, "Individual descendant paths are intentionally aggregated away."),
    siblings: rating(0, "Sibling groups are not represented."),
    partners: rating(
      1,
      "Cross-place co-parent counts hint at alliances but do not show marriages.",
    ),
    multipleMarriages: rating(0, "Individual spouse histories disappear in aggregation."),
    halfSiblings: rating(0, "Individual child ownership is not available."),
    pedigreeCollapse: rating(0, "People are not individually identifiable in the aggregate graph."),
    disconnectedGroups: rating(
      3,
      "Retained places can expose isolated regional components, subject to thresholds.",
    ),
    availableSpace: rating(4, "Aggregation dramatically reduces the number of visible nodes."),
    generationClarity: rating(0, "Generations are absent."),
    chronologicalClarity: rating(0, "The implemented Algorithm 4.1 view does not encode time."),
    nameReadability: rating(5, "A small set of place labels remains highly legible."),
    interactiveExploration: rating(
      2,
      "Person search can highlight a retained place cluster; the aggregate view does not support individual tracing.",
    ),
    printing: rating(4, "The reduced graph works well as a compact analytical figure."),
    practicalScale: rating(
      5,
      "Threshold aggregation is explicitly designed for very large genealogies.",
    ),
  },
};

export function getMethodRatings(methodId: string): MethodRatingSet | null {
  return methodId in METHOD_RATINGS ? METHOD_RATINGS[methodId as ReviewedMethodId] : null;
}

export function overallVersatility(ratings: MethodRatingSet): number {
  const total = RATING_CRITERIA.reduce((sum, criterion) => sum + ratings[criterion.id].score, 0);
  return total / RATING_CRITERIA.length;
}
