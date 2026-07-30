export interface VisualizationViewState {
  version: 1;
  methodId: string;
  camera: Readonly<Record<string, number>>;
}

export function createVisualizationViewState<Camera extends object>(
  methodId: string,
  camera: Camera,
): VisualizationViewState {
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(camera)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Visualization camera value ${key} must be a finite number.`);
    }
    values[key] = value;
  }
  return {
    version: 1,
    methodId,
    camera: values,
  };
}

export function parseVisualizationViewState(value: unknown): VisualizationViewState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.methodId !== "string" || !record.methodId.trim()) {
    return null;
  }
  if (typeof record.camera !== "object" || record.camera === null || Array.isArray(record.camera)) {
    return null;
  }
  const camera: Record<string, number> = {};
  for (const [key, entry] of Object.entries(record.camera)) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      return null;
    }
    camera[key] = entry;
  }
  return {
    version: 1,
    methodId: record.methodId,
    camera,
  };
}
