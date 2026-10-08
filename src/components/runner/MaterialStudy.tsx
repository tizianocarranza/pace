"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

export type MaterialMode = "current" | "shared" | "pilot";
export const MaterialStudyContext = createContext<MaterialMode>("pilot");
export const useMaterialStudy = () => useContext(MaterialStudyContext);
const eventName = "pace-material-study";
const subscribe = (notify: () => void) => {
  window.addEventListener(eventName, notify);
  window.addEventListener("popstate", notify);
  return () => { window.removeEventListener(eventName, notify); window.removeEventListener("popstate", notify); };
};
function snapshot(): MaterialMode {
  if (process.env.NODE_ENV !== "development") return "pilot";
  const mode = new URLSearchParams(window.location.search).get("materials");
  return mode === "current" || mode === "shared" ? mode : "pilot";
}
export const useMaterialSelection = () => useSyncExternalStore(subscribe, snapshot, () => "pilot" as MaterialMode);

export function MaterialStudyControls({ mode }: { mode: MaterialMode }) {
  if (process.env.NODE_ENV !== "development") return null;
  return <aside data-material-review className="fixed bottom-3 left-3 z-50 rounded border border-black/10 bg-white/95 p-3 text-xs text-black/60"
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
    <details><summary className="cursor-pointer">Material pilot · Study B</summary>
      <div className="mt-2 flex gap-1">
        {([['current', 'Current'], ['shared', 'Shared light'], ['pilot', 'Pilot']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={mode === value}
            className={`rounded border px-2 py-1 ${mode === value ? 'border-black text-black' : 'border-black/10'}`}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("materials", value);
              window.history.replaceState(null, "", url);
              window.dispatchEvent(new Event(eventName));
            }}>{label}</button>)}
      </div>
      <p className="mt-2 max-w-60">Same camera and live world. Shared light isolates the material change from the lighting change.</p>
    </details>
  </aside>;
}
