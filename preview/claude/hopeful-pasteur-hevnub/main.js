// Point d'entrée : boucle, pas fixe, input, machine à états. Voir SPEC.md §5, §7.
// Seul fichier qui connaît le DOM et l'horloge.
import { STEP, TUNING, createState, step } from './physics.js'
import * as render from './render.js'
import * as audio from './audio.js'

const MAX_FRAME = 1 / 30   // borne du dt de frame : sans elle, un lag traverse la montagne

const canvas = document.getElementById('game')
const titleScreen = document.getElementById('title')
const hud = document.getElementById('hud')
const elSpeed = document.getElementById('speed')
const elDist = document.getElementById('dist')

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
let pointerId = -1, pointerOrigin = 0, pointerSteer = 0
let keyLeft = false, keyRight = false, keySteer = 0

function startRun() {
  if (state.phase !== 'title') return
  state.phase = 'run'
  titleScreen.hidden = true
  hud.hidden = false
}

canvas.addEventListener('pointerdown', (e) => {
  audio.init()                       // iOS refuse le son hors d'un geste
  startRun()
  if (pointerId !== -1) return
  pointerId = e.pointerId
  pointerOrigin = e.clientX
  pointerSteer = 0
})

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId) return
  // Le glissement horizontal depuis le point de contact donne la carre.
  pointerSteer = clamp((e.clientX - pointerOrigin) / TUNING.STEER_SPAN, -1, 1)
})

function endPointer(e) {
  if (e.pointerId !== pointerId) return
  pointerId = -1
  pointerSteer = 0
}
canvas.addEventListener('pointerup', endPointer)
canvas.addEventListener('pointercancel', endPointer)

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keyLeft = true; e.preventDefault(); startRun() }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { keyRight = true; e.preventDefault(); startRun() }
  if (e.code === 'Space') { e.preventDefault(); startRun() }
})
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyLeft = false
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keyRight = false
})

function pause() { paused = true; audio.suspend() }
function unpause() {
  if (!paused) return
  paused = false
  last = -1                          // on repart du temps courant, jamais de rattrapage
  acc = 0
  audio.resume()
}
window.addEventListener('blur', () => { pointerId = -1; pointerSteer = 0; keyLeft = keyRight = false; pause() })
window.addEventListener('focus', unpause)
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else unpause() })
window.addEventListener('contextmenu', (e) => e.preventDefault())
window.addEventListener('resize', resize)
window.addEventListener('orientationchange', resize)

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }

// Le doigt est prioritaire sur le clavier, et la carre revient toujours à 0 toute seule.
function updateSteer(dt) {
  const T = TUNING
  const dir = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0)
  if (dir !== 0) keySteer = clamp(keySteer + dir * dt / T.KEY_RAMP, -1, 1)
  else keySteer -= keySteer * (1 - Math.exp(-dt / T.STEER_RETURN))

  if (pointerId !== -1) state.steer = pointerSteer
  else if (dir !== 0 || Math.abs(keySteer) > 0.001) state.steer = keySteer
  else state.steer -= state.steer * (1 - Math.exp(-dt / T.STEER_RETURN))
}

function drain() {
  const events = state.events
  for (let i = 0; i < events.length; i++) {
    render.fx(events[i], state)
    audio.play(events[i], 0)
  }
  events.length = 0
}

let lastSpeed = -1, lastDist = -1
function updateHud() {
  const kmh = Math.round(state.s * 3.6)
  if (kmh !== lastSpeed) { elSpeed.textContent = kmh; lastSpeed = kmh }
  const d = Math.round(state.dist)
  if (d !== lastDist) { elDist.textContent = d; lastDist = d }
}

let last = -1, acc = 0

function frame(now) {
  requestAnimationFrame(frame)
  if (last < 0) last = now
  let dt = (now - last) / 1000
  last = now
  if (dt > MAX_FRAME) dt = MAX_FRAME

  if (!paused && state.phase === 'run') {
    updateSteer(dt)
    acc += dt
    while (acc >= STEP) { step(state, STEP); acc -= STEP }
    drain()
    updateHud()
  }
  render.draw(state, dt)
}

resize()
requestAnimationFrame(frame)
