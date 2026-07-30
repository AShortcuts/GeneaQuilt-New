pub mod analysis;
pub mod document;
pub mod doi;
pub mod gedcom;
pub mod graph;
pub mod model;
pub mod search;
pub mod selection;
pub mod timeline;

pub use analysis::{
    CanonicalDocument, DocumentAnalysis, SourceProfile, ValidationFinding, ValidationSeverity,
    analyze_document, build_canonical_document, profile_gedcom,
};
pub use document::{
    DocumentCommand, DocumentError, DocumentSnapshot, EditablePerson, FamilyRole, GedcomExport,
    GedcomVersion, GenealogyDocument, PersonInput, RelativeKind,
};
pub use doi::{DoiValue, compute_selection_doi};
pub use gedcom::{GedcomError, parse_gedcom};
pub use graph::{EdgeRecord, GeneaGraph, VertexRecord};
pub use model::{Family, ParentFamilyLink, Person, VertexId, VertexKind};
pub use selection::{HighlightMode, SelectionState, TraceResult, trace};
