import type { CanonicalDocument } from "../../../domain/schema.ts";
import type { VisualizationContext } from "../../adapter.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import type { DiagramEdge, DiagramNode, DiagramScene } from "../../diagram/types.ts";
import { boundsFromNodes } from "../genealogyLayout.ts";

export interface BirthplaceClusterOptions {
  minimumClusterSize: number;
  minimumCoParentLinksExclusive: number;
}

export interface BirthplaceCluster {
  place: string;
  personIds: string[];
}

export interface BirthplaceClusterLink {
  leftPlace: string;
  rightPlace: string;
  coParentLinks: number;
}

export interface BirthplaceClusterModel {
  clusters: BirthplaceCluster[];
  links: BirthplaceClusterLink[];
  peopleWithBirthplaces: number;
  includedPersonIds: ReadonlySet<string>;
}

export const DEFAULT_BIRTHPLACE_CLUSTER_OPTIONS: BirthplaceClusterOptions = {
  minimumClusterSize: 15,
  minimumCoParentLinksExclusive: 3,
};

export const birthplaceClusterAdapter = createDiagramAdapter("birthplace-cluster", (context) =>
  buildBirthplaceClusterScene(context),
);

export function buildBirthplaceClusterScene(
  context: VisualizationContext,
  options: BirthplaceClusterOptions = DEFAULT_BIRTHPLACE_CLUSTER_OPTIONS,
): DiagramScene {
  const model = buildBirthplaceClusterModel(context.document, options);
  if (!model.clusters.length) {
    const nodes: DiagramNode[] = [
      {
        id: "birthplace-cluster:no-data",
        recordId: null,
        relatedRecordIds: [],
        label:
          model.peopleWithBirthplaces === 0
            ? "No BIRT.PLAC values in this GEDCOM"
            : `No birthplace has ${options.minimumClusterSize} people`,
        shape: "family",
        x: 205,
        y: 174,
        width: 290,
        height: 52,
      },
    ];
    return clusterScene(context.document, model, nodes, [], options, {
      minX: 0,
      minY: 0,
      width: 700,
      height: 400,
    });
  }

  const positions = forceClusterPositions(model.clusters, model.links);
  const nodes = model.clusters.map<DiagramNode>((cluster) => {
    const center = positions.get(cluster.place) ?? { x: 0, y: 0 };
    const diameter = 46 + Math.sqrt(cluster.personIds.length) * 18;
    return {
      id: `birthplace-cluster:${cluster.place}`,
      recordId: null,
      relatedRecordIds: cluster.personIds,
      label: `${cluster.place} · ${cluster.personIds.length}`,
      compactLabel: `${cluster.place} · ${cluster.personIds.length}`,
      shape: "circle",
      x: center.x - diameter / 2,
      y: center.y - diameter / 2,
      width: diameter,
      height: diameter,
    };
  });
  const nodesByPlace = new Map(
    model.clusters.map((cluster, index) => [cluster.place, nodes[index]]),
  );
  const edges = model.links.flatMap<DiagramEdge>((link) => {
    const left = nodesByPlace.get(link.leftPlace);
    const right = nodesByPlace.get(link.rightPlace);
    if (!left || !right) return [];
    return [
      {
        id: `birthplace-link:${link.leftPlace}:${link.rightPlace}`,
        points: [nodeCenter(left), nodeCenter(right)],
        kind: "supplemental",
        directed: false,
      },
    ];
  });
  return clusterScene(context.document, model, nodes, edges, options);
}

export function buildBirthplaceClusterModel(
  document: CanonicalDocument,
  options: BirthplaceClusterOptions = DEFAULT_BIRTHPLACE_CLUSTER_OPTIONS,
): BirthplaceClusterModel {
  if (!Number.isInteger(options.minimumClusterSize) || options.minimumClusterSize < 1) {
    throw new Error("Birthplace cluster size must be a positive integer.");
  }
  if (
    !Number.isInteger(options.minimumCoParentLinksExclusive) ||
    options.minimumCoParentLinksExclusive < 0
  ) {
    throw new Error("Birthplace co-parent threshold must be a non-negative integer.");
  }
  const peopleById = new Map(document.people.map((person) => [person.id, person]));
  const clusterPeople = new Map<string, string[]>();
  for (const person of document.people) {
    const place = normalizedPlace(person.birth_place);
    if (!place) continue;
    const ids = clusterPeople.get(place) ?? [];
    ids.push(person.id);
    clusterPeople.set(place, ids);
  }
  const retainedPlaces = new Set(
    [...clusterPeople.entries()]
      .filter(([, personIds]) => personIds.length >= options.minimumClusterSize)
      .map(([place]) => place),
  );
  const linkCounts = new Map<string, number>();
  for (const family of document.families) {
    if (!family.child_ids.some((childId) => peopleById.has(childId))) continue;
    const parentPlaces = new Set(
      [family.husband_id, family.wife_id]
        .filter((id): id is string => Boolean(id))
        .map((id) => normalizedPlace(peopleById.get(id)?.birth_place ?? null))
        .filter((place): place is string => Boolean(place && retainedPlaces.has(place))),
    );
    const places = [...parentPlaces].sort((left, right) => left.localeCompare(right));
    for (let leftIndex = 0; leftIndex < places.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < places.length; rightIndex += 1) {
        const left = places[leftIndex];
        const right = places[rightIndex];
        if (!left || !right || left === right) continue;
        const key = pairKey(left, right);
        linkCounts.set(key, (linkCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const clusters = [...clusterPeople.entries()]
    .filter(([place]) => retainedPlaces.has(place))
    .map(([place, personIds]) => ({ place, personIds }))
    .sort(
      (left, right) =>
        right.personIds.length - left.personIds.length || left.place.localeCompare(right.place),
    );
  const links = [...linkCounts.entries()]
    .filter(([, count]) => count > options.minimumCoParentLinksExclusive)
    .map(([key, coParentLinks]) => {
      const [leftPlace, rightPlace] = key.split("\u0000");
      if (!leftPlace || !rightPlace) throw new Error("Invalid birthplace cluster pair.");
      return { leftPlace, rightPlace, coParentLinks };
    })
    .sort(
      (left, right) =>
        right.coParentLinks - left.coParentLinks ||
        left.leftPlace.localeCompare(right.leftPlace) ||
        left.rightPlace.localeCompare(right.rightPlace),
    );
  return {
    clusters,
    links,
    peopleWithBirthplaces: [...clusterPeople.values()].reduce(
      (sum, personIds) => sum + personIds.length,
      0,
    ),
    includedPersonIds: new Set(clusters.flatMap((cluster) => cluster.personIds)),
  };
}

function clusterScene(
  document: CanonicalDocument,
  model: BirthplaceClusterModel,
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  options: BirthplaceClusterOptions,
  boundsOverride?: Readonly<{ minX: number; minY: number; width: number; height: number }>,
): DiagramScene {
  return {
    methodId: "birthplace-cluster",
    title: "Birthplace cluster graph",
    description:
      "People are aggregated by recorded BIRT.PLAC value; links count children whose two recorded parents come from different retained birthplace clusters.",
    nodes,
    edges,
    bounds: boundsOverride ?? boundsFromNodes(nodes),
    projection: {
      visiblePeople: model.includedPersonIds.size,
      totalPeople: document.people.length,
      visibleFamilies: 0,
      totalFamilies: document.families.length,
      label: `${model.clusters.length} retained birthplace clusters · ${model.links.length} co-parent links`,
      rule: `Algorithm 4.1 with Tsize=${options.minimumClusterSize} and the strict condition L > ${options.minimumCoParentLinksExclusive}.`,
    },
    notes: [
      "Circle area grows with cluster population through a square-root diameter scale.",
      "A link is an aggregate co-parent-place count, not a direct route, migration path, marriage, or individual parent-child line.",
      model.peopleWithBirthplaces === 0
        ? "This genealogy records no BIRT.PLAC values, so the method correctly has no geographic clusters to draw."
        : `${model.peopleWithBirthplaces.toLocaleString()} people have a recorded birthplace before threshold pruning.`,
    ],
  };
}

function forceClusterPositions(
  clusters: readonly BirthplaceCluster[],
  links: readonly BirthplaceClusterLink[],
): ReadonlyMap<string, { x: number; y: number }> {
  const count = clusters.length;
  const radius = Math.max(180, count * 42);
  const positions = new Map(
    clusters.map((cluster, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(1, count)) * Math.PI * 2;
      return [cluster.place, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }];
    }),
  );
  const linkedPairs = links.map((link) => ({
    left: link.leftPlace,
    right: link.rightPlace,
    strength: Math.min(3, 0.8 + Math.log2(link.coParentLinks + 1) * 0.45),
  }));
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const force = new Map(clusters.map((cluster) => [cluster.place, { x: 0, y: 0 }]));
    for (let leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
      const left = clusters[leftIndex];
      const leftPosition = left ? positions.get(left.place) : null;
      if (!left || !leftPosition) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex += 1) {
        const right = clusters[rightIndex];
        const rightPosition = right ? positions.get(right.place) : null;
        if (!right || !rightPosition) continue;
        const dx = rightPosition.x - leftPosition.x || 0.001;
        const dy = rightPosition.y - leftPosition.y || 0.001;
        const distanceSquared = Math.max(100, dx * dx + dy * dy);
        const magnitude = 22_000 / distanceSquared;
        addForce(
          force,
          left.place,
          (-dx / Math.sqrt(distanceSquared)) * magnitude,
          (-dy / Math.sqrt(distanceSquared)) * magnitude,
        );
        addForce(
          force,
          right.place,
          (dx / Math.sqrt(distanceSquared)) * magnitude,
          (dy / Math.sqrt(distanceSquared)) * magnitude,
        );
      }
    }
    for (const link of linkedPairs) {
      const left = positions.get(link.left);
      const right = positions.get(link.right);
      if (!left || !right) continue;
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const magnitude = ((distance - 190) / 190) * link.strength;
      addForce(force, link.left, (dx / distance) * magnitude, (dy / distance) * magnitude);
      addForce(force, link.right, (-dx / distance) * magnitude, (-dy / distance) * magnitude);
    }
    const temperature = 12 * (1 - iteration / 80);
    for (const cluster of clusters) {
      const position = positions.get(cluster.place);
      const delta = force.get(cluster.place);
      if (!position || !delta) continue;
      const magnitude = Math.max(1, Math.hypot(delta.x, delta.y));
      position.x += (delta.x / magnitude) * Math.min(temperature, magnitude) - position.x * 0.002;
      position.y += (delta.y / magnitude) * Math.min(temperature, magnitude) - position.y * 0.002;
    }
  }
  return positions;
}

function addForce(
  forces: Map<string, { x: number; y: number }>,
  id: string,
  x: number,
  y: number,
): void {
  const force = forces.get(id);
  if (!force) return;
  force.x += x;
  force.y += y;
}

function normalizedPlace(value: string | null): string | null {
  const place = value?.replace(/\s+/g, " ").trim();
  return place || null;
}

function pairKey(left: string, right: string): string {
  return left.localeCompare(right) <= 0 ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function nodeCenter(node: DiagramNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}
