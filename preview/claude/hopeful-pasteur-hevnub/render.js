// Tout le dessin. Lit state, n'y écrit jamais. Traînée, particules et secousse sont internes ici.
// Voir SPEC.md §8. Session 1 : ciel plat, terrain, personnage, caméra. Session 4 : parallaxe, particules.
import { TUNING } from './physics.js'

const STEP_X = 6        // u entre deux points de la courbe dessinée
const MARGIN = 60       // u de terrain dessinés au-delà des bords
const DEPTH = 2000      // u de remplissage sous la caméra
const BODY_R = 14       // u, rayon du corps
const BOARD_W = 44, BOARD_H = 6, BOARD_DY = 16   // u, planche sous le corps

let canvas, ctx, palette
let W = 0, H = 0, scale = 1
let sky = null
let curveY = null       // hauteurs de la courbe, pré-alloué : rien ne s'alloue dans draw

// Traînée : tampon circulaire de positions au sol, interne au rendu.
const trailX = new Float64Array(TUNING.TRAIL_LEN)
const trailY = new Float64Array(TUNING.TRAIL_LEN)
let trailN = 0, trailHead = 0

/** Lit la palette CSS une fois, alloue les pools. Jamais de getComputedStyle dans la boucle. */
export function init(c) {
  canvas = c
  ctx = canvas.getContext('2d')
  const cs = getComputedStyle(document.documentElement)
  palette = {}
  for (const k of ['sky-1', 'sky-2', 'far', 'mid', 'ground', 'ground-edge', 'fg', 'ink', 'paper', 'accent', 'accent-hi', 'danger']) {
    palette[k] = cs.getPropertyValue('--' + k).trim()
  }
}

export function resize(w, h, dpr) {
  W = w; H = h
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  scale = h / TUNING.VIEW_H

  sky = ctx.createLinearGradient(0, 0, 0, h)   // recréé ici seulement, jamais par frame
  sky.addColorStop(0, palette['sky-1'])
  sky.addColorStop(1, palette['sky-2'])

  // Le pire cas de largeur monde : zoom au minimum, donc vue la plus large.
  const worldW = W / (scale * (1 - TUNING.ZOOM_MAX)) + 2 * MARGIN
  const n = Math.ceil(worldW / STEP_X) + 4
  if (!curveY || curveY.length < n) curveY = new Float64Array(n)
}

/** Dessine une frame, avance traînée et effets de dt. */
export function draw(state, dt) {
  const cam = state.cam
  const zoom = scale * cam.zoom

  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  pushTrail(state)

  ctx.save()
  ctx.translate(TUNING.CAM_ANCHOR[0] * W, TUNING.CAM_ANCHOR[1] * H)
  ctx.scale(zoom, zoom)
  ctx.translate(-cam.x, -cam.y)

  drawTerrain(state, cam, zoom)
  drawTrail(state)
  drawRider(state)

  ctx.restore()
}

function drawTerrain(state, cam, zoom) {
  const left = cam.x - TUNING.CAM_ANCHOR[0] * W / zoom - MARGIN
  const right = cam.x + (1 - TUNING.CAM_ANCHOR[0]) * W / zoom + MARGIN
  const x0 = Math.floor(left / STEP_X) * STEP_X
  const n = Math.min(curveY.length, Math.ceil((right - x0) / STEP_X) + 1)
  const ter = state.terrain
  for (let i = 0; i < n; i++) curveY[i] = ter.sample(x0 + i * STEP_X).y

  const bottom = cam.y + DEPTH
  ctx.beginPath()
  ctx.moveTo(x0, bottom)
  for (let i = 0; i < n; i++) ctx.lineTo(x0 + i * STEP_X, curveY[i])
  ctx.lineTo(x0 + (n - 1) * STEP_X, bottom)
  ctx.closePath()
  ctx.fillStyle = palette.ground
  ctx.fill()

  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const x = x0 + i * STEP_X
    if (i === 0) ctx.moveTo(x, curveY[i]); else ctx.lineTo(x, curveY[i])
  }
  ctx.strokeStyle = palette['ground-edge']
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.stroke()
}

// La jauge de charge n'est pas dans le HUD : c'est cette traînée et le dézoom (SPEC §7).
function pushTrail(state) {
  if (state.pressed && state.grounded) {
    trailX[trailHead] = state.x
    trailY[trailHead] = state.y
    trailHead = (trailHead + 1) % TUNING.TRAIL_LEN
    if (trailN < TUNING.TRAIL_LEN) trailN++
  } else if (trailN > 0) {
    trailN--   // elle se résorbe au lieu de disparaître d'un coup
  }
}

function drawTrail(state) {
  if (trailN < 2) return
  const len = TUNING.TRAIL_LEN
  ctx.strokeStyle = palette.accent
  ctx.lineCap = 'round'
  const oldest = (trailHead - trailN + 2 * len) % len
  for (let i = 1; i < trailN; i++) {
    const a = (oldest + i - 1) % len            // jamais trailHead : cette case n'est pas encore écrite
    const b = (oldest + i) % len
    const k = i / trailN                       // 0 à la queue, 1 sous les pieds
    ctx.globalAlpha = 0.5 * k * (0.3 + 0.7 * state.charge)
    ctx.lineWidth = 2 + 10 * state.charge * k
    ctx.beginPath()
    ctx.moveTo(trailX[a], trailY[a])
    ctx.lineTo(trailX[b], trailY[b])
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// Trois formes : un disque, une planche, un point à l'avant. Ça suffit à lire un flip.
function drawRider(state) {
  ctx.save()
  ctx.translate(state.x, state.y)
  ctx.rotate(state.angle)

  ctx.fillStyle = palette.ink
  roundRect(-BOARD_W / 2, -BOARD_H, BOARD_W, BOARD_H, BOARD_H / 2)
  ctx.fill()

  ctx.beginPath()
  ctx.arc(0, -BOARD_H - BOARD_DY, BODY_R, 0, 2 * Math.PI)
  ctx.fill()

  ctx.beginPath()
  ctx.arc(BOARD_W / 2 - 4, -BOARD_H / 2, 3.5, 0, 2 * Math.PI)
  ctx.fillStyle = palette['accent-hi']
  ctx.fill()

  ctx.restore()
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Effet visuel déclenché par un événement de state.events. */
export function fx(event, state) {
  // Session 4 : particules, secousse, voile de crash
}

export function getPalette() { return palette }
