use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use geneaquilt_core::{build_canonical_document, parse_gedcom, profile_gedcom};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let source_path = args.next().map(PathBuf::from).ok_or_else(usage)?;
    let mut public_output = None::<PathBuf>;

    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--write-public" => {
                public_output = Some(
                    args.next()
                        .map(PathBuf::from)
                        .ok_or_else(|| "--write-public requires an output path".to_string())?,
                );
            }
            _ => return Err(format!("unknown argument: {argument}\n{}", usage())),
        }
    }

    let source = fs::read_to_string(&source_path)
        .map_err(|error| format!("unable to read {}: {error}", source_path.display()))?;
    let mut source_profile =
        profile_gedcom(&source).map_err(|error| format!("GEDCOM profile failed: {error}"))?;
    let graph = parse_gedcom(&source).map_err(|error| format!("GEDCOM parse failed: {error}"))?;

    let media_file_count = source_profile.media_files.len();
    if public_output.is_some() {
        // Public browser data retains only record counts. Source media filenames and note contents
        // are not visualization inputs and must not leak into the derived artifact.
        source_profile.media_files.clear();
    }
    let document = build_canonical_document(&graph, source_profile);

    println!("Source: {}", source_path.display());
    println!(
        "Records: {} people, {} families, {} relationship links",
        document.analysis.people, document.analysis.families, document.analysis.relationship_links
    );
    println!(
        "Shape: {} groups, {} generations, widest {}, largest sibling group {}",
        document.analysis.disconnected_family_groups,
        optional_count(document.analysis.generation_depth),
        optional_count(document.analysis.widest_generation),
        document.analysis.largest_sibling_group
    );
    println!(
        "Relationships: {} people with multiple spouses, {} people in multiple spouse families, {} half-sibling structures",
        document.analysis.people_with_multiple_spouses,
        document.analysis.people_in_multiple_spouse_families,
        document.analysis.half_sibling_structures
    );
    println!(
        "Complexity: {} people affected by pedigree collapse, {} reconvergence points",
        document.analysis.pedigree_collapse_people, document.analysis.reconvergence_points
    );
    println!(
        "Dates: {:.1}% coverage ({} people, {} families)",
        document.analysis.date_coverage_percent,
        document.analysis.people_with_dates,
        document.analysis.families_with_dates
    );
    println!(
        "Source extras: {} notes, {} sources, {} media objects, {} linked media files",
        document.source_profile.note_records,
        document.source_profile.source_records,
        document.source_profile.object_records,
        media_file_count
    );
    println!(
        "Interactive Mode: {}",
        if document.analysis.blocks_interactive {
            "blocked by validation"
        } else {
            "allowed"
        }
    );
    for finding in &document.analysis.findings {
        println!(
            "- {:?} {} ({} records): {}",
            finding.severity,
            finding.code,
            finding.record_ids.len(),
            finding.message
        );
    }

    if let Some(output_path) = public_output {
        ensure_parent_directory(&output_path)?;
        let json = serde_json::to_string_pretty(&document)
            .map_err(|error| format!("unable to serialize public document: {error}"))?;
        fs::write(&output_path, format!("{json}\n"))
            .map_err(|error| format!("unable to write {}: {error}", output_path.display()))?;
        println!("Public canonical document: {}", output_path.display());
    }

    Ok(())
}

fn optional_count(value: Option<usize>) -> String {
    value.map_or_else(|| "unavailable".to_string(), |count| count.to_string())
}

fn ensure_parent_directory(path: &Path) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    fs::create_dir_all(parent)
        .map_err(|error| format!("unable to create {}: {error}", parent.display()))
}

fn usage() -> String {
    "usage: cargo run -p geneaquilt-core --example analyze_gedcom -- <source.ged> [--write-public <document.json>]".to_string()
}
