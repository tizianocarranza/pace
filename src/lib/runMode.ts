/** What a run is played with: the prompts' language and length. Runs compare (best,
 * average, history) only with runs of the same mode. The choice is remembered in this
 * browser; storage failures fall back to the default. */
export type Language = "en" | "es";
export type Length = "short" | "medium" | "long";
export type RunMode = { language: Language; length: Length };

export const LANGUAGES: readonly Language[] = ["en", "es"];
export const LENGTHS: readonly Length[] = ["short", "medium", "long"];
export const DEFAULT_MODE: RunMode = { language: "en", length: "short" };

/** Stored with each run; runs saved before modes existed were all English and short. */
export const modeKey = ({ language, length }: RunMode) => `${language}:${length}`;

const STORAGE_KEY = "pace-mode";

function stored(): RunMode | null {
  try {
    const [language, length] = (localStorage.getItem(STORAGE_KEY) ?? "").split(":");
    return LANGUAGES.includes(language as Language) && LENGTHS.includes(length as Length)
      ? { language: language as Language, length: length as Length } : null;
  } catch {
    return null;
  }
}

let current: RunMode | null = null;
const listeners = new Set<() => void>();

export const runMode = {
  get(): RunMode {
    current ??= stored() ?? DEFAULT_MODE;
    return current;
  },
  /** The player's choice: applied and remembered. */
  choose(next: RunMode) {
    try { localStorage.setItem(STORAGE_KEY, modeKey(next)); } catch { /* storage unavailable */ }
    current = next;
    listeners.forEach(listener => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
