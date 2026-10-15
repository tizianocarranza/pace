import { WORLD_LIGHT } from "./worldLighting";

/** Quiet real-light counterpart to the world's shared shader illumination. */
export function EnvironmentLighting() {
  return (
    <group name="PaceEnvironmentLighting">
      <ambientLight intensity={0.2} />
      {/* Periwinkle floor bounce plus warm/cool rims give Pip colored volume. */}
      <hemisphereLight args={["#ffffff", "#aab4f4", 0.45]} />
      <directionalLight {...WORLD_LIGHT.key} intensity={2.3} />
      <directionalLight {...WORLD_LIGHT.warm} intensity={0.7} />
      <directionalLight {...WORLD_LIGHT.cool} intensity={0.7} />
    </group>
  );
}
