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

/** Both bodies are spheres shaded on the disk: `sphereNormal` is the view-space normal, and
 * the surface detail is noise evaluated on that normal turned by `uSpin`, so it curves with
 * the sphere and drifts across it. `uTime` animates the sun's surface; both are frozen under
 * reduced motion. */
const common = /* glsl */ `
  uniform float uAlpha;
  uniform float uGlow;
  uniform float uTime;
  uniform float uSpin;
  varying vec2 vDisk;

  vec3 sphereNormal(vec2 disk) {
    return vec3(disk, sqrt(max(0.0, 1.0 - dot(disk, disk))));
  }
  vec3 spin(vec3 v, float angle) {
    float c = cos(angle), s = sin(angle);
    return vec3(c * v.x + s * v.z, v.y, c * v.z - s * v.x);
  }
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  vec3 hash3(vec3 p) {
    return vec3(hash(p), hash(p + 19.19), hash(p + 47.73));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + 1.0), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float value = 0.0, amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      amplitude *= 0.5;
    }
    return value;
  }
`;

/** The sun: a pale gold sphere darkening to peach at its limb, its surface slowly boiling
 * with granulation and a few warm faculae, in a soft peach corona that ripples into rays. On
 * the white day page light has to be color, so the corona is a tint, never white. */
export const sunFragment = /* glsl */ `
  ${common}
  void main() {
    float r = length(vDisk);
    float disk = 1.0 - smoothstep(0.92, 1.0, r);
    vec3 normal = sphereNormal(vDisk);
    vec3 surface = spin(normal, uSpin);
    float limb = normal.z;

    vec3 body = mix(${glsl("#f38f55")}, ${glsl("#fff3d9")}, smoothstep(0.05, 0.9, limb));
    // Granules tint toward peach rather than darken, which would read grey on the day page.
    float granules = fbm(surface * 14.0 + vec3(0.0, 0.0, uTime * 0.12));
    body = mix(body, ${glsl("#fbc08f")}, smoothstep(0.55, 0.25, granules) * 0.22 * limb);
    float faculae = smoothstep(0.58, 0.7, fbm(surface * 2.4 + 4.0 + uTime * 0.02));
    body = mix(body, ${glsl("#f7a46e")}, faculae * 0.4 * limb);

    // Rays: the corona's falloff varies with angle, sampled on a circle so it wraps.
    vec2 around = vDisk / max(r, 1e-4);
    float rays = noise(vec3(around * 2.6, uTime * 0.08)) * 0.65 + noise(vec3(around * 6.0, 3.0 - uTime * 0.05)) * 0.35;
    float halo = exp(-max(r - 0.95, 0.0) * mix(3.4, 1.7, rays)) * 0.42 * uGlow;
    float ring = exp(-abs(r - 0.99) * 26.0) * 0.18 * uGlow;
    vec3 color = mix(${glsl("#f7a46e")}, body, disk);
    gl_FragColor = vec4(color, max(disk, min(halo + ring, 1.0)) * uAlpha);
    #include <colorspace_fragment>
  }
`;

/** The moon: a sphere lit from behind and to the left into a crescent. Its surface has blue
 * grey maria and craters whose rims bend the normal, so they catch the light along the
 * terminator; the dark side keeps a faint earthshine that shows the maria. A thin cool rim
 * and halo around it. */
export const moonFragment = /* glsl */ `
  ${common}
  void main() {
    float r = length(vDisk);
    float disk = 1.0 - smoothstep(0.92, 1.0, r);
    vec3 normal = sphereNormal(vDisk);
    float turn = uSpin + 0.6;
    vec3 surface = spin(normal, turn);

    float maria = smoothstep(0.44, 0.62, fbm(surface * 1.8 + 2.3));

    // Craters: the nearest feature point of a 3D cell grid on the surface; about half the
    // cells hold one. The bowl and the raised rim tilt the normal along the radial direction.
    const float cells = 4.0;
    vec3 point = surface * cells;
    vec3 base = floor(point);
    float best = 8.0;
    vec3 toCrater = vec3(0.0);
    float radius = 1.0;
    float present = 0.0;
    for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
    for (int z = -1; z <= 1; z++) {
      vec3 cell = base + vec3(x, y, z);
      vec3 seed = hash3(cell);
      vec3 offset = point - (cell + 0.2 + seed * 0.6);
      float d = length(offset);
      if (d < best) { best = d; toCrater = offset; radius = 0.2 + seed.y * 0.25; present = step(0.45, seed.z); }
    }
    float t = best / radius;
    float bowl = (1.0 - step(1.0, t)) * (t * t - 1.0) * 0.6;
    float rim = 0.35 * exp(-pow((t - 1.0) / 0.25, 2.0));
    float slope = ((1.0 - step(1.0, t)) * 1.2 * t - rim * 2.0 * (t - 1.0) / 0.0625) / radius;
    vec3 gradient = present * slope * toCrater / max(best, 1e-4);
    gradient -= dot(gradient, surface) * surface;
    vec3 bumped = spin(normalize(surface - gradient * 0.09), -turn);

    float shade = dot(bumped, normalize(vec3(-1.0, 0.3, -0.75)));
    float lit = smoothstep(-0.1, 0.2, shade);
    float fine = fbm(surface * 9.0);
    vec3 albedo = mix(${glsl("#eef1ff")}, ${glsl("#a2acd8")}, maria * 0.8);
    albedo *= 1.0 + present * (rim * 0.25 + bowl * 0.18) + (fine - 0.5) * 0.12;
    albedo *= mix(0.82, 1.0, pow(normal.z, 0.3));
    vec3 earthshine = ${glsl("#26336b")} * mix(1.18, 0.74, maria);

    vec3 body = mix(earthshine, albedo, lit);
    body = mix(body, ${glsl("#c9d6ff")}, smoothstep(0.82, 1.0, r) * lit * 0.5);
    float halo = exp(-max(r - 0.95, 0.0) * 2.8) * 0.3 * uGlow;
    vec3 color = mix(${glsl("#7c9cff")}, body, disk);
    float bodyAlpha = disk * mix(0.55, 1.0, lit);
    gl_FragColor = vec4(color, max(bodyAlpha, halo) * uAlpha);
    #include <colorspace_fragment>
  }
`;
