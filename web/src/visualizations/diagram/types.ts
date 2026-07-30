import type { VisualizationProjectionSummary } from "../adapter.ts";

export type DiagramNodeShape =
  "person" | "family" | "couple" | "circle" | "triangle" | "diamond" | "sector" | "label";

export type DiagramEdgeKind =
  | "descent"
  | "marriage"
  | "family"
  | "axis"
  | "supplemental"
  | "son"
  | "daughter"
  | "lifeline"
  | "uncertain"
  | "drop";

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface DiagramNode {
  id: string;
  recordId: string | null;
  relatedRecordIds: string[];
  label: string;
  compactLabel?: string;
  secondaryLabel?: string;
  shape: DiagramNodeShape;
  x: number;
  y: number;
  width: number;
  height: number;
  sex?: string | null;
  emphasized?: boolean;
  duplicate?: boolean;
  guide?: boolean;
  uncertain?: boolean;
  labelVisible?: boolean;
  pathData?: string;
  labelX?: number;
  labelY?: number;
  labelRotation?: number;
  labelAnchor?: "start" | "middle" | "end";
  labelMaxWidth?: number;
}

export interface DiagramEdge {
  id: string;
  points: DiagramPoint[];
  kind: DiagramEdgeKind;
  directed?: boolean;
  recordId?: string | null;
  curve?: "vertical" | "arc" | "smooth";
  sex?: string | null;
  uncertain?: boolean;
  fade?: "start" | "end" | "both";
}

export type DiagramGuide =
  | {
      id: string;
      kind: "circle";
      center: DiagramPoint;
      radius: number;
      label?: string;
    }
  | {
      id: string;
      kind: "line";
      from: DiagramPoint;
      to: DiagramPoint;
      label?: string;
    };

export interface DiagramBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface DiagramScene {
  methodId: string;
  title: string;
  description: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  guides?: DiagramGuide[];
  bounds: DiagramBounds;
  projection: VisualizationProjectionSummary;
  notes: string[];
}
