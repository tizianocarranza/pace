import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/theme";

const instrumentSans = Instrument_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pace — Typing in Motion",
  description:
    "A minimalist typing game that turns your typing speed into motion.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The intro reveals the UI (GenesisStage); hidden from the first paint, no flash.
      data-genesis="waiting"
      // Day by default; the head script switches it to the saved or system theme before
      // the first paint, so React must accept the attribute it finds.
      data-theme="day"
      suppressHydrationWarning
      className={`${instrumentSans.className} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
