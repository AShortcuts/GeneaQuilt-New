import type { VisualizationInstance } from "../visualizations/adapter.ts";

export interface FitToggleButtonLabels {
  fitLabel: string;
  restoreLabel: string;
  fitText?: string;
  restoreText?: string;
}

export function bindFitToggleButton(
  button: HTMLButtonElement,
  view: VisualizationInstance,
  labels: FitToggleButtonLabels,
): void {
  const text = button.querySelector<HTMLElement>("span");
  const renderState = (isFitted: boolean): void => {
    const label = isFitted ? labels.restoreLabel : labels.fitLabel;
    button.ariaLabel = label;
    button.title = label;
    button.ariaPressed = String(isFitted);
    if (text) {
      text.textContent = isFitted ? (labels.restoreText ?? label) : (labels.fitText ?? label);
    }
  };

  renderState(false);
  button.onclick = () => renderState(view.toggleFit(true));
}
