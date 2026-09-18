// Sons synthétisés à l'oscillateur. Aucun fichier. Voir SPEC.md §8.
// init() uniquement dans un pointerdown : iOS refuse le son sans geste.
let ac = null, master = null, noise = null
let wind = null, windGain = null, windFilter = null

export function init() {
  if (ac) return
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  ac = new Ctx()
  master = ac.createGain()
  master.gain.value = 0.42
  master.connect(ac.destination)

  // Un seul tampon de bruit, rempli une fois : il sert au vent et à la chute.
  noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1

  wind = ac.createBufferSource()
  wind.buffer = noise
  wind.loop = true
  windFilter = ac.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.frequency.value = 500
  windFilter.Q.value = 0.7
  windGain = ac.createGain()
  windGain.gain.value = 0
  wind.connect(windFilter).connect(windGain).connect(master)
  wind.start()
}

// Une note : un oscillateur, une enveloppe, rien d'autre.
function note(type, f0, f1, dur, gain, delay = 0) {
  const t = ac.currentTime + delay
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function burst(dur, gain, freq) {
  const t = ac.currentTime
  const s = ac.createBufferSource()
  s.buffer = noise
  const f = ac.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = freq
  const g = ac.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
  s.connect(f).connect(g).connect(master)
  s.start(t)
  s.stop(t + dur)
}

/**
 * 'takeoff' | 'jump_short' | 'jump_mid' | 'jump_long' | 'land_flat' | 'land_hard' | 'wipe' | 'end'.
 * Les trois sons de saut montent en hauteur, en durée et en nombre de notes : la longueur du saut
 * s'entend avant d'être lue.
 */
export function play(name) {
  if (!ac) return
  switch (name) {
    case 'takeoff':
      note('triangle', 210, 620, 0.16, 0.16)
      break
    case 'jump_short':
      note('sine', 523, 523, 0.11, 0.2)
      break
    case 'jump_mid':
      note('sine', 587, 587, 0.13, 0.22)
      note('sine', 880, 880, 0.2, 0.16, 0.09)
      break
    case 'jump_long':
      note('sine', 659, 659, 0.14, 0.24)
      note('sine', 988, 988, 0.16, 0.2, 0.1)
      note('sine', 1319, 1319, 0.5, 0.22, 0.21)
      note('triangle', 330, 330, 0.7, 0.1, 0.21)
      break
    case 'land_flat':
      burst(0.09, 0.14, 1400)
      break
    case 'land_hard':
      burst(0.14, 0.2, 700)
      break
    case 'wipe':
      note('square', 130, 45, 0.35, 0.2)
      burst(0.3, 0.32, 900)
      break
    case 'end':
      note('sine', 523, 523, 0.14, 0.2)
      note('sine', 659, 659, 0.14, 0.2, 0.13)
      note('sine', 784, 784, 0.4, 0.22, 0.26)
      break
  }
}

/** Souffle du vent : gain et couleur montent avec la vitesse. Rampé, jamais coupé net. */
export function setWind(speed01, airborne) {
  if (!ac) return
  const v = Math.max(0, Math.min(1, speed01))
  windGain.gain.setTargetAtTime(v * v * (airborne ? 0.16 : 0.1), ac.currentTime, 0.12)
  windFilter.frequency.setTargetAtTime(300 + v * 1500, ac.currentTime, 0.2)
}

export function suspend() { if (ac && ac.state === 'running') ac.suspend() }
export function resume() { if (ac && ac.state === 'suspended') ac.resume() }
