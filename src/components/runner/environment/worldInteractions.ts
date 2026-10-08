import * as THREE from "three";
import { PIP_FLOOR_Y } from "../pipContacts";
import { type PipMotionSignals, type PipStatus } from "../pipMotion";
import { type LandscapeMotion } from "./worldMotion";

export const IMPULSE_CAPACITY = 8;
export type PhysicalImpulse = {
  position: THREE.Vector3;
  originX: number;
  distanceAtBirth: number;
  strength: number;
  radius: number;
  age: number;
  lifetime: number;
  kind: "landing" | "stumble";
};

/** Fixed storage for physical events. Positions travel with the contacted terrain,
 * using unwrapped distance so a terrain recycle cannot teleport a live response. */
export class WorldInteractions {
  readonly impulses: PhysicalImpulse[] = Array.from({ length: IMPULSE_CAPACITY }, () => ({
    position: new THREE.Vector3(), originX: 0, distanceAtBirth: 0,
    strength: 0, radius: 0, age: 0, lifetime: 0, kind: "landing",
  }));
  readonly packed = Array.from({ length: IMPULSE_CAPACITY }, () => new THREE.Vector4());
  readonly parameters = Array.from({ length: IMPULSE_CAPACITY }, () => new THREE.Vector4());
  private readonly seenFeet = [0, 0];
  private seenStumble = 0;
  private cursor = 0;
  private previousStatus: PipStatus = "idle";

  private emit(x: number, z: number, strength: number, distance: number, kind: PhysicalImpulse["kind"]) {
    const impulse = this.impulses[this.cursor];
    this.cursor = (this.cursor + 1) % IMPULSE_CAPACITY;
    impulse.position.set(x, PIP_FLOOR_Y, z);
    impulse.originX = x;
    impulse.distanceAtBirth = distance;
    impulse.strength = strength;
    impulse.radius = kind === "landing" ? 2.65 : 3.1;
    impulse.age = 0;
    impulse.lifetime = kind === "landing" ? 0.85 : 1.1;
    impulse.kind = kind;
  }

  update(delta: number, motion: PipMotionSignals | null, world: LandscapeMotion, status: PipStatus) {
    const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, 0.05) : 0;
    const reset = status === "idle" && this.previousStatus !== "idle";
    this.previousStatus = status;
    const contacts = motion?.contacts;
    const suppressed = reset || !contacts?.ready || motion?.reducedMotion || !motion?.active;
    for (let i = 0; i < IMPULSE_CAPACITY; i++) {
      const impulse = this.impulses[i];
      impulse.age += dt;
      if (suppressed || impulse.age >= impulse.lifetime) impulse.strength = 0;
      impulse.position.x = impulse.originX - (world.distance - impulse.distanceAtBirth);
    }
    if (contacts?.ready && !suppressed) {
      for (let i = 0; i < 2; i++) {
        const foot = contacts.feet[i];
        if (foot.sequence !== this.seenFeet[i] && foot.impact > 0) {
          // Measured landing velocity supplies the event energy; intensity scales it continuously.
          const energy = foot.impact * (0.12 + 0.88 * motion.speed ** 1.5);
          this.emit(foot.point.x, foot.point.z, energy, world.distance, "landing");
        }
      }
      if (motion.stumbleSequence !== this.seenStumble) {
        const left = contacts.feet[0], right = contacts.feet[1];
        // One offset disturbance per accepted Stumble, never one per mistyped key.
        const foot = left.height < right.height ? left : right;
        this.emit(foot.point.x - 0.18, foot.point.z + 0.12,
          0.65 + motion.speed * 0.55, world.distance, "stumble");
      }
    }
    for (let i = 0; i < 2; i++) this.seenFeet[i] = contacts?.feet[i].sequence ?? 0;
    this.seenStumble = motion?.stumbleSequence ?? 0;
    for (let i = 0; i < IMPULSE_CAPACITY; i++) {
      const impulse = this.impulses[i];
      this.packed[i].set(impulse.position.x, impulse.position.z, impulse.strength, impulse.age);
      this.parameters[i].set(impulse.radius, impulse.lifetime,
        impulse.kind === "stumble" ? 1 : 0, impulse.position.y);
    }
  }
}

/** Small reusable surface response. No expanding ring: a smooth, slightly elongated
 * pressure dent. Return height and its analytic X/Z derivatives for coherent lighting. */
export const interactionField = /* glsl */ `
  uniform vec4 uImpulses[${IMPULSE_CAPACITY}];
  uniform vec4 uImpulseParameters[${IMPULSE_CAPACITY}];
  vec3 contactPressure(vec2 point) {
    vec3 response = vec3(0.0);
    for (int i = 0; i < ${IMPULSE_CAPACITY}; i++) {
      vec4 event = uImpulses[i];
      if (event.z <= 0.0) continue;
      vec4 config = uImpulseParameters[i];
      vec2 d = point - event.xy;
      if (dot(d, d) > config.x * config.x) continue;
      float t = event.w / config.y;
      float envelope = (1.0 - exp(-50.0 * t)) * exp(-7.0 * t) * (1.0 - smoothstep(0.65, 1.0, t));
      vec2 width = vec2(0.65 + config.z * 0.22, 0.46) + event.w * vec2(0.24, 0.12);
      vec2 q = d / width;
      float height = -0.035 * event.z * envelope * exp(-dot(q, q));
      response += vec3(height, height * -2.0 * d / (width * width));
    }
    return response;
  }
  vec2 fragmentResponse(vec3 point) {
    vec2 response = vec2(0.0);
    for (int i = 0; i < ${IMPULSE_CAPACITY}; i++) {
      vec4 event = uImpulses[i];
      if (event.z <= 0.0) continue;
      vec4 config = uImpulseParameters[i];
      vec3 d = point - vec3(event.x, config.w, event.y);
      float distanceToContact = length(d);
      if (distanceToContact >= config.x) continue;
      float age = event.w - distanceToContact * 0.065;
      if (age <= 0.0) continue;
      float local = pow(1.0 - smoothstep(0.0, config.x, distanceToContact), 2.0);
      float settle = exp(-7.5 * age) * sin(age * 12.0) * (1.0 - smoothstep(0.65, 1.0, event.w / config.y));
      float energy = event.z * local * settle;
      response += vec2(0.12 * energy, 0.14 * energy * d.x / max(distanceToContact, 0.01));
    }
    return response;
  }
`;
