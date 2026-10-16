/** The big bang for consumers outside the canvas (the page's UI, GenesisStage): published
 * by ReactiveEnvironment every frame from WorldGenesis, never a second clock. */
const state = { arrivals: 0, active: false, x: 0, y: 0, radius: 0 };
let listener: (() => void) | null = null;

export const genesisStage = {
  get state(): Readonly<typeof state> { return state; },
  /** Called from the frame loop: no allocation, and the listener wakes only on change. */
  publish(arrivals: number, active: boolean, x: number, y: number, radius: number) {
    if (arrivals === state.arrivals && active === state.active && Math.abs(x - state.x) < 0.5
      && Math.abs(y - state.y) < 0.5 && Math.abs(radius - state.radius) < 0.5) return;
    state.arrivals = arrivals; state.active = active;
    state.x = x; state.y = y; state.radius = radius;
    listener?.();
  },
  /** One consumer at a time (GenesisStage); returns its unsubscribe. */
  listen(next: () => void) {
    listener = next;
    return () => { if (listener === next) listener = null; };
  },
};
