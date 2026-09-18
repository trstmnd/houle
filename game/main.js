// Point d'entrée : boucle, pas fixe, input, machine à états. Voir SPEC.md §5, §7.
// Seul fichier qui connaît le DOM et l'horloge.
import { STEP, TUNING, createState, step } from './physics.js'
import * as render from './render.js'
import * as audio from './audio.js'

// Version affichée sur l'écran d'accueil. À monter d'un cran à chaque push qui change le jeu :
// c'est le seul moyen de savoir, sur un téléphone, si on joue bien la dernière.
const VERSION = '0.18.0'

const MAX_FRAME = 1 / 30   // borne du dt de frame : sans elle, un lag traverse la montagne

const canvas = document.getElementById('game')
const titleScreen = document.getElementById('title')
const endScreen = document.getElementById('end')
const hud = document.getElementById('hud')
const elSpeed = document.getElementById('speed')
const elSpeedBar = document.getElementById('speed-bar')
const elDist = document.getElementById('dist')
const elTimer = document.getElementById('timer')
const elScore = document.getElementById('score')
const elChain = document.getElementById('chain')
const elFlash = document.getElementById('flash')
const elJump = document.getElementById('jump')
const elJumpLen = document.getElementById('jump-len')
const pads = document.getElementById('pads')
const zoneL = document.getElementById('zone-l')
const zoneM = document.getElementById('zone-m')
const zoneR = document.getElementById('zone-r')
const elChargeBar = document.getElementById('charge-bar')
const elTuto = document.getElementById('tuto')
const elTutoText = document.getElementById('tuto-text')

function readSeed() {
  const raw = new URLSearchParams(location.search).get('seed')
  const n = raw === null ? NaN : parseInt(raw, 10)
  if (Number.isFinite(n) && n > 0) return n % 1000000
  return 100000 + Math.floor(Math.random() * 900000)
}

const seed = readSeed()
try { history.replaceState(null, '', '?seed=' + seed) } catch (e) { /* navigation privée */ }

render.init(canvas)
let state = createState(seed)
window.__ski = state   // poignée de debug : lire l'état depuis la console du téléphone

// Records : par piste et tous terrains. En navigation privée, l'accès jette, on s'en passe.
function readBest(key) {
  try { return parseInt(localStorage.getItem(key), 10) || 0 } catch (e) { return 0 }
}
function writeBest(key, v) {
  try { localStorage.setItem(key, String(v)) } catch (e) { /* navigation privée */ }
}

const seedKey = 'ski3000:best:' + seed
// Les records d'avant le renommage sont repris une fois, puis oubliés : personne ne perd sa piste.
if (readBest(seedKey) === 0 && readBest('houle:best:' + seed) > 0) {
  writeBest(seedKey, readBest('houle:best:' + seed))
}
let best = readBest(seedKey)
setText('title-seed', String(seed).padStart(6, '0'))
setText('title-version', VERSION)
setText('title-best', best)

function setText(id, v) { document.getElementById(id).textContent = v }

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  render.resize(window.innerWidth, window.innerHeight, dpr)
}

let paused = false
let inputLock = 0   // input ignoré juste après un changement d'écran (SPEC §7)
let keyLeft = false, keyRight = false, keySteer = 0
let padSteer = 0
let padDir = 0      // -1 ou 1 tant qu'une zone de virage est tenue
let padTuck = false // les deux côtés tenus en même temps : position de l'œuf

// Trois zones qui couvrent l'écran. On retient quel pointeur tient quelle zone : sans ça, lâcher
// le doigt de saut annulerait le virage que l'autre doigt tient encore.
const tenus = new Map()

function bindZone(el, role) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    audio.init()
    startRun()
    tenus.set(e.pointerId, role)
    appliqueZones()
    if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId) } catch (err) { /* sans capture, tant pis */ } }
  })
  const fin = (e) => {
    e.stopPropagation()
    tenus.delete(e.pointerId)
    appliqueZones()
  }
  el.addEventListener('pointerup', fin)
  el.addEventListener('pointercancel', fin)
}

function appliqueZones() {
  let gauche = false, droite = false, saut = false
  for (const role of tenus.values()) {
    if (role === -1) gauche = true
    else if (role === 1) droite = true
    else saut = true
  }
  // Les deux côtés à la fois : plus de carre, on se met en œuf et ça prend de la vitesse.
  padTuck = gauche && droite
  padDir = padTuck ? 0 : (gauche ? -1 : (droite ? 1 : 0))
  state.press = saut && !padTuck
  zoneL.classList.toggle('on', gauche)
  zoneR.classList.toggle('on', droite)
  zoneM.classList.toggle('on', state.press)
}

function relacheTout() {
  tenus.clear()
  appliqueZones()
}

bindZone(zoneL, -1)
bindZone(zoneM, 0)
bindZone(zoneR, 1)

function startRun() {
  if (state.phase !== 'title' || inputLock > 0) return
  state.phase = 'run'
  titleScreen.hidden = true
  hud.hidden = false
  document.body.classList.add('playing')
  tutoStep = tutoDone ? -1 : 0
  showTuto()
}

function endRun() {
  const d = Math.round(state.dist)
  if (state.score > best) { best = state.score; writeBest(seedKey, best) }
  setText('end-dist', state.score)
  setText('end-sub', d + ' m parcourus')
  setText('end-best', best)
  setText('end-seed', String(seed).padStart(6, '0'))
  endScreen.hidden = false
  hud.hidden = true            // la carte de fin recouvre le HUD, autant le retirer
  pads.hidden = true
  elTuto.hidden = true
  document.body.classList.remove('playing')
  inputLock = TUNING.INPUT_LOCK
}

// Rejouer, c'est repartir d'un état neuf sur la même piste : rien à remettre à zéro à la main.
function restart(newSeed) {
  if (newSeed !== seed) {
    location.search = '?seed=' + newSeed
    return
  }
  state = createState(seed)
  window.__ski = state
  state.phase = 'run'
  endScreen.hidden = true
  hud.hidden = false
  pads.hidden = false
  document.body.classList.add('playing')
  inputLock = TUNING.INPUT_LOCK
  lastSpeed = lastDist = lastTimer = -1
  acc = 0
}

document.getElementById('btn-replay').addEventListener('pointerdown', (e) => { e.stopPropagation(); restart(seed) })
document.getElementById('btn-new').addEventListener('pointerdown', (e) => {
  e.stopPropagation()
  restart(100000 + Math.floor(Math.random() * 900000))
})
// Toujours depuis le gestionnaire du clic, jamais après un await : sinon le geste est perdu.
document.getElementById('btn-share').addEventListener('pointerdown', (e) => {
  e.stopPropagation()
  const url = location.href
  const toast = document.getElementById('toast')
  if (navigator.share) { navigator.share({ title: 'Ski 3000', url }).catch(() => {}); return }
  if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {})
  toast.hidden = false
  setTimeout(() => { toast.hidden = true }, 1500)
})


window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keyLeft = true; e.preventDefault(); startRun() }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { keyRight = true; e.preventDefault(); startRun() }
  if (e.code === 'Space') { e.preventDefault(); startRun(); state.press = true; zoneM.classList.add('on') }
})
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyLeft = false
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keyRight = false
  if (e.code === 'Space') { state.press = false; zoneM.classList.remove('on') }
})

function pause() { paused = true; audio.suspend() }
function unpause() {
  if (!paused) return
  paused = false
  last = -1                          // on repart du temps courant, jamais de rattrapage
  acc = 0
  audio.resume()
}
window.addEventListener('blur', () => { keyLeft = keyRight = false; relacheTout(); pause() })
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

  if (padDir !== 0) padSteer = clamp(padSteer + padDir * dt / T.KEY_RAMP, -1, 1)
  else padSteer -= padSteer * (1 - Math.exp(-dt / T.STEER_RETURN))

  // Les zones gagnent sur le clavier, et la carre revient toujours à zéro toute seule.
  if (padDir !== 0 || Math.abs(padSteer) > 0.001) state.steer = padSteer
  else if (dir !== 0 || Math.abs(keySteer) > 0.001) state.steer = keySteer
  else state.steer -= state.steer * (1 - Math.exp(-dt / T.STEER_RETURN))

  // Au clavier comme au doigt, les deux côtés ensemble mettent en œuf.
  state.tuck = padTuck || (keyLeft && keyRight)
  if (state.tuck) state.press = false     // en œuf, les mains sont sur les genoux : pas de saut
}

let flashTimer = 0, jumpTimer = 0

// Didacticiel : une étape à la fois, chacune attend son geste. Jamais de texte qu'on ne peut pas faire disparaître.
const TUTO = [
  { texte: 'Tiens à gauche ou à droite pour virer', fait: (s) => Math.abs(s.steer) > 0.35 },
  { texte: 'Lâche : le skieur revient dans l\'axe', fait: (s) => Math.abs(s.steer) < 0.05 && s.t > 3 },
  { texte: 'Virer freine. Tout droit, ça va vite', fait: (s) => s.s > 22 },
  { texte: 'Vise les piquets orange : ce sont les tremplins', fait: (s) => !s.grounded },
  { texte: 'Tiens le milieu dans la courbe, lâche sur la bosse', fait: (s) => s.charge > 0.5 },
  { texte: 'Passe entre les fanions : la chaîne multiplie', fait: (s) => s.chain > 0 },
  { texte: 'Les deux côtés en même temps : l\'œuf, ça accélère', fait: (s) => s.tuck },
]
let tutoStep = 0
let tutoDone = readBest('ski3000:tuto') === 1

function showTuto() {
  if (tutoStep < 0 || tutoStep >= TUTO.length) {
    elTuto.hidden = true
    return
  }
  elTutoText.textContent = TUTO[tutoStep].texte
  elTuto.hidden = false
}

function updateTuto() {
  if (tutoStep < 0 || tutoStep >= TUTO.length) return
  if (!TUTO[tutoStep].fait(state)) return
  tutoStep++
  if (tutoStep >= TUTO.length) {
    tutoDone = true
    writeBest('ski3000:tuto', 1)
  }
  showTuto()
}

function drain() {
  const events = state.events
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    render.fx(e, state)
    audio.play(e)
    if (e === 'wipe') flash(true)
    else if (e === 'land_flat') flash(false)
    else if (e === 'end') endRun()
    else if (e === 'jump_short' || e === 'jump_mid' || e === 'jump_long') showJump(e)
    else if (e === 'gate') pulseChain()
  }
  events.length = 0
}

// L'animation CSS ne repart que si l'élément est retiré du flux entre deux sauts.
function showJump(kind) {
  elJumpLen.textContent = Math.round(state.lastJump)
  elJump.classList.toggle('long', kind === 'jump_long')
  elJump.hidden = true
  void elJump.offsetWidth
  elJump.hidden = false
  jumpTimer = 0.9
}

// Le multiplicateur pulse au passage : l'animation ne repart que si la classe est retirée.
function pulseChain() {
  elChain.classList.remove('pulse')
  void elChain.offsetWidth
  elChain.classList.add('pulse')
}

function flash(bad) {
  elFlash.classList.toggle('bad', bad)
  elFlash.classList.add('on')
  flashTimer = 0.06
}

let lastSpeed = -1, lastDist = -1, lastTimer = -1, lastCharge = -1, lastScore = -1, lastChain = -1

// On ne touche le DOM que quand une valeur change : jamais à chaque frame pour rien.
function updateHud() {
  const kmh = Math.round(state.s * 3.6)
  if (kmh !== lastSpeed) {
    elSpeed.textContent = kmh
    elSpeedBar.style.width = Math.round(Math.min(1, state.s / TUNING.MAX_SPEED) * 100) + '%'
    lastSpeed = kmh
  }
  const d = Math.round(state.dist)
  if (d !== lastDist) { elDist.textContent = d; lastDist = d }
  if (state.score !== lastScore) { elScore.textContent = state.score; lastScore = state.score }
  if (state.chain !== lastChain) {
    elChain.textContent = '×' + state.mult
    elChain.hidden = state.chain < 1
    lastChain = state.chain
  }
  const ch = Math.round(state.charge * 20)
  if (ch !== lastCharge) { elChargeBar.style.width = ch * 5 + '%'; lastCharge = ch }
  const left = Math.max(0, Math.ceil(TUNING.RUN_TIME - state.t))
  if (left !== lastTimer) {
    elTimer.textContent = left
    elTimer.classList.toggle('low', left <= 10)
    elTimer.classList.toggle('blink', left === 0)
    lastTimer = left
  }
}

let last = -1, acc = 0

function frame(now) {
  requestAnimationFrame(frame)
  if (last < 0) last = now
  let dt = (now - last) / 1000
  last = now
  if (dt > MAX_FRAME) dt = MAX_FRAME

  if (inputLock > 0) inputLock -= dt
  if (flashTimer > 0) { flashTimer -= dt; if (flashTimer <= 0) elFlash.classList.remove('on') }
  if (jumpTimer > 0) { jumpTimer -= dt; if (jumpTimer <= 0) elJump.hidden = true }

  if (!paused && state.phase === 'run') {
    updateSteer(dt)
    acc += dt
    while (acc >= STEP) { step(state, STEP); acc -= STEP }
    drain()
    updateHud()
    updateTuto()
  }
  audio.setWind(state.s / TUNING.MAX_SPEED, !state.grounded)
  render.draw(state, dt)
}

resize()
requestAnimationFrame(frame)
