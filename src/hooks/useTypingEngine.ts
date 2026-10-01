"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Keystroke = {
  timestamp: number;
  correct: boolean;
};

type UseTypingEngineOptions = {
  text: string;
};

const WPM_WINDOW = 4_000;
const MAX_WPM = 120;

export function useTypingEngine({ text }: UseTypingEngineOptions) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [keystrokes, setKeystrokes] = useState<Keystroke[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  const correctCharacters = useRef(0);
  const totalCharacters = useRef(0);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null || currentIndex >= text.length) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => {
      window.clearInterval(interval);
    };
  }, [startedAt, currentIndex, text.length]);

  const handleKey = useCallback(
    (key: string) => {
      if (currentIndex >= text.length) return;
      if (key.length !== 1) return;

      const now = Date.now();

      if (startedAt === null) {
        setStartedAt(now);
      }

      const isCorrect = key === text[currentIndex];

      totalCharacters.current += 1;

      if (isCorrect) {
        correctCharacters.current += 1;

        const nextIndex = currentIndex + 1;

        setCurrentIndex(nextIndex);

        if (nextIndex >= text.length) {
          setFinishedAt(now);
        }
      } else {
        setErrorCount((count) => count + 1);
      }

      setKeystrokes((previous) => [
        ...previous.filter(
          (keystroke) => now - keystroke.timestamp <= WPM_WINDOW,
        ),
        {
          timestamp: now,
          correct: isCorrect,
        },
      ]);
    },
    [currentIndex, startedAt, text],
  );

  const reset = useCallback(() => {
    setCurrentIndex(0);
    setKeystrokes([]);
    setStartedAt(null);
    setFinishedAt(null);
    setErrorCount(0);
    setNow(Date.now());

    correctCharacters.current = 0;
    totalCharacters.current = 0;
  }, []);

  const elapsedTime = useMemo(() => {
    if (startedAt === null) return 0;

    const endTime = finishedAt ?? now;

    return (endTime - startedAt) / 1000;
  }, [startedAt, finishedAt, now]);

  const currentWpm = useMemo(() => {
    const recentCorrectKeystrokes = keystrokes.filter(
      (keystroke) =>
        keystroke.correct && now - keystroke.timestamp <= WPM_WINDOW,
    );

    const minutes = WPM_WINDOW / 60_000;

    return Math.round(recentCorrectKeystrokes.length / 5 / minutes);
  }, [keystrokes, now]);

  const averageWpm = useMemo(() => {
    if (startedAt === null || correctCharacters.current === 0) {
      return 0;
    }

    const elapsedMinutes = elapsedTime / 60;

    if (elapsedMinutes <= 0) return 0;

    return Math.round(correctCharacters.current / 5 / elapsedMinutes);
  }, [elapsedTime]);

  const accuracy =
    totalCharacters.current === 0
      ? 100
      : Math.round((correctCharacters.current / totalCharacters.current) * 100);

  const intensity = Math.min(currentWpm / MAX_WPM, 1);

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
    intensity,
    status,
    errorCount,
    handleKey,
    reset,
  };
}
