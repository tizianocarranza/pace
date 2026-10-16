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

/** A finished run as the engine recorded it (timestamps in ms). */
export type RunRecord = {
  startedAt: number;
  finishedAt: number;
  correctTimes: readonly number[];
  errorTimes: readonly number[];
  correct: number;
  total: number;
};

export type RunSummary = {
  /** Finish timestamp; identifies the run in the saved history. */
  at: number;
  wpm: number;
  accuracy: number;
  /** Seconds from the first key to the last. */
  time: number;
  /** Live WPM over the run, sampled every SERIES_STEP seconds and at the finish. */
  series: { t: number; wpm: number }[];
  /** Seconds from the start at which each wrong key was pressed. */
  errors: number[];
  /** Highest live WPM once the pace has settled in. */
  peak: number;
  /** How steady the pace was: 100 is perfectly even. */
  consistency: number;
};

const SERIES_STEP = 0.5;
/** The first second reads from only a few keys, too noisy for peak and consistency. */
const SETTLE = 1;

/** Live WPM at `at`, as the counter showed it then. */
function liveWpmAt(correctTimes: readonly number[], at: number, startedAt: number) {
  let count = 0;
  while (count < correctTimes.length && correctTimes[count] <= at) count++;
  return liveWpm(correctTimes.slice(0, count), at, startedAt, count);
}

/** Everything the results show, computed once the run is over. */
export function summarize(run: RunRecord): RunSummary {
  const duration = Math.max(0, (run.finishedAt - run.startedAt) / 1000);
  const series: RunSummary["series"] = [];
  for (let t = 0; t < duration; t += SERIES_STEP) {
    series.push({ t, wpm: liveWpmAt(run.correctTimes, run.startedAt + t * 1000, run.startedAt) });
  }
  series.push({ t: duration, wpm: liveWpmAt(run.correctTimes, run.finishedAt, run.startedAt) });

  const settled = series.filter(sample => sample.t >= SETTLE).map(sample => sample.wpm);
  const peak = Math.max(0, ...(settled.length > 0 ? settled : series.map(sample => sample.wpm)));
  let consistency = run.correct > 0 ? 100 : 0;
  if (settled.length >= 2) {
    const mean = settled.reduce((sum, wpm) => sum + wpm, 0) / settled.length;
    const variance = settled.reduce((sum, wpm) => sum + (wpm - mean) ** 2, 0) / settled.length;
    consistency = mean > 0 ? Math.round(Math.min(1, Math.max(0, 1 - Math.sqrt(variance) / mean)) * 100) : 0;
  }

  const wpm = averageWpm(run.correct, run.startedAt, run.finishedAt);
  return {
    at: run.finishedAt,
    wpm,
    accuracy: accuracy(run.correct, run.total),
    time: duration,
    series,
    errors: run.errorTimes.map(time => (time - run.startedAt) / 1000),
    // The average counts the first key, the live window measures between keys; a steady
    // run can read one apart, and a peak below the average would look wrong.
    peak: Math.max(peak, wpm),
    consistency,
  };
}
