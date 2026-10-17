import { parseResultSlug } from "@/lib/shareResult";
import { CARD_SIZE, cardImage } from "../../_og/card";

export const alt = "A pace result";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ result: string }> }) {
  // A link that does not parse still unfurls, with the site's card.
  return cardImage(parseResultSlug((await params).result));
}
