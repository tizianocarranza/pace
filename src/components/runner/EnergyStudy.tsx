"use client";

import { useSyncExternalStore } from "react";

export type EnergyMode = "off" | "surfaces" | "on";
const eventName = "pace-energy-study";
const subscribe = (notify: () => void) => {
  window.addEventListener(eventName, notify);
  window.addEventListener("popstate", notify);
  return () => { window.removeEventListener(eventName, notify); window.removeEventListener("popstate", notify); };
};
function snapshot(): EnergyMode {
  if (process.env.NODE_ENV !== "development") return "on";
  const mode = new URLSearchParams(window.location.search).get("energy");
  return mode === "off" || mode === "surfaces" ? mode : "on";
}
export const useEnergySelection = () => useSyncExternalStore(subscribe, snapshot, () => "on" as EnergyMode);

export function EnergyControls() {
  const mode = useEnergySelection();
  if (process.env.NODE_ENV !== "development") return null;
  return <aside data-energy-review className="fixed bottom-3 left-3 z-50 rounded border border-black/10 bg-white/95 p-3 text-xs text-black/60"
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
    <details><summary className="cursor-pointer">Visual energy</summary>
      <div className="mt-2 flex gap-1">
        {([['off', 'Off'], ['surfaces', 'Surfaces'], ['on', 'On']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={mode === value}
            className={`rounded border px-2 py-1 ${mode === value ? 'border-black text-black' : 'border-black/10'}`}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("energy", value);
              window.history.replaceState(null, "", url);
              window.dispatchEvent(new Event(eventName));
            }}>{label}</button>)}
      </div>
      <p className="mt-2 max-w-60">Compare at the same pose. Speed and contact events keep running.</p>
    </details>
  </aside>;
}
