/** How a mistake shows in the prompt. Production always uses the approved style; the
 * development-only Pace Debug panel switches it live to compare. Never affects statistics.
 * - `current`: the letter flashes peach, the caret tints and shakes sideways.
 * - `glow`: the letter blooms in a peach halo; the caret tints and pulses vertically.
 * - `blur`: the letter blurs with a peach tint and comes back into focus.
 * - `marks`: like `glow`, plus a faint peach dot stays under every missed letter.
 * - `haze`: a soft peach haze blooms behind the letter, like the intro's core.
 * - `word`: a faint peach glow washes over the whole current word.
 * - `caret`: only the caret tells: it tints and glows; the letter is untouched.
 * - `dip`: the letter dips a hair, tinted, and settles back (vertical only). */
export type ErrorStyle = "current" | "glow" | "blur" | "marks" | "haze" | "word" | "caret" | "dip";

export const ERROR_STYLES: ErrorStyle[] = ["current", "glow", "blur", "marks", "haze", "word", "caret", "dip"];
export const APPROVED_ERROR_STYLE: ErrorStyle = "caret";

let current: ErrorStyle = APPROVED_ERROR_STYLE;
const listeners = new Set<() => void>();

export const errorStyle = {
  get: () => current,
  set(next: ErrorStyle) {
    current = next;
    listeners.forEach(listener => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
