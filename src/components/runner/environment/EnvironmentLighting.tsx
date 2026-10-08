import { WORLD_LIGHT } from "./worldLighting";
import { useMaterialStudy } from "../MaterialStudy";

/** Quiet real-light counterpart to the world's shared shader illumination. */
export function EnvironmentLighting() {
  const shared = useMaterialStudy() !== "current";
  return (
    <group name="PaceEnvironmentLighting">
      <ambientLight intensity={shared ? 0.28 : WORLD_LIGHT.ambient} />
      <directionalLight {...WORLD_LIGHT.key} intensity={shared ? 2.3 : WORLD_LIGHT.key.intensity} />
      <directionalLight {...WORLD_LIGHT.warm} intensity={shared ? 0.48 : WORLD_LIGHT.warm.intensity} />
      <directionalLight {...WORLD_LIGHT.cool} intensity={shared ? 0.42 : WORLD_LIGHT.cool.intensity} />
    </group>
  );
}
