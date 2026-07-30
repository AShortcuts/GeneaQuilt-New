import assert from "node:assert/strict";
import test from "node:test";

import { siteHeader, type SitePage } from "./siteHeader.ts";

test("the shared header marks exactly one current page", () => {
  for (const activePage of ["explore", "compare", "about"] satisfies SitePage[]) {
    const markup = siteHeader({ activePage, theme: "light" });

    assert.equal((markup.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(markup, new RegExp(`href="${hrefFor(activePage)}" aria-current="page"`));
  }
});

test("the shared header describes the theme action and state", () => {
  const markup = siteHeader({ activePage: "explore", theme: "dark" });

  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /aria-label="Use light appearance"/);
});

function hrefFor(page: SitePage): string {
  switch (page) {
    case "explore":
      return "/";
    case "compare":
      return "/visualizations.html";
    case "about":
      return "/about.html";
  }
}
