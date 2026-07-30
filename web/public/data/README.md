# Built-in genealogy data

`adam-harishon.document.json` is a derived, method-neutral visualization document. It contains Person and Family identifiers, display names, role-specific Family links, child links, limited date ranges, source statistics, and Tree Analysis. It deliberately excludes the Source GEDCOM text, notes, sources, custom properties, and media filenames or contents.

The creator-controlled Source GEDCOM must never be copied into `web`, committed to the repository, or placed in a Vite public directory. A `.private/` workspace directory is ignored as an additional guard if a local copy is ever needed.

This is a static, serverless browser app, so the derived visualization document is necessarily delivered to—and can be inspected on—the visiting device. It is not the Source GEDCOM, but a client-only site cannot make data it draws technically unretrievable. The product policy therefore prevents UI-generated Source GEDCOM and standalone-data exports; it is not presented as copy protection.

Regenerate the public document locally with:

```sh
cargo run -p geneaquilt-core --example analyze_gedcom -- /absolute/path/to/source.ged --write-public web/public/data/adam-harishon.document.json
```

The source hash and public export rules are recorded in `adam-harishon.manifest.json`. Update its version and hash whenever the creator supplies a new source version.
