import { MathUtils } from "three";
import { type PipMotionSignals, type PipStatus } from "../pipMotion";
import { WORLD_PERIOD } from "./terrainProfile";

// Preserve roughly six world units/s at 60 WPM with the extended visual curve.
export const MAX_WORLD_VELOCITY = 7.6;

/** One momentum source for the terrain, its light pools and the light trails. */
export class LandscapeMotion {
  velocity = 0;
  intensity = 0;
  distance = 0;
  travel = 0;
  lag = 0;
  visibility = 1;
  private previousStatus: PipStatus = "idle";

  update(delta: number, motion: PipMotionSignals | null, status: PipStatus) {
    const dt = Number.isFinite(delta) ? MathUtils.clamp(delta, 0, 0.05) : 0;
    if (status === "idle" && this.previousStatus !== "idle") {
      this.distance = this.travel = this.velocity = this.intensity = this.lag = 0;
      this.visibility = 1;
    }
    this.previousStatus = status;
    const active = status !== "idle" && motion?.active;
    const fade = status === "finished" && !motion?.active ? 0 : 1;
    this.visibility = MathUtils.damp(this.visibility, fade, 4, dt);
    // Freeze traversal without snapping the visible pose.
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
  }

  /** A world-anchored x, wrapped to the terrain period around the camera. */
  wrapX(x: number) {
    return MathUtils.euclideanModulo(x - this.travel + WORLD_PERIOD / 2, WORLD_PERIOD) - WORLD_PERIOD / 2;
  }
}
