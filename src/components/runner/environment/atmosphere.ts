/** View depth relative to the fixed focal plane through Pip, not screen height. */
export const atmosphereField = /* glsl */ `
  float distanceHaze(vec3 worldPosition) {
    float focalDepth = -(viewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
    float viewDepth = -(viewMatrix * vec4(worldPosition, 1.0)).z;
    return smoothstep(5.0, 34.0, viewDepth - focalDepth) * 0.74;
  }
`;
