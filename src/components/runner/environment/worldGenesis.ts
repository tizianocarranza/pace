import { MathUtils, Vector4 } from "three";
import { type PipMotionSignals, type PipStatus } from "../pipMotion";

/** Seconds from the start of the intro to the bang (the singularity grows until then). */
export const GENESIS_BANG = 0.45;
/** Final reveal radius (world units from Pip's spot); beyond every visible ground point. */
export const GENESIS_RADIUS = 70;
/** Expansion time constant (s): the front races out, then slows. */
export const GENESIS_EXPANSION = 0.9;
/** After the bang, the intro is over once the wave front has faded. */
export const GENESIS_SETTLE = 2;
/** The collapse at the finish: the world falls back into the core over this long (s)... */
export const GENESIS_COLLAPSE = 0.9;
/** ...starting at the edge of the visible ground (surfacePresence crops |x| near 35)... */
const COLLAPSE_RADIUS = 42;
/** ...and the core flares and is spent over this long (s) once it has swallowed it. */
const COLLAPSE_FADE = 0.6;
/** The resting state: a complete world. */
const REVEALED = 1e4;

type GenesisPhase = "rest" | "birth" | "collapse" | "collapsed";

/**
 * The world's big bang, played at the start of each arrival (the intro). A point of light
 * grows where Pip will stand, flares and bursts, and the ground is revealed by a circular
 * wave front racing out from it. Every value is a function of elapsed time, so it plays
 * identically at any frame rate. At the finish, once Pip has run off, it plays in reverse:
 * the world falls back into a point of light, which flares and goes out, and stays empty
 * until the next arrival (Try again). With reduced motion the world is simply complete
 * (and `LandscapeMotion` fades it in and out instead).
 *
 * `value`: x reveal radius, y core size, z seconds since the bang (negative before it),
 * w wave-front strength.
 */
export class WorldGenesis {
  readonly value = new Vector4(REVEALED, 0, -1, 0);
  /** The birth or the collapse is playing (the core point draws only then). */
  active = false;
  /** Only the birth expands the page's UI (GenesisStage); the collapse leaves it alone. */
  expanding = false;
  private phase: GenesisPhase = "rest";
  /** Arrivals consumed, whether played or skipped (reduced motion). */
  arrivals = 0;
  /** Expansion progress: 0 before the bang, 1 − e^(−t/τ) during it, 1 at rest. The page
   * (GenesisStage) expands on this same curve as the ground. */
  progress = 1;
  private time = 0;
  private seenArrival = 0;

  update(delta: number, motion: PipMotionSignals | null, status: PipStatus = "idle") {
    const dt = Number.isFinite(delta) ? MathUtils.clamp(delta, 0, 0.05) : 0;
    const arrival = motion?.arrivalSequence ?? 0;
    if (arrival !== this.seenArrival) {
      this.seenArrival = arrival;
      this.arrivals++;
      this.time = 0;
      this.phase = "birth";
    }
    // Pip has left the frame: the world falls back into the core.
    if (status === "finished" && motion && !motion.active && (this.phase === "rest" || this.phase === "birth")) {
      this.time = 0;
      this.phase = "collapse";
    }
    if (motion?.reducedMotion) this.phase = "rest";
    this.active = this.phase === "birth" || this.phase === "collapse";
    this.expanding = this.phase === "birth";
    this.progress = 1;
    if (this.phase === "rest") { this.value.set(REVEALED, 0, -1, 0); return; }
    if (this.phase === "collapsed") { this.value.set(0, 0, -1, 0); return; }

    this.time += dt;
    if (this.phase === "collapse") { this.collapse(); return; }
    const sinceBang = this.time - GENESIS_BANG;
    if (sinceBang < 0) {
      // The singularity: grows in, with one soft beat before it bursts.
      const grow = MathUtils.smoothstep(this.time, 0, GENESIS_BANG * 0.75);
      const beat = 1 + 0.18 * Math.sin(Math.PI * 2 * this.time / GENESIS_BANG);
      this.value.set(0, grow * beat, sinceBang, 0);
      this.progress = 0;
      return;
    }
    if (sinceBang >= GENESIS_SETTLE) {
      this.phase = "rest";
      this.active = this.expanding = false;
      this.value.set(REVEALED, 0, -1, 0);
      return;
    }
    this.progress = 1 - Math.exp(-sinceBang / GENESIS_EXPANSION);
    const radius = GENESIS_RADIUS * this.progress;
    // The core flares at the bang and is spent within a fraction of a second.
    const core = 1.7 * Math.exp(-sinceBang / 0.14);
    const front = Math.exp(-sinceBang / 1.2);
    this.value.set(radius, core, sinceBang, front);
  }

  /** The big bang in reverse: the edge falls inward from the first frame and speeds up,
   * with its front lit; the core gathers as the world reaches it, flares and goes out. */
  private collapse() {
    const t = this.time;
    const u = Math.min(1, t / GENESIS_COLLAPSE);
    const radius = COLLAPSE_RADIUS * (1 - Math.pow(u, 1.6));
    const front = MathUtils.smoothstep(t, 0, 0.25) * (1 - MathUtils.smoothstep(u, 0.85, 1));
    const after = t - GENESIS_COLLAPSE;
    const core = after < 0
      ? MathUtils.smoothstep(u, 0.55, 1)
      : 1.4 * Math.exp(-after / 0.15) * (1 - MathUtils.smoothstep(after, COLLAPSE_FADE * 0.6, COLLAPSE_FADE));
    if (after >= COLLAPSE_FADE) {
      this.phase = "collapsed";
      this.active = false;
      this.value.set(0, 0, -1, 0);
      return;
    }
    this.value.set(Math.max(0, radius), core, -1, front);
  }
}

/** Reveal mask and wave front, around Pip's spot (the world origin). */
export const genesisField = /* glsl */ `
  uniform vec4 uGenesis;
  float genesisSoftness() { return 1.5 + 0.12 * uGenesis.x; }
  float genesisReveal(vec3 point) {
    float radius = uGenesis.x;
    return 1.0 - smoothstep(radius - genesisSoftness(), radius, length(point.xz));
  }
  // Sits just inside the reveal edge, so the front stays visible as it passes.
  float genesisFront(vec3 point) {
    if (uGenesis.w <= 0.0) return 0.0;
    float center = uGenesis.x - genesisSoftness() * 0.6;
    float q = (length(point.xz) - center) / (0.8 + 0.06 * uGenesis.x);
    return uGenesis.w * exp(-q * q);
  }
`;
