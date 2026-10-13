/** Which world layers are mounted. The world is reduced to its essentials (terrain,
 * Pip and the light trails); switch a layer back on to reintroduce it once the
 * essentials are polished. Disabled layers keep their code, checks and budgets. */
export const WORLD_LAYERS = {
  formations: false, // folds, arches and suspended stones (FORMATIONS)
  details: false, // crystals, petals, bubbles, glass rings, motes and the near fragment
  nearBanks: false, // defocused foreground banks
  passingLight: false, // EnvironmentEnergy: six light paths through the formations
  lightTrails: true,
} as const;
