"use client";

import { Center, useGLTF } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { PIP_SOLE_Y } from "./pipContacts";
import { createPipFace } from "./pipFace";
import { PipShadow } from "./PipShadow";
import { ReactiveEnvironment } from "./environment/ReactiveEnvironment";
import { usePipSurface } from "./usePipSurface";
import { usePipReflection } from "./usePipReflection";
import { usePipMotion } from "./usePipMotion";

type PipProps = {
  intensity: number;
  sustainedInput?: boolean;
  lastCorrectAt: number | null;
  errorCount: number;
  status: "idle" | "running" | "finished";
  onFinishExit?: () => void;
};

export function Pip({ intensity, sustainedInput = false, lastCorrectAt, errorCount, status, onFinishExit }: PipProps) {
  const placement = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/models/pip.glb");
  const face = useMemo(() => createPipFace(), []);
  usePipSurface(scene, face);
  usePipReflection(scene);
  const motion = usePipMotion(
    scene, placement, animations, intensity, lastCorrectAt, errorCount, status, onFinishExit, sustainedInput, face,
  );

  return (
    <group>
      <ReactiveEnvironment motion={motion} status={status} />
      <PipShadow motion={motion} />
      <group ref={placement} name="PipPlacement">
        <Center disableY position-y={PIP_SOLE_Y}>
          <primitive object={scene} />
        </Center>
      </group>
    </group>
  );
}

useGLTF.preload("/models/pip.glb");
