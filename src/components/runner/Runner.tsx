"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import * as THREE from "three";
import { Pip } from "./Pip";
import { EnvironmentLighting } from "./environment/EnvironmentLighting";
import { frameComposition } from "./composition";
import { StudioEnvironment } from "./environment/StudioEnvironment";
import { NightMix } from "./environment/NightMix";
import { SkyBodies } from "./environment/SkyBodies";

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

const hidden: THREE.Object3D[] = [];

/** Runs `work` with every hidden object shown (light trails at rest, the genesis core, the
 * sky body of the other theme), then hides them again. */
function withHiddenShown<T>(scene: THREE.Scene, work: () => T): T {
  hidden.length = 0;
  scene.traverse(object => { if (!object.visible) hidden.push(object); });
  try {
    for (const object of hidden) object.visible = true;
    return work();
  } finally {
    for (const object of hidden) object.visible = false;
    hidden.length = 0;
  }
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
      // compile() only links programs; the driver finishes them on first draw (~70 ms per
      // program on ANGLE/D3D11). Draw everything once while the canvas is still transparent,
      // so the first trail or the first theme switch never stalls mid-run.
      try { withHiddenShown(scene, () => gl.render(scene, camera)); } catch { /* only a warm-up */ }
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => { if (!cancelled) onReady(); });
      });
    };
    // compile() only walks visible objects, so the hidden ones are shown for its synchronous
    // part; the polling that follows needs no scene.
    // A failed precompile only costs the stall it was meant to avoid; never keep the loader up.
    withHiddenShown(scene, () => gl.compileAsync(scene, camera)).then(presented, presented);
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
          <NightMix />
          <SkyBodies />
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
