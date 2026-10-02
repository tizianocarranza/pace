"use client";

import { useEffect, useState } from "react";
import { useTypingEngine } from "@/hooks/useTypingEngine";
import { Runner } from "@/components/runner/Runner";
import { getRandomPrompt, PROMPTS } from "@/data/prompts";

export default function Home() {
  const [text, setText] = useState<string>(PROMPTS[0]);
  const [showResults, setShowResults] = useState(false);

  const {
    currentIndex,
    currentWpm,
    accuracy,
    status,
    intensity,
    errorCount,
    averageWpm,
    elapsedTime,
    handleKey,
    reset,
  } = useTypingEngine({
    text: text,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleKey(event.key);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleKey]);

  const handleTryAgain = () => {
    setShowResults(false);
    setText((currentText) => getRandomPrompt(currentText));
    reset();
  };

  return (
    <main className="grid min-h-screen grid-rows-[auto_1fr_1fr] bg-white px-12 py-8 text-[#171715] max-sm:px-6 max-sm:py-6">
      <header className="flex items-center justify-between">
        <span className="text-base font-medium tracking-[-0.04em]">pace.</span>
      </header>

      <section className="flex items-center justify-center">
        {!showResults ? (
          <p className="w-[min(48rem,80vw)] text-center text-[clamp(1.6rem,2.5vw,2.75rem)] leading-[1.2] font-normal tracking-[-0.035em]">
            <span className="text-[#171715]">
              {text.slice(0, currentIndex)}
            </span>

            <span className="relative">
              {status !== "finished" && (
                <span
                  aria-hidden
                  className="absolute top-[0.08em] -left-[0.02em] h-[0.9em] w-px bg-[#171715]"
                />
              )}

              <span className="text-[#d7d7d3]">{text.slice(currentIndex)}</span>
            </span>
          </p>
        ) : (
          <div className="results-enter flex flex-col items-center">
            <div className="text-5xl tabular-nums">{averageWpm}</div>

            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-neutral-400">
              WPM
            </div>

            <div className="mt-8 flex gap-8 text-sm">
              <div className="flex flex-col items-center">
                <span>{accuracy}%</span>
                <span className="text-neutral-400">accuracy</span>
              </div>

              <div className="flex flex-col items-center">
                <span>{elapsedTime.toFixed(1)}s</span>
                <span className="text-neutral-400">time</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTryAgain}
              className="mt-10 cursor-pointer text-sm underline underline-offset-4"
            >
              try again
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col items-center justify-center gap-6">
        <Runner
          intensity={intensity}
          errorCount={errorCount}
          status={status}
          onFinishExit={() => setShowResults(true)}
          className="h-48 w-screen"
        />

        {status !== "finished" && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-3xl tabular-nums">{currentWpm}</span>

            <span className="text-[10px] tracking-[0.2em] text-neutral-400">
              WPM
            </span>
          </div>
        )}
      </section>
    </main>
  );
}
