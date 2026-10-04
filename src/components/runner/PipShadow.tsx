"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { PIP_FLOOR_Y } from "./pipContacts";
import { type PipMotionRef } from "./usePipMotion";

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uLeft;
  uniform vec3 uRight;
  uniform vec3 uColor;
  varying vec3 vWorld;

  float contact(vec3 foot) {
    float lift = max(foot.z, 0.0);
    vec2 radius = vec2(0.20, 0.26) + lift * vec2(0.22, 0.28);
    vec2 p = (vWorld.xz - foot.xy) / radius;
    return 0.24 * exp(-2.3 * dot(p, p)) * exp(-5.5 * lift);
  }

  void main() {
    vec2 center = (uLeft.xy + uRight.xy) * 0.5;
    float lift = max(0.0, (uLeft.z + uRight.z) * 0.5);
    vec2 p = (vWorld.xz - center) / (vec2(1.05, 0.90) + lift * 0.2);
    // A nearly invisible penumbra joins the two small contacts. Gaussian tails
    // dissolve before the plane boundary, so there is no visible oval edge.
    float broad = 0.022 * exp(-2.0 * dot(p, p));
    float near = 0.025 * exp(-5.0 * dot(p, p));
    float alpha = contact(uLeft) + contact(uRight)
      + (broad + near) * exp(-1.5 * lift);
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

export function PipShadow({ motion }: { motion: PipMotionRef }) {
  const shadow = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    uLeft: { value: new THREE.Vector3() },
    uRight: { value: new THREE.Vector3() },
    uColor: { value: new THREE.Color("#77736f") },
  }), []);

  useFrame(() => {
    if (!shadow.current || !material.current) return;
    const contacts = motion.current?.contacts;
    shadow.current.visible = contacts?.ready ?? false;
    if (!contacts?.ready) return;
    const [left, right] = contacts.feet;
    const live = material.current.uniforms;
    live.uLeft.value.set(left.point.x, left.point.z, left.height);
    live.uRight.value.set(right.point.x, right.point.z, right.height);
    shadow.current.position.set(
      (left.point.x + right.point.x) * 0.5,
      PIP_FLOOR_Y,
      (left.point.z + right.point.z) * 0.5,
    );
  });

  return (
    <mesh ref={shadow} rotation-x={-Math.PI / 2} position-y={PIP_FLOOR_Y} renderOrder={-1}>
      {/* R3F owns both resources; no shadow maps or extra rendering passes. */}
      <planeGeometry args={[5, 4]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
