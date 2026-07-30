# Product UI concepts

These concepts lock the intended information hierarchy and visual direction for the multi-method GeneaQuilt workspace. They are implementation references, not algorithm-fidelity references; every chart in the finished product must come from the audited method implementation and real genealogy data.

## Included states

- `home-desktop-concept.png`: first visit, Adam HaRishon's Tree projection, GEDCOM entry, and quiet Local Trees access.
- `method-selection-desktop-concept.png`: understandable Tree Analysis, user goal, explainable recommendations, and required method choice.
- `interactive-mode-desktop-concept.png`: viewport-first visualization with compact floating tools and a collapsible person panel.
- `comparison-desktop-concept.png`: isolated A/B views and the complete capability-rating table.
- `mobile-flow-concept.png`: mobile home, method selection, and single-view Interactive Mode.

## Required corrections during implementation

- Adam HaRishon's built-in tree is never listed as an exportable Local Tree and its Source GEDCOM is never offered for download.
- Counts, dates, names, relationships, scores, and method drawings in concepts are placeholders until generated from audited data.
- The home projection rule is documented and derived from the supplied GEDCOM; it is not an arbitrary first-record slice.
- Interactive Mode uses the actual GeneaQuilt layout and preserves every disconnected group. It does not reproduce the concept's invented geometry.
- Comparison samples use the exact Avraham three-descendant-generation projection defined in `docs/product-direction.md`.
- On mobile, comparison uses A/B switching rather than compressed side-by-side views.
- Plain text never translates or lifts on hover; links use underline or color, and controls use clear focus/pressed states.

## Visual contract

- Warm parchment and ivory surfaces, forest teal primary actions, restrained ochre and rust emphasis.
- Editorial serif for titles and a legible geometric sans face for controls and data.
- Generous negative space on ordinary pages; the visualization owns most of the viewport in Interactive Mode.
- Glass is limited to floating Interactive Mode tools, with strong contrast and a solid reduced-transparency fallback.
- Secondary features stay behind labeled disclosures, menus, drawers, or Method Details.
