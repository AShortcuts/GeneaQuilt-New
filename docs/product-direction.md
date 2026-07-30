# GeneaQuilt Product Direction

Status: Accepted on 2026-07-21.

This document records the agreed product behavior and implementation sequence for expanding GeneaQuilt from a single-view GEDCOM viewer into a private, multi-method genealogy visualization workspace. Canonical product language lives in [`CONTEXT.md`](../CONTEXT.md), and durable architecture decisions live in [`docs/adr`](./adr).

## Product Promise

GeneaQuilt helps people open a family tree file, understand the structure of the genealogy, choose an appropriate Visualization Method, and explore or compare accurate Charts without sending family data to a server.

The ordinary experience is newcomer-friendly and visually led. Technical definitions, limitations, implementation evidence, and research papers live in Method Details rather than occupying the main workflow.

## Permanent Rules

- GeneaQuilt has no server-side storage, processing, accounts, synchronization, or hosted sharing.
- A GEDCOM is described plainly as a family tree file format.
- Genealogy Documents stay on the user's device.
- GeneaQuilt is the default recommendation for large Whole-dataset Views, not a universal winner.
- Accuracy comes before visual polish.
- A method is selectable only after its Native Visualization passes review.
- Visualization Methods share data and theme behavior, not geometry.
- Tree creation and editing are architecturally anticipated but not exposed in this iteration.

## Primary Journeys

### First visit

The home page immediately presents a limited, interactive Projection of Adam HaRishon's Tree. The page explains in one short sentence that GEDCOM is a family tree file format and offers two primary paths:

1. Enter Interactive Mode with Adam HaRishon's Tree.
2. Choose a GEDCOM from the user's device.

There is no Make a Tree action until the editing experience can be built as a complete product in its own right.

### GEDCOM upload

The required flow is:

1. Choose GEDCOM.
2. Parse, validate, and analyze it locally.
3. Show an understandable Tree Analysis.
4. Show recommended methods first, followed by every other method.
5. Require the user to select a method.
6. Open Interactive Mode.

The selection screen links to the dedicated Comparison View. It does not open a tree automatically, although GeneaQuilt may be preselected as the leading recommendation.

### Returning user

Successful uploads may be retained as Local Trees in IndexedDB. The local library provides open, rename, individual delete, and Export & Share actions. It also offers Open without saving for temporary work.

Deletion identifies the tree and record count, recommends exporting first, requires confirmation, and explains that deletion on the device is permanent.

## Adam HaRishon's Tree

Adam HaRishon's Tree is authored and owned by the site's creator. Its Source GEDCOM is not directly downloadable or shareable from the site.

- The site offers Request the GEDCOM once the creator supplies the public request email address.
- The tree remains fully usable in Interactive Mode.
- Users may generate Charts, Reports, images, normal PDFs, and Tiled Poster PDFs.
- Standalone interactive HTML export is disabled because it could expose enough structured data to reconstruct the tree.
- Every derived export includes the tree title, creator credit, tree version, and site attribution.
- The creator will provide the public email address and exact creator-credit wording before release.

Because the site is static and has no server-side processing, the derived visualization document required to draw this tree is delivered to the visitor's device and can be inspected there. It excludes the Source GEDCOM text, notes, sources, custom properties, and media, and the UI never offers it as a downloadable tree. This is an honest product boundary, not technical copy protection.

The audited home Projection contains 58 of 535 people and 23 of 243 Families. It follows the shortest recorded lineage from Adam to Ya'akov, includes the spouse in each lineage Family, and then includes every recorded spouse and child Family of Ya'akov. Ya'akov's children are the terminal generation; no grandchild Families are included. It is a genealogical rule, never an arbitrary first-N-record limit.

## Tree Analysis and Recommendations

Tree Analysis measures at least:

- Person and Family counts
- Disconnected Family Groups
- generation depth and breadth
- largest sibling group
- multiple spouses and remarriages
- half-sibling structures
- Pedigree Collapse and Reconvergence
- date coverage
- missing or conflicting relationships
- Impossible Parent Loops

Recommendations also consider a compact user goal: whole genealogy, ancestors, descendants, one person's neighborhood, chronology, printing, or comparison.

Recommendation rules are deterministic and explainable. A recommendation says why it was made, such as a large record count or extensive remarriage. The 1,000-person threshold for prioritizing GeneaQuilt in Whole-genealogy recommendations is confirmed by the reproducible local baseline in [`performance-baseline.md`](./performance-baseline.md); it marks the point where Canvas-backed whole-document rendering becomes preferable to dense SVG, not a universal quality boundary.

Incompatible or narrowly focused methods are explained and ranked lower rather than hidden. A method is disabled only when it cannot operate safely on the active Genealogy Document.

## Comparison View

The Comparison View lists every current and future Visualization Method, including In-development Methods. It is a dedicated page rather than a crowded section of the upload flow.

### Visual samples

Every Available Method uses the same Avraham Comparison Sample:

- generation 0: Avraham
- generation 1: children
- generation 2: grandchildren
- generation 3: great-grandchildren
- connected spouses and descendant Families within that range

This public sample makes the visual comparison familiar and consistent. Separate internal fixtures still test remarriage, half-siblings, disconnected groups, missing parents, Pedigree Collapse, Reconvergence, and invalid input when those structures are not present in the Avraham Projection.

### Rating table

The table shows availability, Method Details, and best use as factual text. It rates every reviewed method from zero to five stars for:

- familiarity
- Whole-dataset View support
- ancestors
- descendants
- siblings
- husbands and wives
- multiple marriages
- half-sibling parentage
- Pedigree Collapse
- Disconnected Family Groups
- use of available space
- generation clarity
- chronological clarity
- name readability
- interactive exploration
- printing
- practical scale

Each score follows a written rubric and includes a short qualification where needed. The bottom displays Overall Versatility as an equal-weight average out of five stars. This is a breadth score, not a universal-quality claim; document-specific Method Recommendations remain separate.

Available Methods have working samples and ratings. In-development Methods remain visible, but their ratings say Review pending instead of presenting estimates as facts.

## Interactive Mode

Interactive Mode gives the active View as much of the viewport as practical. Search, method selection, tree summary, export, and Method Details appear in compact floating toolbars with restrained glass backgrounds.

The glass treatment must retain strong text contrast, use minimal blur, avoid decorative motion, and provide a solid fallback for reduced-transparency preferences and constrained devices.

### Method capabilities

- A Whole-dataset View receives the full Genealogy Document, including Disconnected Family Groups.
- A focused method asks for a focal Person Record and shows the Projection's visible and total counts.
- Switching methods preserves the document, theme, selected person, and relevant focus.
- Camera coordinates are not transferred between unrelated Layouts.
- Shared controls remain consistent; method-specific controls appear only where meaningful.

There is no Copy Link feature. Private Local Trees cannot produce portable site links because there is no server and no document data is placed in URLs.

## Export & Share

Export availability is declared separately by each method.

For a user's Local Tree, Export & Share may provide:

- Source GEDCOM
- standalone interactive HTML
- current-view PDF
- complete-diagram PDF
- Tiled Poster PDF
- image or print output
- the device's local share sheet

Standalone HTML warns that the file contains private family information. Export & Share never creates a hosted link.

PDF output offers Current view and Complete diagram when the selected method can produce both. Tiled Poster PDF supports Letter, A4, and A3 paper, portrait or landscape orientation, configurable overlap, crop marks, page coordinates, assembly order, and preview. A single oversized PDF page may also be produced when dimensions and PDF software permit it.

## Genealogy Rules and Validation

The canonical Family model is recorded in [ADR 0002](./adr/0002-use-binary-husband-wife-families.md).

- Multiple or simultaneous spouses create separate binary Families.
- Children link only to their specifically recorded Family or Families.
- One birth Family and additional explicit adoptive or foster Families are allowed.
- Step relationships are derived through marriage and never silently converted to parentage.
- A Person Record may have no recorded parents.
- A Family that links children must identify at least one parent.
- An unknown spouse role remains empty; no fictional Unknown Person Record is generated.
- A Family without children is valid.
- `HUSB` and `WIFE` roles do not infer or override the independent GEDCOM `SEX` value.
- Unsupported or conflicting source structures are preserved and reported rather than discarded.

An Impossible Parent Loop blocks Interactive Mode. The validation summary identifies the affected records and instructs the user to correct the Source GEDCOM in its originating genealogy program; GeneaQuilt cannot safely guess which relationship should be removed.

## Method Availability and Accuracy

Usable methods do not carry doubtful accuracy badges. They are simply Available Methods. In-development Methods are visible in the catalog but cannot be selected.

Method Details records how an Available Method was checked, including:

- primary paper
- original source code when available
- official application output or author examples
- exact graph transformation
- mathematical invariants
- difficult genealogy fixtures
- deterministic behavior where promised
- visual comparison with authoritative output
- documented differences in the web version

If a paper and original application intentionally differ, the application behavior is the primary version and Method Details explains the paper difference. An apparent implementation bug is not copied blindly; the intended method is preserved and the correction is documented.

The initial native-method sequence is:

1. GeneaQuilt
2. traditional pedigree
3. hourglass
4. dual tree
5. p-graph family
6. area-adaptive tree
7. remaining methods in research-related batches

## Target Architecture

### Genealogy Document Module

The Rust core remains authoritative for GEDCOM parsing, preservation, validation, the binary Family model, stable record identity, relationship indexes, Projection creation, search, and document analysis.

### Tree Workspace Module

Owns Adam HaRishon's Tree, Local Tree identity, IndexedDB persistence, temporary uploads, deletion, provenance, and transitions among the home page, selection screen, Comparison View, and Interactive Mode.

### Method Recommendation Module

Owns explainable document analysis, user-goal matching, provisional thresholds, recommendation reasons, and compatibility findings. It does not calculate visualization geometry.

### Visualization Registry

Owns method identity, availability, Method Details, research sources, capabilities, rating rubrics, export support, and selection of an isolated Adapter.

### Visualization Host

Owns the Interactive Mode shell, theme, shared selection concepts, loading and validation states, floating tools, responsive behavior, and lifecycle isolation. It never calculates algorithm-specific geometry.

### Method Implementations

Each method owns its Projection needs, ranking, ordering, placement, routing, marks, labels, and method-specific interaction. SVG, Canvas, WebGL, TypeScript, and Rust may be selected per method. Two instances of the same method must coexist without identifier or state collisions.

### Fidelity Harness

Owns transformation fixtures, mathematical invariants, authoritative visual references, deterministic snapshots, accessibility checks, export checks, and measured scale envelopes.

## TypeScript and Worker Direction

Handwritten web application and visualization source will migrate substantially to TypeScript as Modules are separated. This includes validated schemas at the Rust/Wasm and renderer seams. Static HTML and CSS remain appropriate, and generated Wasm bindings remain generated rather than hand-converted.

GEDCOM parsing, Tree Analysis, and expensive Layout work move off the main browser thread. The migration is staged by functional Module rather than performed as a blind extension-only rewrite.

## Performance and Accessibility

Standard performance fixtures contain 100, 1,000, and 10,000 people. GeneaQuilt additionally targets a 50,000-person stress fixture, while every method publishes its own practical scale rather than inheriting GeneaQuilt's claim. Compare is measured separately with two active Views.

Every Available Method provides:

- keyboard access to meaningful controls
- searchable Person Records
- selected-person details
- a text summary and relationship list independent of the drawing
- touch pan and zoom where spatial navigation applies
- useful single-View mobile operation
- A/B switching for mobile comparison instead of two compressed side-by-side Views

## Delivery Sequence

### Phase 0: preserve and label the baseline

- Keep current behavior working.
- Mark existing comparison drawings as being replaced rather than treating them as authoritative.
- Establish fixtures, terminology, and target schemas.

### Phase 1: canonical document and TypeScript foundation

- Deepen GEDCOM preservation, binary Family validation, and Impossible Parent Loop reporting.
- Define validated method-neutral document and analysis data.
- Introduce the TypeScript build and worker pipeline incrementally.

### Phase 2: Adam HaRishon's Tree and workspace

- Package the creator-supplied Source GEDCOM with provenance and version metadata.
- Build the documented home Projection.
- Add Local Trees, temporary upload, IndexedDB persistence, deletion, and local-only Export & Share rules.

### Phase 3: analysis and method selection

- Build Tree Analysis.
- Add user-goal selection and explainable Method Recommendations.
- Require method selection before Interactive Mode.

### Phase 4: Registry, Host, and first native methods

- Establish isolated method lifecycle and capabilities.
- Migrate GeneaQuilt first.
- Implement pedigree, hourglass, dual tree, p-graphs, and area-adaptive tree through the accuracy gate.

### Phase 5: Comparison View

- Build the Avraham Comparison Sample.
- Add complete capability rubrics, Method Ratings, Overall Versatility, and side-by-side live comparison.
- List all methods without inventing ratings for unfinished work.

### Phase 6: exports, remaining methods, and scale

- Add method-specific HTML, PDF, image, print, and Tiled Poster PDF exports.
- Implement remaining method families in audited batches.
- Tune workers, caching, culling, level of detail, Canvas, and WebGL only from measured evidence.

## Acceptance Gates

A phase is not complete unless:

- no family data is sent to a server
- unsupported GEDCOM information is not silently lost
- every recommendation explains itself
- every focused View discloses its Projection
- two method instances remain isolated
- theme changes do not alter Layout meaning
- unavailable methods cannot masquerade as accurate implementations
- Adam HaRishon's Source GEDCOM cannot be exported from the site
- user-tree exports clearly disclose private-data implications
- desktop and mobile workflows remain understandable without reading research text

## Inputs Still Required

These are content inputs, not unresolved product decisions:

- the public request email address
- exact creator-credit wording for derived Charts and Reports
- an official implementation, complete paper, or authoritative output for any Method that cannot otherwise pass its Accuracy Gate

Adam HaRishon's Source GEDCOM is now packaged locally. Its initial version identifier is derived from the supplied file so the exact input used for every Projection and export remains traceable.
