// Point d'entrée. Session 1 remplace ce fichier par la vraie boucle : pas fixe, input, machine à états (SPEC.md §3, §4, §7).
// En attendant, il prouve que le pipeline de déploiement marche : un ciel, une dune, un titre.
import { TUNING } from './physics.js'
import * as render from './render.js'

const canvas = document.getElementById('game')
render.init(canvas)
const palette = render.getPalette()
const ctx = canvas.getContext('2d')
document.getElementById('title-cta').textContent = 'Session 1 : samedi matin'

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  render.resize(window.innerWidth, window.innerHeight, dpr)
  draw()
}

function draw() {
  const w = window.innerWidth, h = window.innerHeight
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, palette['sky-1'])
  sky.addColorStop(1, palette['sky-2'])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  // Une dune de démonstration, même famille de courbe que le vrai terrain
  const k = 2 * Math.PI / (TUNING.HILL_WAVE * 0.5)
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= w; x += 6) {
    const y = h * 0.66 + TUNING.HILL_BASE * 0.5 * Math.sin(k * x + 1.5 * Math.PI) + 0.12 * x * 0.3
    ctx.lineTo(x, y)
  }
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fillStyle = palette.ground
  ctx.fill()
}

window.addEventListener('resize', resize)
window.addEventListener('orientationchange', resize)
window.addEventListener('contextmenu', (e) => e.preventDefault())
resize()
