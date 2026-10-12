type GameStatus = "idle" | "running" | "finished";

export const FULL_VISUAL_WPM = 90;

/** One curve for every visual consumer; statistics always keep the original WPM. */
export function wpmToIntensity(wpm: number) {
  const normalized = Number.isFinite(wpm) ? Math.min(1, Math.max(0, wpm) / FULL_VISUAL_WPM) : 0;
  // 60 is an established run (0.78); 90 has real sprint headroom. One curve
  // feeds Pip and the world, including the simulator. Scoring is unaffected.
  return normalized ** 0.6;
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
