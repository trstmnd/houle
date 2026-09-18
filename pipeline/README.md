# Workflow de preview, en attente de son déplacement

`pages.yml` doit vivre dans `.github/workflows/`. Il est posé ici parce que le jeton qui a poussé le dépôt n'a pas le scope `workflow` : GitHub refuse à ce jeton tout commit qui crée un fichier sous `.github/workflows/`.

À déplacer par un commit qui en a le droit (`git mv pipeline/pages.yml .github/workflows/pages.yml`), puis basculer la source GitHub Pages sur la branche `gh-pages`. Ce dossier disparaît avec le déplacement.
