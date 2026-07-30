import { buildAdamHomeProjection, type GenealogyProjection } from "../domain/projection.ts";
import type { CanonicalDocument } from "../domain/schema.ts";
import { parseCanonicalDocument } from "../domain/schemaValidation.ts";
import type { AdamDocumentManifest } from "./models.ts";

export interface LoadedAdamDocument {
  manifest: AdamDocumentManifest;
  document: CanonicalDocument;
  homeProjection: GenealogyProjection;
}

let loadPromise: Promise<LoadedAdamDocument> | null = null;

export function loadAdamDocument(): Promise<LoadedAdamDocument> {
  loadPromise ??= loadAdamDocumentFiles();
  return loadPromise;
}

async function loadAdamDocumentFiles(): Promise<LoadedAdamDocument> {
  const manifestResponse = await fetch("/data/adam-harishon.manifest.json");
  if (!manifestResponse.ok) {
    throw new Error(`Unable to load Adam HaRishon's Tree manifest (${manifestResponse.status}).`);
  }
  const manifest = parseAdamManifest(await manifestResponse.json());
  const documentResponse = await fetch(manifest.publicArtifact.path);
  if (!documentResponse.ok) {
    throw new Error(`Unable to load Adam HaRishon's Tree (${documentResponse.status}).`);
  }
  const document = parseCanonicalDocument(await documentResponse.json());
  const homeProjection = buildAdamHomeProjection(
    document,
    manifest.anchors.adamPersonId,
    manifest.anchors.yaakovPersonId,
  );
  if (
    homeProjection.people.length !== manifest.homeProjection.people ||
    homeProjection.families.length !== manifest.homeProjection.families
  ) {
    throw new Error(
      "Adam HaRishon's Tree projection no longer matches its reviewed manifest counts.",
    );
  }
  return { manifest, document, homeProjection };
}

export function parseAdamManifest(value: unknown): AdamDocumentManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Adam HaRishon's Tree manifest must be an object.");
  }
  const manifest = value as Partial<AdamDocumentManifest>;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.documentId !== "adam-harishon" ||
    typeof manifest.title !== "string" ||
    typeof manifest.version !== "string" ||
    !manifest.source ||
    manifest.source.includedInWebsite !== false ||
    !manifest.creator ||
    !manifest.anchors ||
    typeof manifest.anchors.adamPersonId !== "string" ||
    typeof manifest.anchors.avrahamPersonId !== "string" ||
    typeof manifest.anchors.yaakovPersonId !== "string" ||
    !manifest.homeProjection ||
    !manifest.publicArtifact ||
    manifest.publicArtifact.containsSourceGedcom !== false ||
    manifest.publicArtifact.containsNotes !== false ||
    manifest.publicArtifact.containsMedia !== false ||
    !manifest.exportPolicy ||
    manifest.exportPolicy.sourceGedcom !== false ||
    manifest.exportPolicy.standaloneInteractiveHtml !== false
  ) {
    throw new Error("Adam HaRishon's Tree manifest does not satisfy its privacy contract.");
  }
  return manifest as AdamDocumentManifest;
}
