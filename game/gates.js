// Portes : placement seedé, passage testé sur le segment du pas, chaîne et score. PUR.
// Voir SPEC.md §6. Ne connaît ni three, ni document, ni Math.random.
import { TUNING } from './physics.js'

/** Prépare le pool. Appelé une fois par createState. */
export function create(state) {
  const gates = state.gates
  for (let i = 0; i < TUNING.GATE_POOL; i++) {
    gates.push({ n: -1, x: 0, y: 0, z: 0, passed: false, missed: false })
  }
  state.gatesUpto = 0
  ensure(state)
}

// Position latérale de la porte n : seedée, jamais collée au bord, et écartée des tremplins
// pour qu'on n'ait pas à choisir entre sauter et passer la porte au même endroit.
function place(state, n, out) {
  const T = TUNING
  const ter = state.terrain
  const h = frac(Math.sin(n * 91.7 + state.seed * 0.013) * 43758.5453)
  // Depuis que la piste est en cuvette, une porte au bord coûte cher à aller chercher : on les
  // resserre autour de l'axe pour qu'elles restent un choix, pas une punition.
  const marge = (T.TRACK_HALF - T.GATE_W) * 0.55
  let z = -n * T.GATE_GAP
  const proche = Math.round(-z / T.JUMP_GAP)
  const zRamp = -proche * T.JUMP_GAP
  if (Math.abs(z - zRamp) < T.JUMP_WZ * 2) z -= T.JUMP_WZ * 2.5   // pas sur la table du tremplin
  out.n = n
  out.x = ter.centre(z) + (h * 2 - 1) * marge
  out.z = z
  out.y = ter.height(out.x, out.z)
  out.passed = false
  out.missed = false
  return out
}

function frac(v) { return v - Math.floor(v) }

/** Garde le pool rempli devant le skieur. Recycle les portes passées derrière lui. */
export function ensure(state) {
  const T = TUNING
  const premier = Math.max(1, Math.floor(-state.z / T.GATE_GAP) + 1)
  for (let i = 0; i < state.gates.length; i++) {
    const voulu = premier + i
    if (state.gates[i].n !== voulu) place(state, voulu, state.gates[i])
  }
  state.gatesUpto = premier + state.gates.length
}

/**
 * Teste le franchissement sur le segment (px, pz) vers (state.x, state.z).
 * Le segment, pas le point : à 40 m/s le skieur avance de 0,33 m par pas, mais une porte
 * ratée doit être vue exactement au moment où on coupe sa ligne.
 */
export function check(state, px, pz) {
  const T = TUNING
  const gates = state.gates
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i]
    if (g.passed || g.missed) continue
    if (!(pz > g.z && state.z <= g.z)) continue        // on vient de couper la ligne de la porte

    const t = (pz - g.z) / (pz - state.z || 1)
    const x = px + (state.x - px) * t
    const y = state.y                                   // hauteur au passage, suffisante à cette échelle
    const dedans = Math.abs(x - g.x) < T.GATE_W / 2 && y < g.y + T.GATE_H

    if (dedans) {
      g.passed = true
      state.chain += 1
      state.mult = T.MULT_TABLE[Math.min(state.chain - 1, T.MULT_TABLE.length - 1)]
      state.score += T.GATE_VALUE * state.mult
      state.lastGate = g
      state.events.push('gate')
    } else {
      g.missed = true
      breakChain(state)
      state.events.push('gate_miss')
    }
  }
}

export function breakChain(state) {
  state.chain = 0
  state.mult = TUNING.MULT_TABLE[0]
}
