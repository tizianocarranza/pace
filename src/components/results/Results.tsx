"use client";

import { useState, type CSSProperties } from "react";
import { WpmChart } from "./WpmChart";
import { quicksand } from "@/lib/fonts";
import { recordRun, type Progress } from "@/lib/runHistory";
import { modeKey, type RunMode } from "@/lib/runMode";
import type { RunSummary } from "@/lib/typingStats";

type ResultsProps = {
  summary: RunSummary;
  /** The mode the run was played in; it is only compared with runs of that mode. */
  mode: RunMode;
  onTryAgain: () => void;
};

/** Saves the run in this browser and compares it with earlier ones; null when the
 * browser keeps no storage. Saving is idempotent, so a double mount saves once. */
function saveRun(summary: RunSummary, mode: RunMode): Progress | null {
  try {
    const { at, wpm, accuracy, time, peak, consistency } = summary;
    return recordRun(window.localStorage, { at, wpm, accuracy, time, peak, consistency, mode: modeKey(mode) });
  } catch {
    return null;
  }
}

/** Each block eases in a little after the one above it. */
const enter = (step: number): CSSProperties => ({ animationDelay: `${step * 90}ms` });

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`${quicksand.className} text-lg tabular-nums max-sm:text-base`}>{value}</span>
      <span className="text-xs text-[var(--muted)] max-sm:text-[10px]">{label}</span>
    </div>
  );
}

/** The finished run: WPM, its shape over time, the details and how it compares. */
export function Results({ summary, mode, onTryAgain }: ResultsProps) {
  // Results only render on the client, after a run, so storage is available here.
  const [progress] = useState(() => saveRun(summary, mode));
  const delta = progress?.average != null ? summary.wpm - progress.average : null;
  const history = progress?.recent ?? [];
  const historyTop = Math.max(1, ...history.map(run => run.wpm));

  return (
    <div className="flex w-[min(28rem,84vw)] flex-col items-center">
      <div className="results-enter flex flex-col items-center" style={enter(0)}>
        <div className={`${quicksand.className} text-6xl leading-none tabular-nums max-sm:text-5xl`}>{summary.wpm}</div>
        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">wpm · {mode.length} · {mode.language}</div>
      </div>

      <div className="results-enter mt-7 w-full max-sm:mt-4" style={enter(1)}>
        <WpmChart series={summary.series} errors={summary.errors} peak={summary.peak} className="block w-full" />
      </div>

      <div className="results-enter mt-6 grid w-full grid-cols-4 gap-2 max-sm:mt-4" style={enter(2)}>
        <Stat value={`${summary.accuracy}%`} label="accuracy" />
        <Stat value={`${summary.time.toFixed(1)}s`} label="time" />
        <Stat value={`${summary.peak}`} label="peak" />
        <Stat value={`${summary.consistency}%`} label="consistency" />
      </div>

      {progress && (
        <div className="results-enter mt-7 flex items-center gap-4 text-xs text-[var(--muted)] max-sm:mt-4" style={enter(3)}>
          {progress.previousBest === null ? (
            <span>first run saved</span>
          ) : (
            <>
              {progress.isBest
                ? <span className="results-best font-medium">✦ new best</span>
                : <span>best {progress.previousBest}</span>}
              {delta !== null && (
                <span className="tabular-nums">
                  {delta === 0 ? "on your average" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs avg`}
                </span>
              )}
            </>
          )}
          {history.length >= 2 && (
            <span role="img" aria-label={`Last ${history.length} runs: ${history.map(run => run.wpm).join(", ")} WPM`}
              className="flex h-4 items-end gap-[3px]">
              {history.map((run, index) => (
                <span key={run.at}
                  className={`w-[3px] rounded-full ${index === history.length - 1 ? "results-history-current" : "bg-[var(--track)]"}`}
                  style={{ height: `${Math.max(18, (run.wpm / historyTop) * 100)}%` }} />
              ))}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onTryAgain}
        className="results-enter mt-10 cursor-pointer text-sm underline underline-offset-4 max-sm:mt-6"
        style={enter(4)}
      >
        try again
      </button>
    </div>
  );
}
