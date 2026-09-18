// Terrain de ski : hauteur analytique h(x, z) et ses 5 dérivées. PUR. Voir SPEC.md §4.
// y vers le haut, la piste descend vers -Z. Les dérivées secondes servent au décollage.
import { mulberry32 } from './rng.js'
import { TUNING } from './physics.js'

/**
 * @returns {{ sample(x, z): {y, hx, hz, hxx, hxz, hzz} }}
 */
export function create(seed) {
  const rnd = mulberry32(seed)
  // Ordre des tirages = contrat : p1 à p7, puis rien.
  const p = new Array(7)
  for (let i = 0; i < 7; i++) p[i] = rnd() * 2 * Math.PI

  const T = TUNING
  // Pulsations figées à la création : la boucle ne recalcule rien.
  const a = 2 * Math.PI / T.WAVE_X          // houle latérale
  const b = 2 * Math.PI / T.WAVE_Z          // rouleaux en travers
  const c = 2 * Math.PI / T.WAVE_BIG_X      // relief large
  const d = 2 * Math.PI / T.WAVE_BIG_Z
  const mx = 2 * Math.PI / T.MOG_X          // pas des bosses
  const mz = 2 * Math.PI / T.MOG_Z
  const f = 2 * Math.PI / T.MOG_BAND        // alternance lisse / champ de bosses

  const out = { y: 0, hx: 0, hz: 0, hxx: 0, hxz: 0, hzz: 0 }

  // Tremplin le plus proche, mis en cache : sample est appelé des milliers de fois par frame.
  let rampN = NaN, rampX = 0, rampZ = 0
  function ramp(n) {
    if (n === rampN) return
    rampN = n
    rampZ = -n * T.JUMP_GAP
    rampX = (hash(n, 7, p[4]) - 0.5) * T.TRACK_HALF
  }

  function sample(x, z) {
    const s1 = Math.sin(a * x + p[0]), c1 = Math.cos(a * x + p[0])
    const s2 = Math.sin(b * z + p[1]), c2 = Math.cos(b * z + p[1])
    const s3 = Math.sin(c * x + p[2]), c3 = Math.cos(c * x + p[2])
    const s4 = Math.sin(d * z + p[3]), c4 = Math.cos(d * z + p[3])
    const S = Math.sin(mx * x + p[4]), C = Math.cos(mx * x + p[4])       // bosses en x
    const Tz = Math.sin(mz * z + p[5]), Cz = Math.cos(mz * z + p[5])     // bosses en z
    const fs = Math.sin(f * z + p[6]), fc = Math.cos(f * z + p[6])

    // Amplitude des bosses, fonction de z seul : des bandes lisses, des bandes bosselées.
    const A = T.MOG_AMP * (0.5 + 0.5 * fs)
    const dA = T.MOG_AMP * 0.5 * f * fc
    const ddA = -T.MOG_AMP * 0.5 * f * f * fs

    // Le tremplin : une bosse gaussienne, dérivable partout, donc le critère de décollage la voit.
    ramp(Math.round(-z / T.JUMP_GAP))
    const rx = x - rampX, rz = z - rampZ
    const wx2 = T.JUMP_WX * T.JUMP_WX, wz2 = T.JUMP_WZ * T.JUMP_WZ
    const e = T.JUMP_AMP * Math.exp(-(rx * rx / wx2 + rz * rz / wz2))
    const ex = -2 * rx / wx2, ez = -2 * rz / wz2

    out.y = T.SLOPE * z
      + T.R1 * s1
      + T.R2 * s2
      + T.R3 * s3 * s4
      + A * S * Tz
      + e

    out.hx = T.R1 * a * c1
      + T.R3 * c * c3 * s4
      + A * mx * C * Tz
      + e * ex

    out.hz = T.SLOPE
      + T.R2 * b * c2
      + T.R3 * d * s3 * c4
      + (dA * Tz + A * mz * Cz) * S
      + e * ez

    out.hxx = -T.R1 * a * a * s1
      - T.R3 * c * c * s3 * s4
      - A * mx * mx * S * Tz
      + e * (ex * ex - 2 / wx2)

    out.hxz = T.R3 * c * d * c3 * c4
      + (dA * Tz + A * mz * Cz) * mx * C
      + e * ex * ez

    out.hzz = -T.R2 * b * b * s2
      - T.R3 * d * d * s3 * s4
      + (ddA * Tz + 2 * dA * mz * Cz - A * mz * mz * Tz) * S
      + e * (ez * ez - 2 / wz2)

    return out
  }

  // Hash déterministe d'une case du réseau : pose les arbres sans état ni Math.random.
  function hash(a, b, salt) {
    const v = Math.sin(a * 127.1 + b * 311.7 + salt) * 43758.5453
    return v - Math.floor(v)
  }

  // Arbre de la case (ix, iz) : position, hauteur, et s'il a le droit d'exister.
  // Ils ne poussent que hors piste : ce sont eux qui bordent le couloir, mieux que des fanions.
  function tree(ix, iz, out) {
    const g = TUNING.TREE_GAP
    out.x = ix * g + (hash(ix, iz, p[0]) - 0.5) * g * 0.8
    out.z = iz * g + (hash(ix, iz, p[1]) - 0.5) * g * 0.8
    out.y = sample(out.x, out.z).y
    out.scale = 0.75 + hash(ix, iz, p[2]) * 0.9
    const edge = Math.abs(out.x) - TUNING.TRACK_HALF
    out.show = edge > 3 && hash(ix, iz, p[3]) < Math.min(1, 0.25 + edge / 60)
    // Un sur cinq est un rocher : de la roche pour l'échelle, et ça casse la forêt uniforme.
    out.rock = hash(ix, iz, p[2] + 11.3) < 0.2
    return out
  }

  // Hauteur seule, sans les dérivées : c'est tout ce dont le maillage a besoin, et il appelle
  // des milliers de fois. Deux fois moins de trigonométrie que sample.
  function height(x, z) {
    ramp(Math.round(-z / T.JUMP_GAP))
    const rx = x - rampX, rz = z - rampZ
    const u = rx * rx / (T.JUMP_WX * T.JUMP_WX) + rz * rz / (T.JUMP_WZ * T.JUMP_WZ)
    const e = u > 9 ? 0 : T.JUMP_AMP * Math.exp(-u)     // au-delà de 3 sigmas le tremplin ne vaut rien
    return T.SLOPE * z
      + T.R1 * Math.sin(a * x + p[0])
      + T.R2 * Math.sin(b * z + p[1])
      + T.R3 * Math.sin(c * x + p[2]) * Math.sin(d * z + p[3])
      + T.MOG_AMP * (0.5 + 0.5 * Math.sin(f * z + p[5 + 1])) * Math.sin(mx * x + p[4]) * Math.sin(mz * z + p[5])
      + e
  }

  /** Position du tremplin numéro n, pour que le rendu puisse le baliser. */
  function jump(n, out2) {
    ramp(n)
    out2.x = rampX
    out2.z = rampZ
    out2.y = sample(rampX, rampZ).y
    return out2
  }

  return { sample, height, tree, jump, seed }
}
