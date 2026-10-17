"use client";

import { useEffect, useRef, useState } from "react";

type TouchInputProps = {
  /** Called once per typed character, like the window keydown on a hardware keyboard. */
  onKey: (key: string) => void;
  /** False once the run is finished: the input lets go, so the on-screen keyboard closes. */
  active: boolean;
  /** Shown while the input waits for a first tap on touch screens. */
  idle: boolean;
};

/**
 * An invisible input over the prompt, so touch screens can open their keyboard: tapping
 * the prompt focuses it. Mobile keyboards rarely send usable keydown events, so this reads
 * what the input receives and forwards each new character. While it has focus, the page's
 * window keydown ignores it, so a hardware keyboard is never counted twice.
 */
export function TouchInput({ onKey, active, idle }: TouchInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  /** Characters of the current value already forwarded. */
  const forwarded = useRef(0);
  /** Keyboards that compose words keep the value until the composition ends. */
  const composing = useRef(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!active) ref.current?.blur();
  }, [active]);

  const clear = (input: HTMLInputElement) => {
    input.value = "";
    forwarded.current = 0;
  };

  return (
    <>
      <input
        ref={ref}
        aria-label="Type the prompt"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        // 16px keeps iOS from zooming in on focus; nothing of it is visible.
        className="absolute inset-0 h-full w-full cursor-default bg-transparent text-[16px] text-transparent caret-transparent opacity-0 outline-none"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={event => {
          composing.current = false;
          clear(event.currentTarget);
        }}
        onInput={event => {
          const input = event.currentTarget;
          const value = input.value;
          for (const key of value.slice(forwarded.current)) onKey(key);
          forwarded.current = value.length;
          if (!composing.current) clear(input);
        }}
      />
      {idle && !focused && (
        <span aria-hidden className="pointer-events-none absolute top-full left-1/2 mt-4 hidden -translate-x-1/2 text-xs tracking-[0.02em] text-[var(--muted)] pointer-coarse:block">
          tap to type
        </span>
      )}
    </>
  );
}
