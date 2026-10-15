"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { useTypingEngine } from "@/hooks/useTypingEngine";
import { Runner } from "@/components/runner/Runner";
import { TypingText } from "@/components/typing/TypingText";
import { WpmCounter } from "@/components/typing/WpmCounter";
import { getRandomPrompt, PROMPTS } from "@/data/prompts";
import { resolveVisualSpeed } from "@/lib/visualSpeed";

const WpmSimulator = process.env.NODE_ENV === "development"
  ? lazy(() => import("@/components/debug/WpmSimulator")) : null;

export default function Home() {
  const [text, setText] = useState<string>(PROMPTS[0]);
  const [showResults, setShowResults] = useState(false);
  const [simulatedWpm, setSimulatedWpm] = useState<number | null>(null);

  const {
    currentIndex,
    currentWpm,
    accuracy,
    status,
    lastCorrectAt,
    errorCount,
    averageWpm,
    elapsedTime,
    handleKey,
    reset,
  } = useTypingEngine({
    text: text,
  });

  const visualSpeed = resolveVisualSpeed(currentWpm, status,
    process.env.NODE_ENV === "development" ? simulatedWpm : null);

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
    <main className="isolate grid min-h-screen grid-rows-[auto_1fr_1fr] bg-white px-12 py-8 text-[#3d3a55] max-sm:px-6 max-sm:py-6">
      <header className="flex items-center justify-between">
        <span className="text-base font-medium tracking-[-0.04em]">pace.</span>
        <a
          href="https://github.com/tizianocarranza"
          target="_blank"
          rel="noreferrer"
          className="text-xs tracking-[0.02em] text-[#a9a5c8] transition-colors duration-300 hover:text-[#3d3a55] focus-visible:text-[#3d3a55]"
        >
          by Tiziano Carranza
        </a>
      </header>

      <section className="flex items-center justify-center">
        {!showResults ? (
          <TypingText
            key={text}
            text={text}
            currentIndex={currentIndex}
            errorCount={errorCount}
            status={status}
            intensity={visualSpeed.intensity}
            className="w-[min(48rem,80vw)] text-center text-[clamp(1.6rem,2.5vw,2.75rem)] leading-[1.3] font-normal tracking-[-0.035em]"
          />
        ) : (
          <div className="results-enter flex flex-col items-center">
            <div className="text-5xl tabular-nums">{averageWpm}</div>

            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[#a9a5c8]">
              WPM
            </div>

            <div className="mt-8 flex gap-8 text-sm">
              <div className="flex flex-col items-center">
                <span>{accuracy}%</span>
                <span className="text-[#a9a5c8]">accuracy</span>
              </div>

              <div className="flex flex-col items-center">
                <span>{elapsedTime.toFixed(1)}s</span>
                <span className="text-[#a9a5c8]">time</span>
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
          intensity={visualSpeed.intensity}
          sustainedInput={visualSpeed.sustainedInput}
          lastCorrectAt={lastCorrectAt}
          errorCount={errorCount}
          status={visualSpeed.status}
          onFinishExit={() => setShowResults(true)}
          className="h-48 w-screen"
        />

        {status !== "finished" && (
          <WpmCounter
            wpm={currentWpm}
            intensity={visualSpeed.intensity}
            className={`transition-opacity duration-500 ${status === "idle" ? "opacity-40" : "opacity-100"}`}
          />
        )}
      </section>
      {WpmSimulator && (
        <Suspense fallback={null}>
          <WpmSimulator value={simulatedWpm} onChange={setSimulatedWpm} finished={status === "finished"} />
        </Suspense>
      )}
    </main>
  );
}
