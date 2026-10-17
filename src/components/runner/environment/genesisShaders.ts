import { BufferAttribute, BufferGeometry } from "three";

/** The big bang's core: a single point at Pip's spot, sized from `uGenesis.y`. */
export function createGenesisGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([0, 0.45, 0]), 3));
  return geometry;
}

export const genesisVertex = /* glsl */ `
  uniform vec4 uGenesis;
  uniform vec2 uResolution;
  void main() {
    vec4 view = viewMatrix * vec4(position, 1.0);
    // Sized against the drawing buffer and the camera's distance to Pip.
    gl_PointSize = 120.0 * uGenesis.y * (uResolution.y / 1000.0) * (18.0 / max(-view.z, 1.0));
    gl_Position = projectionMatrix * view;
  }
`;

export const genesisFragment = /* glsl */ `
  uniform vec4 uGenesis;
  uniform vec3 uPearl;
  uniform vec3 uViolet;
  uniform vec3 uWarm;
  uniform float uNight;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float d = dot(q, q);
    if (d > 1.0) discard;
    // On a white page brightness is contrast: a near-white hot center inside a denser
    // lavender halo, a pale peach ring between them, and a four-point glint.
    vec3 glow = mix(uViolet, uPearl, 0.3);
    vec3 heart = mix(uWarm, uPearl, 0.5);
    vec3 color = mix(glow, heart, exp(-d * 6.0));
    float hot = exp(-d * 28.0);
    color = mix(color, vec3(1.0), hot);
    vec2 a = abs(q);
    float glint = exp(-a.x * 22.0) * exp(-a.y * 3.0) + exp(-a.y * 22.0) * exp(-a.x * 3.0);
    color = mix(color, mix(uPearl, uViolet, 0.25), glint * (1.0 - hot));
    float alpha = max(exp(-d * 3.4) * 0.95, glint * 0.8);
    // On the dark page the halo is the light itself: a little more of it.
    gl_FragColor = vec4(color, min(1.0, alpha * (1.0 + uNight * 0.25)) * min(1.0, uGenesis.y * 1.5));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
