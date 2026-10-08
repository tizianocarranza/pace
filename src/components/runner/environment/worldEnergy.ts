import { MathUtils, Vector4 } from "three";
import { type PipMotionSignals, type PipStatus } from "../pipMotion";
import { type LandscapeMotion } from "./worldMotion";

/** Visual memory of the existing momentum, never a second WPM or gameplay model. */
export class WorldEnergy {
  // Strength, sustained coherence, acceleration catch, local interruption.
  readonly value = new Vector4();
  phase = 0;
  private seenStumble = 0;

  update(delta: number, motion: PipMotionSignals | null, world: LandscapeMotion, status: PipStatus) {
    const dt = Number.isFinite(delta) ? MathUtils.clamp(delta, 0, 0.05) : 0;
    const sequence = motion?.stumbleSequence ?? 0;
    const interrupted = sequence !== this.seenStumble;
    this.seenStumble = sequence;
    if (status === "idle" || !motion?.active || motion.reducedMotion) {
      this.value.set(0, 0, 0, 0);
      if (status === "idle") this.phase = 0;
      return;
    }
    const intensity = MathUtils.clamp(world.intensity, 0, 1);
    const target = intensity * intensity;
    const energy = this.value;
    energy.x = MathUtils.damp(energy.x, target, target > energy.x ? 3.2 : 2.2, dt);
    energy.y = MathUtils.damp(energy.y, target * target, 0.65, dt);
    energy.z = MathUtils.damp(energy.z, Math.max(0, intensity - world.lag), 5, dt);
    energy.w = interrupted ? 1 : MathUtils.damp(energy.w, 0, 3.6, dt);
    // All light paths use this clock. Travel still comes from the physical world.
    this.phase = (this.phase + dt * (0.13 + world.velocity * 0.065)) % (Math.PI * 2);
  }
}

/** Shared optical response: a nearby stumble interrupts light, never the whole scene. */
export const energyField = /* glsl */ `
  uniform vec4 uEnergy;
  uniform float uEnergyPhase;
  float energyContinuity(vec3 point) {
    vec2 local = point.xz / vec2(3.4, 4.5);
    return 1.0 - uEnergy.w * exp(-dot(local, local)) * 0.92;
  }
  float energySweep(vec3 point) {
    float phase = point.x * 0.48 + point.z * 0.24 + point.y * 0.7 + uEnergyPhase * 2.0;
    return pow(0.5 + 0.5 * sin(phase), 10.0);
  }
`;
