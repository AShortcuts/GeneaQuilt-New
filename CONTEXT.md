# GeneaQuilt Context

GeneaQuilt is a private genealogy-visualization workspace for understanding one family tree through multiple visual methods. This glossary names the genealogy and visualization concepts used throughout the product.

## Genealogy Data

**GEDCOM**:
A family tree file format used to exchange genealogical records between different family-tree programs.
_Avoid_: Genealogy app, GeneaQuilt file

**Genealogy Document**:
One imported, built-in, or user-created collection of people, families, relationships, and supporting genealogy data.
_Avoid_: Database, project, dataset

**Editable Genealogy Document**:
The authoritative working revision of a user-created or imported Genealogy Document. It preserves unedited GEDCOM records and applies Person and Family changes atomically.
_Avoid_: Form state, derived chart, second copy

**Adam HaRishon's Tree**:
The creator-owned Genealogy Document used to introduce GeneaQuilt and let visitors explore the visualization methods before supplying their own tree. Its source GEDCOM is controlled separately from charts and reports derived from it.
_Avoid_: Famous tree, sample tree, demo tree

**Source GEDCOM**:
The family tree file from which a Genealogy Document is imported. It is distinct from charts, reports, and other derived presentations of that genealogy.
_Avoid_: Chart, report, screenshot

**Genealogy Graph**:
The people, binary families, and relationships represented by a Genealogy Document as a connected or disconnected graph.
_Avoid_: Layout, diagram

**Family**:
A binary husband-and-wife family and their children. The husband or wife may be unknown, but every child must be linked to at least one known parent; a person may participate in more than one Family.
_Avoid_: Household, unrestricted partnership group

**Person Record**:
One identified person in a Genealogy Document. Similar names or details do not make two Person Records the same person.
_Avoid_: Person Placement, automatic duplicate

**Person Placement**:
One visible occurrence of a Person Record in a particular View. Some methods repeat one Person Record in multiple positions to express ancestry paths.
_Avoid_: Duplicate person, Person Record

**Disconnected Family Group**:
A group of people and Families with no relationship path to another group in the same Genealogy Document.
_Avoid_: Non-relatives

**Local Tree**:
A Genealogy Document retained on the user's device for later use.
_Avoid_: Cloud tree, account tree

**Local Tree Session**:
The active editing lifecycle for one Local Tree or temporary draft, including its current revision, autosave state, recovery history, undo, and redo.
_Avoid_: Account session, collaboration session

**Tree Analysis**:
An understandable summary of a Genealogy Document's size, shape, relationship patterns, date coverage, and validation findings.
_Avoid_: Hidden score, Method Recommendation

## Genealogy Structures

**Pedigree Collapse**:
The same ancestor occupying more than one position in a person's ancestry because different ancestral paths reach that Person Record.
_Avoid_: Recursion, duplicate ancestor

**Reconvergence**:
Two or more relationship paths joining again at the same Person Record or Family.
_Avoid_: Recursion, directed cycle

**Impossible Parent Loop**:
An invalid lineage path that makes a Person Record their own ancestor by repeatedly following parent-to-child direction.
_Avoid_: Pedigree collapse, reconvergence, recursion

## Visualization

**Visualization Method**:
A named way of selecting, arranging, and drawing genealogy information, usually defined by research or established convention.
_Avoid_: Theme, screen, random layout

**Native Visualization**:
A Visualization Method that operates on the active Genealogy Document and approaches the quality and behavior of a dedicated implementation rather than using a fixed illustration.
_Avoid_: Mock-up, static example

**Available Method**:
A Native Visualization that has passed its mathematical, visual, and interaction review and can be selected for Interactive Mode.
_Avoid_: In-development Method, approximate illustration

**In-development Method**:
A catalogued Visualization Method whose Native Visualization has not yet passed review and therefore cannot be selected for Interactive Mode.
_Avoid_: Available Method, inaccurate method

**View**:
One rendered, interactive instance of a Visualization Method applied to a Genealogy Document or Projection.
_Avoid_: Visualization Method, Genealogy Document

**View State**:
The temporary camera position for one View, scoped to a Genealogy Document, Visualization Method, and focal people so a redraw can return to the same place.
_Avoid_: Genealogy data, saved relationship, layout

**Layout**:
The method-specific placement and routing result for a View.
_Avoid_: Genealogy Graph, theme

**Projection**:
A deliberately selected portion of a Genealogy Graph used for a preview or focused Visualization Method.
_Avoid_: Arbitrary record limit, first records

**Whole-dataset View**:
A View capable of including every Person Record and Family in a Genealogy Document, including Disconnected Family Groups.
_Avoid_: Focused View, Projection

**Interactive Mode**:
A spacious, hands-on View intended for sustained exploration of one Genealogy Document with one Visualization Method.
_Avoid_: View full tree, static preview

**Method Details**:
The optional explanation of a Visualization Method's meaning, strengths, limitations, coverage, and research sources.
_Avoid_: Main instructions, research dump

**Method Recommendation**:
An explainable suggestion of Visualization Methods based on a Genealogy Document's structure and the user's stated purpose.
_Avoid_: Automatic winner, opaque ranking

**Comparison View**:
The dedicated place for comparing every Visualization Method's strengths, limitations, ratings, and visual sample.
_Avoid_: Interactive Mode, Method Details

**Avraham Comparison Sample**:
The shared visual-sample Projection containing Avraham, connected spouses, and descendant Families through three descendant generations.
_Avoid_: Adam HaRishon's Tree preview, arbitrary test family

**Method Rating**:
A documented zero-to-five-star assessment of how well a Visualization Method handles one named capability.
_Avoid_: Unexplained opinion, Method Recommendation

**Overall Versatility**:
The equal-weight average of a Visualization Method's published Method Ratings, expressing breadth rather than universal quality.
_Avoid_: Overall winner, recommendation for every tree

## Derived Documents

**Chart**:
A visual presentation derived from a Genealogy Document through one Visualization Method.
_Avoid_: Source GEDCOM, Genealogy Document

**Report**:
A printable or readable document derived from genealogy information, with explanatory text or structured details in addition to a Chart.
_Avoid_: Source GEDCOM

**Tiled Poster PDF**:
A Chart divided across multiple printable PDF pages that can be assembled into one larger physical presentation.
_Avoid_: Single-page PDF, Source GEDCOM

**Export & Share**:
A local action that creates a file or invokes the device's sharing tools without uploading the Genealogy Document or creating a hosted link.
_Avoid_: Public link, cloud sharing
