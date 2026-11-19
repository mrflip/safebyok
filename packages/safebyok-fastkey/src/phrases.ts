// The messages of the refusals this package makes itself.

// == [Refusals]: NoWebAssembly, EmptyPassphrase, WasmWouldNotCompile

/** A platform with no WebAssembly at all. */
export const NoWebAssembly = "This platform has no WebAssembly (React Native's Hermes has none), so the WebAssembly key deriver cannot run here: use argon2idWebV1Deriver, or makeArgon2idDeriver, from safebyok-big/browser."

/** An empty passphrase, which hash-wasm cannot take. */
export const EmptyPassphrase = "A passphrase can't be empty."

/** WebAssembly that would not compile. */
export const WasmWouldNotCompile = "WebAssembly would not compile here, so Argon2id cannot run through it. The likely cause is a page's Content-Security-Policy, whose script-src must allow 'wasm-unsafe-eval': allow it, or use argon2idWebV1Deriver from safebyok-big/browser."
// --
