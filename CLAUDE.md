# Ski 3000 : consignes pour l'agent qui code

Tu codes un mini-jeu web en un week-end pour Tristan, qui te pilote souvent depuis son téléphone. **Lis `SPEC.md` en entier avant la première ligne de code.** `LATER.md` est la liste de ce qu'on ne code pas. Ce fichier dit comment travailler, la spec dit quoi construire.

## Quand Tristan dit...

| Il écrit | Tu fais |
|---|---|
| « Session N » | `git pull`. Lis `SPEC.md` §11, session N. Enchaîne ses blocs **un à la fois** : code, `sh check.sh`, commit, push, **donne l'URL de preview de ta branche**, et attends son retour avant le bloc suivant. Mets à jour la ligne de la session dans « État » ci-dessous |
| Une sensation (« ça décolle trop mou », « les bosses arrivent trop vite », « je crashe tout le temps ») | C'est un réglage. Tu nommes **une** constante de `TUNING`, tu la bouges d'un cran (10 à 25 %), tu dis l'ancienne et la nouvelle valeur, push, URL. Jamais deux constantes dans le même push. Ordre de réglage dans `SPEC.md` §10 |
| Un bug (« je passe sous le sol », « le son ne part pas ») | Reproduis-le par le raisonnement, corrige, `check.sh`, push, URL, et dis en une ligne ce que c'était |
| « merge » | Ouvre la PR vers `main` avec un titre et 3 lignes. S'il te manque le droit de la fusionner, dis-le, il le fait depuis l'app GitHub |
| Une idée nouvelle | Elle va dans `LATER.md`, pas dans le code, sauf s'il écrit « code-la » |
| « go » ou « suite » | Bloc suivant de la session en cours |

Après chaque push, ta réponse tient en 5 lignes : ce qui a changé, l'URL, ce qu'il doit sentir en jouant. Pas de récap, pas de liste de fichiers.

## Règles de code, non négociables

1. **`physics.js`, `terrain.js`, `gates.js`, `rng.js` sont purs** : jamais de `three` non plus, : aucun `document`, `window`, `canvas`, `performance`, `Date`, `Math.random`. Tout ce que le rendu dessine vient de `state`. `check.sh` les importe dans Node.
2. **`render.js` et `audio.js` lisent `state` et n'y écrivent jamais.** Ils réagissent à `state.events`.
3. **Toute constante de feel vit dans `TUNING`** (`physics.js`). Un nombre magique dans une fonction de physique ou de rendu est un bug.
4. **Une seule dépendance : `three`, chargée par `importmap` depuis `cdn.jsdelivr.net`.** Elle n'est pas dans le dépôt et `npm install` n'existe toujours pas. Zéro build, zéro asset, zéro police, aucun fichier binaire. Le jeu ne marche pas hors ligne, c'est assumé.
5. **Pas d'allocation dans la boucle** : pools pré-alloués pour anneaux, particules, étiquettes, traînée. Pas de `map`/`filter` par frame, pas d'objets créés dans `step` ni dans `draw`.
6. **`sh check.sh` vert avant chaque push.** En modules ES sans build, une variable non déclarée donne une page blanche sur le téléphone, sans aucun message. C'est le piège numéro 1 de ce projet. `check.sh` fait trois passes : syntaxe, `smoke.mjs` pour les modules purs, `domcheck.mjs` qui charge vraiment `render.js` et `main.js` dans un DOM bouchonné et vérifie que chaque `getElementById` a son identifiant dans `index.html`. Le bouchon de `three` est dans `tools/`, il ne dessine rien.
7. **Un fichier à la fois, un commit par bloc**, message en français au présent (« terrain seedé et dérivées analytiques »). Fin de message : `Co-Authored-By` avec ton modèle.
8. **Pas de tests au-delà de `check.sh`.** Le test, c'est le pouce de Tristan sur l'URL de preview.
9. **Ne recrée jamais `index.html`, `style.css`, `rng.js`** : ils sont écrits, tu les modifies. L'`importmap` de `index.html` fixe la version de `three`.
10. **Le pas fixe et le `dt` borné** (`SPEC.md` §4) ne se contournent pas, même « juste pour tester ».

## Pipeline

- **Chaque push déploie ta branche** : Actions lance `check.sh` puis publie `game/` sur `gh-pages`. Ta branche `claude/<slug>` est jouable sur `https://trstmnd.github.io/houle/preview/claude/<slug>/` environ 60 s après le push. Rien à fusionner pour tester.
- `main` est publié à la racine : https://trstmnd.github.io/houle/ (le contenu de `game/` directement, `?seed=` fonctionne dessus).
- Après chaque push, donne l'URL de preview complète de ta branche, telle quelle. Si le run Actions est rouge, rien n'est déployé : lis le log, corrige, repousse.
- Fin de session : « merge » → tu ouvres la PR, Tristan la fusionne en un tap dans l'app GitHub, `main` se redéploie.
- Session sur le Mac (tu as un navigateur) : `.claude/launch.json` lance `python3 -m http.server 8000 --directory game`. Teste toi-même avant de pousser. `file://` ne charge pas les modules ES.
- Session cloud (pas de navigateur) : `check.sh` puis push puis URL. Tu ne peux pas voir le jeu, Tristan le voit pour toi.

## Style

Français dans les commentaires, les commits et les messages. Identifiants en anglais. Nombres en chiffres. Aucun tiret cadratin, nulle part. Commentaires courts qui disent pourquoi, jamais quoi.

## État des sessions

Une ligne par session, tenue à jour par l'agent à chaque push. C'est ce que lit la session suivante.

Le jeu a pivoté le 18/09 : la descente 2D de dunes (spec v2) est abandonnée, on code un ski 3D (`SPEC.md` v3). L'ancienne version vit dans `attic/SPEC-2d.md` et dans la PR 1.

- Bloc 1, glisser : fait, et réglé. STICK colle le skieur au sol, la piste fait 45 m de demi-largeur, les bosses sont écartées à 13 m. Tout droit 1243 m à 75 km/h, en virages tenus 802 m à 48 km/h
- Bloc 2, chuter et compter : fait. Chrono 60 s avec la règle du dernier saut, écrans title et fin, records en localStorage, HUD vitesse et distance, grosses touches à l'écran, didacticiel en 4 étapes
- Bloc 2 bis, tremplins : fait. Bosse gaussienne dans le terrain, balisée par deux piquets orange, longueur du saut mesurée et annoncée, trois sons selon la longueur, souffle du vent
- Bloc 3, les portes : fait. `gates.js` pur, placement seedé écarté des tremplins, passage testé sur le segment du pas et borné en hauteur, chaîne, multiplicateur, score au HUD et à l'écran de fin. Mesuré : 2 portes sur 6 tout droit, 5 sur 5 en visant
- Bloc 4, l'habillage : fait. Sapins, rochers, chaîne de sommets, gerbes de neige, trace des skis, sons, télésiège qui longe la piste. Reste le partage testé sur un vrai téléphone
- Direction artistique depuis la v0.13.0 : cible SSX et Trickstyle, pas Amped. Ciel crépusculaire à trois arrêts, neige violette à l'ombre, alpenglow sur les sommets, sapins presque noirs, rideur orange et cyan, traînées de vitesse au-delà de 26 m/s, horizon qui penche dans le virage (`CAM_ROLL`), piste damée nettement plus claire que le hors-piste. Le HUD est passé en blanc sur ombre portée : le texte sombre ne tenait plus sur un ciel sombre
- `check.sh` fait trois passes depuis la v0.10.0, dont `domcheck.mjs` qui charge vraiment `render.js` et `main.js`. Le jeu est en ligne sur `main`
- À régler au pouce de Tristan, jamais seul : `GATE_GAP` (140 m donne 5 à 6 portes par run, donc une chaîne qui plafonne à 4 et un ×8 inatteignable)
