// Anneaux : placement par simulation de la vraie physique, traversée par segment, chaîne, score. PUR.
// Voir SPEC.md §6. Session 3.
import { TUNING, canTakeOff, simulateFlight } from './physics.js'

/** Génère les anneaux des crêtes jusqu'à uptoX dans le pool state.rings, recycle ceux derrière la caméra. */
export function ensure(state, uptoX) {
  // Session 3
}

/** Teste la traversée sur le segment (px, py) → (state.x, state.y). Met à jour chaîne, mult, score, events. */
export function check(state, px, py) {
  // Session 3
}

export function breakChain(state) {
  state.chain = 0
  state.mult = TUNING.MULT_TABLE[0]
}
