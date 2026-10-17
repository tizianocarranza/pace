"use client";

import { useLayoutEffect, useSyncExternalStore, type CSSProperties } from "react";
import { theme } from "@/lib/theme";
import { CELESTIAL, celestialHover } from "@/components/runner/environment/celestial";

const serverTheme = () => "day" as const;
/** The hit area is a little larger than the body. */
const HIT = 1.4;

/** The theme toggle: an invisible button over the sun or moon drawn in the sky (SkyBodies).
 * Also keeps `<html data-theme>` in sync: after the dev remount (which resets attributes set
 * by the inline script) and with the system preference, until the player makes a choice. */
export function CelestialToggle() {
  const current = useSyncExternalStore(theme.subscribe, theme.get, serverTheme);

  useLayoutEffect(() => {
    theme.resolve();
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => { if (!theme.hasChoice()) theme.resolve(); };
    query.addEventListener("change", onSystem);
    return () => {
      query.removeEventListener("change", onSystem);
      celestialHover.value = 0;
    };
  }, []);

  const night = current === "night";
  const place = {
    "--celestial-right": `${CELESTIAL.wide.right}px`,
    "--celestial-top": `${CELESTIAL.wide.top}px`,
    "--celestial-hit": `${CELESTIAL.wide.size * HIT}px`,
    "--celestial-right-compact": `${CELESTIAL.compact.right}px`,
    "--celestial-top-compact": `${CELESTIAL.compact.top}px`,
    "--celestial-hit-compact": `${CELESTIAL.compact.size * HIT}px`,
  } as CSSProperties;

  return (
    <button
      type="button"
      data-genesis-reveal
      aria-label={night ? "Switch to day" : "Switch to night"}
      title={night ? "Day" : "Night"}
      style={place}
      className="celestial-toggle"
      onPointerEnter={() => { celestialHover.value = 1; }}
      onPointerLeave={() => { celestialHover.value = 0; }}
      onFocus={() => { celestialHover.value = 1; }}
      onBlur={() => { celestialHover.value = 0; }}
      onClick={event => {
        theme.choose(night ? "day" : "night");
        // Keep focus off the button, so Space/Enter while typing never toggles it again.
        event.currentTarget.blur();
      }}
    />
  );
}
