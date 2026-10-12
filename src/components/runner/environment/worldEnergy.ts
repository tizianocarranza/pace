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
    // Quiet at low speed, established at 60, with restrained remaining headroom.
    const target = MathUtils.smoothstep(intensity, 0.2, 1);
    const energy = this.value;
    energy.x = MathUtils.damp(energy.x, target, target > energy.x ? 3.2 : 2.2, dt);
    energy.y = MathUtils.damp(energy.y, target * target, target > energy.y ? 0.9 : 1.1, dt);
    energy.z = MathUtils.damp(energy.z, Math.max(0, intensity - world.lag), 5, dt);
    energy.w = interrupted ? 1 : MathUtils.damp(energy.w, 0, 3.6, dt);
    // All light paths use this clock. Travel still comes from the physical world.
    this.phase = (this.phase + dt * (world.velocity * 0.095)) % (Math.PI * 2);
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
    // Overlapping broad catches sustain surface response through traversal,
    // rather than a brief synchronized flash followed by a long empty interval.
    float first = pow(0.5 + 0.5 * sin(phase), 6.0);
    float second = pow(0.5 + 0.5 * sin(point.x * 0.66 + point.z * 0.64 + point.y * 0.96 + uEnergyPhase * 3.0 + 2.1), 8.0);
    return min(1.0, first * 0.72 + second * 0.48);
  }
`;
