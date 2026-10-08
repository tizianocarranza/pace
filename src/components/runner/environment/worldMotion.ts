import { MathUtils } from "three";
import { type PipMotionSignals, type PipStatus } from "../pipMotion";
import { WORLD_PERIOD } from "./terrainProfile";

export const MAX_WORLD_VELOCITY = 6.4;
export const FOREGROUND_RATE = 1.18;
export const FRAGMENT_RATE = 1.36;

/** Apparent rate for the existing perspective camera. Rooted objects share a
 * physical velocity: multiplying them again by depth would slide them off terrain. */
export function depthMultiplier(z: number) {
  return 6 / (6 - Math.min(z, 4));
}

/** One momentum source for terrain, rooted structures, floating motion and near passes. */
export class LandscapeMotion {
  velocity = 0;
  intensity = 0;
  distance = 0;
  travel = 0;
  phase = 0;
  lag = 0;
  visibility = 1;
  private previousStatus: PipStatus = "idle";

  update(delta: number, motion: PipMotionSignals | null, status: PipStatus) {
    const dt = Number.isFinite(delta) ? MathUtils.clamp(delta, 0, 0.05) : 0;
    if (status === "idle" && this.previousStatus !== "idle") {
      this.distance = this.travel = this.velocity = this.intensity = this.lag = this.phase = 0;
      this.visibility = 1;
    }
    this.previousStatus = status;
    const active = status !== "idle" && motion?.active;
    const fade = status === "finished" && !motion?.active ? 0 : 1;
    this.visibility = MathUtils.damp(this.visibility, fade, 4, dt);
    // Freeze both ambient and traversal phases, without snapping the visible pose.
    if (motion?.reducedMotion) { this.velocity = 0; return; }
    const raw = motion?.intent ?? motion?.speed ?? 0;
    const intent = Number.isFinite(raw) ? MathUtils.clamp(raw, 0, 1) : 0;
    const target = active ? intent * MAX_WORLD_VELOCITY : 0;
    const rate = target > this.velocity ? 4.8 : 2.6;
    const decay = Math.exp(-rate * dt);
    // Exact exponential integration, including the distance covered while accelerating.
    const step = target * dt + (this.velocity - target) * (1 - decay) / rate;
    this.distance += step;
    this.travel = this.distance % WORLD_PERIOD;
    this.velocity = target + (this.velocity - target) * decay;
    this.intensity = this.velocity / MAX_WORLD_VELOCITY;
    // A delayed velocity creates small inertial offsets without noisy acceleration derivatives.
    this.lag = MathUtils.damp(this.lag, this.intensity, 1.8, dt);
    this.phase = (this.phase + dt * 0.14) % (Math.PI * 2);
  }

  formationX(x: number) {
    return MathUtils.euclideanModulo(x - this.travel + WORLD_PERIOD / 2, WORLD_PERIOD) - WORLD_PERIOD / 2;
  }

  /** Near scenery recycles entirely outside the viewport; its period differs from
   * the terrain, so the complete composition does not repeat on every terrain lap. */
  foregroundX(x: number, halfWidth: number, rate: number) {
    const halfPeriod = Math.max(36, halfWidth + 12);
    return MathUtils.euclideanModulo(x - this.distance * rate + halfPeriod, halfPeriod * 2) - halfPeriod;
  }
}
