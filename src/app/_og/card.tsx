import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SharedResult } from "@/lib/shareResult";

/** The share card: the day world with Pip along the bottom, the site or a run's result
 * above. Colors are the day tokens of `globals.css`; the fonts are the UI's, as static
 * TTF instances (ImageResponse reads no woff2). */
export const CARD_SIZE = { width: 1200, height: 630 };

const INK = "#3d3a55";
const MUTED = "#a9a5c8";

const directory = join(process.cwd(), "src/app/_og");
const [sansRegular, sansMedium, numbers, world] = await Promise.all([
  readFile(join(directory, "InstrumentSans-Regular.ttf")),
  readFile(join(directory, "InstrumentSans-Medium.ttf")),
  readFile(join(directory, "Quicksand-Medium.ttf")),
  readFile(join(directory, "world.jpg"), "base64"),
]);

export function cardImage(result: SharedResult | null) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
        background: "#ffffff", fontFamily: "Instrument Sans", color: INK, position: "relative" }}>
        {/* Pip on the floor, a crop of a running frame; it fades into the page at the bottom. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img> */}
        <img src={`data:image/jpeg;base64,${world}`} width={1200} height={335} alt=""
          style={{ position: "absolute", left: 0, bottom: 0 }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90, display: "flex",
          background: "linear-gradient(rgba(255,255,255,0), #ffffff)" }} />

        <div style={{ position: "absolute", left: 64, right: 64, top: 52, display: "flex",
          justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 40, fontWeight: 500, letterSpacing: -1.6 }}>pace.</span>
          <span style={{ fontSize: 24, color: MUTED }}>typing in motion</span>
        </div>

        {result ? (
          <div style={{ marginTop: 92, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontFamily: "Quicksand", fontSize: 184, lineHeight: 1 }}>{result.wpm}</span>
            <span style={{ marginTop: 18, fontSize: 24, letterSpacing: 4.3, color: MUTED, textTransform: "uppercase" }}>
              {`wpm · ${result.accuracy}% accuracy · ${result.mode.length} · ${result.mode.language}`}
            </span>
          </div>
        ) : (
          <div style={{ marginTop: 150, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 64, letterSpacing: -2.2 }}>Type, and Pip runs.</span>
            <span style={{ marginTop: 16, fontSize: 28, color: MUTED }}>
              A minimalist typing game that turns your speed into motion.
            </span>
          </div>
        )}
      </div>
    ),
    {
      ...CARD_SIZE,
      fonts: [
        { name: "Instrument Sans", data: sansRegular, weight: 400, style: "normal" },
        { name: "Instrument Sans", data: sansMedium, weight: 500, style: "normal" },
        { name: "Quicksand", data: numbers, weight: 500, style: "normal" },
      ],
    },
  );
}
