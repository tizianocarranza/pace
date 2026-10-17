/** Tunable look and motion of the WPM orb. Production always uses the defaults; the
 * development-only Orb debugger edits a live copy. Values never affect statistics. */
export type OrbTuning = {
  // Motion (springs read these every frame).
  /** How quickly the shown number follows the live WPM (rad/s), critically damped. */
  numberOmega: number;
  /** Crossfade of a changing digit (ms). */
  numberFadeMs: number;
  levelOmega: number;
  levelDamping: number;
  frontOmega: number;
  backOmega: number;
  tiltPerVelocity: number;
  maxTilt: number;
  swellBase: number;
  swellBillow: number;
  // Cloud shape (SVG filter).
  displacement: number;
  noiseFrequency: number;
  noiseMorph: number;
  noiseMorphSeconds: number;
  blur: number;
  densityContrast: number;
  densityOffset: number;
  // Look.
  cloudOpacity: number;
  glassEdge: number;
  driftFrontSeconds: number;
  driftBackSeconds: number;
  breatheSeconds: number;
  colorTop: string;
  colorMid: string;
  colorBottom: string;
  /** Glow behind the light digits, so they read over the pale cloud. */
  numberGlow: number;
  /** Strength of the glow around the orb (grows with the fill). */
  halo: number;
  /** Brightness of the cloud (1 = its colors as picked). */
  cloudLight: number;
  /** How strongly the orb takes the floor's warm grade (1 = exactly the floor's). */
  warmthStrength: number;
  // Preview: a fixed level instead of the live intensity (null follows the game).
  previewLevel: number | null;
  /** A fixed warmth instead of the floor's (null follows the world). */
  previewWarmth: number | null;
  /** Incremented to empty the orb instantly and replay the rise to the target. */
  replay: number;
};

/** The cloud at night: on the midnight page it glows a moonlit lavender-blue instead of
 * the day's near-white. The Orb debugger tunes the day palette. */
export const ORB_NIGHT_COLORS = { colorTop: "#cbc8ff", colorMid: "#9ea8f6", colorBottom: "#6f82e6" } as const;

export const ORB_DEFAULTS: OrbTuning = {
  numberOmega: 5,
  numberFadeMs: 320,
  levelOmega: 4,
  levelDamping: 0.7,
  frontOmega: 6,
  backOmega: 2.2,
  tiltPerVelocity: 20,
  maxTilt: 6,
  swellBase: 0.75,
  swellBillow: 2.5,
  displacement: 12,
  noiseFrequency: 0.043,
  noiseMorph: 0.007,
  noiseMorphSeconds: 14,
  blur: 1.4,
  densityContrast: 1.5,
  densityOffset: 0.05,
  cloudOpacity: 1,
  glassEdge: 0.22,
  driftFrontSeconds: 10,
  driftBackSeconds: 16,
  breatheSeconds: 6,
  colorTop: "#ebe5fd",
  colorMid: "#d7cef9",
  colorBottom: "#bdcaf5",
  numberGlow: 1.4,
  halo: 1,
  cloudLight: 1.06,
  // Stronger than the floor: the pale orb is small, the same grade would barely read.
  warmthStrength: 1.6,
  previewLevel: null,
  previewWarmth: null,
  replay: 0,
};

let current = ORB_DEFAULTS;
const listeners = new Set<() => void>();

export const orbTuning = {
  get: () => current,
  set(patch: Partial<OrbTuning>) {
    current = { ...current, ...patch };
    listeners.forEach(listener => listener());
  },
  reset() {
    current = { ...ORB_DEFAULTS, replay: current.replay };
    listeners.forEach(listener => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
