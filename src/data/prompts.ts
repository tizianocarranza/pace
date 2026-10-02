export const PROMPTS = [
  "Small daily actions often lead to remarkable results over time.",
  "Good ideas become better when you give them room to breathe.",
  "Progress rarely feels dramatic while it is actually happening.",
  "Simple things done consistently tend to matter more than expected.",
  "The quietest moments can sometimes produce the clearest thoughts.",
  "A little patience can turn a difficult problem into a simple one.",
  "There is something satisfying about making small things work well.",
  "Some days are for moving quickly and others are for finding direction.",
  "The best work often begins before you know exactly where it is going.",
  "Small improvements become surprisingly powerful when repeated often.",
] as const;

export function getRandomPrompt(currentPrompt?: string) {
  const availablePrompts = currentPrompt
    ? PROMPTS.filter((prompt) => prompt !== currentPrompt)
    : PROMPTS;

  const randomIndex = Math.floor(
    Math.random() * availablePrompts.length,
  );

  return availablePrompts[randomIndex];
}