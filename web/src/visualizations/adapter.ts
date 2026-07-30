import type { CanonicalDocument } from "../domain/schema.ts";
import type { GenealogyProjection } from "../domain/projection.ts";
import type { VisualizationViewState } from "./viewport/viewState.ts";

export type AppTheme = "light" | "dark";
export type VisualizationExportMode = "current" | "complete";

export interface SelectedRecordDetails {
  id: string;
  label: string;
  kind: "person" | "family";
  parents: string[];
  spouses: string[];
  children: string[];
  date_start: number | null;
  date_end: number | null;
}

export interface VisualizationContext {
  document: CanonicalDocument;
  projection?: GenealogyProjection;
  sourceGedcom?: string;
  theme: AppTheme;
  focalPersonId?: string;
  secondaryFocalPersonId?: string;
  fitInsets?: Readonly<{ top: number; right: number; bottom: number; left: number }>;
  onSelectionChange?(details: SelectedRecordDetails | null): void;
}

export interface VisualizationSearchResult {
  id: string;
  label: string;
  kind: "person" | "family";
}

export interface VisualizationProjectionSummary {
  visiblePeople: number;
  totalPeople: number;
  visibleFamilies: number;
  totalFamilies: number;
  label: string;
  rule: string;
}

export interface VisualizationInstance {
  readonly methodId: string;
  fit(animated?: boolean): void;
  toggleFit(animated?: boolean): boolean;
  zoomBy(multiplier: number): void;
  setTheme(theme: AppTheme): void;
  setExpandedNames(expanded: boolean): void;
  renderMethodTools?(host: HTMLElement): void;
  search(query: string): VisualizationSearchResult[];
  select(id: string, center?: boolean): void;
  clearSelection(): void;
  projectionSummary(): VisualizationProjectionSummary;
  exportPng(mode?: VisualizationExportMode): Promise<Blob>;
  exportInteractiveHtml(title: string): string | null;
  captureViewState(): VisualizationViewState;
  restoreViewState(state: VisualizationViewState): boolean;
  destroy(): void;
}

export interface VisualizationAdapter {
  readonly methodId: string;
  mount(host: HTMLElement, context: VisualizationContext): Promise<VisualizationInstance>;
}
