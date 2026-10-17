"use client";

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTypingEngine } from "@/hooks/useTypingEngine";
import { Results } from "@/components/results/Results";
import { Runner, type RunnerInput } from "@/components/runner/Runner";
import { GenesisStage } from "@/components/runner/GenesisStage";
import { CelestialToggle } from "@/components/CelestialToggle";
import { ModePicker } from "@/components/ModePicker";
import { TypingText } from "@/components/typing/TypingText";
import { WpmCounter } from "@/components/typing/WpmCounter";
import { pickPrompt, promptsFor } from "@/data/prompts";
import { DEFAULT_MODE, runMode, type RunMode } from "@/lib/runMode";
import { resolveVisualSpeed } from "@/lib/visualSpeed";

const WpmSimulator = process.env.NODE_ENV === "development"
  ? lazy(() => import("@/components/debug/WpmSimulator")) : null;

const serverMode = () => DEFAULT_MODE;
/** Prompts played lately, across modes; the next pick avoids them. */
const RECENT_PROMPTS = 12;

type Prompt = { text: string; mode: RunMode };

export default function Home() {
  const mode = useSyncExternalStore(runMode.subscribe, runMode.get, serverMode);
  // Until the first pick, the mode's first prompt: the same on the server and the client.
  const [picked, setPicked] = useState<Prompt | null>(null);
  const prompt = picked ?? { text: promptsFor(mode)[0], mode };
  const text = prompt.text;
  const recentPrompts = useRef<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [simulatedWpm, setSimulatedWpm] = useState<number | null>(null);
  const [introReplay, setIntroReplay] = useState(0);

  const {
    currentIndex,
    currentWpm,
    status,
    lastCorrectAt,
    errorCount,
    summary,
    handleKey,
    reset,
  } = useTypingEngine({
    text: text,
  });

  const visualSpeed = resolveVisualSpeed(currentWpm, status,
    process.env.NODE_ENV === "development" ? simulatedWpm : null);

  // Read by Pip's frame loop: keystrokes update the scene without re-rendering it.
  const runnerInput = useRef<RunnerInput>({ intensity: 0, sustainedInput: false, lastCorrectAt: null, errorCount: 0 });
  useLayoutEffect(() => {
    const input = runnerInput.current;
    input.intensity = visualSpeed.intensity;
    input.sustainedInput = visualSpeed.sustainedInput;
    input.lastCorrectAt = lastCorrectAt;
    input.errorCount = errorCount;
  });
  const handleFinishExit = useCallback(() => setShowResults(true), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Space or Enter on a focused control presses it; it is not typing.
      if (event.target instanceof Element && event.target.closest("button, a")) return;
      handleKey(event.key);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleKey]);

  const nextPrompt = (nextMode: RunMode): Prompt => {
    recentPrompts.current = [...recentPrompts.current, text].slice(-RECENT_PROMPTS);
    return { text: pickPrompt(nextMode, recentPrompts.current), mode: nextMode };
  };

  const handleTryAgain = () => {
    setShowResults(false);
    setPicked(nextPrompt(mode));
    reset();
  };

  const handleModeChange = (nextMode: RunMode) => {
    runMode.choose(nextMode);
    if (status === "idle") {
      setPicked(nextPrompt(nextMode));
      reset();
    } else {
      // A finished run keeps its prompt and mode; the next one uses the new mode.
      setPicked(prompt);
    }
  };

  return (
    <main className="isolate grid min-h-screen grid-rows-[auto_1fr_1fr] bg-[var(--page)] px-12 py-8 text-[var(--ink)] transition-colors duration-[600ms] max-sm:px-6 max-sm:py-6">
      <GenesisStage />
      <CelestialToggle />
      <header data-genesis-reveal className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 max-sm:grid-cols-2 max-sm:gap-y-3">
        <span className="text-base font-medium tracking-[-0.04em]">pace.</span>
        <ModePicker mode={mode} onChange={handleModeChange} disabled={status === "running"}
          className="max-sm:col-span-2 max-sm:row-start-2 max-sm:justify-self-center" />
        <a
          href="https://github.com/tizianocarranza"
          target="_blank"
          rel="noreferrer"
          className="justify-self-end text-xs tracking-[0.02em] text-[var(--muted)] transition-colors duration-300 hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
        >
          by Tiziano Carranza
        </a>
      </header>

      <section data-genesis-reveal className="flex items-center justify-center">
        {!showResults ? (
          <TypingText
            key={text}
            text={text}
            lang={prompt.mode.language}
            currentIndex={currentIndex}
            errorCount={errorCount}
            status={status}
            intensity={visualSpeed.intensity}
            className="w-[min(48rem,80vw)] text-center text-[clamp(1.6rem,2.5vw,2.75rem)] leading-[1.3] font-normal tracking-[-0.035em]"
          />
        ) : (
          summary && <Results summary={summary} mode={prompt.mode} onTryAgain={handleTryAgain} />
        )}
      </section>

      <section className="flex flex-col items-center justify-center gap-6">
        <Runner
          input={runnerInput}
          status={visualSpeed.status}
          onFinishExit={handleFinishExit}
          introReplay={process.env.NODE_ENV === "development" ? introReplay : 0}
          className="h-48 w-screen"
        />

        {status !== "finished" && (
          <div data-genesis-reveal>
            <WpmCounter
              wpm={currentWpm}
              intensity={visualSpeed.intensity}
              className={`transition-opacity duration-500 ${status === "idle" ? "opacity-40" : "opacity-100"}`}
            />
          </div>
        )}
      </section>
      {WpmSimulator && (
        <Suspense fallback={null}>
          <WpmSimulator value={simulatedWpm} onChange={setSimulatedWpm} finished={status === "finished"}
            idle={status === "idle"} onReplayIntro={() => setIntroReplay(n => n + 1)} />
        </Suspense>
      )}
    </main>
  );
}
