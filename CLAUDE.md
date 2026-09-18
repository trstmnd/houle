# Houle : consignes pour l'agent qui code

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

1. **`physics.js`, `terrain.js`, `rings.js`, `rng.js` sont purs** : aucun `document`, `window`, `canvas`, `performance`, `Date`, `Math.random`. Tout ce que le rendu dessine vient de `state`. `check.sh` les importe dans Node.
2. **`render.js` et `audio.js` lisent `state` et n'y écrivent jamais.** Ils réagissent à `state.events`.
3. **Toute constante de feel vit dans `TUNING`** (`physics.js`). Un nombre magique dans une fonction de physique ou de rendu est un bug.
4. **Zéro dépendance, zéro build, zéro asset, zéro police.** `npm install` n'existe pas dans ce projet. Aucun fichier binaire dans le dépôt.
5. **Pas d'allocation dans la boucle** : pools pré-alloués pour anneaux, particules, étiquettes, traînée. Pas de `map`/`filter` par frame, pas d'objets créés dans `step` ni dans `draw`.
6. **`sh check.sh` vert avant chaque push.** En modules ES sans build, une faute de syntaxe donne une page blanche sur le téléphone, sans aucun message. C'est le piège numéro 1 de ce projet.
7. **Un fichier à la fois, un commit par bloc**, message en français au présent (« terrain seedé et dérivées analytiques »). Fin de message : `Co-Authored-By` avec ton modèle.
8. **Pas de tests au-delà de `check.sh`.** Le test, c'est le pouce de Tristan sur l'URL de preview.
9. **Ne recrée jamais `index.html`, `style.css`, `rng.js`** : ils sont écrits, tu les modifies.
10. **Le pas fixe et le `dt` borné** (`SPEC.md` §4) ne se contournent pas, même « juste pour tester ».

## Pipeline

- **Chaque push déploie ta branche** : Actions lance `check.sh` puis publie `game/` sur `gh-pages`. Ta branche `claude/<slug>` est jouable sur `https://trstmnd.github.io/houle/preview/claude/<slug>/` environ 60 s après le push. Rien à fusionner pour tester.
- `main` est publié à la racine : https://trstmnd.github.io/houle/ (la racine redirige vers `game/` en gardant `?seed=`).
- Après chaque push, donne l'URL de preview complète de ta branche, telle quelle. Si le run Actions est rouge, rien n'est déployé : lis le log, corrige, repousse.
- Fin de session : « merge » → tu ouvres la PR, Tristan la fusionne en un tap dans l'app GitHub, `main` se redéploie.
- Session sur le Mac (tu as un navigateur) : `.claude/launch.json` lance `python3 -m http.server 8000 --directory game`. Teste toi-même avant de pousser. `file://` ne charge pas les modules ES.
- Session cloud (pas de navigateur) : `check.sh` puis push puis URL. Tu ne peux pas voir le jeu, Tristan le voit pour toi.

## Style

Français dans les commentaires, les commits et les messages. Identifiants en anglais. Nombres en chiffres. Aucun tiret cadratin, nulle part. Commentaires courts qui disent pourquoi, jamais quoi.

## État des sessions

Une ligne par session, tenue à jour par l'agent à chaque push. C'est ce que lit la session suivante.

- Session 1 (samedi 19/09 matin) : bloc 1 fait (terrain.js : sample, crests, inflectionBefore). Blocs 2 à 4 à faire
- Session 2 (samedi 19/09 après-midi) : à faire
- Session 3 (dimanche 20/09 matin) : à faire
- Session 4 (dimanche 20/09 après-midi) : à faire
