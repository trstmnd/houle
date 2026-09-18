// Terrain seedé : somme de 3 sinusoïdes modulées + pente moyenne. PUR. Voir SPEC.md §5.
// Dérivées analytiques : le critère de décollage lit h'' à chaque pas.
import { mulberry32 } from './rng.js'
import { TUNING } from './physics.js'

const SCAN = 8    // u, pas de balayage pour les crêtes et les inflexions
const REFINE = 4  // bissections, ramène les 8 u à 0,5 u

/**
 * @returns {{ sample(x): {y, dy, ddy}, crests(x0, x1): {x, y}[], inflectionBefore(xc): number, layer(k, xScreen): number, wind: number }}
 */
export function create(seed) {
  const rnd = mulberry32(seed)
  // Ordre des tirages = contrat : φ0 fixé (départ sur une crête), φ1, φ2, ψ0, ψ1, ψ2, puis le vent.
  const phi = [1.5 * Math.PI, rnd() * 2 * Math.PI, rnd() * 2 * Math.PI]
  const psi = [rnd() * 2 * Math.PI, rnd() * 2 * Math.PI, rnd() * 2 * Math.PI]
  const wind = (rnd() * 2 - 1) * TUNING.WIND_MAX

  // Pulsations et amplitudes figées à la création : rien à recalculer dans la boucle.
  const n = TUNING.OCT_AMP.length
  const k = new Array(n), m = new Array(n), amp = new Array(n)
  for (let i = 0; i < n; i++) {
    k[i] = 2 * Math.PI / (TUNING.HILL_WAVE * TUNING.OCT_WAVE[i])
    m[i] = k[i] / TUNING.MOD_WAVE
    amp[i] = TUNING.HILL_BASE * TUNING.OCT_AMP[i]
  }

  // Un seul objet rendu, réutilisé à chaque appel : la boucle n'alloue pas (CLAUDE.md règle 5).
  // Donc on lit ses champs tout de suite, on ne garde jamais deux sample() vivants en même temps.
  const out = { y: 0, dy: 0, ddy: 0 }

  function sample(x) {
    let y = TUNING.SLOPE_AVG * x
    let dy = TUNING.SLOPE_AVG
    let ddy = 0
    for (let i = 0; i < n; i++) {
      const s = Math.sin(k[i] * x + phi[i]), c = Math.cos(k[i] * x + phi[i])
      const ms = Math.sin(m[i] * x + psi[i]), mc = Math.cos(m[i] * x + psi[i])
      const A = amp[i] * (1 + TUNING.MOD_DEPTH * ms)          // amplitude modulée
      const dA = amp[i] * TUNING.MOD_DEPTH * m[i] * mc
      const ddA = -amp[i] * TUNING.MOD_DEPTH * m[i] * m[i] * ms
      y += A * s
      dy += dA * s + A * k[i] * c                              // règle du produit
      ddy += ddA * s + 2 * dA * k[i] * c - A * k[i] * k[i] * s
    }
    out.y = y; out.dy = dy; out.ddy = ddy
    return out
  }

  /** Minima locaux de h : y vers le bas, une crête est un minimum. */
  function crests(x0, x1) {
    const found = []
    let prev = sample(x0).dy
    for (let x = x0 + SCAN; x <= x1; x += SCAN) {
      const cur = sample(x).dy
      if (prev < 0 && cur >= 0) {
        let lo = x - SCAN, hi = x
        for (let i = 0; i < REFINE; i++) {
          const mid = (lo + hi) / 2
          if (sample(mid).dy < 0) lo = mid; else hi = mid
        }
        const xc = (lo + hi) / 2
        found.push({ x: xc, y: sample(xc).y })
      }
      prev = cur
    }
    return found
  }

  /** Dernier x avant la crête où la montée commence à s'arrondir : c'est là que le tir devient possible. */
  function inflectionBefore(xc) {
    const span = TUNING.HILL_WAVE
    for (let d = SCAN; d <= span; d += SCAN) {
      if (sample(xc - d).ddy <= 0) {
        let lo = xc - d, hi = xc - d + SCAN
        for (let i = 0; i < REFINE; i++) {
          const mid = (lo + hi) / 2
          if (sample(mid).ddy <= 0) lo = mid; else hi = mid
        }
        return (lo + hi) / 2
      }
    }
    return xc - span
  }

  function layer(k, xScreen) {
    // Session 4 : silhouette de fond k ∈ {1, 2}, espace écran, sans SLOPE_AVG
    return 0
  }

  return { sample, crests, inflectionBefore, layer, wind, phi, psi }
}
