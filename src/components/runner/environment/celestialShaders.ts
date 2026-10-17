import { Color } from "three";

/** A linear GLSL constant from an sRGB hex (three's color management converts it). */
const glsl = (hex: string) => {
  const { r, g, b } = new Color(hex);
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
};

/** The quad spans this many body diameters, leaving room for the halo. */
export const CELESTIAL_QUAD = 2.8;

/** Screen-space quad: centered on `uCenter` (CSS px, top-left origin), `uSize` px across.
 * Independent of the camera framing, so it always sits under the HTML toggle. */
export const celestialVertex = /* glsl */ `
  uniform vec2 uCenter;
  uniform float uSize;
  uniform vec2 uViewport;
  varying vec2 vDisk;
  void main() {
    // In body radii: the disk's edge is at length(vDisk) = 1.
    vDisk = position.xy * ${(CELESTIAL_QUAD * 2).toFixed(2)};
    vec2 center = vec2(uCenter.x / uViewport.x * 2.0 - 1.0, 1.0 - uCenter.y / uViewport.y * 2.0);
    vec2 extent = uSize * ${CELESTIAL_QUAD.toFixed(2)} / uViewport * 2.0;
    gl_Position = vec4(center + position.xy * extent, 0.0, 1.0);
  }
`;

const common = /* glsl */ `
  uniform float uAlpha;
  uniform float uGlow;
  varying vec2 vDisk;
`;

/** The sun: a pale gold disk warming to peach at its rim, in a soft peach halo. On the white
 * day page light has to be color, so the halo is a tint, never white. */
export const sunFragment = /* glsl */ `
  ${common}
  void main() {
    float r = length(vDisk);
    float disk = 1.0 - smoothstep(0.9, 1.0, r);
    vec3 body = mix(${glsl("#fff3d9")}, ${glsl("#f9b27c")}, smoothstep(0.1, 1.0, r));
    float halo = exp(-max(r - 0.95, 0.0) * 2.4) * 0.42 * uGlow;
    vec3 color = mix(${glsl("#f7a46e")}, body, disk);
    gl_FragColor = vec4(color, max(disk, halo) * uAlpha);
    #include <colorspace_fragment>
  }
`;

/** The moon: a sphere shaded analytically on the disk, lit from behind and to the left into
 * a crescent; the dark side keeps a faint earthshine. A thin cool halo around it. */
export const moonFragment = /* glsl */ `
  ${common}
  void main() {
    float r = length(vDisk);
    float disk = 1.0 - smoothstep(0.9, 1.0, r);
    vec3 normal = vec3(vDisk, sqrt(max(0.0, 1.0 - r * r)));
    float lit = smoothstep(-0.04, 0.2, dot(normal, normalize(vec3(-1.0, 0.3, -0.75))));
    vec3 body = mix(${glsl("#26336b")}, ${glsl("#e9eeff")}, lit);
    float halo = exp(-max(r - 0.95, 0.0) * 2.8) * 0.3 * uGlow;
    vec3 color = mix(${glsl("#7c9cff")}, body, disk);
    float bodyAlpha = disk * mix(0.55, 1.0, lit);
    gl_FragColor = vec4(color, max(bodyAlpha, halo) * uAlpha);
    #include <colorspace_fragment>
  }
`;
