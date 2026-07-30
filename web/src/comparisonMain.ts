import { ComparisonApp } from "./comparison/comparisonApp.ts";

const root = document.querySelector<HTMLElement>("#comparison-app");
if (!root) {
  throw new Error("The comparison page is missing its application root.");
}

void ComparisonApp.start(root).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `
    <main class="comparison-fatal">
      <h1>The comparison could not open</h1>
      <p>${escapeHtml(message)}</p>
      <a class="button button-primary" href="/visualizations.html">Try again</a>
    </main>
  `;
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
