/** Live WPM window, in seconds of key age: a key fades in over RISE, counts fully until
 * HOLD and fades out by FADE. Tapered edges make every key enter and leave gradually, so
 * the live value glides instead of stepping by a whole key (3 WPM in a hard 4 s window). */
const RISE = 0.5;
const HOLD = 2;
const FADE = 5;
/** Shortest span the rate is measured over, so the second key can't read as a sprint. */
const MIN_SPAN = 0.25;

/** Keys older than this no longer count; callers may drop them. */
export const LIVE_WINDOW_MS = FADE * 1000;

function weight(age: number) {
  if (age < 0 || age >= FADE) return 0;
  if (age < RISE) return age / RISE;
  if (age < HOLD) return 1;
  return (FADE - age) / (FADE - HOLD);
}

/** ∫₀ᵀ weight: the window's effective length after T seconds of typing. */
function windowSeconds(span: number) {
  const t = Math.min(Math.max(span, 0), FADE);
  let total = (Math.min(t, RISE) ** 2) / (2 * RISE);
  if (t > RISE) total += Math.min(t, HOLD) - RISE;
  if (t > HOLD) {
    const fall = t - HOLD;
    total += fall - fall * fall / (2 * (FADE - HOLD));
  }
  return total;
}

/**
 * Live WPM from the timestamps (ms) of recent correct keys. `correctCount` is every
 * correct key since `startedAt`. Keys are samples of a rate: n keys span n − 1 intervals,
 * and each edge of the run holds half a sample, so the span is stretched by half an
 * average interval. That reads the real pace from the second key, not a slow ramp.
 */
export function liveWpm(times: readonly number[], now: number, startedAt: number | null, correctCount: number) {
  if (startedAt === null || correctCount < 2) return 0;
  let keys = 0;
  for (const time of times) keys += weight((now - time) / 1000);
  const elapsed = (now - startedAt) / 1000;
  const span = Math.max(MIN_SPAN, elapsed * (correctCount - 0.5) / (correctCount - 1));
  return Math.round(keys / 5 / (windowSeconds(span) / 60));
}

/** Net WPM over the whole run: correct characters per five, per minute. */
export function averageWpm(correct: number, startedAt: number | null, endedAt: number | null) {
  if (startedAt === null || endedAt === null || correct === 0) return 0;
  const minutes = (endedAt - startedAt) / 60_000;
  return minutes > 0 ? Math.round(correct / 5 / minutes) : 0;
}

export function accuracy(correct: number, total: number) {
  return total === 0 ? 100 : Math.round((correct / total) * 100);
}
