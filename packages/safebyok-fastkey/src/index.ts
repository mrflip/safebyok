/** safebyok-fastkey: Argon2id through WebAssembly (hash-wasm), as a safebyok KeyDeriver.
 * It takes the same keyDeriverSpecs as the core's pure-JavaScript deriver and derives the same bytes,
 * several times faster, wherever WebAssembly runs.
 */
export { makeArgon2idWasmDeriver, argon2idWasmWebV1Deriver } from './wasm-deriver'
