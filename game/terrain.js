// Terrain seedé : somme de 3 sinusoïdes modulées + pente moyenne. PUR. Voir SPEC.md §5.
// Dérivées analytiques : le critère de décollage lit h'' à chaque pas.
import { mulberry32 } from './rng.js'
import { TUNING } from './physics.js'

/**
 * @returns {{ sample(x): {y, dy, ddy}, crests(x0, x1): {x, y}[], inflectionBefore(xc): number, layer(k, xScreen): number, wind: number }}
 */
export function create(seed) {
  const rnd = mulberry32(seed)
  // Ordre des tirages = contrat : φ0 fixé (départ sur une crête), φ1, φ2, ψ0, ψ1, ψ2, puis le vent.
  const phi = [1.5 * Math.PI, rnd() * 2 * Math.PI, rnd() * 2 * Math.PI]
  const psi = [rnd() * 2 * Math.PI, rnd() * 2 * Math.PI, rnd() * 2 * Math.PI]
  const wind = (rnd() * 2 - 1) * TUNING.WIND_MAX

  function sample(x) {
    // Session 1 : y = SLOPE_AVG·x + Σ A_i(x)·sin(k_i x + φ_i), A_i(x) = HILL_BASE·OCT_AMP[i]·(1 + MOD_DEPTH·sin(m_i x + ψ_i))
    return { y: 0, dy: 0, ddy: 0 }
  }

  function crests(x0, x1) {
    // Session 1 : minima locaux de h (dy passe de négatif à positif), pas de 8 u puis 4 bissections
    return []
  }

  function inflectionBefore(xc) {
    // Session 1 : balayage arrière depuis xc jusqu'au premier ddy ≤ 0
    return xc
  }

  function layer(k, xScreen) {
    // Session 4 : silhouette de fond k ∈ {1, 2}, espace écran, sans SLOPE_AVG
    return 0
  }

  return { sample, crests, inflectionBefore, layer, wind, phi, psi }
}
