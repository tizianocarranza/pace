"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { accuracy as accuracyOf, averageWpm as averageWpmOf, LIVE_WINDOW_MS, liveWpm } from "@/lib/typingStats";

type UseTypingEngineOptions = {
  text: string;
};

/** How often the live WPM is re-read while it can still change. */
const TICK_MS = 100;

/** The run as the key handler sees it: always current, even between renders. */
type Run = {
  text: string;
  index: number;
  startedAt: number | null;
  correct: number;
  total: number;
  /** Timestamps of correct keys still inside the live window, oldest first. */
  recent: number[];
};

const freshRun = (text: string): Run => ({ text, index: 0, startedAt: null, correct: 0, total: 0, recent: [] });

export function useTypingEngine({ text }: UseTypingEngineOptions) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [lastCorrectAt, setLastCorrectAt] = useState<number | null>(null);
  const [currentWpm, setCurrentWpm] = useState(0);
  /** True while the live WPM may still move; the ticker sleeps otherwise. */
  const [live, setLive] = useState(false);

  const run = useRef<Run>(freshRun(text));

  useEffect(() => {
    run.current.text = text;
  }, [text]);

  /** Re-reads the live WPM; React only re-renders when the shown integer changes. */
  const measure = useCallback((now: number) => {
    const r = run.current;
    while (r.recent.length > 0 && now - r.recent[0] >= LIVE_WINDOW_MS) r.recent.shift();
    const wpm = liveWpm(r.recent, now, r.startedAt, r.correct);
    setCurrentWpm(wpm);
    return wpm;
  }, []);

  useEffect(() => {
    if (!live) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const wpm = measure(now);
      // Rest once the last key has left the window; the next key wakes the ticker.
      if (wpm === 0 && run.current.recent.length === 0) setLive(false);
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [live, measure]);

  // Stable, and reads the run from the ref, so fast keys never see a stale index.
  const handleKey = useCallback((key: string) => {
    const r = run.current;
    if (r.index >= r.text.length || key.length !== 1) return;

    const now = Date.now();
    if (r.startedAt === null) {
      r.startedAt = now;
      setStartedAt(now);
    }

    r.total += 1;
    if (key === r.text[r.index]) {
      r.correct += 1;
      r.index += 1;
      r.recent.push(now);
      setCurrentIndex(r.index);
      setLastCorrectAt(now);
      if (r.index >= r.text.length) setFinishedAt(now);
    } else {
      setErrorCount((count) => count + 1);
    }
    setCorrect(r.correct);
    setTotal(r.total);

    measure(now);
    setLive(r.index < r.text.length);
  }, [measure]);

  const reset = useCallback(() => {
    run.current = freshRun(run.current.text);
    setCurrentIndex(0);
    setErrorCount(0);
    setCorrect(0);
    setTotal(0);
    setStartedAt(null);
    setFinishedAt(null);
    setLastCorrectAt(null);
    setCurrentWpm(0);
    setLive(false);
  }, []);

  // Results only: the time is read once the run is finished.
  const elapsedTime = startedAt === null || finishedAt === null ? 0 : (finishedAt - startedAt) / 1000;
  const averageWpm = averageWpmOf(correct, startedAt, finishedAt);
  const accuracy = accuracyOf(correct, total);

  const status: "idle" | "finished" | "running" =
    currentIndex === 0
      ? "idle"
      : currentIndex >= text.length
        ? "finished"
        : "running";

  return {
    currentIndex,
    currentWpm,
    elapsedTime,
    averageWpm,
    accuracy,
    lastCorrectAt,
    status,
    errorCount,
    handleKey,
    reset,
  };
}
