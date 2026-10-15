"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import * as THREE from "three";
import { Pip } from "./Pip";
import { EnvironmentLighting } from "./environment/EnvironmentLighting";
import { frameComposition } from "./composition";
import { StudioEnvironment } from "./environment/StudioEnvironment";

type RunnerProps = {
  intensity: number;
  sustainedInput?: boolean;
  lastCorrectAt: number | null;
  errorCount: number;
  status: "idle" | "running" | "finished";
  onFinishExit?: () => void;
  className?: string;
};

function StudioFraming() {
  const { camera, size, scene, gl, raycaster } = useThree();
  useLayoutEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    // A read-only scene handle for the local screenshot harness, never gameplay state.
    const reviewWindow = window as Window & { __paceReview?: unknown };
    reviewWindow.__paceReview = { camera, scene, renderer: gl, raycaster };
    return () => { delete reviewWindow.__paceReview; };
  }, [camera, scene, gl, raycaster]);
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    frameComposition(camera, size.width, size.height);
    return () => camera.clearViewOffset();
  }, [camera, size.width, size.height]);
  return null;
}
export function Runner({
  intensity,
  sustainedInput = false,
  lastCorrectAt,
  errorCount,
  status,
  onFinishExit,
  className,
}: RunnerProps) {
  return (
    <div className={`relative ${className ?? ""}`} style={{ width: "100%" }}>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <Canvas
          camera={{
            position: [0, 1.2, 6],
            fov: 30,
          }}
          onCreated={({ camera }) => {
            camera.lookAt(0, 0, 0);
          }}
        >
          <StudioFraming />
          <StudioEnvironment />
          <EnvironmentLighting />

          <Pip
            intensity={intensity}
            sustainedInput={sustainedInput}
            lastCorrectAt={lastCorrectAt}
            errorCount={errorCount}
            status={status}
            onFinishExit={onFinishExit}
          />
        </Canvas>
      </div>
    </div>
  );
}
