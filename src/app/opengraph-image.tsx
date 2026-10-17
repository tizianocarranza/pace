import { CARD_SIZE, cardImage } from "./_og/card";

export const alt = "pace. A typing game where Pip runs as fast as you type.";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default function Image() {
  return cardImage(null);
}
