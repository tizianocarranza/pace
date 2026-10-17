/** Finished runs remembered in this browser. Statistics come from the typing engine;
 * this only stores and compares them, each run only with runs of its own mode. Storage failures (private mode, quota, corrupt
 * data) degrade to "no history" and never break the results. */

export type SavedRun = {
  /** Finish timestamp (ms); unique per run. */
  at: number;
  wpm: number;
  accuracy: number;
  time: number;
  peak: number;
  consistency: number;
  /** `modeKey` of the run (`runMode.ts`); absent on runs saved before modes existed. */
  mode?: string;
};

export type Progress = {
  /** Best WPM of this mode before this run, or null on its first run. */
  previousBest: number | null;
  /** Mean WPM of the previous AVERAGE_OF runs of this mode, or null on its first run. */
  average: number | null;
  /** The last RECENT runs of this mode, oldest first, including this one. */
  recent: SavedRun[];
  isBest: boolean;
};

type RunStorage = Pick<Storage, "getItem" | "setItem">;

export const RUNS_KEY = "pace:runs:v1";
/** Runs saved before modes existed were all short English prompts. */
const LEGACY_MODE = "en:short";
const MAX_RUNS = 150;
const AVERAGE_OF = 10;
const RECENT = 10;

const isRun = (value: unknown): value is SavedRun =>
  typeof value === "object" && value !== null &&
  (["at", "wpm", "accuracy", "time", "peak", "consistency"] as const)
    .every(key => Number.isFinite((value as Record<string, unknown>)[key])) &&
  ["string", "undefined"].includes(typeof (value as Record<string, unknown>).mode);

const modeOf = (run: SavedRun) => run.mode ?? LEGACY_MODE;

export function loadRuns(storage: RunStorage): SavedRun[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(RUNS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRun) : [];
  } catch {
    return [];
  }
}

/** Saves `run` (once: saving the same `at` again changes nothing) and compares it with
 * the runs before it. */
export function recordRun(storage: RunStorage, run: SavedRun): Progress {
  const runs = loadRuns(storage);
  const existing = runs.findIndex(saved => saved.at === run.at);
  const before = (existing === -1 ? runs : runs.slice(0, existing))
    .filter(saved => modeOf(saved) === modeOf(run));
  if (existing === -1) {
    try {
      storage.setItem(RUNS_KEY, JSON.stringify([...runs, run].slice(-MAX_RUNS)));
    } catch {
      // Not remembered this time; the comparison below still works.
    }
  }

  const previousBest = before.length > 0 ? Math.max(...before.map(saved => saved.wpm)) : null;
  const lastFew = before.slice(-AVERAGE_OF);
  const average = lastFew.length > 0
    ? Math.round(lastFew.reduce((sum, saved) => sum + saved.wpm, 0) / lastFew.length)
    : null;

  return {
    previousBest,
    average,
    recent: [...before, run].slice(-RECENT),
    isBest: previousBest !== null && run.wpm > previousBest,
  };
}
