"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { DEFAULT_COMPOSITION, type CompositionStudy } from "./composition";

export const CompositionContext = createContext<{ study: CompositionStudy; gray: boolean }>({ study: DEFAULT_COMPOSITION, gray: false });
export const useComposition = () => useContext(CompositionContext);
const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};
function snapshot() {
  if (process.env.NODE_ENV !== "development") return DEFAULT_COMPOSITION;
  const query = new URLSearchParams(window.location.search);
  // Study B is approved. A/C are available only in the archived Phase 1 review.
  const requested = query.get("compositionReview") === "1" ? query.get("composition") : "b";
  const study = requested === "a" || requested === "b" || requested === "c" ? requested : DEFAULT_COMPOSITION;
  return study + (query.get("gray") === "1" ? ":gray" : "");
}
/** Development-only URL studies; no gameplay/debug-panel controls are added. */
export function useCompositionSelection() {
  const selected = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_COMPOSITION);
  return { study: selected[0] as CompositionStudy, gray: selected.endsWith(":gray") };
}
