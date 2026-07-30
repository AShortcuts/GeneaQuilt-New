export type IconName =
  | "back"
  | "check"
  | "chevron"
  | "close"
  | "edit"
  | "export"
  | "file"
  | "fit"
  | "focus"
  | "folder"
  | "info"
  | "lock"
  | "menu"
  | "method"
  | "minus"
  | "moon"
  | "plus"
  | "search"
  | "sun"
  | "trash"
  | "redo"
  | "undo"
  | "upload"
  | "warning";

const PATHS: Record<IconName, string> = {
  back: '<path d="m15 18-6-6 6-6"/><path d="M9 12h10"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  export: '<path d="M12 3v12m0-12-4 4m4-4 4 4"/><path d="M5 13v6h14v-6"/>',
  file: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/>',
  fit: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  focus: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  method: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  minus: '<path d="M5 12h14"/>',
  moon: '<path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
  redo: '<path d="m17 7 4 4-4 4"/><path d="M3 18v-2a5 5 0 0 1 5-5h13"/>',
  undo: '<path d="m7 7-4 4 4 4"/><path d="M21 18v-2a5 5 0 0 0-5-5H3"/>',
  upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 15v5h16v-5"/>',
  warning: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v4M12 17h.01"/>',
};

export function icon(name: IconName): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
}

export function brandMark(): string {
  return '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
}
