"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { type PipFace } from "./pipFace";
import { PipMotion, type PipMotionSignals, type PipStatus } from "./pipMotion";

export type PipMotionRef = RefObject<PipMotionSignals | null>;

/** Live typing input. The page writes it after each render and Pip's frame loop reads it,
 * so keystrokes and the live WPM tick never re-render the 3D tree. */
export type PipInput = {
  intensity: number;
  sustainedInput: boolean;
  lastCorrectAt: number | null;
  errorCount: number;
};

export function usePipMotion(
  model: THREE.Group,
  placement: RefObject<THREE.Group | null>,
  clips: THREE.AnimationClip[],
  input: RefObject<PipInput>,
  status: PipStatus,
  onFinishExit?: () => void,
  face?: PipFace,
  arrive = false,
  introReplay = 0,
) {
  const controller = useRef<PipMotion | null>(null);
  const signals = useRef<PipMotionSignals | null>(null);

  useLayoutEffect(() => {
    if (!placement.current) return;
    const motion = new PipMotion(model, placement.current, clips, face);
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
  }, [model, placement, clips, face]);

  // The intro starts once the scene is drawn; from then on every reset (Try again) replays it.
  useEffect(() => {
    const motion = controller.current;
    if (!arrive || !motion) return;
    motion.autoArrive = true;
    motion.beginArrival();
  }, [arrive, model, placement, clips, face]);

  // Development replay from the debug panel; only from rest, never mid-run.
  const replayStatus = useRef(status);
  useLayoutEffect(() => { replayStatus.current = status; }, [status]);
  useEffect(() => {
    if (introReplay > 0 && replayStatus.current === "idle") controller.current?.beginArrival();
  }, [introReplay]);

  // Explicit order: animation/pose -> sole samples -> shadow and environment.
  // Negative priority preserves R3F's automatic rendering.
  useFrame((state, delta) => {
    const { intensity, lastCorrectAt, errorCount, sustainedInput } = input.current;
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
