/** View depth relative to the fixed focal plane through Pip, not screen height. */
export const atmosphereField = /* glsl */ `
  float distanceHaze(vec3 worldPosition) {
    // The world origin's view depth: viewMatrix * (0, 0, 0, 1) is its translation column.
    float focalDepth = -viewMatrix[3].z;
    float viewDepth = -(viewMatrix * vec4(worldPosition, 1.0)).z;
    return smoothstep(4.0, 28.0, viewDepth - focalDepth) * 0.84;
  }
`;
