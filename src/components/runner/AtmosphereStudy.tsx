"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

export type AtmosphereMode = "off" | "haze" | "on";
export const AtmosphereContext = createContext<AtmosphereMode>("on");
export const useAtmosphere = () => useContext(AtmosphereContext);
const eventName = "pace-atmosphere-study";
const subscribe = (notify: () => void) => {
  window.addEventListener(eventName, notify);
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener(eventName, notify);
    window.removeEventListener("popstate", notify);
  };
};
function snapshot(): AtmosphereMode {
  if (process.env.NODE_ENV !== "development") return "on";
  const mode = new URLSearchParams(window.location.search).get("atmosphere");
  return mode === "off" || mode === "haze" ? mode : "on";
}
export const useAtmosphereSelection = () => useSyncExternalStore(subscribe, snapshot, () => "on" as AtmosphereMode);

export function AtmosphereControls({ mode }: { mode: AtmosphereMode }) {
  if (process.env.NODE_ENV !== "development") return null;
  return <aside data-atmosphere-review className="fixed bottom-3 right-3 z-50 rounded border border-black/10 bg-white/95 p-3 text-xs text-black/60"
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
    <details><summary className="cursor-pointer">Optical depth</summary>
      <div className="mt-2 flex gap-1">
        {([['off', 'Off'], ['haze', 'Haze only'], ['on', 'On']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={mode === value}
            className={`rounded border px-2 py-1 ${mode === value ? 'border-black text-black' : 'border-black/10'}`}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("atmosphere", value);
              window.history.replaceState(null, "", url);
              window.dispatchEvent(new Event(eventName));
            }}>{label}</button>)}
      </div>
      <p className="mt-2 max-w-60">Compare distance haze and foreground softness at the same live pose.</p>
    </details>
  </aside>;
}
