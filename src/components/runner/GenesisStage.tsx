"use client";

import { useEffect } from "react";
import { genesisStage } from "./environment/genesisStage";

type Phase = "waiting" | "playing" | "done";

/** If the scene never arrives (3D failed or is very slow), the UI shows anyway. */
const WAIT_FALLBACK_MS = 6000;

/**
 * Carries the big bang's wave across the page. `<html data-genesis>` holds the phase:
 * `waiting` (no arrival yet, the UI is hidden), `playing` (each `[data-genesis-reveal]`
 * element is uncovered as the wave crosses it) and `done`. Values come from the frame
 * loop through `genesisStage`; this writes CSS variables directly and never re-renders. Reduced motion skips straight to `done`.
 */
export function GenesisStage() {
  useEffect(() => {
    const html = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let phase: Phase = reduced.matches ? "done" : "waiting";
    html.dataset.genesis = phase;

    // Each element's mask is in its own box: place the core in local coordinates.
    // Read once per intro (and on resize); the core does not move while it plays.
    const measure = () => {
      const { x, y } = genesisStage.state;
      document.querySelectorAll<HTMLElement>("[data-genesis-reveal]").forEach(element => {
        const rect = element.getBoundingClientRect();
        element.style.setProperty("--genesis-x", `${x - rect.left}px`);
        element.style.setProperty("--genesis-y", `${y - rect.top}px`);
      });
    };
    const apply = () => {
      const stage = genesisStage.state;
      const next: Phase = reduced.matches ? "done" : stage.active ? "playing"
        : stage.arrivals > 0 ? "done" : phase;
      if (next !== phase) {
        phase = next;
        html.dataset.genesis = phase;
        if (phase === "playing") measure();
      }
      if (phase === "playing") {
        html.style.setProperty("--genesis-r", `${stage.radius}px`);
      }
    };
    const onResize = () => { if (phase === "playing") measure(); };
    const fallback = window.setTimeout(() => {
      if (phase !== "waiting") return;
      phase = "done";
      html.dataset.genesis = phase;
    }, WAIT_FALLBACK_MS);

    apply();
    const unlisten = genesisStage.listen(apply);
    window.addEventListener("resize", onResize);
    return () => {
      unlisten();
      window.clearTimeout(fallback);
      window.removeEventListener("resize", onResize);
      html.dataset.genesis = "done";
    };
  }, []);

  return null;
}
