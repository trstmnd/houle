// Redirige l'import de three vers le bouchon, le temps de check.sh. Node n'a pas d'importmap.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
register('./resolve-three.mjs', pathToFileURL('./tools/'))
