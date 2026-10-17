import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { quicksand } from "@/lib/fonts";
import { LANGUAGE_NAMES, parseResultSlug } from "@/lib/shareResult";

/** A shared run: what the link's card shows, and the way into the game. */

export async function generateMetadata({ params }: PageProps<"/r/[result]">): Promise<Metadata> {
  const result = parseResultSlug((await params).result);
  if (!result) return {};
  const title = `${result.wpm} WPM on pace.`;
  const description = `${result.accuracy}% accuracy on ${result.mode.length} ${LANGUAGE_NAMES[result.mode.language]} prompts. Your turn.`;
  return {
    title,
    description,
    // Nested fields replace the layout's whole object, so the card type is repeated.
    openGraph: { title, description, siteName: "pace.", type: "website" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: false },
  };
}

export default async function SharedResultPage({ params }: PageProps<"/r/[result]">) {
  const result = parseResultSlug((await params).result);
  if (!result) notFound();

  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr] bg-[var(--page)] px-12 py-8 text-[var(--ink)] max-sm:px-6 max-sm:py-6">
      <header>
        <Link href="/" className="text-base font-medium tracking-[-0.04em]">pace.</Link>
      </header>
      <section className="flex flex-col items-center justify-center">
        <div className={`${quicksand.className} text-6xl leading-none tabular-nums max-sm:text-5xl`}>{result.wpm}</div>
        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
          wpm · {result.accuracy}% accuracy · {result.mode.length} · {result.mode.language}
        </div>
        <Link href="/" className="mt-10 text-sm underline underline-offset-4">your turn</Link>
      </section>
    </main>
  );
}
