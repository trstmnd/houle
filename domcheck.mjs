// Charge render.js et main.js pour de vrai, dans un DOM bouchonné, et fait tourner quelques frames.
// Raison d'être : deux pages blanches sont déjà passées à travers smoke.mjs, qui ne charge que les
// modules purs. En modules ES sans build, une variable non déclarée donne un écran vide sans message.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const html = fs.readFileSync('./game/index.html', 'utf8')
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))

const listeners = new Map()
const demandes = []          // tout getElementById passé par ici, pour croiser avec le HTML

function elem(id) {
  const style = {}
  const classes = new Set()
  return {
    id, style, hidden: false, textContent: '', offsetWidth: 0, width: 0, height: 0,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    get className() { return [...classes].join(' ') },
    addEventListener(type, fn) { listeners.set(id + ':' + type, fn) },
    getContext: () => ({}),
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    setPointerCapture() {},
  }
}

const cache = new Map()
globalThis.document = {
  hidden: false,
  documentElement: {},
  getElementById(id) {
    demandes.push(id)
    if (!cache.has(id)) cache.set(id, elem(id))
    return cache.get(id)
  },
  createElement: (t) => elem(t),
  addEventListener(type, fn) { listeners.set('document:' + type, fn) },
}

let frames = []
globalThis.window = {
  innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
  addEventListener(type, fn) { listeners.set('window:' + type, fn) },
  AudioContext: undefined,
}
globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length }
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#ffffff' })
globalThis.location = { search: '?seed=123456', href: 'https://exemple/?seed=123456' }
globalThis.history = { replaceState() {} }
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
// navigator existe déjà dans Node et n'a qu'un accesseur : on le complète au lieu de l'écraser.
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
globalThis.performance = { now: () => Date.now() }

// Le chargement seul attrape déjà une constante lue avant son initialisation.
await import('./game/main.js')

// Tous les identifiants réclamés par main.js existent-ils dans index.html ?
for (const id of new Set(demandes)) {
  assert.ok(ids.has(id), `main.js demande #${id}, absent de index.html`)
}

// Quelques frames, puis une run lancée au clavier, puis quelques frames de jeu.
const state = globalThis.window.__ski   // main.js pose sa poignée sur window, pas sur globalThis
assert.ok(state, 'main.js n a pas exposé son état')
function tourne(n, t0 = 0) {
  for (let i = 0; i < n; i++) {
    const prets = frames
    frames = []
    for (const f of prets) f(t0 + i * 16.7)
  }
}
tourne(3)
listeners.get('window:keydown')({ code: 'Space', preventDefault() {} })
tourne(40, 100)
assert.equal(state.phase, 'run', 'la touche espace ne lance pas la run')
assert.ok(state.press, 'espace ne charge pas le saut')
listeners.get('window:keyup')({ code: 'Space' })
listeners.get('window:keydown')({ code: 'ArrowRight', preventDefault() {} })
tourne(60, 800)
assert.ok(Number.isFinite(state.x) && Number.isFinite(state.s), 'la boucle part en NaN')
assert.ok(state.dist > 0, 'le skieur ne descend pas dans la boucle réelle')

// Redimensionnement et retour d'onglet : deux chemins qui plantaient facilement.
listeners.get('window:resize')({})
listeners.get('document:visibilitychange')({})
tourne(5, 2000)

console.log('domcheck : ok, render.js et main.js chargés,', new Set(demandes).size, 'éléments vérifiés')
