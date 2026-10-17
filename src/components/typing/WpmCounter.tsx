"use client";

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { ORB_NIGHT_COLORS, orbTuning } from "./orbTuning";
import { theme } from "@/lib/theme";
import { quicksand } from "@/lib/fonts";
import { FLOOR_WARMTH } from "@/components/runner/environment/floorWarmth";
import { worldTone } from "@/components/runner/environment/worldTone";

type WpmCounterProps = {
  /** Real live WPM from the typing engine; the number always shows this statistic. */
  wpm: number;
  /** Resolved visual intensity from `visualSpeed.ts`; drives the cloud level only. */
  intensity: number;
  className?: string;
};

/** Columns, most significant first: hundreds, tens, ones. */
const COLUMNS = [2, 1, 0] as const;

/** The shown number moves only once the spring is this far past it, so the live WPM
 * flickering between neighbours (60 ↔ 61) never dissolves a digit back and forth. */
const SHOW_THRESHOLD = 0.75;
/** Minimum time between changes (ms), so each digit crossfade can finish. */
const SHOW_HOLD = 250;

const digitAt = (value: number, column: number) => Math.floor(value / 10 ** column) % 10;
function digitCount(value: number) {
  return value > 99 ? 3 : value > 9 ? 2 : 1;
}

/** Level spring substep. The level spring is slightly underdamped, so the cloud eases
 * in and billows once; the two puff rows chase the cloud body at their own pace (the
 * front leads, the back trails), so a charge rises in separate billows that merge
 * again when steady. Their constants live in `orbTuning.ts`. */
const LEVEL_STEP = 1 / 240;

// The orb is a circle of radius 44 centered in a 100×100 view box.
const RADIUS = 44;
const BOTTOM = 50 + RADIUS;

/** Filled area fraction for a fill height, sampled once: the level follows volume,
 * so the narrow bottom rises visibly at low speed and the wide middle fills slowly. */
const AREA_SAMPLES = 64;
const AREA = Array.from({ length: AREA_SAMPLES + 1 }, (_, i) => {
  const h = (i / AREA_SAMPLES) * 2 * RADIUS;
  const d = RADIUS - h;
  const segment = RADIUS * RADIUS * Math.acos(d / RADIUS) - d * Math.sqrt(Math.max(0, 2 * RADIUS * h - h * h));
  return segment / (Math.PI * RADIUS * RADIUS);
});

function heightForArea(fraction: number) {
  const f = Math.min(1, Math.max(0, fraction));
  let i = 0;
  while (i < AREA_SAMPLES - 1 && AREA[i + 1] < f) i++;
  const span = AREA[i + 1] - AREA[i];
  const t = span > 0 ? (f - AREA[i]) / span : 0;
  return ((i + t) / AREA_SAMPLES) * 2 * RADIUS;
}

/** A color under the floor's warm grade (`FLOOR_WARMTH.grade`, what a held sprint
 * multiplies the floor by), scaled by `strength`. The orb mixes toward it with the
 * floor's own warmth, so both warm together. */
function warmed(hex: string, strength: number) {
  const value = parseInt(hex.slice(1), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255].map((channel, i) => {
    const factor = 1 + (FLOOR_WARMTH.grade[i] - 1) * strength;
    return Math.round(Math.min(255, Math.max(0, channel * factor)));
  });
  return `#${channels.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}
const toward = (cool: string, strength: number) =>
  `color-mix(in oklab, ${cool}, ${warmed(cool, strength)} calc(var(--orb-warmth, 0) * 100%))`;

/** Analytic critically damped step toward `target`; returns [position, velocity]. */
function follow(x: number, v: number, target: number, omega: number, dt: number, out: [number, number]) {
  const e = Math.exp(-omega * dt);
  const d = x - target;
  const k = v + omega * d;
  out[0] = target + (d + k * dt) * e;
  out[1] = (v - omega * k * dt) * e;
}

/** Cloud puffs along the surface (y relative to it, positive is below). Each row is
 * periodic over 50 units and repeated, so drifting it by 50 loops seamlessly. */
const PUFF_PERIOD = 50;
function puffRow(base: readonly { x: number; y: number; r: number }[]) {
  return [-1, 0, 1, 2].flatMap(k => base.map(puff => ({ ...puff, x: puff.x + k * PUFF_PERIOD })));
}
const BACK_PUFFS = puffRow([{ x: 14, y: 5, r: 9 }, { x: 31, y: 6, r: 13 }, { x: 46, y: 4, r: 8 }]);
const FRONT_PUFFS = puffRow([{ x: 5, y: 3, r: 11 }, { x: 22, y: 1, r: 8 }, { x: 37, y: 4, r: 12 }]);
/** Puffs breathe out of phase, so the cloud top never pulses as one. */
function renderPuffs(puffs: readonly { x: number; y: number; r: number }[], delay: number) {
  return puffs.map((p, index) => (
    <circle key={index} className="wpm-orb-puff" cx={p.x} cy={p.y} r={p.r}
      style={{ animationDelay: `${(index % 3) * -2.3 - delay}s` }} />
  ));
}

type CounterMotion = {
  value: number; vValue: number; tValue: number; shown: number; shownAt: number;
  /** Per column (ones, tens, hundreds): the visible slot (0 or 1) and its digit. */
  slot: number[]; digit: number[];
  level: number; vLevel: number; tLevel: number; carry: number;
  front: number; vFront: number; back: number; vBack: number;
  raf: number; last: number; reduced: boolean;
  scratch: [number, number];
};

/** The cloud body's top for a filled area fraction. Empty sits fully below the orb;
 * full lifts the puffs past the top. */
function surfaceFor(level: number) {
  const l = Math.min(1, Math.max(0, level));
  return BOTTOM - heightForArea(l) + (1 - l) * 8 - l * l * 8;
}

/**
 * The live WPM readout: an orb that fills with living cloud as the resolved intensity
 * rises, with the real WPM in its middle; a digit that changes dissolves into the
 * next. Springs write CSS variables and text nodes straight to the DOM, so React never
 * re-renders per frame. The cloud's
 * drift, breathing and boiling edge are CSS and SVG animations.
 */
export function WpmCounter({ wpm, intensity, className }: WpmCounterProps) {
  const [initialWpm] = useState(() => Math.max(0, Math.round(wpm)));
  const id = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const digitsRef = useRef<HTMLSpanElement>(null);
  const spokenRef = useRef<HTMLSpanElement>(null);
  const motion = useRef<CounterMotion | null>(null);
  const wake = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    const digits = digitsRef.current;
    const spoken = spokenRef.current;
    if (!root || !svg || !digits || !spoken) return;
    const surface = surfaceFor(intensity);
    const m: CounterMotion = motion.current ??= {
      value: wpm, vValue: 0, tValue: wpm, shown: initialWpm, shownAt: 0,
      slot: [0, 0, 0], digit: [digitAt(initialWpm, 0), digitAt(initialWpm, 1), digitAt(initialWpm, 2)],
      level: intensity, vLevel: 0, tLevel: intensity, carry: 0,
      front: surface, vFront: 0, back: surface, vBack: 0,
      raf: 0, last: 0, reduced: false, scratch: [0, 0],
    };

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onQuery = () => {
      m.reduced = query.matches;
      // SMIL keeps the noise morphing; reduced motion holds it still.
      if (m.reduced) svg.pauseAnimations(); else svg.unpauseAnimations();
    };
    onQuery();
    query.addEventListener("change", onQuery);

    // Two stacked slots per column, ones first; queried once.
    const slots = [0, 1, 2].map(column =>
      Array.from(digits.querySelectorAll<HTMLElement>(`[data-col="${column}"] .wpm-orb-slot`)));

    /** Shows a new number: each changed digit eases in over the old one, which blurs out. */
    const show = (shown: number, now: number) => {
      m.shown = shown;
      m.shownAt = now;
      // Update React's own text nodes rather than replacing them.
      if (spoken.firstChild) spoken.firstChild.nodeValue = String(shown);
      for (let column = 0; column < 3; column++) {
        const digit = digitAt(shown, column);
        if (digit === m.digit[column]) continue;
        m.digit[column] = digit;
        const leaving = slots[column][m.slot[column]];
        m.slot[column] = 1 - m.slot[column];
        const entering = slots[column][m.slot[column]];
        if (entering.firstChild) entering.firstChild.nodeValue = String(digit);
        // Snap below and blurred, flush once (a change is rare, never per frame), then ease in.
        entering.dataset.state = "enter";
        void entering.offsetWidth;
        entering.dataset.state = "in";
        leaving.dataset.state = "out";
      }
      // Leading columns collapse when unused, so the number re-centers.
      const count = String(digitCount(shown));
      if (digits.dataset.digits !== count) digits.dataset.digits = count;
    };

    const apply = (now: number) => {
      const value = Math.max(0, m.value);
      const next = Math.round(value);
      if (next !== m.shown &&
        (m.reduced || (Math.abs(value - m.shown) >= SHOW_THRESHOLD && now - m.shownAt >= SHOW_HOLD))) {
        show(next, now);
      }
      const t = orbTuning.get();
      const level = Math.min(1, Math.max(0, m.level));
      const moving = Math.abs(m.vLevel);
      // Calm breathing plus a billow while the level moves.
      const swell = m.reduced ? 0.4 : t.swellBase + Math.min(0.8, moving * t.swellBillow);
      const tilt = m.reduced ? 0 : Math.max(-t.maxTilt, Math.min(t.maxTilt, -m.vLevel * t.tiltPerVelocity));
      root.style.setProperty("--wpm-fill", level.toFixed(4));
      root.style.setProperty("--orb-y", surfaceFor(level).toFixed(3));
      root.style.setProperty("--orb-y-front", m.front.toFixed(3));
      root.style.setProperty("--orb-y-back", m.back.toFixed(3));
      root.style.setProperty("--orb-wave", swell.toFixed(3));
      root.style.setProperty("--orb-tilt", `${tilt.toFixed(2)}deg`);
      // The floor's own warmth, so the orb and the ground warm in the same breath.
      const warmth = Math.min(1, Math.max(0, t.previewWarmth ?? worldTone.warmth));
      root.style.setProperty("--orb-warmth", warmth.toFixed(4));
    };

    const step = (now: number) => {
      const dt = Math.min(Math.max((now - m.last) / 1000, 0), 0.05);
      m.last = now;
      const out = m.scratch;
      const t = orbTuning.get();

      follow(m.value, m.vValue, m.tValue, t.numberOmega, dt, out);
      m.value = out[0]; m.vValue = out[1];

      // Level: underdamped spring in fixed substeps, so every frame rate billows alike.
      m.carry += dt;
      while (m.carry >= LEVEL_STEP) {
        m.carry -= LEVEL_STEP;
        const accel = t.levelOmega * t.levelOmega * (m.tLevel - m.level) - 2 * t.levelDamping * t.levelOmega * m.vLevel;
        m.vLevel += accel * LEVEL_STEP;
        m.level += m.vLevel * LEVEL_STEP;
      }

      const body = surfaceFor(m.level);
      follow(m.front, m.vFront, body, t.frontOmega, dt, out);
      m.front = out[0]; m.vFront = out[1];
      follow(m.back, m.vBack, body, t.backOmega, dt, out);
      m.back = out[0]; m.vBack = out[1];

      // Keeps running until the shown number has landed on the target too.
      const settled = m.shown === Math.max(0, Math.round(m.tValue)) &&
        Math.abs(m.value - m.tValue) < 0.005 && Math.abs(m.vValue) < 0.05 &&
        Math.abs(m.level - m.tLevel) < 0.0005 && Math.abs(m.vLevel) < 0.002 &&
        Math.abs(m.front - body) < 0.05 && Math.abs(m.back - body) < 0.05 &&
        Math.abs(m.vFront) < 0.1 && Math.abs(m.vBack) < 0.1;

      if (settled) {
        m.value = m.tValue; m.level = m.tLevel;
        m.front = m.back = surfaceFor(m.level);
        m.vValue = m.vLevel = m.vFront = m.vBack = 0;
        m.raf = 0;
      } else {
        m.raf = requestAnimationFrame(step);
      }

      apply(now);
    };

    wake.current = () => {
      if (m.reduced) {
        // Reduced motion shows the value at once, without gliding or billowing.
        cancelAnimationFrame(m.raf);
        m.raf = 0;
        m.value = m.tValue; m.level = m.tLevel;
        m.front = m.back = surfaceFor(m.level);
        m.vValue = m.vLevel = m.vFront = m.vBack = 0;
        apply(performance.now());
        return;
      }
      if (m.raf) return;
      m.last = performance.now();
      m.carry = 0;
      m.raf = requestAnimationFrame(step);
    };

    apply(performance.now());
    // The world publishes its warmth from the frame loop; wake to repaint the colors.
    const unlisten = worldTone.listen(() => wake.current());

    return () => {
      unlisten();
      query.removeEventListener("change", onQuery);
      cancelAnimationFrame(m.raf);
      m.raf = 0;
      wake.current = () => {};
    };
    // The motion state is created once from the first props; later props arrive below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Production never changes the tuning; the development Orb debugger does.
  const tuning = useSyncExternalStore(orbTuning.subscribe, orbTuning.get, orbTuning.get);
  const night = useSyncExternalStore(theme.subscribe, () => theme.get() === "night", () => false);
  const palette = night ? ORB_NIGHT_COLORS : tuning;
  const target = tuning.previewLevel ?? intensity;

  useLayoutEffect(() => {
    const m = motion.current;
    if (!m) return;
    m.tValue = wpm;
    m.tLevel = target;
    wake.current();
  }, [wpm, target, tuning.previewWarmth]);

  // Debugger "replay": empty the orb at once and let it rise to the target again.
  const replayed = useRef(tuning.replay);
  useLayoutEffect(() => {
    const m = motion.current;
    if (!m || replayed.current === tuning.replay) return;
    replayed.current = tuning.replay;
    m.level = 0;
    m.front = m.back = surfaceFor(0);
    m.vLevel = m.vFront = m.vBack = 0;
    wake.current();
  }, [tuning.replay]);

  const tuningStyle = {
    "--orb-cloud-max": tuning.cloudOpacity,
    "--orb-drift-front": `${tuning.driftFrontSeconds}s`,
    "--orb-drift-back": `${tuning.driftBackSeconds}s`,
    "--orb-breathe": `${tuning.breatheSeconds}s`,
    "--orb-number-glow": tuning.numberGlow,
    "--orb-digit-fade": `${tuning.numberFadeMs}ms`,
    "--orb-halo": tuning.halo,
    "--orb-cloud-light": tuning.cloudLight,
  } as CSSProperties;
  const morph = `${tuning.noiseFrequency - tuning.noiseMorph};${tuning.noiseFrequency + tuning.noiseMorph};${tuning.noiseFrequency - tuning.noiseMorph}`;

  const orb = `${id}-orb`, tint = `${id}-tint`, glass = `${id}-glass`, cloud = `${id}-cloud`;

  return (
    <div ref={rootRef} style={tuningStyle}
      className={`wpm-orb flex flex-col items-center gap-1.5 ${className ?? ""}`}>
      <div className="relative size-[5.5rem]">
        <svg ref={svgRef} aria-hidden viewBox="0 0 100 100"
          className="wpm-orb-svg size-full overflow-visible">
          <defs>
            <clipPath id={orb}>
              <circle cx="50" cy="50" r={RADIUS} />
            </clipPath>
            {/* No outline: the sphere is a faint lavender edge feathering into clear glass. */}
            <radialGradient id={glass} cx="50" cy="50" r={RADIUS} gradientUnits="userSpaceOnUse">
              <stop offset="0.55" style={{ stopColor: "var(--pending)" }} stopOpacity="0" />
              <stop offset="1" style={{ stopColor: "var(--pending)" }} stopOpacity={tuning.glassEdge} />
            </radialGradient>
            {/* Pale, airy palette in each layer's own space: near-white lavender on top. */}
            <linearGradient id={tint} gradientUnits="userSpaceOnUse" x1="0" y1="-12" x2="0" y2="90">
              <stop offset="0" style={{ stopColor: toward(palette.colorTop, tuning.warmthStrength) }} />
              <stop offset="0.45" style={{ stopColor: toward(palette.colorMid, tuning.warmthStrength) }} />
              <stop offset="1" style={{ stopColor: toward(palette.colorBottom, tuning.warmthStrength) }} />
            </linearGradient>
            {/* Fixed in the orb's space, so drifting puffs keep reshaping the displaced
                edge; the noise itself morphs slowly. Alpha is modulated by the same noise
                for soft dense and thin patches inside the cloud. */}
            <filter id={cloud} filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"
              colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency={tuning.noiseFrequency} numOctaves="3" seed="7" result="noise">
                <animate attributeName="baseFrequency" values={morph} dur={`${tuning.noiseMorphSeconds}s`} repeatCount="indefinite" />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={tuning.displacement}
                xChannelSelector="R" yChannelSelector="G" result="shape" />
              <feGaussianBlur in="shape" stdDeviation={tuning.blur} result="soft" />
              <feColorMatrix in="noise" type="matrix" result="density"
                values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${tuning.densityContrast} 0 0 0 ${tuning.densityOffset}`} />
              <feComposite in="soft" in2="density" operator="in" />
            </filter>
          </defs>

          <g clipPath={`url(#${orb})`} className="wpm-orb-lit">
            <circle cx="50" cy="50" r={RADIUS} fill={`url(#${glass})`} />
            <g className="wpm-orb-cloud" filter={`url(#${cloud})`} fill={`url(#${tint})`}>
              <g className="wpm-orb-body">
                <rect x="-10" y="6" width="120" height="400" />
              </g>
              <g className="wpm-orb-back">
                <g className="wpm-orb-swell">
                  <g className="wpm-orb-drift-back">{renderPuffs(BACK_PUFFS, 1.1)}</g>
                </g>
              </g>
              <g className="wpm-orb-tilt">
                <g className="wpm-orb-front">
                  <g className="wpm-orb-swell">
                    <g className="wpm-orb-drift-front">{renderPuffs(FRONT_PUFFS, 0)}</g>
                  </g>
                </g>
              </g>
            </g>
          </g>
        </svg>

        <span className="absolute inset-0 grid place-items-center">
          <span ref={digitsRef} aria-hidden data-digits={digitCount(initialWpm)}
            className={`wpm-orb-digits ${quicksand.className}`}>
            {COLUMNS.map(column => (
              <span key={column} className="wpm-orb-col" data-col={column}>
                {/* The initial digits never change, so React leaves these nodes to the swaps. */}
                <span className="wpm-orb-slot" data-state="in">{digitAt(initialWpm, column)}</span>
                <span className="wpm-orb-slot" data-state="out">{digitAt(initialWpm, column)}</span>
              </span>
            ))}
          </span>
          {/* The initial text never changes, so React leaves this node to the spring. */}
          <span ref={spokenRef} className="sr-only">{initialWpm}</span>
        </span>
      </div>

      <span className="text-[10px] leading-none tracking-[0.2em] text-[var(--muted)]">
        WPM
      </span>
    </div>
  );
}
