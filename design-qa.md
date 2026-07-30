# Family Tree Editor Design QA

## Evidence

- Source visual truth: `/var/folders/vl/qwh7jjjx6tv8wbcj2ffx404m0000gn/T/codex-clipboard-9a8ee0f1-70bc-474a-8254-0aaced3fafcb.png`
- Final implementation capture: `/private/tmp/geneaquilt-family-tree-dated-final.png`
- Normalized implementation capture: `/private/tmp/geneaquilt-family-tree-dated-final-normalized.png`
- Full-view side-by-side comparison: `/private/tmp/geneaquilt-design-comparison-dated-final.png`
- Focused editor-panel comparison: `/private/tmp/geneaquilt-design-panel-comparison-dated-final.png`
- Requested CSS viewport: `1586 x 1024`
- Source pixels: `1586 x 992`
- Implementation pixels: `1586 x 1005`
- Density normalization: both captures are 1x. The implementation's bottom 13 pixels were cropped to `1586 x 992` for the full-view comparison; no rescaling was applied. The focused source panel was normalized from `485 x 911` to the implementation panel's `480 x 910`.
- State: light theme, conventional Family tree selected, Miriam Cohen selected and open for editing, parent family and sibling visible, saved local tree.
- Browser evidence: Codex in-app browser at `http://127.0.0.1:5173/`.

## Full-View Comparison

The final combined evidence shows the same primary composition as the source: fixed editing toolbar, spacious genealogy canvas, conventional vertical parent/family/child hierarchy, outlined selected person, persistent right-side editor, lower-left zoom controls, and bottom editor actions. The implementation uses a smaller three-person QA fixture, so the source is intentionally denser, but card scale, hierarchy, and panel proportions are comparable.

## Focused Region Comparison

The focused panel comparison was required because form labels, field density, and relative actions were too small to judge reliably in the full-view pair. It confirms that person identity, sex, life-event fields, Add relatives, and the primary/cancel action row follow the source hierarchy. The fourth sibling action intentionally changes the source's three-card row into a balanced two-by-two grid.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the existing GeneaQuilt Charter/Avenir language is retained. Family-tree cards now use the serif genealogy treatment and a second life-span line; editor hierarchy remains clear at desktop and mobile sizes.
- Spacing and layout rhythm: the drawer, field stack, relative cards, and sticky action row fit at the reference viewport. The conventional tree fit is capped so small families remain readable instead of expanding into oversized cards.
- Colors and visual tokens: existing parchment, green, rust, line, surface, and selected-state tokens consistently map to the reference's warm archival palette.
- Image and asset fidelity: the existing GeneaQuilt brand mark is reused. The family tree is live data-driven SVG rather than a substituted image; no reference raster asset was replaced with a placeholder or generated approximation.
- Copy and content: `Add parent`, `Add spouse`, `Add child`, and conditional `Add sibling` match the requested language. `Family tree` replaces the technical method label for the primary view.
- Responsiveness and accessibility: the editor was exercised at `390 x 844`; fields remained scrollable, action buttons remained reachable, and all relative controls retained semantic button names and form labels.

## Comparison History

1. Initial comparison found two P2 issues: a small tree fit to oversized cards, and the sticky save row covered the relative-action area. The fit now has a relationship-tree maximum scale; the drawer gained reference-like height and denser editor spacing; the redundant date hint was removed from edit mode. Post-fix evidence: `/private/tmp/geneaquilt-design-comparison-final.png`.
2. The post-layout comparison found a P2 content-fidelity gap: source cards showed life spans while the implementation showed names only. Relationship-tree nodes now render recorded birth/death years as a secondary line with an accessible combined label. Post-fix evidence: `/private/tmp/geneaquilt-design-comparison-dated-final.png`.
3. Final full-view and focused-panel comparisons found no remaining P0/P1/P2 issue.

## Open Questions

- None blocking. Distinct kinship icons and sex markers on person cards remain optional P3 refinements rather than requirements for this implementation.

## Implementation Checklist

- [x] Make the conventional Family tree the new-tree default.
- [x] Keep small trees at a readable zoom while preserving pan, zoom, and fit.
- [x] Show life spans on conventional person cards.
- [x] Remove the two requested sex labels while preserving imported GEDCOM values.
- [x] Add parent, spouse, child, and conditional sibling actions to the person editor.
- [x] Persist siblings in the selected GEDCOM parent family.
- [x] Verify desktop, mobile, save status, interaction flow, and console output.

final result: passed
