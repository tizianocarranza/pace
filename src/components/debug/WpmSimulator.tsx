"use client";

import { useState } from "react";

/** Imported only by the development build. No typing-engine state is writable here. */
export default function WpmSimulator({ value, onChange, finished }: {
  value: number | null;
  onChange: (wpm: number | null) => void;
  finished: boolean;
}) {
  const [wpm, setWpm] = useState(30);
  const enabled = value !== null;
  const update = (next: number) => {
    setWpm(next);
    if (enabled) onChange(next);
  };

  return (
    <aside aria-label="Pace development tools" onKeyDown={event => event.stopPropagation()}
      className="fixed top-4 right-4 z-50 max-w-[calc(100vw-2rem)] rounded border border-neutral-200 bg-white/95 p-3 text-xs text-neutral-600 shadow-sm">
      <details>
        <summary className="cursor-pointer select-none">Pace Debug</summary>
        <fieldset disabled={finished} className="mt-3 w-56 space-y-3 disabled:opacity-50">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={event => onChange(event.target.checked ? wpm : null)} />
            Simulate visual speed
          </label>
          <label className="block" htmlFor="simulated-wpm">Simulated WPM</label>
          <input id="simulated-wpm" type="range" min="0" max="120" step="0.5"
            value={wpm} disabled={!enabled} onChange={event => update(event.currentTarget.valueAsNumber)}
            className="block w-full accent-neutral-600" />
          <output htmlFor="simulated-wpm" className="block tabular-nums">{wpm} WPM</output>
          <div className="flex gap-1" aria-label="WPM presets">
            {[0, 15, 30, 45, 60, 90].map(preset => (
              <button key={preset} type="button" disabled={!enabled} onClick={() => update(preset)}
                className="flex-1 rounded border border-neutral-200 py-1 disabled:opacity-40">{preset}</button>
            ))}
          </div>
        </fieldset>
        {finished && <p className="mt-2">Simulation pauses during results.</p>}
      </details>
    </aside>
  );
}
