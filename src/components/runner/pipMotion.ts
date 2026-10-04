import * as THREE from "three";
import { createContacts, createContactSampler, resetContacts, type PipContacts } from "./pipContacts";

export type PipStatus = "idle" | "running" | "finished";
export type PipMotionSignals = {
  speed: number;
  acceleration: number;
  locomotion: number;
  stumble: number;
  active: boolean;
  reducedMotion: boolean;
  contacts: PipContacts;
};

type Spring = { value: number; velocity: number };

// Exact damped oscillator: consistent compression/release at 30, 60 or 120 Hz.
function springStep(spring: Spring, delta: number) {
  const frequency = 19;
  const drag = frequency * 0.72;
  const damped = frequency * Math.sqrt(1 - 0.72 ** 2);
  const decay = Math.exp(-drag * delta);
  const sine = Math.sin(damped * delta);
  const cosine = Math.cos(damped * delta);
  const value = spring.value;
  const velocity = spring.velocity;
  spring.value = decay * (value * cosine + (velocity + drag * value) / damped * sine);
  spring.velocity = decay * (velocity * cosine
    - (drag * velocity + frequency ** 2 * value) / damped * sine);
}

/** Owns visual motion only. Scoring and the typing engine never depend on it. */
export class PipMotion {
  readonly signals: PipMotionSignals = {
    speed: 0, acceleration: 0, locomotion: 0, stumble: 0,
    active: false, reducedMotion: false, contacts: createContacts(),
  };
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly run: THREE.AnimationAction;
  private readonly stumble: THREE.AnimationAction;
  private readonly sampleContacts: ReturnType<typeof createContactSampler>;
  private readonly body: THREE.Mesh | undefined;
  private readonly bodyBone: THREE.Bone | undefined;
  private readonly squashIndex: number | undefined;
  private readonly stretchIndex: number | undefined;
  private readonly compression: Spring = { value: 0, velocity: 0 };
  private readonly viewProjection = new THREE.Matrix4();
  private readonly rightFrustumPlane = new THREE.Plane();
  private previousStatus: PipStatus = "idle";
  private previousErrors = 0;
  private stumbling = false;
  private finishCycles = 0;
  private exitVelocity = 0;
  private exited = false;

  constructor(
    private readonly model: THREE.Group,
    private readonly placement: THREE.Group,
    clips: THREE.AnimationClip[],
  ) {
    const idle = clips.find((clip) => clip.name === "Idle");
    const run = clips.find((clip) => clip.name === "Run");
    const stumble = clips.find((clip) => clip.name === "Stumble");
    if (!idle || !run || !stumble) throw new Error("Pip requires Idle, Run and Stumble clips.");
    this.mixer = new THREE.AnimationMixer(model);
    this.idle = this.mixer.clipAction(idle);
    this.run = this.mixer.clipAction(run);
    this.stumble = this.mixer.clipAction(stumble);
    this.stumble.setLoop(THREE.LoopOnce, 1);
    this.stumble.clampWhenFinished = true;
    const body = model.getObjectByName("PipBody");
    const bone = model.getObjectByName("Body");
    this.body = body instanceof THREE.Mesh ? body : undefined;
    this.bodyBone = bone instanceof THREE.Bone ? bone : undefined;
    this.squashIndex = this.body?.morphTargetDictionary?.Squash;
    this.stretchIndex = this.body?.morphTargetDictionary?.Stretch;
    this.sampleContacts = createContactSampler(model);
    this.reset(0);
  }

  private reset(errors: number) {
    this.mixer.stopAllAction();
    this.idle.reset().setEffectiveWeight(1).play();
    this.run.reset().setEffectiveWeight(0).play();
    this.run.paused = true;
    this.stumbling = false;
    this.previousErrors = errors;
    this.finishCycles = 0;
    this.exitVelocity = 0;
    this.exited = false;
    this.compression.value = this.compression.velocity = 0;
    this.signals.speed = this.signals.acceleration = this.signals.locomotion = this.signals.stumble = 0;
    this.signals.active = false;
    this.placement.position.set(0, 0, 0);
    this.placement.rotation.set(0, 0, 0);
    this.placement.visible = true;
    resetContacts(this.signals.contacts);
  }

  /** Returns true once, only when the complete silhouette has left the camera. */
  update(
    delta: number,
    intensity: number,
    lastCorrectAt: number | null,
    errors: number,
    status: PipStatus,
    now: number,
    camera: THREE.Camera,
    viewportWidth: number,
  ): boolean {
    const dt = THREE.MathUtils.clamp(delta, 0, 0.05);
    if (dt === 0) return false;
    const motion = this.signals;
    const reduced = motion.reducedMotion ? 0 : 1;
    if (status === "idle" && this.previousStatus !== "idle") this.reset(errors);
    if (status === "running" && this.previousStatus === "idle") {
      this.compression.velocity += 1.1 * reduced;
    }
    if (status === "finished" && this.previousStatus !== "finished") {
      // The charge is measured in strides, so it belongs to the running cadence.
      this.finishCycles = 0;
      this.stumbling = false;
      this.stumble.stop();
      this.compression.velocity += 1.6 * reduced;
    }
    this.previousStatus = status;
    if (this.exited) return false;

    if (errors > this.previousErrors && status !== "finished") {
      if (!this.stumbling) {
        this.stumble.reset().setEffectiveTimeScale(1.4).play();
        this.stumbling = true;
        motion.speed *= 0.72;
        this.compression.velocity += 1.5 * reduced;
      }
      // Further errors register in gameplay but never pin the clip at frame zero.
    }
    this.previousErrors = errors;
    if (this.stumbling && this.stumble.time >= this.stumble.getClip().duration) {
      this.stumbling = false;
      this.stumble.stop();
    }
    const stumblePhase = this.stumbling ? this.stumble.time / this.stumble.getClip().duration : 1;
    const stumbleEnvelope = this.stumbling
      ? THREE.MathUtils.smoothstep(stumblePhase, 0, 0.09)
        * (1 - THREE.MathUtils.smoothstep(stumblePhase, 0.55, 1))
      : 0;
    motion.stumble = stumbleEnvelope;

    const input = Number.isFinite(intensity) ? THREE.MathUtils.clamp(intensity, 0, 1) : 0;
    const age = lastCorrectAt === null ? Infinity : Math.max(0, (now - lastCorrectAt) / 1000);
    const grace = THREE.MathUtils.lerp(0.95, 0.38, input);
    // WPM remains a four-second statistic. Visual intent starts coasting sooner.
    const intent = input * Math.exp(-Math.max(0, age - grace) * 3.2);
    const target = status === "finished" ? 1 : status === "idle" ? 0
      : intent * (1 - stumbleEnvelope * 0.55);
    const previousSpeed = motion.speed;
    motion.speed = THREE.MathUtils.damp(motion.speed, target, target > motion.speed ? 5.5 : 3.2, dt);
    motion.acceleration = THREE.MathUtils.damp(
      motion.acceleration, (motion.speed - previousSpeed) / dt, 7, dt,
    );
    motion.locomotion = THREE.MathUtils.smoothstep(motion.speed, 0.003, 0.15);
    motion.active = status !== "idle" || this.stumbling;

    const sprint = THREE.MathUtils.smoothstep(motion.speed, 0.55, 1);
    const cadence = 0.62 + 1.18 * Math.sqrt(motion.speed) + sprint * 0.24;
    this.run.setEffectiveTimeScale(motion.reducedMotion ? Math.min(cadence, 1.15)
      : status === "finished" ? 2.35 : cadence);
    this.run.paused = motion.locomotion < 0.001;
    const stumbleWeight = stumbleEnvelope * (motion.reducedMotion ? 0.15 : 0.62);
    this.idle.setEffectiveWeight((1 - motion.locomotion) * (1 - stumbleWeight));
    this.run.setEffectiveWeight(motion.locomotion * (1 - stumbleWeight));
    this.stumble.setEffectiveWeight(stumbleWeight);
    this.mixer.update(dt);

    let landing = 0;
    for (const foot of motion.contacts.feet) landing = Math.max(landing, foot.impact);
    this.compression.velocity += landing * (1.4 + motion.speed * 1.8) * reduced;
    springStep(this.compression, dt);
    const compression = Math.max(0, this.compression.value);
    const release = Math.max(0, -this.compression.value);
    const acceleration = THREE.MathUtils.clamp(motion.acceleration, -1.5, 1.5);
    if (this.bodyBone) {
      // The animated body pivot leaves the feet planted. The mixer restores
      // its authored rotation each frame before these small additions.
      this.bodyBone.rotateX((motion.speed * 0.045 + acceleration * 0.018) * reduced * (1 - stumbleEnvelope));
    }
    if (this.body?.morphTargetInfluences) {
      if (this.squashIndex !== undefined) {
        this.body.morphTargetInfluences[this.squashIndex] = Math.min(0.18, compression);
      }
      if (this.stretchIndex !== undefined) {
        this.body.morphTargetInfluences[this.stretchIndex] = reduced * (1 - stumbleEnvelope)
          * Math.min(0.30, motion.speed ** 2 * 0.23 + Math.max(0, acceleration) * 0.025 + release);
      }
    }

    // No artificial hover offset: the authored soles can reach the studio floor.
    this.placement.rotation.y = THREE.MathUtils.damp(
      this.placement.rotation.y, Math.PI / 3 * THREE.MathUtils.smoothstep(motion.speed, 0, 0.10), 5, dt,
    );
    if (status === "finished") {
      this.finishCycles += dt * this.run.getEffectiveTimeScale() / this.run.getClip().duration;
      const launch = motion.reducedMotion ? 1 : THREE.MathUtils.smoothstep(this.finishCycles, 0.08, 0.38);
      const exitSpeed = THREE.MathUtils.clamp(viewportWidth * 0.60, 7.5, 22);
      this.exitVelocity = THREE.MathUtils.damp(this.exitVelocity, exitSpeed * launch, 4.5, dt);
      this.placement.position.x += this.exitVelocity * dt;
      // Test a conservative sphere against the camera's right plane. Projecting
      // just an X offset misses the far side of the body on wide perspectives.
      this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const e = this.viewProjection.elements;
      this.rightFrustumPlane.setComponents(
        e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12],
      ).normalize();
      if (this.rightFrustumPlane.distanceToPoint(this.placement.position) < -1.9) {
        this.exited = true;
        this.placement.visible = false;
        motion.active = false;
        motion.contacts.ready = false;
        return true;
      }
    }
    this.sampleContacts(motion.contacts, dt, motion.locomotion,
      motion.locomotion > 0.1 && !this.stumbling && !motion.reducedMotion);
    return false;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    if (this.body?.morphTargetInfluences) {
      if (this.squashIndex !== undefined) this.body.morphTargetInfluences[this.squashIndex] = 0;
      if (this.stretchIndex !== undefined) this.body.morphTargetInfluences[this.stretchIndex] = 0;
    }
    this.signals.contacts.ready = false;
  }
}
