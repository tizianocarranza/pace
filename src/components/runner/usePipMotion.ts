"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { PipMotion, type PipMotionSignals, type PipStatus } from "./pipMotion";

export type PipMotionRef = RefObject<PipMotionSignals | null>;

export function usePipMotion(
  model: THREE.Group,
  placement: RefObject<THREE.Group | null>,
  clips: THREE.AnimationClip[],
  intensity: number,
  lastCorrectAt: number | null,
  errorCount: number,
  status: PipStatus,
  onFinishExit?: () => void,
  sustainedInput = false,
) {
  const controller = useRef<PipMotion | null>(null);
  const signals = useRef<PipMotionSignals | null>(null);

  useLayoutEffect(() => {
    if (!placement.current) return;
    const motion = new PipMotion(model, placement.current, clips);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => { motion.signals.reducedMotion = preference.matches; };
    updatePreference();
    preference.addEventListener("change", updatePreference);
    controller.current = motion;
    signals.current = motion.signals;
    return () => {
      preference.removeEventListener("change", updatePreference);
      motion.dispose();
      controller.current = null;
      signals.current = null;
    };
  }, [model, placement, clips]);

  // Explicit order: animation/pose -> sole samples -> shadow and environment.
  // Negative priority preserves R3F's automatic rendering.
  useFrame((state, delta) => {
    const finished = controller.current?.update(
      delta, intensity, lastCorrectAt, errorCount, status, Date.now(), state.camera,
      // R3F's viewport estimate ignores camera view offsets. Read the horizontal
      // projection so extending the studio upward preserves the exit velocity.
      2 * state.camera.position.length() / state.camera.projectionMatrix.elements[0],
      sustainedInput,
    );
    if (finished) onFinishExit?.();
  }, -1);

  return signals;
}
