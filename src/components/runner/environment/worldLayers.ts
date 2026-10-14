/** Which world layers are mounted. The world is reduced to its essentials (terrain,
 * Pip and the light trails); switch a layer back on to reintroduce it once the
 * essentials are polished. Disabled layers keep their code, checks and budgets. */
export const WORLD_LAYERS = {
  formations: false, // folds, arches and suspended stones (FORMATIONS)
  details: false, // crystals, petals, bubbles, glass rings, motes and the near fragment
  nearBanks: false, // defocused foreground banks
  passingLight: false, // EnvironmentEnergy: six light paths through the formations
  lightTrails: true,
  // Pilot's satin floor (pilot.ground). Off: the analytic terrain reads lighter and
  // better modelled; Pip keeps the Pilot lighting either way.
  satinGround: false,
} as const;
