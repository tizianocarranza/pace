"use client";

import { Center, useGLTF } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";
import { PipShadow } from "./PipShadow";
import { SpeedLines } from "./SpeedLines";
import { usePipSurface } from "./usePipSurface";
import { usePipMotion } from "./usePipMotion";

type PipProps = {
  intensity: number;
  lastCorrectAt: number | null;
  errorCount: number;
  status: "idle" | "running" | "finished";
  onFinishExit?: () => void;
};

export function Pip({ intensity, lastCorrectAt, errorCount, status, onFinishExit }: PipProps) {
  const placement = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/models/pip.glb");
  usePipSurface(scene);
  const motion = usePipMotion(
    scene, placement, animations, intensity, lastCorrectAt, errorCount, status, onFinishExit,
  );

  return (
    <group>
      <SpeedLines motion={motion} origin={placement} />
      <PipShadow motion={motion} />
      <group ref={placement} name="PipPlacement">
        <Center>
          <primitive object={scene} />
        </Center>
      </group>
    </group>
  );
}

useGLTF.preload("/models/pip.glb");
