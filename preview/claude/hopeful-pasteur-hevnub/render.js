// Scène Three : terrain, skieur, fanions, caméra. Lit state, n'y écrit jamais. Voir SPEC.md §8.
import * as THREE from 'three'
import { TUNING, lookAt } from './physics.js'

const SKY = 0xD8ECF7, SNOW = 0xFFFFFF, SUN = 0xFFF3DC
const FLAG_L = 0xE0453A, FLAG_R = 0x1F7BB7

let renderer, scene, camera, terrainMesh, geo, posAttr
let skier, skierBody, flagsL, flagsR
let originX = NaN, originZ = NaN      // case du réseau sur laquelle la grille est calée
const look = { x: 0, y: 0, z: 0 }
const tmpObj = new THREE.Object3D()   // réutilisé pour poser les fanions, rien ne s'alloue par frame

const NX = TUNING.GRID_NX, NZ = TUNING.GRID_NZ, CELL = TUNING.CELL
const FLAG_EVERY = 12                 // m entre deux fanions d'une rangée
const FLAG_N = 40                     // fanions par rangée

export function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY)
  scene.fog = new THREE.Fog(SKY, TUNING.FOG_NEAR, TUNING.FOG_FAR)

  camera = new THREE.PerspectiveCamera(TUNING.FOV_BASE, 1, 0.5, 900)

  scene.add(new THREE.HemisphereLight(0xFFFFFF, 0x9FB8CC, 1.35))
  const sun = new THREE.DirectionalLight(SUN, 1.5)
  sun.position.set(-0.6, 1, 0.45)
  scene.add(sun)

  // Grille de terrain : PlaneGeometry posée à plat, hauteurs réécrites quand la grille change de case.
  geo = new THREE.PlaneGeometry(NX * CELL, NZ * CELL, NX, NZ)
  geo.rotateX(-Math.PI / 2)
  posAttr = geo.attributes.position
  terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: SNOW, flatShading: true }))
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
  const ter = state.terrain
  for (let i = 0; i < arr.length; i += 3) {
    arr[i + 1] = ter.sample(ox + arr[i], oz + arr[i + 2]).y
  }
  posAttr.needsUpdate = true
  geo.computeBoundingSphere()
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
