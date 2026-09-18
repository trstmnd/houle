// Point d'entrée : boucle, pas fixe, input, machine à états. Voir SPEC.md §4, §7.
// Rien de pur ici : c'est le seul fichier qui a le droit de connaître le DOM et l'horloge.
import { STEP, TUNING, createState, step } from './physics.js'
import * as render from './render.js'
import * as audio from './audio.js'

const MAX_FRAME = 1 / 30   // borne du dt de frame : sans elle, un lag d'une seconde traverse le terrain

const canvas = document.getElementById('game')
const titleScreen = document.getElementById('title')

// Seed : lue dans l'URL, sinon tirée et écrite dedans. L'adresse porte toujours la piste en cours.
function readSeed() {
  const raw = new URLSearchParams(location.search).get('seed')
  const n = raw === null ? NaN : parseInt(raw, 10)
  if (Number.isFinite(n) && n > 0) return n % 1000000
  return 100000 + Math.floor(Math.random() * 900000)
}

const seed = readSeed()
try { history.replaceState(null, '', '?seed=' + seed) } catch (e) { /* navigation privée */ }

render.init(canvas)
const state = createState(seed)
document.getElementById('title-seed').textContent = String(seed).padStart(6, '0')
window.__houle = state   // poignée de debug : lire l'état depuis la console du téléphone

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  render.resize(window.innerWidth, window.innerHeight, dpr)
}

let paused = false
let inputLock = 0   // ignore l'input juste après un changement d'écran (SPEC §7)

// Le même geste lance la run et commence à charger.
function press() {
  if (inputLock > 0) return
  audio.init()                     // iOS refuse le son hors d'un geste : c'est ici ou nulle part
  if (state.phase === 'title') {
    state.phase = 'run'
    titleScreen.hidden = true
  }
  state.pressed = true
}

function release() { state.pressed = false }

function pause() {
  state.pressed = false
  paused = true
  audio.suspend()
}

function unpause() {
  if (!paused) return
  paused = false
  last = -1                        // on repart du temps courant, jamais de rattrapage
  acc = 0
  audio.resume()
}

window.addEventListener('pointerdown', press)
window.addEventListener('pointerup', release)
window.addEventListener('pointercancel', release)
window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (e.code === 'Space' || e.code === 'ArrowDown') { e.preventDefault(); press() }
})
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowDown') release()
})
window.addEventListener('blur', pause)
window.addEventListener('focus', unpause)
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else unpause() })
window.addEventListener('contextmenu', (e) => e.preventDefault())
window.addEventListener('resize', resize)
window.addEventListener('orientationchange', resize)

// render.js et audio.js réagissent aux événements, ils ne lisent jamais la physique en cours de pas.
function drain() {
  const events = state.events
  const level = Math.min(state.chain, TUNING.MULT_TABLE.length - 1)
  for (let i = 0; i < events.length; i++) {
    render.fx(events[i], state)
    audio.play(events[i], level)
  }
  events.length = 0
}

let last = -1, acc = 0

function frame(now) {
  requestAnimationFrame(frame)
  if (last < 0) last = now
  let dt = (now - last) / 1000
  last = now
  if (dt > MAX_FRAME) dt = MAX_FRAME
  if (inputLock > 0) inputLock -= dt

  if (!paused && state.phase === 'run') {
    acc += dt
    while (acc >= STEP) { step(state, STEP); acc -= STEP }
    drain()
  }
  audio.setCharge(state.charge, state.pressed && state.grounded)
  render.draw(state, dt)
}

resize()
requestAnimationFrame(frame)
