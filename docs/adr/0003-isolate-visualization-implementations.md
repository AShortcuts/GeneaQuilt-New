# Keep Visualization Method Implementations isolated

Every Visualization Method owns its projection, ranking, ordering, placement, edge routing, and drawing decisions behind its own Adapter. Methods share the canonical Genealogy Document, theme tokens, selection concepts, and Interactive Mode host, but they do not share geometry; this permits SVG, Canvas, WebGL, TypeScript, or Rust where appropriate and prevents one method's assumptions or state from interfering with another.
