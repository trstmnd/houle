// Physique du jeu. PUR : aucun document, window, canvas, performance, Date, Math.random.
// Tout le game feel vit dans TUNING. Voir SPEC.md §3, §4, §10.
import * as terrain from './terrain.js'

export const STEP = 1 / 120

export const TUNING = {
  // Feel
  GRAVITY: 1000,        // u/s², sol et vol
  PRESS_MULT: 2.2,      // gravité doigt posé au sol
  MAX_SPEED: 1200,      // u/s, borne aussi la portée des sauts (lisibilité, SPEC §6)
  MIN_SPEED: 180,       // u/s, jamais arrêté
  START_SPEED: 420,
  CRASH_SPEED: 260,
  CRASH_STUN: 0.4,      // s, input ignoré
  CRASH_SPIN: 14,       // rad/s, culbute visuelle
  FRICTION: 0.28,       // /s, proportionnel à la vitesse
  ROT_SPEED: 5.5,       // rad/s, backflip doigt posé en vol
  AIR_TIME_SCALE: 0.82, // ralenti en vol
  ALIGN_RATE: 6,        // /s, alignement sur la trajectoire doigt levé
  ALIGN_ZONE: 1.2,      // rad, au-delà un flip lâché reste à l'envers
  TAKEOFF_GRACE: 0.05,  // s sans test de contact après décollage
  LAND_PERFECT: 0.26,   // rad (≈ 15°)
  LAND_FAIL: 0.70,      // rad (≈ 40°)
  LAND_LOSS: 0.45,      // perte max sur réception correcte
  PERFECT_BOOST: 1.12,
  FLIP_BOOST: 1.06,     // par flip complet rentré parfait
  WIND_MAX: 140,        // u/s²
  RUN_TIME: 60,         // s
  INPUT_LOCK: 0.3,      // s après un changement d'écran

  // Terrain
  HILL_BASE: 170,       // u
  HILL_WAVE: 1300,      // u
  OCT_AMP: [1, 0.26, 0.07],
  OCT_WAVE: [1, 0.43, 0.18],
  MOD_DEPTH: 0.3,
  MOD_WAVE: 7.3,        // en longueurs d'onde de l'octave
  SLOPE_AVG: 0.12,      // ≈ 7°

  // Anneaux
  RING_R: 34,
  RING_EASY_SPEED: 0.55,
  RING_HARD_SPEED: 0.85,
  RING_EASY_VALUE: 10,
  RING_HARD_VALUE: 30,
  MULT_TABLE: [1, 2, 3, 5, 8],
  RING_POOL: 64,
  RING_LOOKAHEAD: 3000,

  // Caméra et effets (lus par render.js, réglés ici pour n'avoir qu'un endroit)
  VIEW_H: 800,
  CAM_ANCHOR: [0.35, 0.55],
  CAM_RATE_X: 8,
  CAM_RATE_Y: 4,
  CAM_LOOK_Y: 0.2,
  LOOK_AHEAD: 160,
  ZOOM_MAX: 0.35,
  ZOOM_RATE: 3,
  TRAIL_LEN: 24,
  SHAKE_PERFECT: 4,
  SHAKE_CRASH: 14,
  SHAKE_DECAY: 12,
}

/** Ramène un angle dans ]-π, π]. */
export function wrapAngle(a) {
  a = (a + Math.PI) % (2 * Math.PI)
  if (a < 0) a += 2 * Math.PI
  return a - Math.PI
}

/** Critère centripète : sur une bosse (ddy > 0), le sol ne peut que pousser. Partagé avec rings.js. */
export function canTakeOff(s, dy, ddy) {
  if (ddy <= 0) return false
  const kappa = ddy / Math.pow(1 + dy * dy, 1.5)
  const cosTheta = 1 / Math.sqrt(1 + dy * dy)
  return s * s * kappa > TUNING.GRAVITY * cosTheta
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }

// Combien de longueurs d'onde on fouille pour trouver le sommet de départ. Structurel, pas du feel.
const START_SEARCH_WAVES = 3

// φ0 = 3π/2 pose l'octave principal sur un sommet en x = 0, mais les deux autres octaves ont une
// phase seedée : sur beaucoup de seeds, 0 tombe en pleine montée. On démarre donc sur la crête dont
// la descente est la plus franche, ce que la spec demande vraiment : 2 secondes de descente d'entrée.
function startX(t) {
  const span = TUNING.HILL_WAVE * START_SEARCH_WAVES
  const cs = t.crests(0, span)
  if (cs.length === 0) return 0
  let bestX = cs[0].x, bestDrop = -Infinity
  for (let i = 0; i < cs.length; i++) {
    const xc = cs[i].x
    let drop = 0
    for (let d = 8; d <= TUNING.HILL_WAVE; d += 8) {
      const g = t.sample(xc + d)
      if (g.dy < 0) break                       // creux atteint : la descente est finie
      drop = g.y - cs[i].y
    }
    if (drop > bestDrop) { bestDrop = drop; bestX = xc }
  }
  return bestX
}

/** État initial d'une run. SPEC.md §3 « L'objet state ». */
export function createState(seed) {
  const t = terrain.create(seed)
  const x = startX(t)
  const ground = t.sample(x)
  const dy = ground.dy
  const tx = 1 / Math.sqrt(1 + dy * dy), ty = dy * tx
  return {
    phase: 'title',
    seed, terrain: t, wind: t.wind,
    t: 0, ending: false,
    x, y: ground.y, vx: TUNING.START_SPEED * tx, vy: TUNING.START_SPEED * ty,
    s: TUNING.START_SPEED,
    angle: Math.atan2(dy, 1),
    grounded: true, pressed: false,
    airTime: 0, flightRings: 0, stun: 0, charge: 0,
    score: 0, chain: 0, mult: 1, best: 0,
    rings: [], ringsUpto: 0,
    events: [],
    lastLanding: { quality: '', diff: 0, flips: 0 },
    cam: { x, y: ground.y, zoom: 1 },
  }
}

/**
 * Un pas fixe de simulation. Remplit state.events ('takeoff', 'ring', 'land_perfect', 'land_ok', 'crash', 'end').
 * Session 1 : sol, décollage, vol sans rotation, réception simplifiée.
 * Session 2 : rotation, alignement, réception à 3 niveaux, crash, stun, chrono.
 * Session 3 : anneaux (via rings.js), vent.
 */
export function step(state, dt) {
  if (state.phase !== 'run') return
  state.t += dt                                  // temps réel, la règle du dernier vol arrive en session 2
  const pressed = state.pressed && state.stun <= 0
  if (state.stun > 0) state.stun -= dt
  if (state.grounded) stepGround(state, dt, pressed)
  else stepAir(state, dt)
  stepCamera(state, dt)
}

// Doigt posé : la gravité est multipliée, on plaque et on charge. On ne décolle jamais.
function stepGround(state, dt, pressed) {
  const T = TUNING, ter = state.terrain
  const dy = ter.sample(state.x).dy
  const tx = 1 / Math.sqrt(1 + dy * dy), ty = dy * tx
  const gEff = T.GRAVITY * (pressed ? T.PRESS_MULT : 1)
  let s = state.s + gEff * ty * dt
  s -= T.FRICTION * s * dt
  s = clamp(s, T.MIN_SPEED, T.MAX_SPEED)
  state.x += s * tx * dt

  const g = ter.sample(state.x)                  // recalé sur la courbe, jamais d'erreur accumulée
  const ndy = g.dy, nddy = g.ddy
  state.y = g.y
  state.s = s
  state.angle = Math.atan2(ndy, 1)
  const ntx = 1 / Math.sqrt(1 + ndy * ndy), nty = ndy * ntx
  state.vx = s * ntx
  state.vy = s * nty
  state.charge = (s - T.MIN_SPEED) / (T.MAX_SPEED - T.MIN_SPEED)

  if (!pressed && canTakeOff(s, ndy, nddy)) {
    state.grounded = false
    state.airTime = 0
    state.flightRings = 0
    state.events.push('takeoff')
  }
}

function stepAir(state, dt) {
  const T = TUNING
  const d = dt * T.AIR_TIME_SCALE                // le ralenti rend la visée possible au doigt
  state.vx += state.wind * d
  state.vy += T.GRAVITY * d
  state.x += state.vx * d
  state.y += state.vy * d
  state.airTime += d
  // Session 2 : backflip doigt posé, alignement sur la trajectoire doigt levé

  if (state.airTime < T.TAKEOFF_GRACE) return    // sinon le premier tick retombe sur la courbe
  const g = state.terrain.sample(state.x)
  if (state.y < g.y) return
  land(state, g.y, g.dy)
}

// Session 1 : toute réception passe. Les 3 niveaux, le boost et le crash arrivent en session 2.
function land(state, gy, dy) {
  const T = TUNING
  const tx = 1 / Math.sqrt(1 + dy * dy), ty = dy * tx
  const slope = Math.atan2(dy, 1)
  const sTan = state.vx * tx + state.vy * ty     // seule la vitesse le long de la pente survit

  state.lastLanding.quality = 'ok'
  state.lastLanding.diff = wrapAngle(state.angle - slope)
  state.lastLanding.flips = 0

  state.s = clamp(sTan, T.MIN_SPEED, T.MAX_SPEED)
  state.grounded = true
  state.y = gy
  state.angle = slope
  state.vx = state.s * tx
  state.vy = state.s * ty
  state.charge = (state.s - T.MIN_SPEED) / (T.MAX_SPEED - T.MIN_SPEED)
  state.events.push('land_ok')
}

// La caméra vit dans state : render.js ne fait que la lire. Lissage indépendant du framerate.
function stepCamera(state, dt) {
  const T = TUNING, cam = state.cam
  const cx = state.x + T.LOOK_AHEAD * state.charge
  const cy = state.y + state.vy * T.CAM_LOOK_Y
  cam.x += (cx - cam.x) * (1 - Math.exp(-T.CAM_RATE_X * dt))
  cam.y += (cy - cam.y) * (1 - Math.exp(-T.CAM_RATE_Y * dt))
  const z = 1 - T.ZOOM_MAX * state.charge        // dézoom avec la vitesse, le meilleur retour qui existe
  cam.zoom += (z - cam.zoom) * (1 - Math.exp(-T.ZOOM_RATE * dt))
}

/**
 * Intègre un vol balistique depuis (x, y) à (vx, vy) jusqu'au contact. Pour rings.js.
 * @returns {{ apex: {x, y}, land: {x, y}, t: number }}
 */
export function simulateFlight(terrainObj, x, y, vx, vy, wind) {
  // Session 3
  return { apex: { x, y }, land: { x, y }, t: 0 }
}
