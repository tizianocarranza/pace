"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import * as THREE from "three";
import { PIP_FLOOR_Y, type FootContact } from "./pipContacts";
import { type PipMotionRef } from "./usePipMotion";

type SpeedLinesProps = {
  motion: PipMotionRef;
  /** Used for silhouette clearance and foot contacts, never to anchor the air. */
  origin?: RefObject<THREE.Group | null>;
};

const AIR_SLOTS = 3;
const FOOT_SLOTS = 3;
const SLOT_COUNT = AIR_SLOTS + FOOT_SLOTS;
const SEGMENTS = 16;
const TAU = Math.PI * 2;

type Passage = {
  progress: number;
  wait: number;
  rate: number;
  x: number;
  y: number;
  z: number;
  span: number;
  length: number;
  width: number;
  bend: number;
  opacity: number;
};

type Simulation = {
  seed: number;
  speed: number;
  contactSequences: [number, number];
  wasActive: boolean;
  nextFoot: number;
  passages: Passage[];
};

function createSimulation(): Simulation {
  return {
    seed: 73129,
    speed: 0,
    contactSequences: [0, 0],
    wasActive: false,
    nextFoot: AIR_SLOTS,
    passages: Array.from({ length: SLOT_COUNT }, (_, index) => ({
      progress: -1,
      wait: 0.4 + index * 1.15,
      rate: 1,
      x: 0,
      y: 0,
      z: 0,
      span: 0,
      length: 0,
      width: 0,
      bend: 0,
      opacity: 0,
    })),
  };
}

function random(simulation: Simulation) {
  simulation.seed = (Math.imul(simulation.seed, 1664525) + 1013904223) >>> 0;
  return simulation.seed / 4294967296;
}

function startPassage(
  simulation: Simulation,
  passage: Passage,
  slot: number,
  viewportWidth: number,
) {
  passage.progress = 0;
  passage.rate = 0.18 + random(simulation) * 0.06;
  passage.length = 1.8 + random(simulation) * 1.7;
  passage.width = 0.030 + random(simulation) * 0.017;
  passage.bend = (random(simulation) - 0.5) * 0.10;
  passage.opacity = 0.18 + random(simulation) * 0.06;
  passage.span = Math.min(viewportWidth * 0.46, 7.0) + passage.length * 0.55;

  // Separate environmental depths, with ample empty space between passages.
  // The middle distance can pass either side of Pip, but never touch his outline.
  if (slot === 0) {
    passage.y = 1.25 + random(simulation) * 0.30;
    passage.z = -0.45 - random(simulation) * 0.70;
  } else if (slot === 1) {
    passage.y = -0.15 + random(simulation) * 0.85;
    passage.z = -1.2 - random(simulation) * 1.1;
    passage.opacity *= 0.78;
  } else {
    passage.y = -1.24 - random(simulation) * 0.20;
    passage.z = 0.05 + random(simulation) * 0.24;
    passage.opacity *= 0.80;
  }
}

function footContact(simulation: Simulation, foot: FootContact) {
  const passage = simulation.passages[simulation.nextFoot];
  simulation.nextFoot = AIR_SLOTS + (simulation.nextFoot - AIR_SLOTS + 1) % FOOT_SLOTS;
  passage.progress = 0;
  passage.rate = 1 / (0.32 + random(simulation) * 0.16);
  // Capture the actual landing location once, then let the accent drift away.
  passage.x = foot.point.x + (random(simulation) - 0.5) * 0.04;
  passage.y = PIP_FLOOR_Y + 0.015;
  passage.z = foot.point.z;
  passage.length = 0.10 + random(simulation) * 0.06;
  passage.width = 0.035 + random(simulation) * 0.015;
  passage.opacity = (0.16 + random(simulation) * 0.04) * foot.impact;
  passage.bend = 0;
}

const vertexShader = /* glsl */ `
  uniform vec4 uPositions[${SLOT_COUNT}];
  uniform vec4 uShapes[${SLOT_COUNT}];
  uniform vec2 uPipPosition;
  uniform float uStrength;
  attribute float aSlot;
  varying vec2 vUv;
  varying float vOpacity;
  varying float vGround;

  vec2 projectPoint(vec3 p) {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    return clip.xy / clip.w;
  }

  void main() {
    int slot = int(aSlot);
    vec4 center = uPositions[slot];
    vec4 shape = uShapes[slot];
    vUv = uv;
    vGround = shape.w;
    vec3 p = center.xyz;
    p.x += (uv.x - 0.5) * shape.x;
    p.y += sin(uv.x * 3.14159265) * shape.z;
    p.y += (uv.y * 2.0 - 1.0) * shape.y;
    vOpacity = center.w * uStrength;

    if (shape.w < 0.5) {
      // Fade the WHOLE passage before it meets the silhouette. Cutting only
      // fragments would leave line ends hugging Pip, resembling attached hairs.
      vec3 pip = vec3(uPipPosition, 0.0);
      vec2 pipScreen = projectPoint(pip);
      vec2 halo = vec2(
        abs(projectPoint(pip + vec3(1.95, 0.0, 0.0)).x - pipScreen.x),
        abs(projectPoint(pip + vec3(0.0, 1.03, 0.0)).y - pipScreen.y)
      );
      vec2 middle = projectPoint(center.xyz);
      vec2 extent = abs(projectPoint(center.xyz + vec3(shape.x * 0.5, 0.0, 0.0)) - middle);
      extent.y += abs(projectPoint(center.xyz + vec3(0.0, abs(shape.z) + shape.y, 0.0)).y - middle.y);
      vec2 distanceToPassage = max(abs(middle - pipScreen) - extent, vec2(0.0));
      float clearance = length(distanceToPassage / max(halo, vec2(0.0001)));
      vOpacity *= smoothstep(1.0, 1.35, clearance);
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vOpacity;
  varying float vGround;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float alpha;
    if (vGround > 0.5) {
      float r = dot(p, p);
      alpha = exp(-3.0 * r) * (1.0 - smoothstep(0.35, 1.0, r));
    } else {
      float edge = exp(-4.0 * p.y * p.y) * (1.0 - smoothstep(0.5, 1.0, abs(p.y)));
      float ends = smoothstep(0.0, 0.30, vUv.x) * (1.0 - smoothstep(0.70, 1.0, vUv.x));
      alpha = edge * ends;
    }
    gl_FragColor = vec4(uColor, alpha * vOpacity);
    #include <colorspace_fragment>
  }
`;

function createGeometryData() {
  const positions = new Float32Array((SEGMENTS + 1) * 6);
  const uvs = new Float32Array((SEGMENTS + 1) * 4);
  const indices = new Uint16Array(SEGMENTS * 6);
  for (let segment = 0; segment <= SEGMENTS; segment++) {
    const u = segment / SEGMENTS;
    for (let edge = 0; edge < 2; edge++) {
      const vertex = segment * 2 + edge;
      positions.set([u, edge, 0], vertex * 3);
      uvs.set([u, edge], vertex * 2);
    }
    if (segment < SEGMENTS) {
      const vertex = segment * 2;
      indices.set([vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3], segment * 6);
    }
  }
  return {
    positions,
    uvs,
    indices,
    slots: Float32Array.from({ length: SLOT_COUNT }, (_, index) => index),
  };
}

export function SpeedLines({
  motion,
  origin,
}: SpeedLinesProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const simulation = useRef<Simulation | null>(null);
  const data = useMemo(() => createGeometryData(), []);
  const uniforms = useMemo(
    () => ({
      uPositions: { value: Array.from({ length: SLOT_COUNT }, () => new THREE.Vector4()) },
      uShapes: { value: Array.from({ length: SLOT_COUNT }, () => new THREE.Vector4()) },
      uPipPosition: { value: new THREE.Vector2() },
      uStrength: { value: 0 },
      uColor: { value: new THREE.Color("#918c85") },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (!material.current || !mesh.current) return;
    const sim = simulation.current ?? (simulation.current = createSimulation());
    const live = material.current.uniforms;
    const positions = live.uPositions.value as THREE.Vector4[];
    const shapes = live.uShapes.value as THREE.Vector4[];
    const movement = motion.current;

    if (!movement?.active) {
      if (sim.wasActive) {
        for (let index = 0; index < SLOT_COUNT; index++) {
          sim.passages[index].progress = -1;
          sim.passages[index].wait = 0.3 + index * 1.1 + random(sim) * 0.6;
          positions[index].w = 0;
        }
      }
      sim.wasActive = false;
      sim.speed = 0;
      sim.contactSequences[0] = movement?.contacts.feet[0].sequence ?? 0;
      sim.contactSequences[1] = movement?.contacts.feet[1].sequence ?? 0;
      live.uStrength.value = 0;
      mesh.current.visible = false;
      return;
    }
    sim.wasActive = true;
    const dt = Math.min(delta, 0.05);
    // The field shares Pip's inertia and error recovery, rather than smoothing
    // the WPM a second time and falling out of sync with his motion.
    sim.speed = movement.speed;
    const strength = movement.reducedMotion ? 0
      : Math.pow(THREE.MathUtils.smoothstep(sim.speed, 0.15, 1), 2.4) * (1 - movement.stumble * 0.6);
    const pipX = origin?.current?.position.x ?? 0;
    const pipY = origin?.current?.position.y ?? 0;
    live.uPipPosition.value.set(pipX, pipY);
    live.uStrength.value = strength;

    for (let index = 0; index < 2; index++) {
      const foot = movement.contacts.feet[index];
      if (foot.sequence !== sim.contactSequences[index]) {
        if (strength > 0.0001 && foot.impact > 0) footContact(sim, foot);
        sim.contactSequences[index] = foot.sequence;
      }
    }

    let movingAir = 0;
    for (let index = 0; index < AIR_SLOTS; index++) {
      if (sim.passages[index].progress >= 0) movingAir++;
    }
    for (let index = 0; index < SLOT_COUNT; index++) {
      const passage = sim.passages[index];
      const ground = index >= AIR_SLOTS;
      if (passage.progress < 0) {
        positions[index].w = 0;
        if (!ground) {
          passage.wait -= dt;
          if (passage.wait <= 0 && movingAir < 2 && strength > 0.0001) {
            startPassage(sim, passage, index, state.viewport.width);
            movingAir++;
          }
        }
        if (passage.progress < 0) continue;
      }
      passage.progress += dt * passage.rate * (ground ? 1 : 0.45 + sim.speed * 1.5);
      const t = passage.progress;
      if (t >= 1) {
        passage.progress = -1;
        passage.wait = 1.8 + random(sim) * 3.2;
        positions[index].w = 0;
        if (!ground) movingAir--;
        continue;
      }
      const envelope = THREE.MathUtils.smoothstep(t, 0, ground ? 0.10 : 0.15)
        * (1 - THREE.MathUtils.smoothstep(t, ground ? 0.22 : 0.72, 1));
      if (ground) {
        passage.x -= dt * (0.65 + sim.speed * 1.3);
        positions[index].set(
          passage.x,
          passage.y + Math.sin(t * Math.PI) * 0.08,
          passage.z,
          envelope * passage.opacity,
        );
        shapes[index].set(passage.length * (1 + t), passage.width * (1 + t * 0.6), 0, 1);
      } else {
        const x = passage.span * (1 - 2 * t);
        positions[index].set(
          x,
          passage.y + Math.sin(t * TAU) * 0.025,
          passage.z,
          envelope * passage.opacity,
        );
        shapes[index].set(passage.length, passage.width, passage.bend, 0);
      }
    }
    // The visibility cutoff only discards imperceptible alpha.
    mesh.current.visible = strength > 0.0001;
  });

  return (
    <mesh ref={mesh} name="PipEnvironmentMotion" frustumCulled={false}>
      {/* Shader displacement exceeds the base bounds. R3F owns resource disposal. */}
      <instancedBufferGeometry instanceCount={SLOT_COUNT}>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-uv" args={[data.uvs, 2]} />
        <bufferAttribute attach="index" args={[data.indices, 1]} />
        <instancedBufferAttribute attach="attributes-aSlot" args={[data.slots, 1]} />
      </instancedBufferGeometry>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        depthTest
        toneMapped={false}
        side={THREE.DoubleSide}
        forceSinglePass
      />
    </mesh>
  );
}
