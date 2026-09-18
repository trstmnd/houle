// Scène Three : terrain, skieur, fanions, caméra. Lit state, n'y écrit jamais. Voir SPEC.md §8.
import * as THREE from 'three'
import { TUNING, lookAt } from './physics.js'

// Palette montagne. Le low poly ne tient que si les couleurs sont franches et peu nombreuses.
const SKY_TOP = 0x2F7BC4, SKY_LOW = 0xCFE8F7, FOG = 0xCFE8F7
const SNOW = 0xFDFDFF, SNOW_SHADE = 0x7FA6CE, ROCK = 0x6E6357
const PINE = 0x27443A, TRUNK = 0x4A3524, SUN = 0xFFF6E2
const RAMP = 0xF08A2B
const FLAG_L = 0xE0453A, FLAG_R = 0x1F7BB7

let renderer, scene, camera, terrainMesh, geo, posAttr, colAttr
let skier, skierBody, flagsL, flagsR, pines, trunks, sky, ramps, shadow
const ramp = { x: 0, y: 0, z: 0 }
let rampFirst = NaN
let originX = NaN, originZ = NaN      // case du réseau sur laquelle la grille est calée
let treeRow = NaN
const tree = { x: 0, y: 0, z: 0, scale: 1, show: false }
const cSnow = { r: 0, g: 0, b: 0 }, cShade = { r: 0, g: 0, b: 0 }, cRock = { r: 0, g: 0, b: 0 }
const look = { x: 0, y: 0, z: 0 }
const tmpObj = new THREE.Object3D()   // réutilisé pour poser les fanions, rien ne s'alloue par frame

const NX = TUNING.GRID_NX, NZ = TUNING.GRID_NZ, CELL = TUNING.CELL
const W = NX + 1                      // sommets par rangée
const heights = new Float32Array((NX + 1) * (NZ + 1))
const FLAG_EVERY = 14                 // m entre deux fanions d'une rangée
const FLAG_N = 30                     // fanions par rangée
const TREE_LANES = 9                  // cases de part et d'autre de la piste
const TREE_ROWS = 26                  // cases devant le skieur
const TREE_N = (2 * TREE_LANES + 1) * TREE_ROWS
const RAMP_N = 4          // tremplins balisés devant le skieur
const RAMP_POSTS = 2      // un piquet de chaque côté de la table

export function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY_LOW)
  scene.fog = new THREE.Fog(FOG, TUNING.FOG_NEAR, TUNING.FOG_FAR)
  sky = makeSky()
  scene.add(sky)

  camera = new THREE.PerspectiveCamera(TUNING.FOV_BASE, 1, 0.5, 900)

  scene.add(new THREE.HemisphereLight(0xEAF4FF, 0x8AA0B4, 1.3))
  const sun = new THREE.DirectionalLight(SUN, 1.35)
  sun.position.set(-0.6, 1, 0.45)
  scene.add(sun)

  // Grille de terrain : PlaneGeometry posée à plat, hauteurs réécrites quand la grille change de case.
  geo = new THREE.PlaneGeometry(NX * CELL, NZ * CELL, NX, NZ)
  geo.rotateX(-Math.PI / 2)
  posAttr = geo.attributes.position
  // Couleur par sommet : neige, neige à l'ombre, roche sur les pentes raides. Une seule passe.
  colAttr = new THREE.BufferAttribute(new Float32Array(posAttr.count * 3), 3)
  geo.setAttribute('color', colAttr)
  copyColor(SNOW, cSnow); copyColor(SNOW_SHADE, cShade); copyColor(ROCK, cRock)
  const span = Math.max(NX, NZ) * CELL
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), span)
  terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
  scene.add(terrainMesh)
  window.__terrainMesh = terrainMesh   // poignée de debug : comparer la grille au terrain réel

  skier = new THREE.Group()
  skierBody = new THREE.Group()
  const dark = new THREE.MeshLambertMaterial({ color: 0x2B3A44 })
  const suit = new THREE.MeshLambertMaterial({ color: 0xE8542F })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.75, 4, 8), suit)
  torso.position.y = 1.15
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), dark)
  head.position.y = 1.72
  const skiGeo = new THREE.BoxGeometry(0.14, 0.06, 1.75)
  const skiL = new THREE.Mesh(skiGeo, dark); skiL.position.set(-0.19, 0.06, 0)
  const skiR = new THREE.Mesh(skiGeo, dark); skiR.position.set(0.19, 0.06, 0)
  // Jambes et bras : sans eux, vu de dos, le skieur est une quille sur deux barres.
  const legGeo = new THREE.BoxGeometry(0.17, 0.72, 0.19)
  const legL = new THREE.Mesh(legGeo, dark); legL.position.set(-0.19, 0.42, 0)
  const legR = new THREE.Mesh(legGeo, dark); legR.position.set(0.19, 0.42, 0)
  const armGeo = new THREE.BoxGeometry(0.13, 0.13, 0.62)
  const armL = new THREE.Mesh(armGeo, suit); armL.position.set(-0.36, 1.2, -0.22)
  const armR = new THREE.Mesh(armGeo, suit); armR.position.set(0.36, 1.2, -0.22)
  skierBody.add(torso, head, skiL, skiR, legL, legR, armL, armR)
  skier.add(skierBody)
  scene.add(skier)

  // Ombre de contact : trois lignes, et le skieur cesse de flotter au-dessus de la neige.
  shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 18),
    new THREE.MeshBasicMaterial({ color: 0x3C5E7C, transparent: true, opacity: 0.3, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  scene.add(shadow)

  flagsL = makeFlagRow(FLAG_L)
  flagsR = makeFlagRow(FLAG_R)
  scene.add(flagsL, flagsR)

  const pineGeo = new THREE.ConeGeometry(1.5, 5.4, 6)
  pineGeo.translate(0, 3.4, 0)
  pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshLambertMaterial({ color: PINE, flatShading: true }), TREE_N)
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 5)
  trunkGeo.translate(0, 0.8, 0)
  trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: TRUNK }), TREE_N)
  scene.add(pines, trunks)

  // Balises de tremplin : on doit le voir venir pour viser, sinon le saut est subi.
  const postGeo = new THREE.BoxGeometry(0.5, 3.2, 0.5)
  postGeo.translate(0, 1.6, 0)
  ramps = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: RAMP }), RAMP_N * RAMP_POSTS)
  scene.add(ramps)
}

// Ciel : une sphère vue de l'intérieur, dégradée du zénith à l'horizon. Aucun asset, 12 lignes.
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color(SKY_TOP) }, low: { value: new THREE.Color(SKY_LOW) } },
    vertexShader: 'varying float vH; void main() { vH = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 low; varying float vH; void main() { gl_FragColor = vec4(mix(low, top, clamp(vH * 1.6, 0.0, 1.0)), 1.0); }',
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 16, 10), mat)
  sky.frustumCulled = false
  return sky
}

function copyColor(hex, out) {
  const c = new THREE.Color(hex)
  out.r = c.r; out.g = c.g; out.b = c.b
}

function makeFlagRow(color) {
  const g = new THREE.ConeGeometry(0.42, 1.9, 6)
  g.translate(0, 0.95, 0)
  return new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color }), FLAG_N)
}

export function resize(w, h, dpr) {
  renderer.setPixelRatio(dpr)
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

export function draw(state, dt) {
  updateTerrain(state)
  updateTrees(state)
  updateRamps(state)
  updateFlags(state)

  skier.position.set(state.x, state.y, state.z)
  skier.rotation.y = -state.heading
  // Inclinaison dans le virage, et le corps se plie quand ça va vite.
  skierBody.rotation.z = state.lean * 0.55
  skierBody.rotation.x = 0.12 + 0.25 * (state.s / TUNING.MAX_SPEED) + (state.wipe > 0 ? 0.9 : 0)

  // L'ombre reste au sol et s'estompe avec la hauteur : c'est elle qui dit où on va retomber.
  const gy = state.terrain.height(state.x, state.z)
  const air = state.y - gy
  shadow.position.set(state.x, gy + 0.06, state.z)
  shadow.rotation.z = state.heading          // une ellipse à la taille des skis, tournée comme eux
  const k = 1 / (1 + air * 0.1)
  shadow.scale.set(0.42 + 0.2 * (1 - k), 1.05 + 0.5 * (1 - k), 1)
  shadow.material.opacity = 0.32 * k

  const cam = state.cam
  camera.position.set(cam.x, cam.y, cam.z)
  lookAt(state, look)
  camera.lookAt(look.x, look.y, look.z)
  if (Math.abs(camera.fov - cam.fov) > 0.01) {
    camera.fov = cam.fov
    camera.updateProjectionMatrix()
  }

  sky.position.copy(camera.position)   // le ciel suit la caméra, sinon on en sort
  renderer.render(scene, camera)
}

// La grille est calée sur un réseau fixe. Quand elle change de case, on ne la recalcule pas :
// on la fait glisser d'une rangée ou d'une colonne, et on ne calcule que la ligne qui entre.
// Une reconstruction complète coûte 19 000 appels de terrain, un glissement en coûte 170.
function updateTerrain(state) {
  const ox = Math.round(state.x / CELL) * CELL
  const oz = Math.round((state.z - NZ * CELL * 0.25) / CELL) * CELL
  if (ox === originX && oz === originZ) return

  const dix = Number.isNaN(originX) ? 99 : Math.round((ox - originX) / CELL)
  const diz = Number.isNaN(originZ) ? 99 : Math.round((oz - originZ) / CELL)

  if (Math.abs(dix) + Math.abs(diz) > 8) {
    originX = ox
    originZ = oz
    rebuild(state)
  } else {
    // Une case à la fois, en avançant l'origine à chaque pas : la rangée qui entre doit être
    // calculée à sa vraie position, pas à celle d'arrivée.
    const sz = Math.sign(diz), sx = Math.sign(dix)
    for (let k = 0; k < Math.abs(diz); k++) { originZ += sz * CELL; rollZ(state, sz) }
    for (let k = 0; k < Math.abs(dix); k++) { originX += sx * CELL; rollX(state, sx) }
    originX = ox
    originZ = oz
  }
  terrainMesh.position.set(ox, 0, oz)
  writeGrid()
}

function worldX(ix) { return originX + ix * CELL - NX * CELL * 0.5 }
function worldZ(iz) { return originZ + iz * CELL - NZ * CELL * 0.5 }

function rebuild(state) {
  const h = state.terrain.height
  for (let iz = 0; iz <= NZ; iz++) {
    const z = worldZ(iz), base = iz * W
    for (let ix = 0; ix <= NX; ix++) heights[base + ix] = h(worldX(ix), z)
  }
}

// L'origine descend d'une case : chaque rangée prend la hauteur de sa voisine, une seule est neuve.
function rollZ(state, dir) {
  const h = state.terrain.height
  if (dir < 0) {
    heights.copyWithin(W, 0, NZ * W)
    const z = worldZ(0)
    for (let ix = 0; ix <= NX; ix++) heights[ix] = h(worldX(ix), z)
  } else {
    heights.copyWithin(0, W, (NZ + 1) * W)
    const z = worldZ(NZ), base = NZ * W
    for (let ix = 0; ix <= NX; ix++) heights[base + ix] = h(worldX(ix), z)
  }
}

function rollX(state, dir) {
  const h = state.terrain.height
  if (dir > 0) {
    heights.copyWithin(0, 1)
    const x = worldX(NX)
    for (let iz = 0; iz <= NZ; iz++) heights[iz * W + NX] = h(x, worldZ(iz))
  } else {
    heights.copyWithin(1, 0, heights.length - 1)
    const x = worldX(0)
    for (let iz = 0; iz <= NZ; iz++) heights[iz * W] = h(x, worldZ(iz))
  }
}

// Hauteurs et couleurs versées dans la géométrie. La pente vient de la grille elle-même,
// par différence finie : les dérivées analytiques ne servent à rien pour colorier.
function writeGrid() {
  const pos = posAttr.array, col = colAttr.array
  const inv2 = 1 / (2 * CELL)
  for (let iz = 0; iz <= NZ; iz++) {
    const base = iz * W
    const up = (iz > 0 ? iz - 1 : iz) * W
    const dn = (iz < NZ ? iz + 1 : iz) * W
    for (let ix = 0; ix <= NX; ix++) {
      const i = base + ix
      const y = heights[i]
      pos[i * 3 + 1] = y
      const l = ix > 0 ? heights[i - 1] : y
      const r = ix < NX ? heights[i + 1] : y
      const hx = (r - l) * inv2
      const hz = (heights[dn + ix] - heights[up + ix]) * inv2
      // Pente forte : la neige ne tient pas, c'est de la roche. Creux : neige bleue à l'ombre.
      // Math.hypot et clamp01 sont inlinés : cette boucle tourne 19 000 fois par franchissement.
      const dz = hz - TUNING.SLOPE
      const steep = Math.sqrt(hx * hx + dz * dz)
      let rock = (steep - 0.7) / 0.45
      rock = rock < 0 ? 0 : (rock > 1 ? 1 : rock)
      let shade = dz * 1.8 + 0.08
      shade = (shade < 0 ? 0 : (shade > 1 ? 1 : shade)) * (1 - rock)
      const snow = 1 - rock - shade
      const c = i * 3
      col[c] = cSnow.r * snow + cShade.r * shade + cRock.r * rock
      col[c + 1] = cSnow.g * snow + cShade.g * shade + cRock.g * rock
      col[c + 2] = cSnow.b * snow + cShade.b * shade + cRock.b * rock
    }
  }
  posAttr.needsUpdate = true
  colAttr.needsUpdate = true
}

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v) }

// Les sapins ne bougent qu'au changement de rangée : 350 matrices, quelques fois par seconde.
function updateTrees(state) {
  const g = TUNING.TREE_GAP
  const row = Math.round(state.z / g)
  if (row === treeRow) return
  treeRow = row
  const ter = state.terrain
  let n = 0
  for (let li = -TREE_LANES; li <= TREE_LANES; li++) {
    for (let r = 0; r < TREE_ROWS; r++) {
      ter.tree(li, row + 3 - r, tree)
      if (tree.show) {
        tmpObj.position.set(tree.x, tree.y, tree.z)
        tmpObj.scale.setScalar(tree.scale)
        tmpObj.rotation.y = tree.x * 0.7
      } else {
        tmpObj.position.set(0, -9999, 0)   // rangé sous la montagne plutôt que retiré du pool
        tmpObj.scale.setScalar(1)
        tmpObj.rotation.y = 0
      }
      tmpObj.updateMatrix()
      pines.setMatrixAt(n, tmpObj.matrix)
      trunks.setMatrixAt(n, tmpObj.matrix)
      n++
    }
  }
  pines.instanceMatrix.needsUpdate = true
  trunks.instanceMatrix.needsUpdate = true
  pines.computeBoundingSphere()
  trunks.computeBoundingSphere()
}

// Deux rangées de piquets qui bordent la piste : c'est là que se lit la vitesse.
function updateFlags(state) {
  const base = Math.floor((state.z + 40) / FLAG_EVERY) * FLAG_EVERY
  const ter = state.terrain
  for (let i = 0; i < FLAG_N; i++) {
    const z = base - i * FLAG_EVERY
    tmpObj.position.set(-TUNING.TRACK_HALF, ter.sample(-TUNING.TRACK_HALF, z).y, z)
    tmpObj.updateMatrix()
    flagsL.setMatrixAt(i, tmpObj.matrix)
    tmpObj.position.set(TUNING.TRACK_HALF, ter.sample(TUNING.TRACK_HALF, z).y, z)
    tmpObj.updateMatrix()
    flagsR.setMatrixAt(i, tmpObj.matrix)
  }
  flagsL.instanceMatrix.needsUpdate = true
  flagsR.instanceMatrix.needsUpdate = true
}

// Les piquets ne bougent qu'au passage d'un tremplin, pas à chaque frame.
function updateRamps(state) {
  const first = Math.round(-state.z / TUNING.JUMP_GAP)
  if (first === rampFirst) return
  rampFirst = first
  const ter = state.terrain
  for (let i = 0; i < RAMP_N; i++) {
    ter.jump(first + i, ramp)
    for (let s = 0; s < RAMP_POSTS; s++) {
      tmpObj.position.set(ramp.x + (s === 0 ? -TUNING.JUMP_WX : TUNING.JUMP_WX), ramp.y - 1.4, ramp.z)
      tmpObj.updateMatrix()
      ramps.setMatrixAt(i * RAMP_POSTS + s, tmpObj.matrix)
    }
  }
  ramps.instanceMatrix.needsUpdate = true
  ramps.computeBoundingSphere()
}

/** Effet déclenché par un événement de state.events. */
export function fx(event, state) {
  // Bloc 4 : gerbes de neige, secousse
}
