"use client";

import { Canvas } from "@react-three/fiber";
import { Pip } from "./Pip";

type RunnerProps = {
  intensity: number;
  errorCount: number;
  status: "idle" | "running" | "finished";
  onFinishExit?: () => void;
  className?: string;
};
export function Runner({
  intensity,
  errorCount,
  status,
  onFinishExit,
  className,
}: RunnerProps) {
  return (
    <div className={className}>
      <Canvas
        camera={{
          position: [0, 1.2, 6],
          fov: 30,
        }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 0, 0);
        }}
      >
        <ambientLight intensity={1.8} />
        <directionalLight position={[3, 4, 5]} intensity={2} />

        <Pip
          intensity={intensity}
          errorCount={errorCount}
          status={status}
          onFinishExit={onFinishExit}
        />
      </Canvas>
    </div>
  );
}
