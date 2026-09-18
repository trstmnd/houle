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

/** État initial d'une run. SPEC.md §3 « L'objet state ». */
export function createState(seed) {
  const t = terrain.create(seed)
  const ground = t.sample(0)
  return {
    phase: 'title',
    seed, terrain: t, wind: t.wind,
    t: 0, ending: false,
    x: 0, y: ground.y, vx: 0, vy: 0,
    s: TUNING.START_SPEED,
    angle: Math.atan2(ground.dy, 1),
    grounded: true, pressed: false,
    airTime: 0, flightRings: 0, stun: 0, charge: 0,
    score: 0, chain: 0, mult: 1, best: 0,
    rings: [], ringsUpto: 0,
    events: [],
    lastLanding: { quality: '', diff: 0, flips: 0 },
    cam: { x: 0, y: ground.y, zoom: 1 },
  }
}

/**
 * Un pas fixe de simulation. Remplit state.events ('takeoff', 'ring', 'land_perfect', 'land_ok', 'crash', 'end').
 * Session 1 : sol, décollage, vol sans rotation, réception simplifiée.
 * Session 2 : rotation, alignement, réception à 3 niveaux, crash, stun, chrono.
 * Session 3 : anneaux (via rings.js), vent.
 */
export function step(state, dt) {
  // Session 1
}

/**
 * Intègre un vol balistique depuis (x, y) à (vx, vy) jusqu'au contact. Pour rings.js.
 * @returns {{ apex: {x, y}, land: {x, y}, t: number }}
 */
export function simulateFlight(terrainObj, x, y, vx, vy, wind) {
  // Session 3
  return { apex: { x, y }, land: { x, y }, t: 0 }
}
