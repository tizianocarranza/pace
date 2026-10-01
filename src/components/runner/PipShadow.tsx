"use client";

import { useFrame } from "@react-three/fiber";
import { RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type PipShadowProps = {
  intensity: number;
  runPhase: RefObject<number>;
};

export function PipShadow({
  intensity,
  runPhase,
}: PipShadowProps) {
  const shadow = useRef<THREE.Mesh>(null);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uOpacity: { value: 0.4 },
        },
        vertexShader: `
          varying vec2 vUv;

          void main() {
            vUv = uv;

            gl_Position =
              projectionMatrix *
              modelViewMatrix *
              vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uOpacity;

          void main() {
            vec2 p = (vUv - 0.5) * 2.0;

            float alpha = exp(-dot(p, p) * 2.0);

            alpha *= 1.0 - smoothstep(
              0.7,
              1.0,
              length(p)
            );

            gl_FragColor = vec4(
              0.25,
              0.24,
              0.23,
              alpha * uOpacity
            );
          }
        `,
      }),
    [],
  );

  useFrame(() => {
    if (!shadow.current) return;

    /*
     * 0 → touching ground
     * 1 → highest point
     *
     * abs(sin()) gives us two little hops per
     * complete run cycle.
     */
    const airborne = Math.abs(
      Math.sin(runPhase.current * Math.PI * 2),
    );

    // Don't animate much while Pip is basically stopped.
    const movement = intensity * airborne;

    shadow.current.scale.x =
      1 + intensity * 0.2 + movement * 0.15;

    shadow.current.scale.y =
      0.18 + movement * 0.04;

    material.uniforms.uOpacity.value =
      0.4 - movement * 0.14;
  });

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return (
    <mesh
      ref={shadow}
      position={[0, -1.55, -0.3]}
      scale={[1, 0.18, 1]}
      material={material}
      renderOrder={-1}
    >
      <planeGeometry args={[1.5, 1.5]} />
    </mesh>
  );
}