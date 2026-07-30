# Roadmap Verification

Status: audited locally on 2026-07-28.

This document maps the accepted phases and Acceptance Gates in
[`product-direction.md`](./product-direction.md) to current implementation
evidence. It is a completion audit, not a replacement product plan. A green
build alone is not considered proof of a user journey.

## Phase Evidence

| Phase                                              | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Result                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 0. Preserve and label the baseline                 | Canonical terms live in [`CONTEXT.md`](../CONTEXT.md), the accepted direction and ADRs are versioned, and deterministic genealogy and scale fixtures cover difficult structures. The single-view shell is retained outside the active import graph until every unique GeneaQuilt interaction passes the explicit [`geneaquilt-shell-parity.md`](./geneaquilt-shell-parity.md) deletion gate. The hand-drawn visualization-lab prototype is not an authoritative method path.                                                                                                                         | Implemented; legacy deletion gate remains active   |
| 1. Canonical document and TypeScript foundation    | `geneaquilt-core` preserves supported record properties, profiles unsupported source structures, enforces binary Family roles, reports conflicts, and blocks Impossible Parent Loops. [`schema.ts`](../web/src/domain/schema.ts) and [`schemaValidation.ts`](../web/src/domain/schemaValidation.ts) validate the Wasm seam. [`document.worker.ts`](../web/src/workers/document.worker.ts) performs GEDCOM parsing and Tree Analysis off the main browser thread. Tree Analysis visibly reports custom tags and other source record types retained in the Source GEDCOM.                              | Implemented and locally verified                   |
| 2. Adam HaRishon's Tree and workspace              | The public method-neutral document, source hash, producer, version, anchors, home Projection rule, and export policy are recorded in [`adam-harishon.manifest.json`](../web/public/data/adam-harishon.manifest.json). The Source GEDCOM is deliberately excluded from the website. [`database.ts`](../web/src/workspace/database.ts) provides open, rename, individual delete, and local persistence in IndexedDB; temporary opening and local Export & Share are part of the workspace flow.                                                                                                        | Implemented and locally verified                   |
| 3. Analysis and Method selection                   | Tree Analysis measures the agreed structural signals. [`recommendMethods.ts`](../web/src/recommendations/recommendMethods.ts) combines them with the user's goal and supplies plain-language reasons and cautions. Interactive Mode remains disabled until an Available Method is explicitly selected.                                                                                                                                                                                                                                                                                               | Implemented and locally verified                   |
| 4. Registry, Host, and first Native Visualizations | [`registry.ts`](../web/src/visualizations/registry.ts), [`adapter.ts`](../web/src/visualizations/adapter.ts), and [`adapters.ts`](../web/src/visualizations/adapters.ts) form the Registry, lifecycle Interface, and Adapter lookup. GeneaQuilt, pedigree, hourglass, dual tree, the p-graph family, and area-adaptive tree have isolated Native Implementations, difficult-structure tests, stated Projection contracts, and reviewed fidelity evidence. GeneaQuilt Method tools now restore alternate ranking, scoped search, directional tracing, multiple pins, isolate depth, zoom response, tilt, timeline brushing, advanced details, and two-way Bring-and-Slide without crowding the shared host. | Implemented and locally browser-verified            |
| 5. Comparison View                                 | The deterministic Avraham sample contains 47 people and 13 Families through three descendant generations. The dedicated A/B page renders two live Adapter instances, all seventeen rating criteria, equal-weight Overall Versatility, candid best-use and limitation text, Method Details, and mobile A/B tabs. All 24 current Methods are reviewed and selectable; the UI still supports an honest In-development state for future Methods.                                                                                                                                                         | Implemented and locally verified                   |
| 6. Exports, remaining Methods, and scale           | All 24 catalogued Methods have Native Implementations, accuracy evidence, explicit export contracts, and measured scale records. Local exports include attributed PNG, print, current-view PDF, complete-diagram PDF, and Tiled Poster PDF. Standalone HTML is now available for every user-tree Method: Canvas and SVG exports provide local pan, responsive wheel zoom, touch pinch, keyboard navigation, Fit, and print/PDF. Adam source and standalone exports remain disabled. The reproducible baseline is in [`performance-baseline.md`](./performance-baseline.md).                          | Implemented and locally verified                   |

## Acceptance Gates

| Gate                                                                  | Evidence                                                                                                                                                                                                                                                                       | Result                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| No family data is sent to a server                                    | [ADR 0001](./adr/0001-keep-geneaquilt-local-only.md) fixes the policy. The browser workflow requested only the local manifest, derived document, JavaScript, and Wasm assets; the generated standalone SVG file also uses a Content Security Policy with `default-src 'none'`. | Pass                                                    |
| Unsupported GEDCOM information is not silently lost                   | A Local Tree retains its original Source GEDCOM. Rust retains supported Person and Family properties and profiles notes, sources, media, other record types, and custom tags. Tree Analysis displays those preservation counts without exposing note contents.                 | Pass                                                    |
| Every recommendation explains itself                                  | Recommendation records always contain reasons, with deterministic tests for large trees and alternate user goals. The selection screen presents the first reason and relevant caution.                                                                                         | Pass                                                    |
| Every focused View discloses its Projection                           | Every Adapter returns a `VisualizationProjectionSummary`. Interactive Mode and Comparison View display visible and total Person and Family counts, a label, and the Projection rule.                                                                                           | Pass                                                    |
| Two Method instances remain isolated                                  | Comparison uses separate Adapter instances and per-instance SVG identifiers. Automated tests reject identifier collisions; a live A/B switch changed only View B and left no duplicate DOM identifiers.                                                                        | Pass                                                    |
| Theme changes do not alter Layout meaning                             | Theme is passed through the Adapter's `setTheme` seam after scene construction. SVG and Canvas theme changes update marks and tokens without recalculating method geometry.                                                                                                    | Pass                                                    |
| Unavailable Methods cannot masquerade as reviewed                     | Registry tests require a Native Adapter and verified evidence for every Available Method. The In-development state is unselectable and shows `Review pending` instead of scores or a sample.                                                                                   | Pass                                                    |
| Adam's Source GEDCOM cannot be exported                               | The manifest parser rejects a permissive Adam export policy. Live Export & Share disables both Source GEDCOM and standalone interactive HTML while retaining chart, image, and PDF output.                                                                                     | Pass                                                    |
| User-tree exports disclose private-data implications                  | Export & Share states that no hosted link is made, warns that standalone files contain private family information, and requires confirmation immediately before HTML creation. The standalone file repeats that it contains family information.                                | Pass                                                    |
| Desktop and mobile workflows are understandable without research text | Desktop and 390 x 844 browser audits covered home, Adam Interactive Mode, local upload, Tree Analysis, required Method selection, focused root choice, Local Trees, Comparison A/B, export policy, and standalone SVG use. Method papers remain behind Method Details.         | Pass in Chromium; cross-browser profiling remains below |

## Local Browser Audit

The 2026-07-28 Chromium audit exercised:

1. the desktop and mobile Adam home Projection;
2. full Adam Interactive Mode and a 277-person area-adaptive Projection;
3. the Adam export prohibition;
4. a generated six-person GEDCOM with remarriage, half-siblings, dates, and a custom `_QA` tag;
5. Tree Analysis, required Method selection, IndexedDB persistence, mobile open/export controls, and permanent deletion;
6. isolated GeneaQuilt and hourglass Comparison Views plus mobile A/B switching;
7. a downloaded area-adaptive standalone HTML file at desktop and mobile sizes;
8. Fit, button zoom, and the current trackpad response curve by observing the exported SVG `viewBox`;
9. GeneaQuilt's quiet Method tools at desktop and 390 x 844, including both
   rankers, scoped search, every relationship direction, multiple pins, isolate
   depth, zoom response, tilt, timeline brushing, and advanced record details;
10. actual Bring-and-Slide pointer navigation from Avraham to Shuach and from
    Shuach to Medan;
11. the browser request log, which contained only loopback-hosted app assets;
    and
12. the browser console, which reported no warnings or errors.

Temporary QA family data was deleted from the browser profile after the audit.

## Release Inputs

These values must come from the site creator and are intentionally not invented
by the implementation:

- a public email address for Request the GEDCOM;
- exact final creator-credit wording for Adam-derived Charts and Reports; and
- authoritative evidence for any future Method that cannot pass the existing
  Accuracy Gate.

The current manifest therefore keeps `requestEmail` as `null` and marks its
creator credit provisional. The supplied Adam Source GEDCOM is represented by
its exact SHA-256 hash and derived public visualization document; project policy
forbids committing or serving the Source GEDCOM itself.

## Remaining Verification

- Repeat the workflow matrix in current Safari and Firefox releases.
- Profile interaction and paint on representative lower-powered phones and
  laptops before publishing device-specific performance claims.
- Replace the two provisional release-content fields when the creator supplies
  them.

The authoritative local checks remain:

```sh
npm run check
npm run benchmark:scale
```
