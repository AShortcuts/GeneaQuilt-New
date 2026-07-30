export const THEME_STORAGE_KEY = "geneaquilt-theme";

/** @typedef {"light" | "dark"} Theme */

/**
 * @param {unknown} value
 * @returns {value is Theme}
 */
function isTheme(value) {
  return value === "light" || value === "dark";
}

/** @returns {Theme} */
export function getInitialTheme() {
  const documentTheme = document.documentElement.dataset.theme;
  if (isTheme(documentTheme)) {
    return documentTheme;
  }

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (isTheme(stored)) {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * @param {Theme} theme
 * @param {{ persist?: boolean }} [options]
 * @returns {Theme}
 */
export function applyDocumentTheme(theme, { persist = false } = {}) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;
  document.documentElement.style.colorScheme = normalizedTheme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", normalizedTheme === "dark" ? "#171a17" : "#f3eee5");

  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
  }

  return normalizedTheme;
}
