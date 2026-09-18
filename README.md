# Ski 3000

Descente de ski infinie, vue 3/4 arrière, un doigt, 60 secondes. Tu tiens ta ligne, tu prends les
tremplins, tu essaies d'aller le plus loin possible. Virer freine : c'est tout l'arbitrage du jeu.

**Jouer** : https://trstmnd.github.io/houle/ (le dépôt et l'URL gardent le nom `houle`)

- Sur téléphone, glisse le doigt pour virer, ou utilise les deux grosses touches.
- Sur ordinateur, les flèches, A et D, ou les touches à l'écran à la souris.
- Chaque piste a une seed, écrite dans l'adresse : partage le lien, tu partages la piste.

## Le code

Modules ES servis tels quels, aucun build, aucun `npm install`. Une seule dépendance, `three`,
chargée par `importmap` depuis un CDN : le jeu a besoin du réseau pour démarrer.

| Fichier | Rôle | Pur ? |
|---|---|---|
| `game/terrain.js` | Hauteur analytique `h(x, z)` et ses 5 dérivées, tremplins, arbres | oui |
| `game/physics.js` | `TUNING`, pas fixe, carve, décollage, vol, réception, chute | oui |
| `game/rng.js` | `mulberry32` | oui |
| `game/main.js` | Boucle, input, écrans, HUD | non |
| `game/render.js` | Scène three, grille de terrain glissante, skieur, caméra | non |
| `game/audio.js` | Oscillateurs WebAudio | non |

`SPEC.md` dit quoi construire, `CLAUDE.md` dit comment travailler, `LATER.md` liste ce qu'on ne
code pas. `attic/` garde la spec de la version 2D abandonnée.

## Avant chaque push

```sh
sh check.sh
```

Syntaxe de chaque fichier, puis les modules purs chargés dans Node : dérivées comparées à la
différence finie, 20 secondes de simulation sans NaN. En modules ES sans build, une faute de
syntaxe donne une page blanche sans le moindre message.

## Servir en local

```sh
python3 -m http.server 8000 --directory game
```

`file://` ne charge pas les modules ES.
