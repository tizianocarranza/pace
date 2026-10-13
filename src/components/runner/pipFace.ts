/** Live eye shape shared by the motion controller (writer) and the eye shader
 * (reader). Values are scales about each eye's center: 1 is the modeled eye. */
export function createPipFace() {
  return { uEyeOpen: { value: 1 }, uEyeWidth: { value: 1 } };
}

export type PipFace = ReturnType<typeof createPipFace>;
