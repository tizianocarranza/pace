"use client";

import { Center, useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { PipShadow } from "./PipShadow";

type PipProps = {
  intensity: number;
  errorCount: number;
  status: "idle" | "running" | "finished";
};

export function Pip({ intensity, errorCount, status }: PipProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh | null>(null);

  const targetIntensity = useRef(intensity);
  const visualIntensity = useRef(0);
  const previousErrorCount = useRef(errorCount);
  const isStumbling = useRef(false);
  const activeAnimation = useRef<"Idle" | "Run" | null>(null);
  const rotationGroup = useRef<THREE.Group>(null);
  const runPhase = useRef(0);

  const { scene, animations } = useGLTF("/models/pip.glb");
  const { actions, mixer } = useAnimations(animations, group);

  useEffect(() => {
    targetIntensity.current = intensity;
  }, [intensity]);

  useEffect(() => {
    const mesh = scene.getObjectByName("PipBody");

    if (mesh instanceof THREE.Mesh) {
      body.current = mesh;
    }
  }, [scene]);

  useEffect(() => {
    const idle = actions.Idle;
    const run = actions.Run;
    const stumble = actions.Stumble;

    if (!idle || !run || !stumble) return;

    idle.reset().play();
    activeAnimation.current = "Idle";

    stumble.setLoop(THREE.LoopOnce, 1);
    stumble.clampWhenFinished = true;

    const handleFinished = (
      event: THREE.Event & { action?: THREE.AnimationAction },
    ) => {
      if (event.action !== stumble) return;

      isStumbling.current = false;

      const next = visualIntensity.current > 0.02 ? run : idle;

      stumble.fadeOut(0.2);
      next.reset().fadeIn(0.2).play();

      activeAnimation.current = next === run ? "Run" : "Idle";
    };

    mixer.addEventListener("finished", handleFinished);

    return () => {
      mixer.removeEventListener("finished", handleFinished);
      idle.stop();
      run.stop();
      stumble.stop();
    };
  }, [actions, mixer]);

  useEffect(() => {
    if (errorCount <= previousErrorCount.current) {
      previousErrorCount.current = errorCount;
      return;
    }

    previousErrorCount.current = errorCount;

    const stumble = actions.Stumble;

    if (!stumble) return;

    isStumbling.current = true;
    activeAnimation.current = null;

    actions.Idle?.fadeOut(0.1);
    actions.Run?.fadeOut(0.1);

    stumble.reset().fadeIn(0.1).play();
  }, [errorCount, actions]);

  useFrame((_, delta) => {
    const smoothing = 1 - Math.exp(-5 * delta);

    visualIntensity.current = THREE.MathUtils.lerp(
      visualIntensity.current,
      targetIntensity.current,
      smoothing,
    );

    const speed = visualIntensity.current;
    const idle = actions.Idle;
    const run = actions.Run;

    if (run && run.isRunning()) {
      const duration = run.getClip().duration;

      if (duration > 0) {
        runPhase.current = (run.time % duration) / duration;
      }
    }

    if (rotationGroup.current) {
      const targetRotation = status === "idle" ? 0 : Math.PI / 3;

      rotationGroup.current.rotation.y = THREE.MathUtils.damp(
        rotationGroup.current.rotation.y,
        targetRotation,
        4,
        delta,
      );

      // Pip se separa ligeramente del suelo a medida
      // que aumenta su velocidad.
      const targetHeight = THREE.MathUtils.lerp(0, 0.2, speed);

      rotationGroup.current.position.y = THREE.MathUtils.damp(
        rotationGroup.current.position.y,
        targetHeight,
        5,
        delta,
      );
    }

    if (!isStumbling.current && idle && run) {
      const nextAnimation =
        activeAnimation.current === "Run"
          ? speed < 0.01
            ? "Idle"
            : "Run"
          : speed > 0.04
            ? "Run"
            : "Idle";

      if (activeAnimation.current !== nextAnimation) {
        const previous = activeAnimation.current === "Run" ? run : idle;

        const next = nextAnimation === "Run" ? run : idle;

        previous.fadeOut(0.2);
        next.reset().fadeIn(0.2).play();

        activeAnimation.current = nextAnimation;
      }

      run.timeScale = THREE.MathUtils.lerp(0.55, 2.25, speed);
    }

    const mesh = body.current;
    const stretchIndex = mesh?.morphTargetDictionary?.Stretch;

    if (stretchIndex !== undefined && mesh?.morphTargetInfluences) {
      mesh.morphTargetInfluences[stretchIndex] = speed * 0.35;
    }
  });

  return (
    <group>
      <PipShadow intensity={intensity} runPhase={runPhase} />

      <group ref={rotationGroup}>
        <Center>
          <group ref={group}>
            <primitive object={scene} />
          </group>
        </Center>
      </group>
    </group>
  );
}

useGLTF.preload("/models/pip.glb");
