import { defineConfig } from 'tsdown'

// The same build as the core's: ESM and CommonJS, each with declarations and source maps.
// `exports` writes package.json's entry points from what was built. publint and attw check the
// package as a consumer would see it, and fail the build on any finding. `safebyok-big` is a peer
// dependency, so it stays external: the VaultError this package throws must be the host's own copy's.
// `hash-wasm` is a dependency and external too, so a host's bundler keeps only the Argon2id it uses.
export default defineConfig({
  entry:      ['src/index.ts'],
  format:     ['esm', 'cjs'],
  // Runs wherever WebAssembly does: browsers, Node, Bun, and the frameworks built on them.
  platform:   'neutral',
  target:     'es2022',
  dts:        true,
  sourcemap:  true,
  clean:      true,
  exports:    { devExports: '@safebyok/source' },
  publint:    { level: 'warning' },
  attw:       { profile: 'strict', level: 'error' },
  failOnWarn: 'ci-only',
})
