# GeneaQuilt Shell Parity

Status: implementation parity reached; deletion gate remains active. Audited on
2026-07-28.

The original single-view browser shell remains in `web/src/app.js`, with its
entrypoint and small state tests in `web/src/main.js`, `web/src/appState.js`,
and `web/src/appState.test.js`. The active website does not import those files:
`web/index.html` loads `workspaceMain.ts`, and the Comparison View loads
`comparisonMain.ts`.

The retained shell is therefore not a production fallback. It is the parity
reference for GeneaQuilt-specific interaction behavior while the multi-method
Tree Workspace replaces the old page structure. A file being absent from the
active import graph is not sufficient evidence that it can be deleted.

## Migration Gate

The retained shell may be removed only after every row below is either:

1. implemented and verified through the current Tree Workspace and
   `GeneaQuiltAdapter`; or
2. explicitly retired because it conflicts with the accepted product
   direction, with the reason recorded here.

| Legacy capability                                         | Current state                                                                                                                                                                                                                                     | Required disposition                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Choose a GEDCOM locally                                   | Replaced by the local worker-backed upload flow and Tree Analysis.                                                                                                                                                                                | Complete                                          |
| Built-in sample                                           | Replaced by the documented Adam HaRishon home Projection and Interactive Mode.                                                                                                                                                                    | Complete                                          |
| Paste or edit raw GEDCOM text                             | Deliberately absent. The accepted iteration does not expose tree creation or editing. Source GEDCOM export remains available for a user's Local Tree.                                                                                             | Retired by product scope                          |
| Standard and experimental GeneaQuilt rankers              | Method tools expose Standard and clearly labeled Experimental layout styles. Switching either way rebuilds only the GeneaQuilt engine, preserves valid selection state, and leaves the source Genealogy Document unchanged.                         | Implemented and browser-verified                  |
| Search names, attributes, and record ids                  | Ordinary search remains name-first. Method tools add All fields, Names, File details, and Record IDs; Chromium runtime checks matched Avraham by name, `38103754` by id, and `BIRT 1948` by source properties.                                      | Implemented and browser-verified                  |
| Relationship trace direction                              | Method tools expose All, Parents and earlier, Children and later, and None. Each mode reaches the existing Wasm interaction seam and updates the same focus model.                                                                                 | Implemented and browser-verified                  |
| Pinned multi-highlight stack                              | The active Adapter composes primary selection with multiple removable pinned highlights. A runtime check retained Medan and Avraham simultaneously.                                                                                              | Implemented and browser-verified                  |
| DOI isolate and focus depth                               | The optional focus checkbox and depth slider call `QuiltRenderer.setIsolation`; the primary selection, search, pins, viewport, and timeline remain independent inputs to the shared focus model.                                                    | Implemented and browser-verified                  |
| Trackpad zoom response control                            | The shared strengthened default remains automatic. Method tools expose optional response fine-tuning and initialize the slider from the actual renderer speed.                                                                                    | Implemented and browser-verified                  |
| Manual tilt control                                       | Two-pointer rotation remains available. Method tools add an explicit angle slider, -15 degree preset, and reset action; the renderer continues to carry that angle into exports.                                                                   | Implemented and browser-verified                  |
| Timeline summary and range brush                          | Method tools expose people/family scope, a Canvas date histogram, range brushing, clear, highlight-only, and highlight-and-fit behavior. The range combines with selection, search, relationship tracing, and pins rather than replacing them.       | Implemented and browser-verified                  |
| Minimap                                                   | The active GeneaQuilt View includes the overview canvas and navigation.                                                                                                                                                                           | Complete                                          |
| Bring-and-Slide                                           | The active Adapter now requests left and right candidates after person selection and passes them to `QuiltRenderer`. Runtime drags navigated right from Avraham to Shuach and left from Shuach to Medan.                                            | Implemented and browser-verified in both directions |
| Selected record relationships                             | The active details drawer shows parents, husbands or wives, children, and dates.                                                                                                                                                                  | Complete                                          |
| Layer, component, graph-link, and source-property details | A secondary Selected record details disclosure shows layer, order, component, parent/spouse Family links, graph direction, and retained source properties without crowding the ordinary details drawer.                                            | Implemented and browser-verified                  |
| Expanded or compact names                                 | Available in Interactive Mode.                                                                                                                                                                                                                    | Complete                                          |
| Theme, Fit, button zoom, keyboard pan and zoom            | Available through shared Interactive Mode controls.                                                                                                                                                                                               | Complete                                          |
| Interactive HTML and print/PDF                            | Replaced by method-declared local HTML, PNG, print, current-view PDF, complete-diagram PDF, and Tiled Poster PDF exports with privacy and Adam policy enforcement.                                                                                | Complete                                          |

## Runtime Evidence

The 2026-07-28 Chromium audit used the bundled 535-person Adam document in the
active `workspaceMain.ts` application and verified:

- the main desktop toolbar remains compact and adds Method tools only for an
  Adapter that supplies them;
- the 390 x 844 toolbar keeps Method tools inside the existing More options
  dialog, and the tool sheet remains scrollable and legible;
- both rankers, all search scopes, all relationship modes, two simultaneous
  pins, isolate depth, zoom response, explicit tilt, timeline brushing and fit,
  and advanced source details change their authoritative UI state without
  browser warnings or errors; and
- actual pointer gestures complete Bring-and-Slide in both directions.

The Rust/Wasm tests cover search scope semantics, interaction direction,
timeline filtering, and Bring-and-Slide candidate semantics. The remaining
reason to retain the old shell is repeatable browser-level automation through
the active Adapter—not missing production functionality.

## Visual Prototype Files

The former hand-drawn visualization-lab files were not authoritative method
implementations. The active Comparison View now mounts the same isolated Native
Visualization Adapters used by Interactive Mode. Their inaccurate drawings must
not be revived as competing implementations.

If any recovered prototype file contains a useful interaction or explanatory
idea, that idea must be evaluated and migrated independently; its drawing is not
fidelity evidence.

## Completion Evidence

The retained shell may be deleted only when:

- the browser-verified rows above have repeatable automated coverage through
  the active Adapter interface;
- desktop and mobile browser checks show the tools remain discoverable without
  crowding Interactive Mode;
- GeneaQuilt search, selection, tracing, timeline, isolate, rotation, and
  Bring-and-Slide work on the canonical difficult-structure fixtures; and
- the retained shell can be deleted without reducing the active test surface or
  removing a unique capability.
