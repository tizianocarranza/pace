/** The sun (day) and moon (night) in the sky, which are also the theme toggle. One anchor,
 * in CSS px from the viewport's top-right corner, places both the 3D bodies (SkyBodies)
 * and the HTML button over them (CelestialToggle), so they always line up. */
export const CELESTIAL = {
  wide: { right: 96, top: 132, size: 52 },
  compact: { right: 44, top: 104, size: 42 },
  /** At or below this viewport width the compact anchor applies. */
  compactWidth: 640,
} as const;

export type CelestialAnchor = { x: number; y: number; size: number };

/** The body's center and diameter in CSS px (top-left origin), written into `out`. */
export function celestialAnchor(width: number, out: CelestialAnchor) {
  const anchor = width <= CELESTIAL.compactWidth ? CELESTIAL.compact : CELESTIAL.wide;
  out.x = width - anchor.right;
  out.y = anchor.top;
  out.size = anchor.size;
  return out;
}

/** Pointer or keyboard focus on the toggle, 0 or 1; the 3D bodies ease toward it. */
export const celestialHover = { value: 0 };
