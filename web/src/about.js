import { applyDocumentTheme, getInitialTheme } from "./theme.js";

const themeToggle = document.querySelector(".theme-toggle-button");
const progressBar = document.querySelector(".reading-progress");
const backToTop = document.querySelector(".back-to-top");
const mobileToc = document.querySelector(".mobile-toc");
const mobileTocCurrent = document.querySelector(".mobile-toc-current");
const sections = [...document.querySelectorAll(".about-anchor")];
const tocLinks = [...document.querySelectorAll("[data-section]")];
const mobileTocLinks = [...document.querySelectorAll(".mobile-toc nav a")];
const themeColor = document.querySelector('meta[name="theme-color"]');

if (
  !themeToggle ||
  !progressBar ||
  !backToTop ||
  !mobileToc ||
  !mobileTocCurrent ||
  !themeColor ||
  sections.length === 0
) {
  throw new Error("The About page is missing a required navigation element");
}

let theme = getInitialTheme();
let updateQueued = false;

function iconSvg(name) {
  const paths = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  };

  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function applyTheme(nextTheme) {
  theme = applyDocumentTheme(nextTheme);
  const isDark = theme === "dark";
  themeToggle.innerHTML = iconSvg(isDark ? "sun" : "moon");
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeColor.setAttribute("content", isDark ? "#171a17" : "#f3eee5");
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
  applyTheme(theme === "dark" ? "light" : "dark");
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
