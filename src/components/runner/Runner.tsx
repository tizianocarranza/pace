"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
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
  /** Development only: incrementing it replays the intro (Pip running in). */
  introReplay?: number;
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

/** Mounts with the rest of the scene (the Canvas suspends its children together while
 * Pip's GLB loads), compiles the shaders off the main thread where the driver allows,
 * then reports ready once a frame has been presented. */
function SceneReady({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    const presented = () => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => { if (!cancelled) onReady(); });
      });
    };
    // A failed precompile only costs the stall it was meant to avoid; never keep the loader up.
    gl.compileAsync(scene, camera).then(presented, presented);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [gl, scene, camera, onReady]);
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
  introReplay = 0,
}: RunnerProps) {
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);

  return (
    <div className={`relative ${className ?? ""}`} style={{ width: "100%" }}>
      <div
        className={`pointer-events-none fixed inset-0 -z-10 transition-opacity duration-700 ease-(--ease-out) ${
          ready ? "opacity-100" : "opacity-0"}`}
      >
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
            arrive={ready}
            introReplay={introReplay}
          />
          <SceneReady onReady={handleReady} />
        </Canvas>
      </div>
    </div>
  );
}
