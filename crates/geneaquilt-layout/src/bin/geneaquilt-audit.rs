use std::{env, fs, process::ExitCode};

use geneaquilt_core::parse_gedcom;
use geneaquilt_layout::{assign_layers, assign_layers_v2, audit_family_generation_mismatches};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let mut path = None::<String>;
    let mut limit = 10usize;
    let mut ranker = Ranker::Original;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--limit" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--limit requires a numeric value".to_string())?;
                limit = value
                    .parse::<usize>()
                    .map_err(|_| format!("invalid --limit value: {value}"))?;
            }
            "--ranker" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--ranker requires one of: original, v2".to_string())?;
                ranker = value.parse()?;
            }
            _ if path.is_none() => path = Some(arg),
            _ => return Err(format!("unexpected argument: {arg}")),
        }
    }

    let Some(path) = path else {
        return Err("usage: cargo run -p geneaquilt-layout --bin geneaquilt-audit -- <path-to-gedcom> [--limit N] [--ranker original|v2]".to_string());
    };

    let source = fs::read_to_string(&path).map_err(|error| format!("failed to read {path}: {error}"))?;
    let graph = parse_gedcom(&source).map_err(|error| format!("failed to parse GEDCOM: {error}"))?;
    let state = match ranker {
        Ranker::Original => assign_layers(&graph),
        Ranker::V2 => assign_layers_v2(&graph),
    };
    let mismatches = audit_family_generation_mismatches(&graph, &state);
    let cycle_component = mismatches.iter().filter(|mismatch| mismatch.cycle_component).count();
    let anchored = mismatches
        .iter()
        .filter(|mismatch| mismatch.anchored_spouse_count > 0)
        .count();
    let spouse_only = mismatches
        .iter()
        .filter(|mismatch| mismatch.spouse_mismatch && !mismatch.child_mismatch)
        .count();
    let child_involved = mismatches
        .iter()
        .filter(|mismatch| mismatch.child_mismatch)
        .count();

    println!("GEDCOM audit: {path}");
    println!("ranker={ranker}");
    println!(
        "people={} families={} edges={} components={} max_layer={} mismatches={}",
        graph.person_count(),
        graph.family_count(),
        graph.edge_count(),
        graph.weak_components().len(),
        state.max_layer,
        mismatches.len()
    );
    println!(
        "cycle_component_mismatches={} anchored_spouse_mismatches={} spouse_only={} child_involved={}",
        cycle_component, anchored, spouse_only, child_involved
    );

    for mismatch in mismatches.into_iter().take(limit) {
        let spouse_layers = mismatch
            .spouse_layers
            .iter()
            .map(|vertex| format!("{} [{}] {}", vertex.label, vertex.layer, vertex.id))
            .collect::<Vec<_>>()
            .join(", ");
        let child_layers = mismatch
            .child_layers
            .iter()
            .map(|vertex| format!("{} [{}] {}", vertex.label, vertex.layer, vertex.id))
            .collect::<Vec<_>>()
            .join(", ");

        println!(
            "- {} ({}) layer={} max_gap={} cycle_component={} anchored_spouses={}",
            mismatch.family_label,
            mismatch.family_id,
            mismatch.family_layer,
            mismatch.max_gap,
            mismatch.cycle_component,
            mismatch.anchored_spouse_count
        );
        println!(
            "  spouse_mismatch={} child_mismatch={}",
            mismatch.spouse_mismatch, mismatch.child_mismatch
        );
        println!("  spouses: {}", spouse_layers);
        println!("  children: {}", child_layers);
    }

    Ok(())
}

#[derive(Clone, Copy)]
enum Ranker {
    Original,
    V2,
}

impl std::fmt::Display for Ranker {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Original => write!(f, "original"),
            Self::V2 => write!(f, "v2"),
        }
    }
}

impl std::str::FromStr for Ranker {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "original" => Ok(Self::Original),
            "v2" => Ok(Self::V2),
            _ => Err(format!("invalid --ranker value: {value}")),
        }
    }
}
