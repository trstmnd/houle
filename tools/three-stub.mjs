// Bouchon de three pour check.sh. Il ne dessine rien : il rend juste des objets assez vrais pour
// que render.js s'exécute du début à la fin. Ce qu'il attrape : une variable non déclarée, une
// constante lue avant son initialisation, un identifiant fautif, une boucle qui sort des bornes.
// Ce qu'il n'attrape pas : un mauvais usage de l'API de three. Ce n'est pas un rendu, c'est un filet.

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this }
  copy(v) { return this.set(v.x, v.y, v.z) }
  setScalar(v) { return this.set(v, v, v) }
}

class Col {
  constructor(hex = 0) {
    this.r = ((hex >> 16) & 255) / 255
    this.g = ((hex >> 8) & 255) / 255
    this.b = (hex & 255) / 255
  }
}

class Attr {
  constructor(array, itemSize) {
    this.array = array
    this.itemSize = itemSize
    this.count = array.length / itemSize
    this.needsUpdate = false
  }
}

class Geo {
  constructor(nx = 0, nz = 0) {
    const n = (nx + 1) * (nz + 1)
    this.attributes = { position: new Attr(new Float32Array(Math.max(n, 1) * 3), 3) }
    this.index = null
    this.boundingSphere = null
  }
  setAttribute(k, v) { this.attributes[k] = v; return this }
  setIndex(v) { this.index = v; return this }
  rotateX() { return this } ; translate() { return this } ; scale() { return this }
  computeBoundingSphere() { return this }
}

class Obj3D {
  constructor() {
    this.position = new Vec3()
    this.rotation = new Vec3()
    this.scale = new Vec3(1, 1, 1)
    this.matrix = {}
    this.children = []
  }
  add(...o) { this.children.push(...o); return this }
  updateMatrix() { return this }
  lookAt() { return this }
}

class MeshLike extends Obj3D {
  constructor(geometry, material) {
    super()
    this.geometry = geometry || new Geo()
    this.material = material || {}
    this.frustumCulled = true
    this.renderOrder = 0
    this.instanceMatrix = { needsUpdate: false }
  }
  setMatrixAt() { return this }
  setColorAt() { this.instanceColor = { needsUpdate: false }; return this }
  computeBoundingSphere() { return this }
}

export class WebGLRenderer {
  constructor(o = {}) { this.domElement = o.canvas || {}; this.toneMapping = 0; this.toneMappingExposure = 1 }
  setPixelRatio() {} ; setSize() {} ; render() {}
}
export class Scene extends Obj3D {}
export class PerspectiveCamera extends Obj3D {
  constructor(fov = 50) { super(); this.fov = fov; this.aspect = 1 }
  updateProjectionMatrix() {}
}
export class HemisphereLight extends Obj3D {}
export class DirectionalLight extends Obj3D {}
export class Group extends Obj3D {}
export class Object3D extends Obj3D {}
export class Mesh extends MeshLike {}
export class Points extends MeshLike {}
export class InstancedMesh extends MeshLike {}
export class PlaneGeometry extends Geo {
  constructor(w, h, nx, nz) { super(nx, nz) }
}
export class BufferGeometry extends Geo {}
export class SphereGeometry extends Geo {}
export class BoxGeometry extends Geo {}
export class ConeGeometry extends Geo {}
export class CylinderGeometry extends Geo {}
export class CapsuleGeometry extends Geo {}
export class CircleGeometry extends Geo {}
export class IcosahedronGeometry extends Geo {}
export class BufferAttribute extends Attr {}
export class Color extends Col {}
export class Vector3 extends Vec3 {}
export class Sphere { constructor(c, r) { this.center = c; this.radius = r } }
export class Fog { constructor(c, n, f) { this.color = c; this.near = n; this.far = f } }
export class MeshLambertMaterial { constructor(o = {}) { Object.assign(this, o) } }
export class MeshBasicMaterial { constructor(o = {}) { Object.assign(this, o) } }
export class PointsMaterial { constructor(o = {}) { Object.assign(this, o) } }
export class ShaderMaterial { constructor(o = {}) { Object.assign(this, o) } }
export const BackSide = 1
export const DoubleSide = 2
export const ACESFilmicToneMapping = 4
