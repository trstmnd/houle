# Houle

Descente infinie de dunes, vue de côté, un seul doigt, 60 secondes. Tu maintiens pour charger dans les creux, tu relâches avant la crête pour décoller, tu traverses des anneaux en vol. Le score, c'est ce que tu attrapes en l'air.

**Jouer** : https://trstmnd.github.io/houle/ · **Défier quelqu'un sur ta piste** : le bouton Partager, ou `?seed=NNNNNN` dans l'URL.

Zéro dépendance, zéro build, zéro image : Canvas 2D et JavaScript vanilla, 9 fichiers dans `game/`.

## Coder depuis le téléphone

1. App Claude, onglet Code, dépôt `trstmnd/houle`, modèle Opus 5.
2. Tape `Session 1` (puis 2, 3, 4 : le plan est dans `SPEC.md` §11).
3. Après chaque push, recharge https://trstmnd.github.io/houle/ et joue.
4. Réglage : dis la sensation (« ça décolle trop mou »), pas la solution.
5. Si l'agent ouvre une PR au lieu de pousser sur `main` : un tap dans l'app GitHub.

## En local sur le Mac

```bash
python3 -m http.server 8000 --directory game
```

Puis http://localhost:8000. Ouvrir `index.html` directement ne marche pas : les modules ES exigent un serveur.

## Fichiers

| Fichier | Rôle |
|---|---|
| `SPEC.md` | La spec v2 : mécanique, constantes, sessions, pipeline |
| `CLAUDE.md` | Les consignes de l'agent qui code |
| `LATER.md` | Ce qu'on ne code pas ce week-end |
| `game/` | Le jeu |
| `check.sh` | Syntaxe et import de chaque module, à passer avant chaque push |
