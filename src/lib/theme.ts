/** Day (the original white world) or night (midnight blue). The choice lives on
 * `<html data-theme>`: an inline script in the root layout sets it before the first paint
 * from the saved choice, else the system preference; CelestialToggle keeps it in sync. */
export type Theme = "day" | "night";

const STORAGE_KEY = "pace-theme";

/** Runs in `<head>` while the HTML parses, so the page never flashes the wrong theme. */
export const THEME_SCRIPT = `(function(){var t="day";try{t=localStorage.getItem("${STORAGE_KEY}");if(t!=="day"&&t!=="night")t=matchMedia("(prefers-color-scheme: dark)").matches?"night":"day"}catch(e){t="day"}document.documentElement.dataset.theme=t})()`;

let current: Theme | null = null;
const listeners = new Set<() => void>();

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "day" || value === "night" ? value : null;
  } catch {
    return null;
  }
}

function system(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

function apply(next: Theme) {
  current = next;
  document.documentElement.dataset.theme = next;
  listeners.forEach(listener => listener());
}

export const theme = {
  get(): Theme {
    if (current) return current;
    if (typeof document === "undefined") return "day";
    return document.documentElement.dataset.theme === "night" ? "night" : "day";
  },
  /** The player's choice: applied and remembered. */
  choose(next: Theme) {
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
    apply(next);
  },
  /** Re-resolves the theme (saved choice, else system) and applies it. */
  resolve() {
    apply(stored() ?? system());
  },
  /** Whether the player has made a choice; until then the system preference leads. */
  hasChoice: () => stored() !== null,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
