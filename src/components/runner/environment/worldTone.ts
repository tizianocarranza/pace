/** The floor's warmth for consumers outside the canvas (the WPM orb): WorldEnergy's
 * sustained energy (`uEnergy.y`), published by ReactiveEnvironment every frame. It is
 * the same value `floorWarmth()` reads, never a second energy memory. */
let warmth = 0;
let listener: (() => void) | null = null;

export const worldTone = {
  get warmth() { return warmth; },
  /** Called from the frame loop: no allocation, and listeners wake only on change. */
  publish(next: number) {
    if (Math.abs(next - warmth) < 0.0005) return;
    warmth = next;
    listener?.();
  },
  /** One consumer at a time (the orb); returns its unsubscribe. */
  listen(next: () => void) {
    listener = next;
    return () => { if (listener === next) listener = null; };
  },
};
