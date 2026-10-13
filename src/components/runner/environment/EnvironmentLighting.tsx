import { WORLD_LIGHT } from "./worldLighting";
import { useMaterialStudy } from "../MaterialStudy";

/** Quiet real-light counterpart to the world's shared shader illumination. */
export function EnvironmentLighting() {
  const shared = useMaterialStudy() !== "current";
  return (
    <group name="PaceEnvironmentLighting">
      <ambientLight intensity={shared ? 0.2 : WORLD_LIGHT.ambient} />
      {/* Periwinkle floor bounce plus warm/cool rims give Pip colored volume. */}
      {shared && <hemisphereLight args={["#ffffff", "#aab4f4", 0.45]} />}
      <directionalLight {...WORLD_LIGHT.key} intensity={shared ? 2.3 : WORLD_LIGHT.key.intensity} />
      <directionalLight {...WORLD_LIGHT.warm} intensity={shared ? 0.7 : WORLD_LIGHT.warm.intensity} />
      <directionalLight {...WORLD_LIGHT.cool} intensity={shared ? 0.7 : WORLD_LIGHT.cool.intensity} />
    </group>
  );
}
