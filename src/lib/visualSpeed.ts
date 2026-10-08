type GameStatus = "idle" | "running" | "finished";

export const FULL_VISUAL_WPM = 65;

/** One curve for every visual consumer; statistics always keep the original WPM. */
export function wpmToIntensity(wpm: number) {
  const normalized = Number.isFinite(wpm) ? Math.min(1, Math.max(0, wpm) / FULL_VISUAL_WPM) : 0;
  return normalized ** 0.75;
}

/** Simulation overrides visual intent only. Real completion always takes priority. */
export function resolveVisualSpeed(realWpm: number, status: GameStatus, simulatedWpm: number | null) {
  const sustainedInput = simulatedWpm !== null && status !== "finished";
  const effectiveWpm = sustainedInput ? simulatedWpm : realWpm;
  return {
    effectiveWpm,
    intensity: wpmToIntensity(effectiveWpm),
    sustainedInput,
    status: sustainedInput ? "running" as const : status,
  };
}
