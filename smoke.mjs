// Importe les modules purs dans Node et vérifie qu'ils tiennent debout.
// Pas un banc de test : un filet. Il attrape une faute de syntaxe, un import cassé, un NaN.
import assert from 'node:assert/strict'
import { TUNING, STEP, createState, step, canTakeOff, wrapAngle } from './game/physics.js'
import * as terrain from './game/terrain.js'
import * as rings from './game/rings.js'
import { mulberry32 } from './game/rng.js'

const KEYS = ['GRAVITY', 'PRESS_MULT', 'MAX_SPEED', 'MIN_SPEED', 'START_SPEED', 'CRASH_SPEED', 'FRICTION',
  'ROT_SPEED', 'AIR_TIME_SCALE', 'LAND_PERFECT', 'LAND_FAIL', 'WIND_MAX', 'RUN_TIME',
  'HILL_BASE', 'HILL_WAVE', 'SLOPE_AVG', 'RING_R', 'MULT_TABLE', 'VIEW_H']
for (const k of KEYS) assert.ok(k in TUNING, `TUNING.${k} manque`)
assert.ok(STEP > 0 && STEP < 1 / 30)

// rng : déterministe
const a = mulberry32(42), b = mulberry32(42)
assert.equal(a(), b())
assert.notEqual(mulberry32(1)(), mulberry32(2)())

// terrain : fini et déterministe
const t1 = terrain.create(123456), t2 = terrain.create(123456)
for (const x of [0, 500, 5000, 50000]) {
  const s = t1.sample(x)
  assert.ok(Number.isFinite(s.y) && Number.isFinite(s.dy) && Number.isFinite(s.ddy), `sample(${x}) non fini`)
  assert.equal(s.y, t2.sample(x).y, 'terrain non déterministe')
}

// physique : 10 s de pas fixes, doigt posé une seconde sur deux, rien ne part en NaN
const st = createState(123456)
st.phase = 'run'
for (let i = 0; i < 1200; i++) {
  st.pressed = Math.floor(i / 120) % 2 === 0
  step(st, STEP)
  assert.ok(Number.isFinite(st.x) && Number.isFinite(st.y) && Number.isFinite(st.s), `NaN au pas ${i}`)
}
assert.ok(st.x >= 0, 'le personnage recule')
assert.equal(typeof canTakeOff(1000, 0, 0.01), 'boolean')
assert.ok(Math.abs(wrapAngle(3 * Math.PI)) <= Math.PI + 1e-9)

// anneaux : la génération ne jette pas
rings.ensure(st, st.x + 3000)
console.log('smoke : ok')
