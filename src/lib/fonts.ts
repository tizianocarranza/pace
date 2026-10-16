import { Quicksand } from "next/font/google";

/** Rounded, soft figures for numbers (the WPM orb and the results); the rest of the UI
 * keeps the site font. Preloaded only where its className renders. */
export const quicksand = Quicksand({ subsets: ["latin"], weight: ["500"] });
