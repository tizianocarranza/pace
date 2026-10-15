"use client";

import { useState, useSyncExternalStore } from "react";
import { ORB_DEFAULTS, orbTuning, type OrbTuning } from "@/components/typing/orbTuning";

type NumberKey = { [K in keyof OrbTuning]: OrbTuning[K] extends number ? K : never }[keyof OrbTuning];
type ColorKey = "colorTop" | "colorMid" | "colorBottom";
type Slider = { key: Exclude<NumberKey, "replay">; label: string; min: number; max: number; step: number };

const GROUPS: { title: string; sliders: Slider[] }[] = [
  {
    title: "Rise",
    sliders: [
      { key: "numberOmega", label: "Number smoothing", min: 1, max: 15, step: 0.1 },
      { key: "numberFadeMs", label: "Digit fade (ms)", min: 80, max: 900, step: 10 },
      { key: "levelOmega", label: "Level speed", min: 0.5, max: 12, step: 0.1 },
      { key: "levelDamping", label: "Level damping", min: 0.2, max: 1.5, step: 0.05 },
      { key: "frontOmega", label: "Front puffs speed", min: 0.5, max: 15, step: 0.1 },
      { key: "backOmega", label: "Back puffs speed", min: 0.3, max: 10, step: 0.1 },
      { key: "tiltPerVelocity", label: "Tilt per velocity", min: 0, max: 60, step: 1 },
      { key: "maxTilt", label: "Max tilt (deg)", min: 0, max: 20, step: 0.5 },
      { key: "swellBase", label: "Puff height", min: 0.2, max: 1.6, step: 0.05 },
      { key: "swellBillow", label: "Billow while moving", min: 0, max: 8, step: 0.1 },
    ],
  },
  {
    title: "Cloud shape",
    sliders: [
      { key: "displacement", label: "Edge distortion", min: 0, max: 30, step: 0.5 },
      { key: "noiseFrequency", label: "Noise scale", min: 0.01, max: 0.12, step: 0.001 },
      { key: "noiseMorph", label: "Noise morph", min: 0, max: 0.03, step: 0.001 },
      { key: "noiseMorphSeconds", label: "Morph period (s)", min: 2, max: 40, step: 0.5 },
      { key: "blur", label: "Softness", min: 0, max: 5, step: 0.1 },
      { key: "densityContrast", label: "Density contrast", min: 0, max: 3, step: 0.05 },
      { key: "densityOffset", label: "Density base", min: -0.5, max: 1, step: 0.01 },
    ],
  },
  {
    title: "Look",
    sliders: [
      { key: "cloudOpacity", label: "Cloud opacity", min: 0.1, max: 1, step: 0.01 },
      { key: "glassEdge", label: "Sphere edge", min: 0, max: 0.8, step: 0.01 },
      { key: "driftFrontSeconds", label: "Front drift (s)", min: 2, max: 40, step: 0.5 },
      { key: "driftBackSeconds", label: "Back drift (s)", min: 2, max: 60, step: 0.5 },
      { key: "breatheSeconds", label: "Breathing (s)", min: 1, max: 20, step: 0.5 },
      { key: "warmthStrength", label: "Warmth strength", min: 0, max: 4, step: 0.1 },
      { key: "numberGlow", label: "Number glow", min: 0, max: 3, step: 0.05 },
      { key: "halo", label: "Orb glow", min: 0, max: 2.5, step: 0.05 },
      { key: "cloudLight", label: "Cloud brightness", min: 0.8, max: 1.3, step: 0.01 },
    ],
  },
];

const COLORS: { key: ColorKey; label: string }[] = [
  { key: "colorTop", label: "Top" },
  { key: "colorMid", label: "Middle" },
  { key: "colorBottom", label: "Bottom" },
];

/** Values that differ from the defaults, ready to paste back into `orbTuning.ts`. */
function changedValues(tuning: OrbTuning) {
  const changed: Partial<OrbTuning> = {};
  for (const key of Object.keys(ORB_DEFAULTS) as (keyof OrbTuning)[]) {
    if (key === "replay" || key === "previewLevel" || key === "previewWarmth") continue;
    if (tuning[key] !== ORB_DEFAULTS[key]) Object.assign(changed, { [key]: tuning[key] });
  }
  return changed;
}

/** Development-only live tuning for the WPM orb. Rendered inside the Pace Debug panel. */
export default function OrbDebugger() {
  const tuning = useSyncExternalStore(orbTuning.subscribe, orbTuning.get, orbTuning.get);
  const [copied, setCopied] = useState(false);
  const previewing = tuning.previewLevel !== null;
  const changed = changedValues(tuning);
  const changedCount = Object.keys(changed).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(changed, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <details className="mt-3 border-t border-neutral-200 pt-3">
      <summary className="cursor-pointer select-none">Orb</summary>
      <div className="mt-3 max-h-[60vh] w-56 space-y-4 overflow-y-auto pr-1">
        <section className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={previewing}
              onChange={event => orbTuning.set({ previewLevel: event.target.checked ? 0.6 : null })} />
            Fixed preview level
          </label>
          <input type="range" min="0" max="1" step="0.01" aria-label="Preview level"
            value={tuning.previewLevel ?? 0} disabled={!previewing}
            onChange={event => orbTuning.set({ previewLevel: event.currentTarget.valueAsNumber })}
            className="block w-full accent-neutral-600" />
          <output className="block tabular-nums">
            {previewing ? `${Math.round((tuning.previewLevel ?? 0) * 100)}% fill` : "Follows the game"}
          </output>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={tuning.previewWarmth !== null}
              onChange={event => orbTuning.set({ previewWarmth: event.target.checked ? 1 : null })} />
            Fixed warmth
          </label>
          <input type="range" min="0" max="1" step="0.01" aria-label="Preview warmth"
            value={tuning.previewWarmth ?? 0} disabled={tuning.previewWarmth === null}
            onChange={event => orbTuning.set({ previewWarmth: event.currentTarget.valueAsNumber })}
            className="block w-full accent-neutral-600" />
          <output className="block tabular-nums">
            {tuning.previewWarmth !== null ? `${Math.round(tuning.previewWarmth * 100)}% warm` : "Follows the floor"}
          </output>
          <div className="flex gap-1">
            <button type="button" onClick={() => orbTuning.set({ replay: tuning.replay + 1 })}
              className="flex-1 rounded border border-neutral-200 py-1">Replay rise</button>
            <button type="button" onClick={() => orbTuning.reset()}
              className="flex-1 rounded border border-neutral-200 py-1">Reset all</button>
          </div>
        </section>

        {GROUPS.map(group => (
          <section key={group.title} className="space-y-2">
            <h3 className="font-medium text-neutral-700">{group.title}</h3>
            {group.sliders.map(slider => (
              <label key={slider.key} className="block">
                <span className="flex justify-between">
                  <span>{slider.label}</span>
                  <span className="tabular-nums">{tuning[slider.key]}</span>
                </span>
                <input type="range" min={slider.min} max={slider.max} step={slider.step}
                  value={tuning[slider.key] ?? 0}
                  onChange={event => orbTuning.set({ [slider.key]: event.currentTarget.valueAsNumber })}
                  className="block w-full accent-neutral-600" />
              </label>
            ))}
          </section>
        ))}

        <section className="space-y-2">
          <h3 className="font-medium text-neutral-700">Colors</h3>
          <div className="flex gap-2">
            {COLORS.map(color => (
              <label key={color.key} className="flex flex-1 flex-col items-center gap-1">
                <input type="color" value={tuning[color.key]}
                  onChange={event => orbTuning.set({ [color.key]: event.currentTarget.value })}
                  className="h-7 w-full cursor-pointer rounded border border-neutral-200" />
                {color.label}
              </label>
            ))}
          </div>
        </section>

        <button type="button" onClick={copy} disabled={changedCount === 0}
          className="w-full rounded border border-neutral-200 py-1 disabled:opacity-40">
          {copied ? "Copied" : `Copy changed values (${changedCount})`}
        </button>
      </div>
    </details>
  );
}
