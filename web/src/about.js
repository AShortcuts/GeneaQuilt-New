import { applyDocumentTheme, getInitialTheme } from "./theme.js";
import { icon } from "./ui/icons.ts";
import { siteHeader } from "./ui/siteHeader.ts";

let theme = getInitialTheme();
const siteHeaderMount = document.querySelector("#about-site-header");
if (!siteHeaderMount) {
  throw new Error("The About page is missing its site header mount point");
}
siteHeaderMount.outerHTML = siteHeader({ activePage: "about", theme });

const themeToggle = document.querySelector(".site-theme-button");
const progressBar = document.querySelector(".reading-progress");
const backToTop = document.querySelector(".back-to-top");
const mobileToc = document.querySelector(".mobile-toc");
const mobileTocCurrent = document.querySelector(".mobile-toc-current");
const sections = [...document.querySelectorAll(".about-anchor")];
const tocLinks = [...document.querySelectorAll("[data-section]")];
const mobileTocLinks = [...document.querySelectorAll(".mobile-toc nav a")];

if (
  !themeToggle ||
  !progressBar ||
  !backToTop ||
  !mobileToc ||
  !mobileTocCurrent ||
  sections.length === 0
) {
  throw new Error("The About page is missing a required navigation element");
}

let updateQueued = false;

function applyTheme(nextTheme, persist = false) {
  theme = applyDocumentTheme(nextTheme, { persist });
  const isDark = theme === "dark";
  themeToggle.innerHTML = icon(isDark ? "sun" : "moon");
  themeToggle.setAttribute("aria-label", isDark ? "Use light appearance" : "Use dark appearance");
  themeToggle.setAttribute("aria-pressed", String(isDark));
}

function activeSectionId() {
  const activationLine = Math.min(230, window.innerHeight * 0.3);
  let activeId = sections[0].id;

  for (const section of sections) {
    if (section.getBoundingClientRect().top <= activationLine) {
      activeId = section.id;
    } else {
      break;
    }
  }

  return activeId;
}

function updateNavigation() {
  const activeId = activeSectionId();
  const activeDesktopLink = tocLinks.find((link) => link.dataset.section === activeId);
  const activeMobileLink = mobileTocLinks.find((link) => link.hash === `#${activeId}`);

  for (const link of [...tocLinks, ...mobileTocLinks]) {
    const isActive = link.hash === `#${activeId}`;
    if (isActive) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  mobileTocCurrent.textContent =
    activeDesktopLink?.textContent ?? activeMobileLink?.textContent ?? "Overview";
}

function updateScrollUi() {
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
  progressBar.style.setProperty("--reading-progress", String(Math.min(1, Math.max(0, progress))));
  backToTop.classList.toggle("is-visible", window.scrollY > 640);
  updateNavigation();
  updateQueued = false;
}

function queueScrollUiUpdate() {
  if (updateQueued) {
    return;
  }
  updateQueued = true;
  window.requestAnimationFrame(updateScrollUi);
}

themeToggle.addEventListener("click", () => {
  applyTheme(theme === "dark" ? "light" : "dark", true);
});

backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

for (const link of mobileTocLinks) {
  link.addEventListener("click", () => {
    mobileToc.open = false;
  });
}

document.addEventListener("click", (event) => {
  if (mobileToc.open && !mobileToc.contains(event.target)) {
    mobileToc.open = false;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileToc.open) {
    mobileToc.open = false;
    mobileToc.querySelector("summary")?.focus();
  }
});

window.addEventListener("scroll", queueScrollUiUpdate, { passive: true });
window.addEventListener("resize", queueScrollUiUpdate);
window.addEventListener("hashchange", queueScrollUiUpdate);

applyTheme(theme);
updateScrollUi();
