// Scène Three : terrain, skieur, fanions, caméra. Lit state, n'y écrit jamais. Voir SPEC.md §8.
import * as THREE from 'three'
import { TUNING, lookAt } from './physics.js'

// Palette montagne. Le low poly ne tient que si les couleurs sont franches et peu nombreuses.
const SKY_TOP = 0x2F7BC4, SKY_LOW = 0xCFE8F7, FOG = 0xCFE8F7
const SNOW = 0xFFFFFF, SNOW_SHADE = 0x6E97C6, ROCK = 0x6E6357
const STONE = 0x6A6E74, TRACK_COL = 0xB9CFE4
const PINE = 0x27443A, TRUNK = 0x4A3524, SUN = 0xFFF6E2
const RAMP = 0xF08A2B
const PEAK_HI = 0xE8F2FA, PEAK_LO = 0xA9C9E2   // chaîne lointaine : blanche en haut, noyée de brume en bas
const FLAG_L = 0xE0453A, FLAG_R = 0x1F7BB7

let renderer, scene, camera, terrainMesh, geo, posAttr, colAttr
let skier, skierBody, flagsL, flagsR, pines, trunks, sky, ramps, shadow, peaks, spray, rocks, track
const ramp = { x: 0, y: 0, z: 0 }
const HIDE = -9999                    // hauteur où l'on range une instance inutilisée
let rampFirst = NaN
let originX = NaN, originZ = NaN      // case du réseau sur laquelle la grille est calée
let treeRow = NaN
const tree = { x: 0, y: 0, z: 0, scale: 1, show: false, rock: false }
const cSnow = { r: 0, g: 0, b: 0 }, cShade = { r: 0, g: 0, b: 0 }, cRock = { r: 0, g: 0, b: 0 }
const look = { x: 0, y: 0, z: 0 }
const tmpObj = new THREE.Object3D()   // réutilisé pour poser les fanions, rien ne s'alloue par frame

const NX = TUNING.GRID_NX, NZ = TUNING.GRID_NZ, CELL = TUNING.CELL
const W = NX + 1                      // sommets par rangée
const SPRAY_N = 260       // pool de flocons, jamais réalloué
const TRACK_N = 90        // points de la trace, chacun deux sommets
const TRACK_STEP = 1.3    // m entre deux points
const TRACK_W = 0.42      // m de demi-largeur
const SPRAY_LIFE = 0.75   // s
const heights = new Float32Array((NX + 1) * (NZ + 1))
const sprayPos = new Float32Array(SPRAY_N * 3)
const sprayVel = new Float32Array(SPRAY_N * 3)
const sprayLife = new Float32Array(SPRAY_N)
let sprayHead = 0
const trackPos = new Float32Array(TRACK_N * 2 * 3)
const trackCol = new Float32Array(TRACK_N * 2 * 3)
let trackLastX = NaN, trackLastZ = 0
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.3

  scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY_LOW)
  scene.fog = new THREE.Fog(FOG, TUNING.FOG_NEAR, TUNING.FOG_FAR)
  sky = makeSky()
  peaks = makePeaks()
  scene.add(sky, peaks)

  camera = new THREE.PerspectiveCamera(TUNING.FOV_BASE, 1, 0.5, 900)

  scene.add(new THREE.HemisphereLight(0xDCEBFA, 0x7C93AA, 0.95))
  const sun = new THREE.DirectionalLight(SUN, 1.75)
  sun.position.set(-0.78, 0.5, 0.38)
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
  const rockGeo = new THREE.IcosahedronGeometry(1.5, 0)
  rockGeo.scale(1.15, 0.72, 1)
  rockGeo.translate(0, 0.45, 0)
  rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: STONE, flatShading: true }), TREE_N)
  scene.add(pines, trunks, rocks)

  // Trace laissée par les skis : un ruban qui suit le skieur et s'efface vers la queue.
  const tg = new THREE.BufferGeometry()
  tg.setAttribute('position', new THREE.BufferAttribute(trackPos, 3))
  tg.setAttribute('color', new THREE.BufferAttribute(trackCol, 3))
  const idx = new Uint16Array((TRACK_N - 1) * 6)
  for (let i = 0; i < TRACK_N - 1; i++) {
    const a = i * 2
    idx[i * 6] = a; idx[i * 6 + 1] = a + 1; idx[i * 6 + 2] = a + 2
    idx[i * 6 + 3] = a + 1; idx[i * 6 + 4] = a + 3; idx[i * 6 + 5] = a + 2
  }
  tg.setIndex(new THREE.BufferAttribute(idx, 1))
  tg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6)
  track = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.34, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
  }))
  track.frustumCulled = false
  scene.add(track)

  // Gerbe de neige : un pool de points, la seule chose qui dise que la neige est de la neige.
  const sg = new THREE.BufferGeometry()
  sg.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3))
  sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6)
  spray = new THREE.Points(sg, new THREE.PointsMaterial({
    color: 0xFFFFFF, size: 0.3, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false,
  }))
  spray.frustumCulled = false
  scene.add(spray)

  // La trace s'efface vers la queue : dégradé figé une fois, du bleu de neige tassée vers le blanc.
  const tc = new THREE.Color(TRACK_COL), sn = new THREE.Color(SNOW)
  for (let i = 0; i < TRACK_N; i++) {
    const t = 1 - i / (TRACK_N - 1)   // 1 sous les skis, 0 à la queue : la trace s'efface derrière
    for (let k = 0; k < 2; k++) {
      const c = (i * 2 + k) * 3
      trackCol[c] = sn.r + (tc.r - sn.r) * (1 - t)
      trackCol[c + 1] = sn.g + (tc.g - sn.g) * (1 - t)
      trackCol[c + 2] = sn.b + (tc.b - sn.b) * (1 - t)
    }
  }

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
  sky.renderOrder = -2
  return sky
}

// Chaîne de montagnes à l'horizon : une silhouette continue sur un cercle, hors du brouillard.
// C'est ce qui fait qu'on skie dans une montagne et plus sur une colline isolée.
function makePeaks() {
  const N = 190, R = 520, BAS = -260
  const pos = new Float32Array(N * 6 * 3)
  const col = new Float32Array(N * 6 * 3)
  const hi = new THREE.Color(PEAK_HI), lo = new THREE.Color(PEAK_LO)
  const haut = (i) => {
    const a = i / N * Math.PI * 2
    // Somme de sinus non harmoniques : une crête irrégulière qui ne se répète pas à l'oeil.
    return 58 + 26 * Math.sin(a * 3.0 + 0.7) + 19 * Math.sin(a * 6.0 + 2.1)
      + 14 * Math.sin(a * 11.0 + 4.3) + 11 * Math.sin(a * 19.0 + 1.2)
      + 8 * Math.sin(a * 31.0 + 5.5) + 5 * Math.sin(a * 47.0 + 3.0)
  }
  let v = 0, c = 0
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2
    const h0 = haut(i), h1 = haut(i + 1)
    const x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R
    const x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R
    const quad = [[x0, BAS, z0, 0], [x1, BAS, z1, 0], [x1, h1, z1, 1],
                  [x0, BAS, z0, 0], [x1, h1, z1, 1], [x0, h0, z0, 1]]
    for (const [x, y, z, t] of quad) {
      pos[v] = x; pos[v + 1] = y; pos[v + 2] = z; v += 3
      col[c] = lo.r + (hi.r - lo.r) * t
      col[c + 1] = lo.g + (hi.g - lo.g) * t
      col[c + 2] = lo.b + (hi.b - lo.b) * t
      c += 3
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  // Pas de brouillard et pas d'éclairage : elles sont au-delà, elles ne servent que de silhouette.
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: false }))
  m.frustumCulled = false
  m.renderOrder = -1
  return m
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
  // On se ramasse en chargeant : c'est le seul retour visuel de la détente à venir.
  skierBody.rotation.x = 0.12 + 0.25 * (state.s / TUNING.MAX_SPEED) + state.charge * 0.32 + (state.wipe > 0 ? 0.9 : 0)
  skierBody.position.y = -0.2 * state.charge

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

  updateTrack(state)
  updateSpray(state, dt)
  sky.position.copy(camera.position)   // le ciel suit la caméra, sinon on en sort
  peaks.position.set(camera.position.x, state.y - 34, camera.position.z)
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
      // Damée au milieu, tassée sur les bords : la piste doit se lire sans fanion.
      const wx = originX + ix * CELL - NX * CELL * 0.5
      const wz = originZ + iz * CELL - NZ * CELL * 0.5
      const hors = Math.abs(wx) - TUNING.TRACK_HALF
      const damee = hors < 0 ? 1 : (hors < 6 ? 1 - hors / 6 : 0)
      const steep = Math.sqrt(hx * hx + dz * dz)
      let rock = (steep - 0.7) / 0.45
      rock = rock < 0 ? 0 : (rock > 1 ? 1 : rock)
      let shade = dz * 2.6 + 0.06
      shade = (shade < 0 ? 0 : (shade > 1 ? 1 : shade)) * (1 - rock)
      // Grain de neige : une variation fine qui ne coûte rien et empêche les grands aplats.
      const grain = 1 + 0.035 * Math.sin(wx * 0.63 + 1.7) * Math.sin(wz * 0.71)
      const snow = 1 - rock - shade
      const c = i * 3
      const lift = (1 + 0.07 * damee) * grain   // la neige damée renvoie un peu plus de lumière
      col[c] = (cSnow.r * snow + cShade.r * shade + cRock.r * rock) * lift
      col[c + 1] = (cSnow.g * snow + cShade.g * shade + cRock.g * rock) * lift
      col[c + 2] = (cSnow.b * snow + cShade.b * shade + cRock.b * rock) * (lift - 0.03 * damee)
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
      const estRocher = tree.show && tree.rock
      const estSapin = tree.show && !tree.rock
      tmpObj.position.set(tree.x, estSapin ? tree.y : HIDE, tree.z)
      tmpObj.scale.setScalar(tree.scale)
      tmpObj.rotation.y = tree.x * 0.7
      tmpObj.updateMatrix()
      pines.setMatrixAt(n, tmpObj.matrix)
      trunks.setMatrixAt(n, tmpObj.matrix)
      tmpObj.position.y = estRocher ? tree.y - 0.3 : HIDE
      tmpObj.scale.setScalar(0.6 + tree.scale * 0.55)
      tmpObj.updateMatrix()
      rocks.setMatrixAt(n, tmpObj.matrix)
      n++
    }
  }
  pines.instanceMatrix.needsUpdate = true
  trunks.instanceMatrix.needsUpdate = true
  rocks.instanceMatrix.needsUpdate = true
  pines.computeBoundingSphere()
  trunks.computeBoundingSphere()
  rocks.computeBoundingSphere()
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

// La trace : un point tous les 1,3 m au sol. Le ruban glisse d'un point, comme la grille du terrain.
function updateTrack(state) {
  if (!state.grounded) return
  const dx = state.x - trackLastX, dz = state.z - trackLastZ
  const d2 = dx * dx + dz * dz
  if (!Number.isNaN(trackLastX) && d2 < TRACK_STEP * TRACK_STEP) return

  const nx = Math.cos(state.heading) * TRACK_W   // perpendiculaire au cap, dans le plan du sol
  const nz = Math.sin(state.heading) * TRACK_W
  const y = state.y + 0.05

  // Après un saut ou une téléportation, on replie toute la trace sur place : sinon elle traverse
  // le décor en une bande rectiligne.
  if (Number.isNaN(trackLastX) || d2 > 36) {
    for (let i = 0; i < TRACK_N * 2; i++) {
      trackPos[i * 3] = state.x + (i % 2 ? nx : -nx)
      trackPos[i * 3 + 1] = y
      trackPos[i * 3 + 2] = state.z + (i % 2 ? nz : -nz)
    }
  } else {
    trackPos.copyWithin(0, 6)
    const b = (TRACK_N - 1) * 6
    trackPos[b] = state.x - nx; trackPos[b + 1] = y; trackPos[b + 2] = state.z - nz
    trackPos[b + 3] = state.x + nx; trackPos[b + 4] = y; trackPos[b + 5] = state.z + nz
  }
  trackLastX = state.x
  trackLastZ = state.z
  track.geometry.attributes.position.needsUpdate = true
}

// Un flocon repris dans le pool, le plus vieux d'abord. Rien ne s'alloue.
function emit(x, y, z, vx, vy, vz) {
  const i = sprayHead
  sprayHead = (sprayHead + 1) % SPRAY_N
  sprayPos[i * 3] = x; sprayPos[i * 3 + 1] = y; sprayPos[i * 3 + 2] = z
  sprayVel[i * 3] = vx; sprayVel[i * 3 + 1] = vy; sprayVel[i * 3 + 2] = vz
  sprayLife[i] = SPRAY_LIFE
}

function updateSpray(state, dt) {
  const T = TUNING
  // En virage, les carres arrachent la neige : d'autant plus qu'on braque et qu'on va vite.
  if (state.grounded && state.wipe <= 0) {
    const force = Math.abs(state.steer) * (state.s / T.MAX_SPEED)
    if (force > 0.08) {
      const dx = Math.sin(state.heading), dz = -Math.cos(state.heading)
      const n = force > 0.45 ? 3 : (force > 0.2 ? 2 : 1)
      const cote = -Math.sign(state.steer)
      for (let k = 0; k < n; k++) {
        const r = (k + 1) / n
        emit(state.x - dx * 0.9, state.y + 0.15, state.z - dz * 0.9,
          -dx * state.s * 0.14 + cote * dz * (2 + 5 * force) * r,
          2.2 + 3.4 * force * r,
          -dz * state.s * 0.14 - cote * dx * (2 + 5 * force) * r)
      }
    }
  }

  for (let i = 0; i < SPRAY_N; i++) {
    if (sprayLife[i] <= 0) continue
    sprayLife[i] -= dt
    const j = i * 3
    if (sprayLife[i] <= 0) { sprayPos[j + 1] = -9999; continue }
    sprayVel[j + 1] -= 9.81 * dt
    sprayPos[j] += sprayVel[j] * dt
    sprayPos[j + 1] += sprayVel[j + 1] * dt
    sprayPos[j + 2] += sprayVel[j + 2] * dt
  }
  spray.geometry.attributes.position.needsUpdate = true
}

/** Effet déclenché par un événement de state.events. */
export function fx(event, state) {
  const n = event === 'wipe' ? 46 : (event === 'land_flat' || event === 'land_hard' ? 22 : 0)
  if (n === 0) return
  const dx = Math.sin(state.heading), dz = -Math.cos(state.heading)
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2
    const r = 1.6 + 3.4 * (k % 5) / 5
    emit(state.x, state.y + 0.2, state.z,
      Math.cos(a) * r - dx * state.s * 0.1,
      2.6 + 3.2 * ((k * 7) % 5) / 5,
      Math.sin(a) * r - dz * state.s * 0.1)
  }
}
