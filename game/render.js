// Scène Three : terrain, skieur, fanions, caméra. Lit state, n'y écrit jamais. Voir SPEC.md §8.
import * as THREE from 'three'
import { TUNING, lookAt } from './physics.js'

// Palette montagne. Le low poly ne tient que si les couleurs sont franches et peu nombreuses.
const SKY_TOP = 0x2F7BC4, SKY_LOW = 0xCFE8F7, FOG = 0xCFE8F7
const SNOW = 0xFDFDFF, SNOW_SHADE = 0x7FA6CE, ROCK = 0x6E6357
const PINE = 0x27443A, TRUNK = 0x4A3524, SUN = 0xFFF6E2
const FLAG_L = 0xE0453A, FLAG_R = 0x1F7BB7

let renderer, scene, camera, terrainMesh, geo, posAttr, colAttr
let skier, skierBody, flagsL, flagsR, pines, trunks, sky
let originX = NaN, originZ = NaN      // case du réseau sur laquelle la grille est calée
let treeRow = NaN
const tree = { x: 0, y: 0, z: 0, scale: 1, show: false }
const cSnow = { r: 0, g: 0, b: 0 }, cShade = { r: 0, g: 0, b: 0 }, cRock = { r: 0, g: 0, b: 0 }
const look = { x: 0, y: 0, z: 0 }
const tmpObj = new THREE.Object3D()   // réutilisé pour poser les fanions, rien ne s'alloue par frame

const NX = TUNING.GRID_NX, NZ = TUNING.GRID_NZ, CELL = TUNING.CELL
const FLAG_EVERY = 14                 // m entre deux fanions d'une rangée
const FLAG_N = 30                     // fanions par rangée
const TREE_LANES = 9                  // cases de part et d'autre de la piste
const TREE_ROWS = 26                  // cases devant le skieur
const TREE_N = (2 * TREE_LANES + 1) * TREE_ROWS

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
  terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
  scene.add(terrainMesh)

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
  updateFlags(state)

  skier.position.set(state.x, state.y, state.z)
  skier.rotation.y = -state.heading
  // Inclinaison dans le virage, et le corps se plie quand ça va vite.
  skierBody.rotation.z = state.lean * 0.55
  skierBody.rotation.x = 0.12 + 0.25 * (state.s / TUNING.MAX_SPEED) + (state.wipe > 0 ? 0.9 : 0)

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

// Les hauteurs ne sont recalculées que quand la grille change de case : quelques fois par seconde.
function updateTerrain(state) {
  const ox = Math.round(state.x / CELL) * CELL
  const oz = Math.round((state.z - NZ * CELL * 0.25) / CELL) * CELL
  if (ox === originX && oz === originZ) return
  originX = ox; originZ = oz
  terrainMesh.position.set(ox, 0, oz)

  const arr = posAttr.array
  const col = colAttr.array
  const ter = state.terrain
  for (let i = 0, c = 0; i < arr.length; i += 3, c += 3) {
    const g = ter.sample(ox + arr[i], oz + arr[i + 2])
    arr[i + 1] = g.y
    // Pente forte : la neige ne tient pas, c'est de la roche. Creux : neige bleue à l'ombre.
    const steep = Math.hypot(g.hx, g.hz - TUNING.SLOPE)
    const rock = clamp01((steep - 0.7) / 0.45)
    const shade = clamp01((g.hz - TUNING.SLOPE) * 1.8 + 0.08) * (1 - rock)
    const snow = 1 - rock - shade
    col[c] = cSnow.r * snow + cShade.r * shade + cRock.r * rock
    col[c + 1] = cSnow.g * snow + cShade.g * shade + cRock.g * rock
    col[c + 2] = cSnow.b * snow + cShade.b * shade + cRock.b * rock
  }
  posAttr.needsUpdate = true
  colAttr.needsUpdate = true
  geo.computeBoundingSphere()
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

/** Effet déclenché par un événement de state.events. */
export function fx(event, state) {
  // Bloc 4 : gerbes de neige, secousse
}
