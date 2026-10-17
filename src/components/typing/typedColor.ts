/** The color of correctly typed letters. Production always uses the approved preset; the
 * development-only Pace Debug panel switches it live to compare. Visual only.
 * - `ink`: the original near-black ink.
 * - `indigo`: a soft indigo, warmer and less black.
 * - `violet`: deep violet, the caret's and the world's family.
 * - `cobalt`: the world's cobalt blue.
 * - `gradient`: violet to cobalt along the prompt, the caret's own gradient. */
export type TypedColor = "ink" | "indigo" | "violet" | "cobalt" | "gradient";

export const TYPED_COLORS: TypedColor[] = ["ink", "indigo", "violet", "cobalt", "gradient"];
export const APPROVED_TYPED_COLOR: TypedColor = "gradient";

let current: TypedColor = APPROVED_TYPED_COLOR;
const listeners = new Set<() => void>();

export const typedColor = {
  get: () => current,
  set(next: TypedColor) {
    current = next;
    listeners.forEach(listener => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
