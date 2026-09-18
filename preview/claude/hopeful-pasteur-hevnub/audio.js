// Sons synthétisés à l'oscillateur. Aucun fichier. Voir SPEC.md §9. Session 4.
// init() uniquement dans un pointerdown : iOS refuse le son sans geste.
let ac = null, master = null

export function init() {
  if (ac) return
  ac = new (window.AudioContext || window.webkitAudioContext)()
  master = ac.createGain()
  master.gain.value = 0.4
  master.connect(ac.destination)
}

/** 'takeoff' | 'ring' | 'land_perfect' | 'land_ok' | 'crash' | 'end'. level : rang dans MULT_TABLE pour 'ring'. */
export function play(name, level = 0) {
  if (!ac) return
  // Session 4
}

/** Bourdonnement de charge : gain rampé, jamais coupé net. */
export function setCharge(charge, active) {
  if (!ac) return
  // Session 4
}

export function suspend() { if (ac && ac.state === 'running') ac.suspend() }
export function resume() { if (ac && ac.state === 'suspended') ac.resume() }
