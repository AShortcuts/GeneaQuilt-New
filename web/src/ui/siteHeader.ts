import { brandMark, icon } from "./icons.ts";

export type SitePage = "explore" | "compare" | "about";
type SiteTheme = "light" | "dark";

interface SiteHeaderOptions {
  activePage: SitePage;
  theme: SiteTheme;
}

const NAV_ITEMS: ReadonlyArray<{ page: SitePage; href: string; label: string }> = [
  { page: "explore", href: "/", label: "Explore" },
  { page: "compare", href: "/visualizations.html", label: "Compare methods" },
  { page: "about", href: "/about.html", label: "About" },
];

export function siteHeader({ activePage, theme }: SiteHeaderOptions): string {
  const isDark = theme === "dark";
  const navigation = NAV_ITEMS.map(
    ({ page, href, label }) =>
      `<a href="${href}"${page === activePage ? ' aria-current="page"' : ""}>${label}</a>`,
  ).join("");

  return `
    <header class="site-header">
      <a class="site-brand" href="/" aria-label="GeneaQuilt home">${brandMark()}<span>GeneaQuilt</span></a>
      <nav aria-label="Main navigation">${navigation}</nav>
      <button class="site-theme-button" type="button" aria-pressed="${isDark}" aria-label="${isDark ? "Use light appearance" : "Use dark appearance"}">${icon(isDark ? "sun" : "moon")}</button>
    </header>
  `;
}
