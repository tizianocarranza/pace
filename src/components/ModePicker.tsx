"use client";

import type { MouseEvent } from "react";
import { LANGUAGES, LENGTHS, type RunMode } from "@/lib/runMode";

type ModePickerProps = {
  mode: RunMode;
  onChange: (mode: RunMode) => void;
  /** While a run is being typed the mode is fixed; the picker steps back. */
  disabled: boolean;
  className?: string;
};

function Option({ label, pressed, disabled, onSelect }: {
  label: string; pressed: boolean; disabled: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (!pressed) onSelect();
        // Keep focus off the button, so Space while typing never presses it again.
        event.currentTarget.blur();
      }}
      className={`cursor-pointer transition-colors duration-300 disabled:cursor-default ${pressed
        ? "text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"}`}
    >
      {label}
    </button>
  );
}

/** Prompt length and language. Runs only compare with runs of the same mode. */
export function ModePicker({ mode, onChange, disabled, className }: ModePickerProps) {
  return (
    <div
      className={`flex items-center gap-3 text-xs tracking-[0.02em] transition-opacity duration-500 max-sm:gap-2 ${disabled ? "opacity-30" : "opacity-100"} ${className ?? ""}`}
    >
      <div role="group" aria-label="Prompt length" className="flex gap-3 max-sm:gap-2">
        {LENGTHS.map(length => (
          <Option key={length} label={length} pressed={mode.length === length} disabled={disabled}
            onSelect={() => onChange({ ...mode, length })} />
        ))}
      </div>
      <span aria-hidden className="text-[var(--muted)]">·</span>
      <div role="group" aria-label="Prompt language" className="flex gap-3 max-sm:gap-2">
        {LANGUAGES.map(language => (
          <Option key={language} label={language} pressed={mode.language === language} disabled={disabled}
            onSelect={() => onChange({ ...mode, language })} />
        ))}
      </div>
    </div>
  );
}
