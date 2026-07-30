import test from "node:test";
import assert from "node:assert/strict";

import { applyDocumentTheme, getInitialTheme, THEME_STORAGE_KEY } from "./theme.js";

function installBrowserState({ documentTheme, storedTheme, prefersDark = false } = {}) {
  const storage = new Map();
  if (storedTheme) {
    storage.set(THEME_STORAGE_KEY, storedTheme);
  }

  const themeColor = {
    content: "",
    setAttribute(name, value) {
      if (name === "content") {
        this.content = value;
      }
    },
  };

  globalThis.localStorage = {
    getItem(key) {
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      storage.set(key, value);
    },
  };
  globalThis.window = {
    matchMedia() {
      return { matches: prefersDark };
    },
  };
  globalThis.document = {
    documentElement: {
      dataset: documentTheme ? { theme: documentTheme } : {},
      style: {},
    },
    querySelector(selector) {
      return selector === 'meta[name="theme-color"]' ? themeColor : null;
    },
  };

  return { storage, themeColor };
}

test.afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.window;
  delete globalThis.document;
});

test("the HTML-selected theme owns the initial appearance", () => {
  installBrowserState({ documentTheme: "dark", storedTheme: "light" });
  assert.equal(getInitialTheme(), "dark");
});

test("a deliberate stored choice overrides the media preference", () => {
  installBrowserState({ storedTheme: "light", prefersDark: true });
  assert.equal(getInitialTheme(), "light");
});

test("the media preference supplies the initial theme when there is no choice", () => {
  installBrowserState({ prefersDark: true });
  assert.equal(getInitialTheme(), "dark");
});

test("applying the initial theme does not turn it into a stored preference", () => {
  const { storage, themeColor } = installBrowserState();

  assert.equal(applyDocumentTheme("dark"), "dark");
  assert.equal(storage.has(THEME_STORAGE_KEY), false);
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(document.documentElement.style.colorScheme, "dark");
  assert.equal(themeColor.content, "#171a17");

  applyDocumentTheme("light", { persist: true });
  assert.equal(storage.get(THEME_STORAGE_KEY), "light");
  assert.equal(themeColor.content, "#f3eee5");
});
