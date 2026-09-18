// Tout le dessin. Lit state, n'y écrit jamais. Particules, traînée et secousse sont internes ici.
// Voir SPEC.md §8. Session 1 : ciel plat, terrain, personnage, caméra. Session 4 : parallaxe, particules.
import { TUNING } from './physics.js'

let canvas, ctx, palette
let W = 0, H = 0, scale = 1

/** Lit la palette CSS une fois, alloue les pools. Jamais de getComputedStyle dans la boucle. */
export function init(c) {
  canvas = c
  ctx = canvas.getContext('2d')
  const cs = getComputedStyle(document.documentElement)
  palette = {}
  for (const k of ['sky-1', 'sky-2', 'far', 'mid', 'ground', 'ground-edge', 'fg', 'ink', 'paper', 'accent', 'accent-hi', 'danger']) {
    palette[k] = cs.getPropertyValue('--' + k).trim()
  }
}

export function resize(w, h, dpr) {
  W = w; H = h
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  scale = h / TUNING.VIEW_H
}

/** Dessine une frame, avance particules et secousse de dt. */
export function draw(state, dt) {
  // Session 1
}

/** Effet visuel déclenché par un événement de state.events. */
export function fx(event, state) {
  // Session 4
}

export function getPalette() { return palette }
