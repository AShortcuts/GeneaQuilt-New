# Visualization performance baseline

Status: measured locally on 2026-07-28.

This baseline records deterministic scene-construction evidence for the practical-scale labels in the Visualization Registry. It is not a promise that every computer will match these times, and it does not confuse fast Layout with a readable drawing. SVG paint, label density, interaction, and the mathematical scope of a method can become limiting well before its Layout function runs out of speed.

## Reproduce it

Run `npm run benchmark:scale` from the repository root. The harness generates linked binary husband-and-wife genealogy fixtures with exactly 100, 1,000, and 10,000 people. GeneaQuilt additionally receives 50,000 people. No fixture or result is uploaded.

The recorded machine was an Apple M4 Pro MacBook Pro with 24 GB memory, using Node 26.5.0 on arm64 macOS. The 100- and 1,000-person results use the median of three runs. The 10,000- and 50,000-person stress results use one run so the harness remains practical in ordinary local development.

## Key result

| Method family        | Fixture | Scene construction |              Produced marks | What actually limits it                                                           |
| -------------------- | ------: | -----------------: | --------------------------: | --------------------------------------------------------------------------------- |
| GeneaQuilt           |  50,000 |          849.64 ms | 66,667 nodes + 66,666 edges | Canvas label density and target-device interaction                                |
| GeneaQuilt           |  10,000 |          145.97 ms | 13,333 nodes + 13,332 edges | Canvas label density                                                              |
| p-graph family       |  10,000 |    58.00-123.57 ms |          6,667-13,333 nodes | SVG paint, crossings, and semantics                                               |
| Relationship nodes   |  10,000 |           67.80 ms | 13,333 nodes + 13,332 edges | SVG paint and visual density                                                      |
| Generic Sugiyama     |  10,000 |          510.59 ms | 10,000 nodes + 13,332 edges | SVG paint and lack of spouse semantics                                            |
| Genealogy Sugiyama   |  10,000 |           97.21 ms | 10,000 nodes + 16,665 edges | SVG paint and direct-parent ambiguity                                             |
| Force layouts        |  10,000 |   630.42-658.74 ms | 10,000 nodes + 16,665 edges | SVG paint and edge clutter                                                        |
| Radial generations   |  10,000 |           30.35 ms | 10,000 nodes + 16,665 edges | Names and crossings at overview scale                                             |
| Fractal rectangles   |  10,000 |           17.00 ms |            6,667 rectangles | Reconvergent path unfolding; hard stop at 50,000 placements                       |
| Birthplace aggregate |  10,000 |            3.55 ms |        5 clusters + 7 links | It is an aggregate, not a Person-level tree                                       |
| TimeNets             |  10,000 |           34.06 ms |         34 nodes + 32 edges | Deliberate degree-of-interest projection                                          |
| Column tree          |  10,000 |           18.86 ms |   6,672 nodes + 6,666 edges | Extremely wide categorical SVG                                                    |
| Area-adaptive tree   |  10,000 |           26.74 ms |   6,667 nodes + 6,666 edges | SVG navigation and deep internal branching; terminal sibling folds remain compact |

Focused pedigree, fan, H-tree, hourglass, local-radial, and dual-tree variants are also exercised against all three fixture sizes. Their source scans stay fast, but their practical scale is governed by the size and grammar of the resulting Projection—for example binary pedigree slots—not by total GEDCOM size.

## Recommendation threshold

The 1,000-person threshold for putting GeneaQuilt first in a Whole-genealogy recommendation is retained. At that point the baseline engine takes about 14.69 ms, while SVG methods are already moving toward thousands of DOM marks and their labels and crossings become the more important concern. This threshold is a deterministic recommendation input, not a claim that other methods cannot calculate a 1,000-person Layout.

## Test boundaries

- Pure scene construction is measured in Node so runs are deterministic and inexpensive to reproduce.
- Browser paint, pan, zoom, search, selection, mobile A/B switching, and exports are covered by separate local browser audits.
- The fixtures intentionally have no Pedigree Collapse or reconvergence, avoiding exponential path unfolding in a generic scale run. Dedicated correctness fixtures cover those structures.
- The benchmark does not change a method's mathematical omissions. A fast descendants-only method remains descendants-only.
