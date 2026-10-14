import * as THREE from "three";
import { landscapeFragment, landscapeVertex } from "./landscapeShaders";
import { createLightingUniforms } from "./worldLighting";
import { WorldInteractions } from "./worldInteractions";

/** Transparent queue order. Translucent depth goes first, so only the front-most
 * resin/glass layer is shaded; bubbles and additive light follow it. */
export const RENDER_ORDER = { translucentDepth: 1, translucent: 2, bubble: 3, light: 4 } as const;

/** Shared finishes; the authored placement reserves warmth for a few related accents. */
export function createLandscapeMaterials(interactions = new WorldInteractions()) {
  const uniforms = {
    ...createLightingUniforms(),
    uTravel: { value: 0 }, uVisibility: { value: 1 },
    uPhase: { value: 0 }, uMomentum: { value: new THREE.Vector2() },
    uEnergy: { value: new THREE.Vector4() }, uEnergyPhase: { value: 0 },
    uEnergyTier: { value: 0 }, uTrailTravel: { value: 0 },
    uCompositionGray: { value: 0 },
    uAtmosphere: { value: 0 }, uNearCapture: { value: 0 },
    uImpulses: { value: interactions.packed }, uImpulseParameters: { value: interactions.parameters },
    uResolution: { value: new THREE.Vector2(1, 1) },
    // High-key field with saturated cobalt, periwinkle and peach accents.
    uPearl: { value: new THREE.Color("#f6f7fd") },
    uBlue: { value: new THREE.Color("#4a74e6") },
    uViolet: { value: new THREE.Color("#a493f2") },
    uDeep: { value: new THREE.Color("#2440a8") },
    uWarm: { value: new THREE.Color("#f79a5c") },
  };
  function surface(name: string, kind: number, warm = false, depthOnly = false) {
    const translucent = kind === 1 || kind === 2 || kind === 5;
    const material = new THREE.ShaderMaterial({
      name, uniforms, vertexShader: landscapeVertex, fragmentShader: landscapeFragment,
      defines: {
        MATERIAL_KIND: kind,
        ...(kind === 0 ? { TERRAIN: 1 } : {}),
        ...(kind === 4 ? { FOREGROUND: 1 } : {}),
        ...(warm ? { WARM_ACCENT: 1 } : {}),
        ...(depthOnly ? { DEPTH_PREPASS: 1 } : {}),
      },
      side: kind === 0 ? THREE.FrontSide : THREE.DoubleSide,
      transparent: translucent,
      depthWrite: !translucent || depthOnly,
      colorWrite: !depthOnly,
      // Thin sheets and approximate mineral transmission need no back-face render pass.
      forceSinglePass: true,
      toneMapped: false,
    });
    // Pushed slightly back so the color pass of the same surface always passes.
    if (depthOnly) Object.assign(material, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const viewport = new THREE.Vector4();
    material.onBeforeRender = renderer => {
      // The native transmission capture uses a smaller viewport than the canvas.
      renderer.getCurrentViewport(viewport);
      uniforms.uResolution.value.set(viewport.z, viewport.w);
      material.uniformsNeedUpdate = true;
    };
    return material;
  }
  return {
    terrain: surface("Pace / pearl ground", 0),
    fold: surface("Pace / cool satin resin", 1),
    warmFold: surface("Pace / peach satin resin", 1, true),
    arch: surface("Pace / blue mineral", 2),
    stone: surface("Pace / polished mineral", 3),
    warmStone: surface("Pace / amber pearl", 3, true),
    foreground: surface("Pace / near pearl", 4),
    bubble: surface("Pace / iridescent bubble", 5),
    // The vertex stage ignores the finish, so one depth material serves resin and glass.
    translucentDepth: surface("Pace / translucent depth", 1, false, true),
  };
}

/** Resin and glass finishes get a depth-only twin; bubbles stay layered on purpose. */
export const hasTranslucentDepth = (finish: string) =>
  finish === "fold" || finish === "warmFold" || finish === "arch";

export function formationMaterial(name: string, kind: "fold" | "arch" | "stone") {
  if (name === "WesternFold") return "warmFold";
  if (name === "DistantStone") return "warmStone";
  return kind;
}
