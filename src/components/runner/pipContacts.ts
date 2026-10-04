import * as THREE from "three";

// The centered, unchanged GLB is 1.744 units tall in its rest pose.
export const PIP_FLOOR_Y = -0.88;

export type FootContact = {
  point: THREE.Vector3;
  height: number;
  previousHeight: number;
  armed: boolean;
  impact: number;
  sequence: number;
};

export type PipContacts = {
  ready: boolean;
  feet: [FootContact, FootContact];
};

export function createContacts(): PipContacts {
  const foot = (): FootContact => ({
    point: new THREE.Vector3(), height: 0, previousHeight: 0,
    armed: false, impact: 0, sequence: 0,
  });
  return { ready: false, feet: [foot(), foot()] };
}

export function resetContacts(contacts: PipContacts) {
  contacts.ready = false;
  for (const foot of contacts.feet) {
    foot.armed = false;
    foot.impact = 0;
    foot.sequence = 0;
  }
}

/** Samples the same animated sole vertices previously used by PipShadow. */
export function createContactSampler(model: THREE.Group) {
  const samples: { mesh: THREE.SkinnedMesh; vertex: number; foot: number }[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const name = object.name.replace(/[. _]/g, "");
    if (name !== "PipFootL" && name !== "PipFootR") return;
    const positions = object.geometry.getAttribute("position");
    let vertex = 0;
    for (let index = 1; index < positions.count; index++) {
      if (positions.getY(index) < positions.getY(vertex)) vertex = index;
    }
    samples.push({ mesh: object, vertex, foot: name === "PipFootL" ? 0 : 1 });
  });

  return (contacts: PipContacts, delta: number, locomotion: number, allowImpact: boolean) => {
    const wasReady = contacts.ready;
    model.updateWorldMatrix(true, false);
    model.updateMatrixWorld(true);
    for (const sample of samples) {
      const foot = contacts.feet[sample.foot];
      sample.mesh.getVertexPosition(sample.vertex, foot.point);
      foot.point.applyMatrix4(sample.mesh.matrixWorld);
      foot.height = Math.max(0, foot.point.y - PIP_FLOOR_Y);
      foot.impact = 0;
      if (!wasReady || !allowImpact) {
        foot.armed = false;
      } else {
        // Hysteresis prevents grazing/idle breathing from firing more contacts.
        if (foot.height > 0.014 + locomotion * 0.025) foot.armed = true;
        if (foot.armed && foot.height < 0.011 + locomotion * 0.012
          && foot.height < foot.previousHeight) {
          const downwardSpeed = (foot.previousHeight - foot.height) / Math.max(delta, 0.001);
          foot.impact = THREE.MathUtils.clamp(0.25 + downwardSpeed * 0.8, 0.25, 1);
          foot.sequence++;
          foot.armed = false;
        }
      }
      foot.previousHeight = foot.height;
    }
    contacts.ready = samples.length === 2;
  };
}
