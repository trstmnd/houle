// Physique du ski. PUR : aucun three, document, window, performance, Date, Math.random.
// Mètres et secondes. Tout le feel vit dans TUNING. Voir SPEC.md §5, §9.
import * as terrain from './terrain.js'

export const STEP = 1 / 120

export const TUNING = {
  // Glisse
  G: 9.81,
  SLOPE: 0.37,          // pente moyenne, 20°
  MAX_SPEED: 45,        // m/s
  MIN_SPEED: 2,
  START_SPEED: 12,
  TURN_RATE: 1.1,       // rad/s à pleine carre
  FALL_ALIGN: 1.4,      // /s, rappel du cap vers l axe de la piste quand la carre est lâchée
  EDGE_DRAG: 0.45,      // /s à steer = 1 : virer coûte, c'est tout l'arbitrage du jeu
  FRICTION: 0.06,       // /s, neige damée
  AIR_DRAG: 0.0012,     // /m, pose la vitesse terminale
  DEEP_DRAG: 0.4,       // /s hors piste : un coût, pas un mur
  TRACK_HALF: 45,       // m, demi-largeur : plus étroit, un virage tenu sort de la piste en 5 s

  // Vol et réception
  STICK: 3.2,           // combien de g les jambes encaissent avant que le sol lâche : sans ce terme,
                        // la moindre bosse catapulte, un skieur absorbe et reste collé
  AIR_STEER: 0.6,       // le cap répond moins bien en l'air qu'au sol
  TAKEOFF_GRACE: 0.06,  // s sans test de contact après le décollage
  LAND_PERFECT: 0.22,   // rad
  LAND_FAIL: 0.62,      // rad
  LAND_LOSS: 0.5,
  LAND_BOOST: 1.04,
  WIPE_SPEED: 6,        // m/s après une chute
  WIPE_TIME: 1.5,       // s sans contrôle

  // Input
  STEER_SPAN: 90,       // px de glissement pour aller de 0 à 1
  STEER_RETURN: 0.25,   // s pour revenir à 0 doigt levé
  KEY_RAMP: 0.18,       // s pour monter à 1 au clavier

  RUN_TIME: 60,

  // Terrain
  WAVE_X: 70,           // m, houle latérale
  WAVE_Z: 46,           // m, rouleaux en travers : ce sont eux qui décollent
  WAVE_BIG_X: 190,
  WAVE_BIG_Z: 260,
  MOG_X: 13,             // m, pas des bosses
  MOG_Z: 16,
  MOG_BAND: 220,        // m, alternance lisse / bosselé
  R1: 2.2,
  R2: 2.0,
  R3: 5.0,
  MOG_AMP: 0.85,

  // Portes (bloc 3)
  GATE_GAP: 140,
  GATE_W: 9,
  MULT_TABLE: [1, 2, 3, 5, 8],

  // Caméra et rendu, lus par render.js
  CAM_BACK: 8.5,
  CAM_UP: 3.6,
  CAM_RATE: 6,          // /s, lissage
  CAM_LOOK: 20,         // m devant le skieur
  FOV_BASE: 62,
  FOV_FAST: 88,
  FOV_RATE: 2.5,
  TREE_GAP: 16,         // m entre deux arbres du réseau
  GRID_NX: 96,
  GRID_NZ: 128,
  CELL: 3.2,            // m entre deux sommets du maillage
  FOG_NEAR: 60,
  FOG_FAR: 330,
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }

/** Ramène un angle dans ]-π, π]. */
export function wrapAngle(a) {
  a = (a + Math.PI) % (2 * Math.PI)
  if (a < 0) a += 2 * Math.PI
  return a - Math.PI
}

/** État initial d'une run. */
export function createState(seed) {
  const ter = terrain.create(seed)
  const g = ter.sample(0, 0)
  return {
    phase: 'title',
    seed, terrain: ter,
    t: 0, ending: false,
    x: 0, y: g.y, z: 0,
    vx: 0, vy: 0, vz: 0,
    s: TUNING.START_SPEED,
    heading: 0,                    // 0 = plein dans la pente, positif vers +X
    steer: 0,                      // -1 à 1, ce que dit le doigt
    lean: 0,                       // inclinaison lissée du skieur, pour le rendu
    grounded: true,
    airTime: 0,
    wipe: 0,                       // temps de chute restant
    dist: 0,                       // mètres descendus
    score: 0, chain: 0, mult: 1,
    gates: [], gatesUpto: 0,
    events: [],
    cam: { x: 0, y: g.y + TUNING.CAM_UP, z: TUNING.CAM_BACK, fov: TUNING.FOV_BASE },
  }
}

/** Un pas fixe. Remplit state.events ('takeoff', 'land_flat', 'land_hard', 'wipe', 'gate', 'end'). */
export function step(state, dt) {
  if (state.phase !== 'run') return
  state.t += dt
  // Le chrono à zéro n'interrompt pas un saut : le dernier vol compte jusqu'à la réception.
  if (state.t >= TUNING.RUN_TIME) {
    if (state.grounded) return finish(state)
    state.ending = true
  }

  if (state.wipe > 0) {
    state.wipe -= dt
    state.steer = 0                // pendant la chute, le doigt ne sert à rien
  }

  if (state.grounded) stepGround(state, dt)
  else stepAir(state, dt)

  const target = state.wipe > 0 ? 0 : state.steer
  state.lean += (target - state.lean) * (1 - Math.exp(-8 * dt))
  stepCamera(state, dt)
}

function stepGround(state, dt) {
  const T = TUNING
  const dx = Math.sin(state.heading), dz = -Math.cos(state.heading)
  const g = state.terrain.sample(state.x, state.z)
  const hd = g.hx * dx + g.hz * dz          // pente le long du cap, négative en descente
  const inv = 1 / Math.sqrt(1 + hd * hd)

  let s = state.s
  s += -T.G * hd * inv * dt                 // la gravité pousse dans la pente
  const deep = Math.abs(state.x) > T.TRACK_HALF ? T.DEEP_DRAG : 0
  s -= (T.FRICTION + T.EDGE_DRAG * Math.abs(state.steer) + deep) * s * dt
  s -= T.AIR_DRAG * s * s * dt
  s = clamp(s, T.MIN_SPEED, T.MAX_SPEED)

  state.heading += state.steer * T.TURN_RATE * dt
  // La pente ramène le skieur dans l'axe quand il lâche la carre. Sans ça, un doigt ne suffit pas :
  // on part en travers et on ne revient jamais. C'est l'axe de la piste, pas la pente locale : suivre
  // les vaguelettes ferait dériver le skieur hors piste en ligne droite.
  state.heading -= wrapAngle(state.heading) * T.FALL_ALIGN * (1 - Math.abs(state.steer)) * dt
  const ndx = Math.sin(state.heading), ndz = -Math.cos(state.heading)
  state.x += s * ndx * dt
  state.z += s * ndz * dt
  state.dist -= s * ndz * dt                // vers -Z : la distance descendue est positive
  state.s = s

  const ng = state.terrain.sample(state.x, state.z)
  state.y = ng.y
  const nhd = ng.hx * ndx + ng.hz * ndz
  const ninv = 1 / Math.sqrt(1 + nhd * nhd)
  state.vx = s * ndx * ninv
  state.vy = s * nhd * ninv
  state.vz = s * ndz * ninv

  if (state.wipe > 0) return                // on ne décolle pas pendant une chute
  // Courbure du sol le long du cap : positive sur un dos de bosse.
  const hdd = ng.hxx * ndx * ndx + 2 * ng.hxz * ndx * ndz + ng.hzz * ndz * ndz
  const kappa = -hdd / Math.pow(1 + nhd * nhd, 1.5)
  if (kappa > 0 && s * s * kappa > T.G * T.STICK * ninv) {
    state.grounded = false
    state.airTime = 0
    state.events.push('takeoff')
  }
}

function stepAir(state, dt) {
  const T = TUNING
  state.vy -= T.G * dt
  state.x += state.vx * dt
  state.y += state.vy * dt
  state.z += state.vz * dt
  state.dist -= state.vz * dt
  state.airTime += dt

  // Le cap suit toujours le doigt : on se replace pour la réception, pas d'acrobatie en v3.
  state.heading += state.steer * T.TURN_RATE * T.AIR_STEER * dt

  if (state.airTime < T.TAKEOFF_GRACE) return
  const g = state.terrain.sample(state.x, state.z)
  if (state.y > g.y) return
  land(state, g)
}

// À plat on garde tout, de travers on encaisse, trop de travers on tombe.
function land(state, g) {
  const T = TUNING
  const v = Math.hypot(state.vx, state.vy, state.vz)
  const dx = Math.sin(state.heading), dz = -Math.cos(state.heading)
  const hd = g.hx * dx + g.hz * dz
  const inv = 1 / Math.sqrt(1 + hd * hd)

  // Angle entre la vitesse et le plan de la pente, mesuré par la normale du terrain.
  const nlen = Math.sqrt(g.hx * g.hx + 1 + g.hz * g.hz)
  const vn = (-g.hx * state.vx + state.vy - g.hz * state.vz) / nlen
  const diff = v > 0.01 ? Math.abs(Math.asin(clamp(vn / v, -1, 1))) : 0

  const sTan = state.vx * dx * inv + state.vy * hd * inv + state.vz * dz * inv

  if (diff < T.LAND_PERFECT) {
    state.s = sTan * T.LAND_BOOST
    state.events.push('land_flat')
  } else if (diff < T.LAND_FAIL) {
    const k = (diff - T.LAND_PERFECT) / (T.LAND_FAIL - T.LAND_PERFECT)
    state.s = sTan * (1 - T.LAND_LOSS * k)
    state.events.push('land_hard')
  } else {
    state.s = T.WIPE_SPEED
    state.wipe = T.WIPE_TIME
    state.chain = 0
    state.mult = T.MULT_TABLE[0]
    state.events.push('wipe')
  }

  state.s = clamp(state.s, T.MIN_SPEED, T.MAX_SPEED)
  state.grounded = true
  state.y = g.y
  state.vy = 0
  if (state.ending) finish(state)
}

function finish(state) {
  state.phase = 'end'
  state.steer = 0
  state.events.push('end')
}

// La caméra vit dans state : render.js ne fait que la lire.
function stepCamera(state, dt) {
  const T = TUNING, cam = state.cam
  const dx = Math.sin(state.heading), dz = -Math.cos(state.heading)
  const k = 1 - Math.exp(-T.CAM_RATE * dt)
  cam.x += (state.x - dx * T.CAM_BACK - cam.x) * k
  cam.y += (state.y + T.CAM_UP - cam.y) * k
  cam.z += (state.z - dz * T.CAM_BACK - cam.z) * k
  // Le champ de vision s'ouvre avec la vitesse : le meilleur retour de vitesse qui existe.
  const f = (state.s - T.START_SPEED) / (T.MAX_SPEED - T.START_SPEED)
  const target = T.FOV_BASE + (T.FOV_FAST - T.FOV_BASE) * clamp(f, 0, 1)
  cam.fov += (target - cam.fov) * (1 - Math.exp(-T.FOV_RATE * dt))
}

/** Direction du regard de la caméra, en mètres devant le skieur. Lue par render.js. */
export function lookAt(state, out) {
  const dx = Math.sin(state.heading), dz = -Math.cos(state.heading)
  out.x = state.x + dx * TUNING.CAM_LOOK
  // On vise la neige devant, pas l'horizon : sinon la moitié de l'écran est du ciel.
  out.y = state.y - TUNING.SLOPE * TUNING.CAM_LOOK
  out.z = state.z + dz * TUNING.CAM_LOOK
  return out
}
