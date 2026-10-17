import { LANGUAGES, LENGTHS, type Language, type Length, type RunMode } from "@/lib/runMode";

/** What a shared link carries: the headline numbers of a run, in its URL. It is the
 * player's word, not a verified score; the share page and card only display it. */
export type SharedResult = { wpm: number; accuracy: number; mode: RunMode };

/** Three digits, like the orb. */
const MAX_WPM = 999;
const SLUG = /^(\d{1,3})-(\d{1,3})-([a-z]+)-([a-z]+)$/;

/** `72-98-en-short`: readable, and a path segment, so each link has its own card route. */
export const resultSlug = ({ wpm, accuracy, mode }: SharedResult) =>
  `${Math.min(wpm, MAX_WPM)}-${accuracy}-${mode.language}-${mode.length}`;

export function parseResultSlug(slug: string): SharedResult | null {
  const match = SLUG.exec(slug);
  if (!match) return null;
  const wpm = Number(match[1]);
  const accuracy = Number(match[2]);
  const language = match[3] as Language;
  const length = match[4] as Length;
  if (wpm > MAX_WPM || accuracy > 100 || !LANGUAGES.includes(language) || !LENGTHS.includes(length)) return null;
  return { wpm, accuracy, mode: { language, length } };
}

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", es: "Spanish" };
