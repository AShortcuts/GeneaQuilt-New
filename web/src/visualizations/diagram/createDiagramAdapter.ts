import type { VisualizationAdapter, VisualizationContext } from "../adapter.ts";
import { SvgDiagramView } from "./SvgDiagramView.ts";
import type { DiagramScene } from "./types.ts";

export type DiagramSceneBuilder = (
  context: VisualizationContext,
  viewport: { width: number; height: number },
) => DiagramScene;

export function createDiagramAdapter(
  methodId: string,
  buildScene: DiagramSceneBuilder,
): VisualizationAdapter {
  return {
    methodId,
    async mount(host, context) {
      const scene = buildScene(context, {
        width: Math.max(320, host.clientWidth),
        height: Math.max(320, host.clientHeight),
      });
      return new SvgDiagramView(
        host,
        context.document,
        scene,
        context.theme,
        context.onSelectionChange,
        context.fitInsets,
      );
    },
  };
}
