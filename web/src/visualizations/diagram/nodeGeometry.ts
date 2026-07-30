import type { DiagramNode } from "./types.ts";

export interface NodeOverlap {
  firstId: string;
  secondId: string;
  overlapX: number;
  overlapY: number;
}

export function findPersonNodeOverlaps(
  nodes: readonly DiagramNode[],
  minimumGap = 0,
): NodeOverlap[] {
  const people = nodes
    .filter((node) => node.shape === "person" && !node.guide)
    .sort((left, right) => left.x - right.x || left.y - right.y || left.id.localeCompare(right.id));
  const overlaps: NodeOverlap[] = [];
  const active: DiagramNode[] = [];

  for (const node of people) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const candidate = active[index];
      if (candidate && candidate.x + candidate.width + minimumGap <= node.x) {
        active.splice(index, 1);
      }
    }
    for (const candidate of active) {
      const overlapX =
        Math.min(candidate.x + candidate.width, node.x + node.width) -
        Math.max(candidate.x, node.x) +
        minimumGap;
      const overlapY =
        Math.min(candidate.y + candidate.height, node.y + node.height) -
        Math.max(candidate.y, node.y) +
        minimumGap;
      if (overlapX > 0 && overlapY > 0) {
        overlaps.push({
          firstId: candidate.id,
          secondId: node.id,
          overlapX,
          overlapY,
        });
      }
    }
    active.push(node);
  }
  return overlaps;
}

/**
 * Preserves every node's vertical force position and stable left-to-right order,
 * while shifting rectangles horizontally until no two footprints overlap.
 */
export function separateNodesHorizontally(nodes: readonly DiagramNode[], minimumGap = 12): void {
  if (nodes.length < 2) return;
  const movable = nodes.filter((node) => node.shape === "person" && !node.guide);
  if (movable.length < 2) return;

  const originalCenter = boundsCenterX(movable);
  const binSize = Math.max(...movable.map((node) => node.height)) + minimumGap;
  const rightEdgeByVerticalBin = new Map<number, number>();
  const ordered = [...movable].sort(
    (left, right) => left.x - right.x || left.y - right.y || left.id.localeCompare(right.id),
  );

  for (const node of ordered) {
    const bins = occupiedVerticalBins(node, binSize, minimumGap);
    let requiredLeft = Number.NEGATIVE_INFINITY;
    for (const bin of bins) {
      const rightEdge = rightEdgeByVerticalBin.get(bin);
      if (rightEdge != null) {
        requiredLeft = Math.max(requiredLeft, rightEdge + minimumGap);
      }
    }
    if (Number.isFinite(requiredLeft) && node.x < requiredLeft) {
      node.x = requiredLeft;
    }
    const rightEdge = node.x + node.width;
    for (const bin of bins) {
      rightEdgeByVerticalBin.set(
        bin,
        Math.max(rightEdgeByVerticalBin.get(bin) ?? -Infinity, rightEdge),
      );
    }
  }

  const shift = originalCenter - boundsCenterX(movable);
  for (const node of movable) node.x += shift;
}

function occupiedVerticalBins(node: DiagramNode, binSize: number, gap: number): number[] {
  const top = node.y - gap / 2;
  const bottom = node.y + node.height + gap / 2;
  const first = Math.floor(top / binSize);
  const last = Math.floor((bottom - Number.EPSILON) / binSize);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function boundsCenterX(nodes: readonly DiagramNode[]): number {
  const minimum = Math.min(...nodes.map((node) => node.x));
  const maximum = Math.max(...nodes.map((node) => node.x + node.width));
  return (minimum + maximum) / 2;
}
