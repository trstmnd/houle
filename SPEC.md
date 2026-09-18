# Ski 3000 : spec v3

> Le jeu s'appelle **Ski 3000**. Le dépôt, la branche et l'URL gardent le nom `houle`, c'est sans conséquence.

> Descente de montagne infinie, vue 3/4 arrière, un doigt. Tu tiens ta ligne, tu prends les bosses, tu passes les portes. 60 secondes. Deux compétences qui s'opposent : la vitesse et la précision.
>
> v3 du 18/09/2026. Remplace la v2 (descente 2D de dunes), archivée dans `attic/SPEC-2d.md` et dans la PR 1. Ce fichier est la référence d'exécution.

## 0. Pourquoi la v3

La v2 était un jeu de golf déguisé en descente : un seul booléen, un tir par bosse. Jouée, elle est plate. La v3 garde ce qui marchait (terrain analytique seedé, pas fixe, zéro build, pipeline de preview) et change le geste : on pilote une trajectoire en continu au lieu d'appuyer sur un bouton.

Ce qui reste vrai : **le cœur doit être agréable sans une seule porte.** Si glisser n'est pas bon, aucune couche ne le sauvera.

## 1. Le jeu

Une piste infinie qui descend vers `-Z`. Le skieur va toujours vers le bas, tu choisis sa ligne.

- **Le doigt dirige.** Glisse à gauche, il vire à gauche. Doigt levé, il se remet dans la pente.
- **Virer coûte.** Plus l'angle de carre est grand, plus tu freines. Une ligne droite est rapide et ingérable, une ligne propre est rapide et tenue. C'est tout l'arbitrage.
- **Les bosses décollent.** Pas de bouton de saut : au-dessus d'une certaine vitesse, un dos de bosse t'arrache du sol. Tu retombes à plat, tu gardes ta vitesse ; tu retombes de travers, tu la perds.
- **Les portes paient.** Deux fanions, un passage. Les enchaîner monte un multiplicateur. Les rater ne coûte que les points.

Une run dure 60 secondes. Une chute coûte 1,5 seconde et la vitesse, jamais la run.

### Les deux compétences

| Compétence | Ce qui la mesure | Ce qui la récompense |
|---|---|---|
| Vitesse | Distance parcourue en 60 s | Une ligne droite dans les zones lisses, du schuss, des réceptions à plat |
| Précision | Portes enchaînées | Des virages courts et tôt, dans les champs de bosses |

Le terrain alterne les deux : des bandes lisses (vitesse) et des champs de bosses (précision), le long de la descente.

## 2. Stack

**Three.js depuis un CDN, WebGL, modules ES, zéro build, zéro asset.**

| Contrainte | Décision |
|---|---|
| 3D | `three` 0.186, chargé par `importmap` depuis `cdn.jsdelivr.net`. C'est la seule dépendance, et elle n'est pas dans le dépôt |
| Build | Aucun. `npm` n'est jamais lancé |
| Images, polices, sons | Aucun fichier. Géométries et matériaux construits par code, police système |
| Hors ligne | Ne marche pas : le CDN est requis. C'est le prix accepté pour la 3D en un week-end |
| Perf | 60 fps sur un téléphone milieu de gamme. Maillage de terrain recalculé seulement quand la grille change de case |
| Unités | Mètres et secondes. Un skieur fait 1,8 m, il descend à 20 à 40 m/s |
| Orientation | Portrait. Le paysage marche, il n'est pas optimisé |

## 3. Architecture

| Fichier | Rôle | Pur ? |
|---|---|---|
| `game/index.html` | Canvas, `importmap`, HUD, écrans | |
| `game/style.css` | Mise en page, pièges mobiles, palette | |
| `game/main.js` | Boucle, pas fixe, input, machine à états | non |
| `game/physics.js` | `TUNING`, `createState`, `step`, carve, décollage, vol, réception, chute | **oui** |
| `game/terrain.js` | `h(x, z)` et ses 5 dérivées, analytiques, seedées | **oui** |
| `game/gates.js` | Placement des portes, passage, chaîne, score | **oui** |
| `game/rng.js` | `mulberry32` | **oui** |
| `game/render.js` | Scène Three, terrain, skieur, caméra, fanions, particules | non |
| `game/audio.js` | Oscillateurs WebAudio | non |

**Règle de pureté inchangée** : `physics.js`, `terrain.js`, `gates.js`, `rng.js` n'importent jamais `three`, ni `document`, ni `window`. `check.sh` les charge dans Node.

`render.js` lit `state` et n'y écrit jamais.

## 4. Terrain

Hauteur analytique, y vers le haut, la piste descend vers `-Z`.

```
h(x, z) = SLOPE·z
        + R1·sin(a·x + p1)                      houle latérale, des dévers
        + R2·sin(b·z + p2)                      rouleaux en travers : ce sont eux qui décollent
        + R3·sin(c·x + p3)·sin(d·z + p4)        relief large
        + A(z)·sin(mx·x + p5)·sin(mz·z + p6)    bosses, en bandes
A(z)    = MOG_AMP · (0,5 + 0,5·sin(f·z + p7))   alterne lisse et champ de bosses
```

`sample(x, z)` rend `y`, `hx`, `hz`, `hxx`, `hxz`, `hzz` en une passe, dans un objet réutilisé. Les dérivées secondes servent au critère de décollage, jamais une différence finie.

Phases tirées de la seed dans cet ordre : `p1` à `p7`. **L'ordre fait partie du contrat.**

La piste est bornée à `|x| < TRACK_HALF`. Au-delà, neige profonde : `DEEP_DRAG` s'ajoute. Deux rangées de fanions marquent le couloir et donnent l'échelle de vitesse.

## 5. Mécanique

Le cap `θ` vaut 0 dans l'axe de la pente, positif vers `+X`. La direction est `d = (sin θ, -cos θ)` dans le plan `(x, z)`.

### Au sol

```js
const hd = hx·dx + hz·dz                        pente le long du cap
s += -G · hd / sqrt(1 + hd²) · dt               la gravité pousse
s -= (FRICTION + EDGE_DRAG·|steer| + deep) · s · dt
s -= AIR_DRAG · s² · dt
θ += steer · TURN_RATE · dt
x += s·dx·dt ; z += s·dz·dt ; y = h(x, z)
```

Virer freine par `EDGE_DRAG·|steer|` : c'est l'arbitrage entier du jeu dans une ligne.

### Le décollage

Courbure du sol le long du cap, puis critère centripète, comme en v2 mais en 3D :

```js
const hdd = hxx·dx² + 2·hxz·dx·dz + hzz·dz²
const kappa = -hdd / Math.pow(1 + hd·hd, 1.5)   positif sur un dos de bosse
if (kappa > 0 && s·s·kappa > G / Math.sqrt(1 + hd·hd)) → en l'air
```

La vitesse au décollage est la tangente : `v = s · (dx, hd, dz) / sqrt(1 + hd²)`.

### En vol et la réception

En vol : `vy -= G·dt`, le cap suit toujours le doigt (on se replace pour la réception), pas de rotation acrobatique en v3.

Contact quand `y ≤ h(x, z)`. On mesure l'angle entre la vitesse et le plan de la pente :

| Écart | Résultat |
|---|---|
| < `LAND_PERFECT` | À plat : vitesse conservée, petit bonus |
| jusqu'à `LAND_FAIL` | Encaissé : perte proportionnelle |
| au-delà | Chute : `WIPE_SPEED`, `WIPE_TIME` sans contrôle |

## 6. Portes, score, seed

- Portes posées par simulation d'une descente de référence, tous les `GATE_GAP` mètres environ, largeur `GATE_W`, décalées latéralement par la seed. Jamais dans une zone où le terrain est infranchissable.
- Passage détecté sur le segment du pas : le skieur coupe le segment entre les deux fanions.
- `mult = MULT_TABLE[min(chain, 4)]`, `MULT_TABLE = [1, 2, 3, 5, 8]`. Une porte ratée casse la chaîne, une chute aussi.
- Le score compte les portes. La distance ne rapporte rien : elle est déjà sa propre récompense, on va plus loin donc on voit plus de portes.
- Seed à 6 chiffres dans `?seed=`, écrite par `replaceState`. Record par seed en `localStorage`.

## 7. Input

| Plateforme | Entrée |
|---|---|
| Mobile | `pointerdown` n'importe où pose l'origine, le glissement horizontal donne `steer` dans `[-1, 1]` sur `STEER_SPAN` pixels. `pointerup` relâche |
| Desktop | Flèches gauche/droite ou A/D, `steer` monte à 1 en `KEY_RAMP` secondes |
| Toujours | Doigt levé : `steer` retombe à 0 en `STEER_RETURN` secondes. `blur` et onglet caché relâchent et mettent en pause |

Pièges mobiles déjà traités dans `index.html` et `style.css` : `touch-action`, `overscroll-behavior`, safe areas, `100dvh`, pas de menu contextuel.

## 8. Rendu

- Ciel plein, brouillard à la même couleur : la piste sort du blanc. C'est ce qui donne la profondeur sans un seul asset.
- Terrain : grille `GRID_NX × GRID_NZ` de `CELL` mètres, calée sur un réseau fixe. Les hauteurs ne sont recalculées **que** quand la grille change de case, pas à chaque frame. `flatShading` : les facettes suffisent à lire une bosse.
- Skieur : trois boîtes et une capsule, inclinées avec `steer`. Il se lit à 30 m/s.
- Caméra : derrière et au-dessus, lissée en exponentielle, elle regarde devant le skieur. **Le champ de vision s'ouvre avec la vitesse** (`FOV_BASE` à `FOV_FAST`) : c'est le meilleur retour de vitesse qui existe.
- Fanions : deux `InstancedMesh`, repositionnés par tranches quand le skieur avance.

## 9. Constantes de départ

Toutes dans `TUNING` (`physics.js`), en mètres et secondes. Points de départ, pas vérités.

| Constante | Valeur | Rôle |
|---|---|---|
| `G` | 9.81 | Gravité |
| `SLOPE` | 0.30 | Pente moyenne (17°) |
| `MAX_SPEED` | 45 | Plafond, m/s |
| `START_SPEED` | 12 | Vitesse au départ |
| `TURN_RATE` | 1.6 | rad/s à pleine carre |
| `EDGE_DRAG` | 0.85 | Freinage du virage, /s à `steer` = 1 |
| `FRICTION` | 0.06 | Neige, /s |
| `AIR_DRAG` | 0.0016 | /m, c'est lui qui pose la vitesse terminale |
| `DEEP_DRAG` | 1.2 | Hors piste, /s |
| `TRACK_HALF` | 34 | Demi-largeur de piste, m |
| `LAND_PERFECT` | 0.22 rad | Réception à plat |
| `LAND_FAIL` | 0.62 rad | Au-delà, chute |
| `LAND_LOSS` | 0.5 | Perte max sur réception encaissée |
| `WIPE_SPEED` | 6 | Vitesse après chute |
| `WIPE_TIME` | 1.5 | Durée sans contrôle |
| `STEER_SPAN` | 90 | Pixels de glissement pour aller de 0 à 1 |
| `STEER_RETURN` | 0.25 | s pour revenir à 0 doigt levé |
| `KEY_RAMP` | 0.18 | s pour monter à 1 au clavier |
| `RUN_TIME` | 60 | s |
| `R1, R2, R3` | 2.2, 1.6, 5.0 | Amplitudes du relief, m |
| `MOG_AMP` | 0.85 | Amplitude des bosses, m |
| `GATE_GAP` | 140 | m entre deux portes |
| `GATE_W` | 9 | m entre les fanions |
| `FOV_BASE, FOV_FAST` | 62, 88 | Degrés |
| `CAM_BACK, CAM_UP` | 11, 4.5 | Position de la caméra, m |

### Ordre de réglage

1. `SLOPE`, `AIR_DRAG` : la vitesse de croisière est-elle bonne ?
2. `TURN_RATE`, `EDGE_DRAG` : virer répond-il, et coûte-t-il assez ?
3. `R2`, `MOG_AMP` : les bosses décollent-elles au bon moment ?
4. `LAND_PERFECT`, `LAND_FAIL` : la réception est-elle exigeante sans être injuste ?
5. `GATE_GAP`, `GATE_W` : les portes sont-elles tenables à pleine vitesse ?
6. `FOV_*`, `CAM_*` : en dernier, jamais avant.

## 10. Les blocs

1. **Glisser.** Terrain, rendu, caméra, skieur, direction au doigt, freinage au virage, décollage sur les bosses, réception. Point de contrôle : descendre 60 secondes est-il agréable, sans une seule porte ?
2. **Chuter et compter.** Chute, chrono 60 s, écrans title et fin, HUD vitesse et distance.
3. **Les portes.** Placement, passage, chaîne, score, fanions.
4. **L'habillage.** Gerbes de neige, son, record, partage, mise en ligne.

## 11. Ce qu'on ne code pas

Reporté dans `LATER.md` : sauts acrobatiques et rotations, plusieurs pistes, arbres et obstacles, fantôme, multijoueur, skins, tutoriel, mode paysage dédié, moteur physique tiers, tests au-delà de `check.sh`.
