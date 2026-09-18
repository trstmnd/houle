// Scène Three : terrain, skieur, fanions, caméra. Lit state, n'y écrit jamais. Voir SPEC.md §8.
import * as THREE from 'three'
import { TUNING, lookAt } from './physics.js'

// Palette montagne. Le low poly ne tient que si les couleurs sont franches et peu nombreuses.
// Palette crépusculaire, arcade plutôt que documentaire : le ciel va de l'indigo au feu, et la
// neige prend cette lumière. Trois arrêts dans le dégradé, sinon un coucher de soleil fait plat.
const SKY_TOP = 0x1E2A6E, SKY_MID = 0xB8508F, SKY_LOW = 0xFF9E6B, FOG = 0xD98CA8
const SNOW = 0xF4F6FF, SNOW_SHADE = 0x5E5CB8, ROCK = 0x413753
const STONE = 0x5A5568, TRACK_COL = 0xB9A6E0
const GATE_L = 0xE0453A, GATE_R = 0x1F7BB7   // rouge à gauche, bleu à droite, comme un slalom
const PYLON = 0x8D949B, CABLE = 0x3A434B, CHAIR = 0xD9532E
const PINE = 0x1B3348, TRUNK = 0x3A2438, SUN = 0xFFE3C8
const RAMP = 0xF08A2B
const PEAK_HI = 0xFFC9A6, PEAK_LO = 0x6E4E86   // chaîne lointaine : alpenglow en haut, violette en bas
const FLAG_L = 0xE0453A, FLAG_R = 0x1F7BB7

// Direction du soleil, une fois pour toutes : bas sur l'horizon, à gauche et devant. C'est le seul
// angle qui donne des ombres portées visibles, un soleil dans le champ et du relief sur la neige.
// De dos, les ombres se cachent derrière ce qui les projette et le terrain devient un aplat.
const SUN_DIR = [-0.78, 0.33, -0.53]

// Mensurations du skieur, en mètres. Cuisse et tibia sont égaux : la flexion du genou se résout
// alors exactement, sans tâtonner, quelle que soit la hauteur de la hanche.
const HIP_H = 0.82, THIGH = 0.44, SHIN = 0.44, UPPER = 0.34, FORE = 0.32

let renderer, scene, camera, terrainMesh, geo, posAttr, colAttr
let skier, skierBody, hips, chest, armL, armR, foreL, foreR, thighL, thighR, shinL, shinR, bootL, bootR, skiL, skiR, drift, flagsL, flagsR, pines, trunks, sky, ramps, shadow, peaks, spray, rocks, track, gateL, gateR
let streaks
let sun
// Animation du skieur : ressort des jambes, mémoire du contact au sol. C'est de l'état de rendu,
// jamais de l'état de jeu : rien de tout cela ne revient dans state.
let flex = 0, flexV = 0, etaitAuSol = true, tumble = 0
let pylons, cables, chairs
let liftRow = NaN
const gateCol = { vif: null, terne: null }
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
const DRIFT_N = 200       // poudreuse qui rampe sur la piste
const DRIFT_LIFE = 2.6    // s
const DRIFT_R = 70        // m, rayon d'apparition autour du skieur
const STREAK_N = 70       // traînées de vitesse, en segments
const STREAK_V = 26       // m/s à partir desquels elles apparaissent
const SPRAY_N = 260       // pool de flocons, jamais réalloué
const TRACK_N = 90        // points de la trace, chacun deux sommets
const TRACK_STEP = 1.3    // m entre deux points
const TRACK_W = 0.42      // m de demi-largeur
const SPRAY_LIFE = 0.6    // s
const heights = new Float32Array((NX + 1) * (NZ + 1))
const sprayPos = new Float32Array(SPRAY_N * 3)
const sprayVel = new Float32Array(SPRAY_N * 3)
const sprayLife = new Float32Array(SPRAY_N)
let sprayHead = 0
const streakPos = new Float32Array(STREAK_N * 6)
const streakLife = new Float32Array(STREAK_N)
const driftPos = new Float32Array(DRIFT_N * 3)
const driftVel = new Float32Array(DRIFT_N * 3)
const driftLife = new Float32Array(DRIFT_N)
let driftHead = 0
const trackPos = new Float32Array(TRACK_N * 2 * 3)
const trackCol = new Float32Array(TRACK_N * 2 * 3)
let trackLastX = NaN, trackLastZ = 0
const FLAG_EVERY = 14                 // m entre deux fanions d'une rangée
const FLAG_N = 30                     // fanions par rangée
const TREE_LANES = 9                  // cases de part et d'autre de la piste
const TREE_ROWS = 26                  // cases devant le skieur
const TREE_N = (2 * TREE_LANES + 1) * TREE_ROWS
const LIFT_X = -82                    // m, décalage du télésiège par rapport à l'axe de la piste
const LIFT_GAP = 62                   // m entre deux pylônes
const LIFT_N = 8                      // pylônes visibles à la fois
const LIFT_H = 13                     // m de haut
const RAMP_N = 4          // tremplins balisés devant le skieur
const RAMP_POSTS = 2      // un piquet de chaque côté de la table

export function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  // Ombre portée réelle, mais seulement celle du skieur : la carte suit le joueur et ne couvre
  // que quelques mètres, donc elle est nette et la passe ne dessine qu'une quinzaine de boîtes.
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap   // le filtre doux coûte plusieurs prises par pixel sur tout l'écran

  scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY_LOW)
  scene.fog = new THREE.Fog(FOG, TUNING.FOG_NEAR, TUNING.FOG_FAR)
  sky = makeSky()
  peaks = makePeaks()
  scene.add(sky, peaks)

  camera = new THREE.PerspectiveCamera(TUNING.FOV_BASE, 1, 0.5, 900)

  scene.add(new THREE.HemisphereLight(0xCBD8FF, 0x4A3F7A, 0.9))
  sun = new THREE.DirectionalLight(SUN, 1.6)
  sun.position.set(SUN_DIR[0] * 44, SUN_DIR[1] * 44, SUN_DIR[2] * 44)
  sun.castShadow = true
  sun.shadow.mapSize.set(512, 512)
  const f = 9                        // m de demi-côté : juste de quoi contenir le skieur et son ombre
  sun.shadow.camera.left = -f; sun.shadow.camera.right = f
  sun.shadow.camera.top = f; sun.shadow.camera.bottom = -f
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 120
  sun.shadow.camera.updateProjectionMatrix()   // sans ça, three garde le cadre par défaut
  sun.shadow.bias = -0.0012         // sans ce biais, la neige se raye elle-même
  sun.shadow.normalBias = 0.04
  scene.add(sun, sun.target)

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
  // Phong plutôt que Lambert : la neige renvoie un éclat rasant vers le soleil couchant. C'est
  // ce reflet, et non la couleur, qui dit que c'est une surface et pas un aplat de papier.
  terrainMesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    vertexColors: true, flatShading: true, shininess: 14, specular: 0x6B78A8,
  }))
  terrainMesh.receiveShadow = true
  scene.add(terrainMesh)
  window.__terrainMesh = terrainMesh   // poignée de debug : comparer la grille au terrain réel

  skier = new THREE.Group()
  skierBody = new THREE.Group()
  const dark = new THREE.MeshLambertMaterial({ color: 0x2B3A44 })
  const suit = new THREE.MeshLambertMaterial({ color: 0xFF5A1F })
  const vif = new THREE.MeshLambertMaterial({ color: 0x21E0C8 })
  const metal = new THREE.MeshLambertMaterial({ color: 0xB8C4D6 })

  const skiGeo = new THREE.BoxGeometry(0.14, 0.06, 1.75)
  skiL = new THREE.Mesh(skiGeo, dark); skiL.position.set(-0.19, 0.06, 0)
  skiR = new THREE.Mesh(skiGeo, dark); skiR.position.set(0.19, 0.06, 0)

  // Squelette à articulations : le pied reste sur le ski, la hanche monte et descend, le genou
  // se plie tout seul pour rattraper la différence. Sans ce pli, absorber une bosse ou se mettre
  // en œuf ne se voit pas : le skieur s'enfonce dans la neige au lieu de se ramasser.
  hips = new THREE.Group()
  hips.position.y = HIP_H
  chest = new THREE.Group()
  chest.position.y = 0.06
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 8), suit)
  torso.position.y = 0.33
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 10, 8), vif)
  head.position.y = 0.78
  chest.add(torso, head)

  // Les segments partent du haut et descendent : la rotation du groupe est donc bien celle
  // de l'articulation, pas celle du milieu du membre.
  const thighGeo = new THREE.BoxGeometry(0.19, THIGH, 0.21); thighGeo.translate(0, -THIGH / 2, 0)
  const shinGeo = new THREE.BoxGeometry(0.16, SHIN, 0.18); shinGeo.translate(0, -SHIN / 2, 0)
  const bootGeo = new THREE.BoxGeometry(0.2, 0.19, 0.36); bootGeo.translate(0, -0.08, -0.04)
  const armGeo = new THREE.BoxGeometry(0.14, UPPER, 0.15); armGeo.translate(0, -UPPER / 2, 0)
  const foreGeo = new THREE.BoxGeometry(0.12, FORE, 0.13); foreGeo.translate(0, -FORE / 2, 0)
  const poleGeo = new THREE.BoxGeometry(0.028, 1.15, 0.028); poleGeo.translate(0, -0.5, 0)

  function jambe(cote) {
    const cuisse = new THREE.Group()
    cuisse.position.set(cote * 0.19, 0, 0)
    cuisse.add(new THREE.Mesh(thighGeo, dark))
    const tibia = new THREE.Group()
    tibia.position.y = -THIGH
    tibia.add(new THREE.Mesh(shinGeo, dark))
    const chaussure = new THREE.Group()
    chaussure.position.y = -SHIN
    chaussure.add(new THREE.Mesh(bootGeo, suit))
    tibia.add(chaussure)
    cuisse.add(tibia)
    hips.add(cuisse)
    return [cuisse, tibia, chaussure]
  }
  function bras(cote) {
    const epaule = new THREE.Group()
    epaule.position.set(cote * 0.26, 0.55, 0)
    epaule.add(new THREE.Mesh(armGeo, vif))
    const avant = new THREE.Group()
    avant.position.y = -UPPER
    avant.add(new THREE.Mesh(foreGeo, vif))
    const baton = new THREE.Mesh(poleGeo, metal)
    baton.position.y = -FORE
    baton.rotation.x = -1.15          // le bâton traîne vers l'arrière, jamais planté dans la neige
    avant.add(baton)
    epaule.add(avant)
    chest.add(epaule)
    return [epaule, avant]
  }
  ;[thighL, shinL, bootL] = jambe(-1)
  ;[thighR, shinR, bootR] = jambe(1)
  ;[armL, foreL] = bras(-1)
  ;[armR, foreR] = bras(1)

  hips.add(chest)
  skierBody.add(skiL, skiR, hips)
  skier.add(skierBody)
  skier.traverse((o) => { if (o.isMesh) o.castShadow = true })
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

  // Un flocon rond, dessiné une fois dans un canvas hors écran. Sans lui, chaque particule est un
  // carré plein, et la neige ressemble à des confettis.
  const flocon = new THREE.CanvasTexture(faitFlocon())

  // Gerbe de neige : un pool de points, la seule chose qui dise que la neige est de la neige.
  const sg = new THREE.BufferGeometry()
  sg.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3))
  sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6)
  spray = new THREE.Points(sg, new THREE.PointsMaterial({
    color: 0xFFFFFF, size: 0.14, map: flocon, alphaTest: 0.04,
    sizeAttenuation: true, transparent: true, opacity: 0.75, depthWrite: false,
  }))
  spray.frustumCulled = false
  scene.add(spray)

  // Poudreuse : de la neige qui rampe sur la pente même à l'arrêt. C'est ce qui empêche le sol
  // d'avoir l'air d'une maquette figée.
  const dg = new THREE.BufferGeometry()
  dg.setAttribute('position', new THREE.BufferAttribute(driftPos, 3))
  dg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6)
  drift = new THREE.Points(dg, new THREE.PointsMaterial({
    color: 0xEAF2FF, size: 0.13, map: flocon, alphaTest: 0.04,
    sizeAttenuation: true, transparent: true, opacity: 0.32, depthWrite: false,
  }))
  drift.frustumCulled = false
  scene.add(drift)

  // Traînées de vitesse : des segments qui filent le long du regard. C'est tout l'effet de vitesse
  // des jeux de glisse arcade, et ça ne coûte que 70 segments.
  const stg = new THREE.BufferGeometry()
  stg.setAttribute('position', new THREE.BufferAttribute(streakPos, 3))
  stg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6)
  streaks = new THREE.LineSegments(stg, new THREE.LineBasicMaterial({
    color: 0xFFFFFF, transparent: true, opacity: 0.4, depthWrite: false,
  }))
  streaks.frustumCulled = false
  scene.add(streaks)

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

  // Télésiège : c'est lui qui dit qu'on est dans une station et pas sur une colline déserte.
  const pylonGeo = new THREE.BoxGeometry(0.9, LIFT_H, 0.9)
  pylonGeo.translate(0, LIFT_H / 2, 0)
  pylons = new THREE.InstancedMesh(pylonGeo, new THREE.MeshLambertMaterial({ color: PYLON }), LIFT_N)
  const cableGeo = new THREE.BoxGeometry(0.16, 0.16, 1)
  cables = new THREE.InstancedMesh(cableGeo, new THREE.MeshLambertMaterial({ color: CABLE }), LIFT_N)
  const chairGeo = new THREE.BoxGeometry(1.5, 1.1, 0.5)
  chairGeo.translate(0, -1.4, 0)
  chairs = new THREE.InstancedMesh(chairGeo, new THREE.MeshLambertMaterial({ color: CHAIR }), LIFT_N * 3)
  scene.add(pylons, cables, chairs)

  // Portes de slalom : deux mâts et une banderole, assez hauts pour se voir de loin.
  const mat = new THREE.BoxGeometry(0.28, TUNING.GATE_H, 0.28)
  mat.translate(0, TUNING.GATE_H / 2, 0)
  gateL = new THREE.InstancedMesh(mat, new THREE.MeshLambertMaterial({ color: 0xFFFFFF }), TUNING.GATE_POOL)
  gateR = new THREE.InstancedMesh(mat, new THREE.MeshLambertMaterial({ color: 0xFFFFFF }), TUNING.GATE_POOL)
  scene.add(gateL, gateR)
  gateCol.vifL = new THREE.Color(GATE_L)
  gateCol.vifR = new THREE.Color(GATE_R)
  gateCol.terne = new THREE.Color(0xB6BEC6)

  // Balises de tremplin : on doit le voir venir pour viser, sinon le saut est subi.
  const postGeo = new THREE.BoxGeometry(0.5, 3.2, 0.5)
  postGeo.translate(0, 1.6, 0)
  ramps = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: RAMP }), RAMP_N * RAMP_POSTS)
  scene.add(ramps)
}

// Un disque dégradé, du blanc plein au transparent. 12 lignes, aucun fichier.
function faitFlocon() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')
  const d = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  d.addColorStop(0, 'rgba(255,255,255,1)')
  d.addColorStop(0.45, 'rgba(255,255,255,0.85)')
  d.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = d
  g.fillRect(0, 0, 64, 64)
  return c
}

// Ciel : une sphère vue de l'intérieur, dégradée du zénith à l'horizon. Aucun asset, 12 lignes.
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(SKY_TOP) },
      mid: { value: new THREE.Color(SKY_MID) },
      low: { value: new THREE.Color(SKY_LOW) },
      sunDir: { value: new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]).normalize() },
      sunCol: { value: new THREE.Color(SUN) },
    },
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunCol;',
      'varying vec3 vD;',
      'void main() {',
      '  float h = clamp(vD.y * 1.5 + 0.12, 0.0, 1.0);',
      '  vec3 c = h < 0.35 ? mix(low, mid, h / 0.35) : mix(mid, top, (h - 0.35) / 0.65);',
      // Le halo d'abord, le disque ensuite : c'est le halo qui fait le contre-jour, le disque
      // seul ne serait qu'un point blanc collé sur un dégradé.
      '  float d = max(dot(vD, sunDir), 0.0);',
      '  c += low * pow(d, 6.0) * 0.45;',
      '  c += sunCol * pow(d, 900.0) * 1.6;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}',
    ].join('\n'),
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
  updateGates(state)
  updateLift(state)
  updateRamps(state)
  updateFlags(state)

  skier.position.set(state.x, state.y, state.z)
  // Les skis dérapent un peu au-delà du cap dans le virage : c'est ce décalage qui fait le carving.
  skier.rotation.y = -state.heading - state.lean * 0.2
  animeSkieur(state, dt)

  // L'ombre reste au sol et s'estompe avec la hauteur : c'est elle qui dit où on va retomber.
  // Le soleil est directionnel, mais sa carte d'ombre, elle, est locale : on la déplace avec le
  // skieur, sinon il sort du cadre au bout de dix mètres et l'ombre disparaît.
  sun.position.set(state.x + SUN_DIR[0] * 44, state.y + SUN_DIR[1] * 44, state.z + SUN_DIR[2] * 44)
  sun.target.position.set(state.x, state.y, state.z)
  sun.target.updateMatrixWorld()

  const gy = state.terrain.height(state.x, state.z)
  const air = state.y - gy
  shadow.position.set(state.x, gy + 0.06, state.z)
  shadow.rotation.z = state.heading          // une ellipse à la taille des skis, tournée comme eux
  const k = 1 / (1 + air * 0.1)
  shadow.scale.set(0.42 + 0.2 * (1 - k), 1.05 + 0.5 * (1 - k), 1)
  // Au sol, l'ombre portée suffit. En vol elle part de côté, donc la tache reprend son rôle :
  // dire où on va retomber. Entre les deux, elle monte progressivement.
  shadow.material.opacity = 0.3 * k * clamp01((air - 0.6) / 1.4)

  const cam = state.cam
  camera.position.set(cam.x, cam.y, cam.z)
  lookAt(state, look)
  // Le vecteur haut tourne autour de l'axe de visée : c'est ça, pencher l'horizon, et pas
  // simplement tourner autour de Z, faux dès que le cap n'est plus dans l'axe.
  const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll)
  const hx = Math.cos(state.heading), hz = Math.sin(state.heading)
  camera.up.set(hx * sr, cr, hz * sr)
  camera.lookAt(look.x, look.y, look.z)
  if (Math.abs(camera.fov - cam.fov) > 0.01) {
    camera.fov = cam.fov
    camera.updateProjectionMatrix()
  }

  updateTrack(state)
  updateDrift(state, dt)
  updateStreaks(state, dt)
  updateSpray(state, dt)
  sky.position.copy(camera.position)   // le ciel suit la caméra, sinon on en sort
  peaks.position.set(camera.position.x, state.y - 34, camera.position.z)
  renderer.render(scene, camera)
}

// Le skieur, image par image. Tout vient de state : la carre, la charge, le vol, la chute, l'œuf.
// Rien ne s'accumule ici sauf le ressort des jambes, qui a besoin d'une mémoire d'une frame.
function animeSkieur(state, dt) {
  const T = TUNING
  const lean = state.lean
  const vit = clamp01(state.s / T.MAX_SPEED)
  const enAir = !state.grounded
  const chute = state.wipe > 0
  const oeuf = state.tuck && !enAir && !chute

  // Ressort des jambes. La réception comprime d'un coup, d'autant plus qu'on tombe de haut et
  // vite, puis les jambes repoussent. C'est ce rebond qui fait qu'une réception se voit.
  if (state.grounded && !etaitAuSol) flexV -= Math.min(2.8, 0.6 + state.airTime * 2.2 + vit * 1.6)
  etaitAuSol = state.grounded
  flexV += (-flex * 75 - flexV * 12) * dt
  flex = clamp(flex + flexV * dt, -0.36, 0.05)

  // Les bosses ont un pas connu : les jambes battent à la même fréquence, proportionnellement
  // à la vitesse. À l'arrêt, rien ne bouge.
  const chatter = enAir || chute ? 0 : Math.sin(state.dist * (2 * Math.PI / T.MOG_Z)) * 0.035 * vit

  let hanche = HIP_H + flex + chatter - 0.2 * state.charge
  if (oeuf) hanche -= 0.24
  if (enAir) hanche -= 0.16          // en vol on ramène les jambes sous soi
  if (chute) hanche -= 0.3

  // Genou : cuisse et tibia étant égaux, le triangle se résout d'un cosinus, sans itérer.
  const d = clamp(hanche, 0.3, THIGH + SHIN - 0.02)
  const alpha = Math.atan2(Math.sqrt(Math.max(0, THIGH * THIGH - d * d * 0.25)), d * 0.5)
  hips.position.y = d
  for (const [cuisse, tibia, chaussure] of [[thighL, shinL, bootL], [thighR, shinR, bootR]]) {
    cuisse.rotation.x = alpha
    tibia.rotation.x = -2 * alpha
    chaussure.rotation.x = alpha     // le pied reste à plat sur le ski quoi que fasse le genou
  }
  // La jambe extérieure porte : elle se tend, l'intérieure se replie sous le corps.
  thighL.rotation.z = lean * 0.14
  thighR.rotation.z = lean * 0.14

  // Le buste : penché en avant avec la vitesse, cassé en deux en œuf, redressé à l'arrêt.
  let pitch = 0.1 + 0.2 * vit + 0.3 * state.charge
  if (oeuf) pitch += 0.85
  if (enAir) pitch += 0.12
  chest.rotation.x = pitch
  // Angulation : le corps bascule sur la carre, les épaules restent plus droites que les hanches.
  skierBody.rotation.z = -lean * 0.58
  chest.rotation.z = lean * 0.2
  chest.rotation.y = lean * 0.3                   // les épaules ouvrent vers l'intérieur du virage

  // Bras. L'angle se pense dans le monde, pas dans le buste : l'épaule est fille du buste, donc
  // on lui retire son inclinaison. Sans ça, se casser en deux en œuf envoie les bras en l'air.
  // Au repos ils accompagnent, en œuf ils partent devant, bâtons sous les aisselles, en vol ils
  // s'écartent pour équilibrer, et dans le virage l'extérieur monte.
  const epaule = (oeuf ? 1.45 : (enAir ? -0.3 : 0.28 + 0.3 * state.charge)) - pitch
  const coude = oeuf ? 0.2 : (enAir ? 0.55 : 0.7)
  const ecart = oeuf ? 0.06 : (enAir ? 0.5 : 0.18)
  armL.rotation.x = epaule - lean * 0.45
  armR.rotation.x = epaule + lean * 0.45
  armL.rotation.z = -ecart - lean * 0.3
  armR.rotation.z = ecart - lean * 0.3
  foreL.rotation.x = coude
  foreR.rotation.x = coude

  // Les skis prennent la carre et se resserrent en œuf. Écartés, ils tiennent mieux : c'est
  // pour ça qu'on les serre quand on cherche la vitesse et qu'on les ouvre à la réception.
  const serre = oeuf ? 0.13 : 0.19
  skiL.rotation.z = -lean * 0.42
  skiR.rotation.z = -lean * 0.42
  skiL.position.x = -serre + lean * 0.05
  skiR.position.x = serre + lean * 0.05
  // En vol, les spatules pointent vers le haut : on ramène les pieds devant soi.
  skiL.rotation.x = skiR.rotation.x = enAir ? -0.18 : 0

  // La chute : le corps part en avant et roule, puis se remet d'aplomb pendant que le temps de
  // chute s'écoule. Sans cette culbute, une chute ne se distingue pas d'un freinage.
  const k = chute ? clamp01((T.WIPE_TIME - state.wipe) / T.WIPE_TIME) : 0
  tumble += (k > 0 ? Math.sin(k * Math.PI) * 1.2 - tumble : -tumble) * (1 - Math.exp(-9 * dt))
  skierBody.rotation.x = tumble
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
  writeGrid(state.terrain)
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
function writeGrid(ter) {
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
      const hors = Math.abs(wx - ter.centre(wz)) - TUNING.TRACK_HALF
      const damee = hors < 0 ? 1 : (hors < 5 ? 1 - hors / 5 : 0)
      const steep = Math.sqrt(hx * hx + dz * dz)
      let rock = (steep - 0.7) / 0.45
      rock = rock < 0 ? 0 : (rock > 1 ? 1 : rock)
      let shade = dz * 2.6 + 0.06
      shade = (shade < 0 ? 0 : (shade > 1 ? 1 : shade)) * (1 - rock)
      // Grain de neige : une variation fine qui ne coûte rien et empêche les grands aplats.
      const grain = 1 + 0.035 * Math.sin(wx * 0.63 + 1.7) * Math.sin(wz * 0.71)
      const snow = 1 - rock - shade
      const c = i * 3
      const lift = (1 + 0.16 * damee) * grain   // la neige damée renvoie franchement plus de lumière
      col[c] = (cSnow.r * snow + cShade.r * shade + cRock.r * rock) * lift
      col[c + 1] = (cSnow.g * snow + cShade.g * shade + cRock.g * rock) * lift
      col[c + 2] = (cSnow.b * snow + cShade.b * shade + cRock.b * rock) * (lift - 0.1 * damee)
    }
  }
  posAttr.needsUpdate = true
  colAttr.needsUpdate = true
}

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v) }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }

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
    const axe = ter.centre(z)
    tmpObj.position.set(axe - TUNING.TRACK_HALF, ter.height(axe - TUNING.TRACK_HALF, z), z)
    tmpObj.updateMatrix()
    flagsL.setMatrixAt(i, tmpObj.matrix)
    tmpObj.position.set(axe + TUNING.TRACK_HALF, ter.height(axe + TUNING.TRACK_HALF, z), z)
    tmpObj.updateMatrix()
    flagsR.setMatrixAt(i, tmpObj.matrix)
  }
  flagsL.instanceMatrix.needsUpdate = true
  flagsR.instanceMatrix.needsUpdate = true
}

// Le télésiège ne bouge qu'au passage d'un pylône. Le câble est un segment tendu entre deux
// pylônes, redressé à la bonne longueur et à la bonne pente : c'est ce qui trahit un faux.
function updateLift(state) {
  const row = Math.round(state.z / LIFT_GAP)
  if (row === liftRow) return
  liftRow = row
  const ter = state.terrain
  let c = 0
  for (let i = 0; i < LIFT_N; i++) {
    const z0 = (row + 2 - i) * LIFT_GAP
    const lx0 = ter.centre(z0) + LIFT_X
    const y0 = ter.height(lx0, z0)
    tmpObj.position.set(lx0, y0, z0)
    tmpObj.scale.setScalar(1)
    tmpObj.rotation.set(0, 0, 0)
    tmpObj.updateMatrix()
    pylons.setMatrixAt(i, tmpObj.matrix)

    const z1 = z0 - LIFT_GAP
    const lx1 = ter.centre(z1) + LIFT_X
    const y1 = ter.height(lx1, z1)
    const hautA = y0 + LIFT_H, hautB = y1 + LIFT_H
    tmpObj.position.set((lx0 + lx1) / 2, (hautA + hautB) / 2, (z0 + z1) / 2)
    tmpObj.rotation.set(Math.atan2(hautB - hautA, LIFT_GAP), 0, 0)
    tmpObj.scale.set(1, 1, Math.hypot(LIFT_GAP, hautB - hautA))
    tmpObj.updateMatrix()
    cables.setMatrixAt(i, tmpObj.matrix)

    // Les sièges pendent sous le câble, régulièrement, entre ces deux pylônes.
    for (let k = 0; k < 3; k++) {
      const t = (k + 0.5) / 3
      const zc = z0 - LIFT_GAP * t
      tmpObj.position.set(lx0 + (lx1 - lx0) * t, hautA + (hautB - hautA) * t, zc)
      tmpObj.rotation.set(0, 0, 0)
      tmpObj.scale.setScalar(1)
      tmpObj.updateMatrix()
      chairs.setMatrixAt(c++, tmpObj.matrix)
    }
  }
  pylons.instanceMatrix.needsUpdate = true
  cables.instanceMatrix.needsUpdate = true
  chairs.instanceMatrix.needsUpdate = true
  pylons.computeBoundingSphere()
  cables.computeBoundingSphere()
  chairs.computeBoundingSphere()
}

// Les portes bougent peu, mais leur couleur change au passage : elles se ternissent une fois
// jouées, pour que la prochaine se distingue d'un coup d'oeil.
function updateGates(state) {
  const T = TUNING
  const gates = state.gates
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i]
    const joue = g.passed || g.missed
    for (let s = 0; s < 2; s++) {
      const cible = s === 0 ? gateL : gateR
      const dx = s === 0 ? -T.GATE_W / 2 : T.GATE_W / 2
      tmpObj.position.set(g.x + dx, state.terrain.height(g.x + dx, g.z), g.z)
      tmpObj.updateMatrix()
      cible.setMatrixAt(i, tmpObj.matrix)
      cible.setColorAt(i, joue ? gateCol.terne : (s === 0 ? gateCol.vifL : gateCol.vifR))
    }
  }
  gateL.instanceMatrix.needsUpdate = true
  gateR.instanceMatrix.needsUpdate = true
  if (gateL.instanceColor) gateL.instanceColor.needsUpdate = true
  if (gateR.instanceColor) gateR.instanceColor.needsUpdate = true
  gateL.computeBoundingSphere()
  gateR.computeBoundingSphere()
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

// La poudreuse est semée autour du skieur, file dans la pente et meurt. Elle est semée au sol une
// fois pour toutes : la suivre mètre par mètre coûterait un appel au terrain par flocon et par frame.
function updateDrift(state, dt) {
  const ter = state.terrain
  const cs = ter.centreSlope(state.z)
  const ax = -cs / Math.hypot(1, cs), az = -1 / Math.hypot(1, cs)   // sens de la pente, le long de l'axe

  // Une poignée de flocons renaît par frame, pas tout le pool d'un coup.
  const naissances = Math.min(6, DRIFT_N)
  for (let k = 0; k < naissances; k++) {
    const i = driftHead
    driftHead = (driftHead + 1) % DRIFT_N
    if (driftLife[i] > 0) continue
    const a = hash01(i * 2.7 + state.dist) * Math.PI * 2
    const r = 14 + hash01(i * 5.1 + state.dist) * DRIFT_R
    const x = state.x + Math.cos(a) * r
    const z = state.z - 45 + Math.sin(a) * r   // semée devant : elle balaie vers le joueur
    const j = i * 3
    driftPos[j] = x
    driftPos[j + 1] = ter.height(x, z) + 0.25 + hash01(i * 9.3 + state.dist) * 1.6
    driftPos[j + 2] = z
    const v = 5 + hash01(i * 3.3 + state.dist) * 9
    const lat = (hash01(i * 7.7 + state.dist) - 0.5) * 3
    driftVel[j] = ax * v + lat
    driftVel[j + 1] = -TUNING.SLOPE * v * 0.7
    driftVel[j + 2] = az * v
    driftLife[i] = DRIFT_LIFE * (0.5 + hash01(i * 11.1 + state.dist) * 0.5)
  }

  for (let i = 0; i < DRIFT_N; i++) {
    if (driftLife[i] <= 0) continue
    driftLife[i] -= dt
    const j = i * 3
    if (driftLife[i] <= 0) { driftPos[j + 1] = -9999; continue }
    driftPos[j] += driftVel[j] * dt
    driftPos[j + 1] += driftVel[j + 1] * dt
    driftPos[j + 2] += driftVel[j + 2] * dt
    // Passée le joueur, elle est dans l'oeil de la caméra et fait une grosse tache blanche.
    if (driftPos[j + 2] > state.z + 3) { driftLife[i] = 0; driftPos[j + 1] = -9999 }
  }
  drift.geometry.attributes.position.needsUpdate = true
}

// Les traînées naissent devant le skieur, filent vers l'arrière et meurent. Elles ne servent que
// la sensation : au-dessous de STREAK_V il n'y en a aucune.
function updateStreaks(state, dt) {
  const vite = (state.s - STREAK_V) / (TUNING.MAX_SPEED - STREAK_V)
  const dx = Math.sin(state.heading), dz = -Math.cos(state.heading)
  for (let i = 0; i < STREAK_N; i++) {
    const j = i * 6
    if (streakLife[i] > 0) {
      streakLife[i] -= dt
      const d = state.s * dt * 1.9
      streakPos[j] += dx * d; streakPos[j + 2] += dz * d
      streakPos[j + 3] += dx * d; streakPos[j + 5] += dz * d
      if (streakLife[i] <= 0) { streakPos[j + 1] = -9999; streakPos[j + 4] = -9999 }
      continue
    }
    if (vite <= 0 || hash01(i + state.dist) > vite * 0.22) continue
    // Semées en anneau autour de l'axe du regard, jamais devant le nez du skieur.
    const a = hash01(i * 3.7 + state.dist) * Math.PI * 2
    const r = 5 + hash01(i * 7.1 + state.dist) * 16
    const avant = 14 + hash01(i * 11.3 + state.dist) * 26
    const cx = state.x + dx * avant + Math.cos(a) * r
    const cz = state.z + dz * avant + Math.sin(a) * r
    const cy = state.y + 1.2 + Math.sin(a) * r * 0.5
    const len = 3 + vite * 9
    streakPos[j] = cx; streakPos[j + 1] = cy; streakPos[j + 2] = cz
    streakPos[j + 3] = cx - dx * len; streakPos[j + 4] = cy; streakPos[j + 5] = cz - dz * len
    streakLife[i] = 0.16 + hash01(i * 5.3 + state.dist) * 0.12
  }
  streaks.geometry.attributes.position.needsUpdate = true
  streaks.material.opacity = 0.12 + 0.34 * Math.max(0, Math.min(1, vite))
}

function hash01(v) {
  const s = Math.sin(v * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

function updateSpray(state, dt) {
  const T = TUNING
  // En virage, les carres arrachent la neige : d'autant plus qu'on braque et qu'on va vite.
  if (state.grounded && state.wipe <= 0) {
    const force = Math.abs(state.steer) * (state.s / T.MAX_SPEED)
    if (force > 0.08) {
      const dx = Math.sin(state.heading), dz = -Math.cos(state.heading)
      const n = force > 0.45 ? 6 : (force > 0.2 ? 4 : 2)
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
  const n = event === 'wipe' ? 80 : (event === 'land_flat' || event === 'land_hard' ? 40 : 0)
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
