// Importe les modules purs dans Node et vérifie qu'ils tiennent debout.
// Pas un banc de test : un filet. Il attrape une faute de syntaxe, un import cassé, un NaN.
import assert from 'node:assert/strict'
import { TUNING, STEP, createState, step } from './game/physics.js'
import * as terrain from './game/terrain.js'
import { mulberry32 } from './game/rng.js'

const KEYS = ['G', 'SLOPE', 'MAX_SPEED', 'START_SPEED', 'TURN_RATE', 'EDGE_DRAG', 'FRICTION',
  'AIR_DRAG', 'DEEP_DRAG', 'TRACK_HALF', 'LAND_PERFECT', 'LAND_FAIL', 'WIPE_SPEED', 'RUN_TIME',
  'WAVE_Z', 'MOG_AMP', 'GATE_W', 'MULT_TABLE', 'FOV_BASE', 'CELL']
for (const k of KEYS) assert.ok(k in TUNING, `TUNING.${k} manque`)
assert.ok(STEP > 0 && STEP < 1 / 30)

// rng : déterministe
const a = mulberry32(42), b = mulberry32(42)
assert.equal(a(), b())
assert.notEqual(mulberry32(1)(), mulberry32(2)())

// terrain : fini et déterministe, dérivées cohérentes avec la hauteur
const t1 = terrain.create(123456), t2 = terrain.create(123456)
for (const [x, z] of [[0, 0], [12, -500], [-30, -5000], [5, -40000]]) {
  const s = t1.sample(x, z)
  for (const k of ['y', 'hx', 'hz', 'hxx', 'hxz', 'hzz']) {
    assert.ok(Number.isFinite(s[k]), `sample(${x}, ${z}).${k} non fini`)
  }
  assert.equal(t1.sample(x, z).y, t2.sample(x, z).y, 'terrain non déterministe')
}

// Les dérivées analytiques doivent coller à la différence finie, sinon le décollage est faux.
const e = 0.01
for (const [x, z] of [[3, -120], [-17, -2500]]) {
  const y0 = t1.sample(x, z).y
  const ax = t1.sample(x, z).hx, az = t1.sample(x, z).hz
  const nx = (t1.sample(x + e, z).y - t1.sample(x - e, z).y) / (2 * e)
  const nz = (t1.sample(x, z + e).y - t1.sample(x, z - e).y) / (2 * e)
  assert.ok(Math.abs(ax - nx) < 1e-3, `hx faux en ${x},${z} : ${ax} contre ${nx}`)
  assert.ok(Math.abs(az - nz) < 1e-3, `hz faux en ${x},${z} : ${az} contre ${nz}`)
  const axx = t1.sample(x, z).hxx
  const nxx = (t1.sample(x + e, z).y - 2 * y0 + t1.sample(x - e, z).y) / (e * e)
  assert.ok(Math.abs(axx - nxx) < 1e-2, `hxx faux en ${x},${z} : ${axx} contre ${nxx}`)
  const azz = t1.sample(x, z).hzz
  const nzz = (t1.sample(x, z + e).y - 2 * y0 + t1.sample(x, z - e).y) / (e * e)
  assert.ok(Math.abs(azz - nzz) < 1e-2, `hzz faux en ${x},${z} : ${azz} contre ${nzz}`)
}

// Les tremplins sont dans la hauteur : on vérifie leurs dérivées sur le dos de l'un d'eux,
// sinon le critère de décollage les lit faux et le saut part n'importe comment.
const r = t1.jump(3, {})
for (const [x, z] of [[r.x, r.z + 4], [r.x + 3, r.z - 2]]) {
  const y0 = t1.sample(x, z).y
  const ax = t1.sample(x, z).hx, az = t1.sample(x, z).hz
  const nx = (t1.sample(x + e, z).y - t1.sample(x - e, z).y) / (2 * e)
  const nz = (t1.sample(x, z + e).y - t1.sample(x, z - e).y) / (2 * e)
  assert.ok(Math.abs(ax - nx) < 1e-3, `hx faux sur un tremplin : ${ax} contre ${nx}`)
  assert.ok(Math.abs(az - nz) < 1e-3, `hz faux sur un tremplin : ${az} contre ${nz}`)
  const azz = t1.sample(x, z).hzz
  const nzz = (t1.sample(x, z + e).y - 2 * y0 + t1.sample(x, z - e).y) / (e * e)
  assert.ok(Math.abs(azz - nzz) < 1e-2, `hzz faux sur un tremplin : ${azz} contre ${nzz}`)
}
// Ce qui compte pour un tremplin, ce n'est pas d'être plus haut que ses voisins, c'est d'être un
// dôme : la courbure le long de la descente doit être franchement négative, sinon le critère de
// décollage ne le voit pas. Comparer deux hauteurs ne marche plus depuis que la piste est en cuvette.
const courbure = t1.sample(r.x, r.z).hzz
assert.ok(courbure < -0.04, `le tremplin n'est pas un dôme : hzz = ${courbure.toFixed(4)}`)

// physique : 20 s de pas fixes, la carre bouge, rien ne part en NaN ni sous la neige
const st = createState(123456)
st.phase = 'run'
for (let i = 0; i < 2400; i++) {
  st.steer = 0.4 * Math.sin(i / 90)   // des virages tenus, pas un blocage de carre
  step(st, STEP)
  assert.ok(Number.isFinite(st.x) && Number.isFinite(st.y) && Number.isFinite(st.s), `NaN au pas ${i}`)
  if (st.grounded) {
    const g = st.terrain.sample(st.x, st.z)
    assert.ok(Math.abs(st.y - g.y) < 1e-6, `sous la neige au pas ${i}`)
  }
}
assert.ok(st.dist > 100, `le skieur ne descend pas : ${st.dist} m`)
assert.ok(st.s > 0 && st.s <= TUNING.MAX_SPEED, `vitesse hors bornes : ${st.s}`)

console.log('smoke : ok, descente de', Math.round(st.dist), 'm en 20 s')
