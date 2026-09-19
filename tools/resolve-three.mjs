import { pathToFileURL } from 'node:url'
const STUB = pathToFileURL(process.cwd() + '/tools/three-stub.mjs').href
export function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: STUB, shortCircuit: true }
  return next(specifier, context)
}
