import { defineConfig } from 'tsdown'

// ESM and CommonJS, each with its own declarations and source maps. `exports` writes package.json's
// entry points from what was built, so they never drift from the files; publint and attw then read
// the package as a consumer would, and fail the build on anything they find. Each entry point also
// gains a `@safebyok/source` condition pointing at its src/, which the workspace's tsconfigs ask
// for, while `publishConfig.exports`, the dist-only copy, is what publishing ships.
//
// `unbundle` keeps each source module its own file in dist/, so `sideEffects: false` can do its
// work: a host's bundler drops every module the host's imports never reach, schemas and all. A
// bundled chunk would hold them together, and a bare `stableJsonify` would carry every validator.
export default defineConfig({
  // `safebyok/testing` is its own entry, so only a test that asks for it loads vitest. The entries
  // are a list so that `root` is honoured: given an object, tsdown takes the package's own directory
  // as the root and writes the modules under dist/src/. The testing entry builds from tests/, outside
  // `src`, so it is named in an object beside the list.
  entry:      ['src/index.ts', 'src/idb.ts', 'src/browser.ts', 'src/utils.ts', 'src/validators.ts', { testing: 'tests/test-helpers.ts' }],
  format:     ['esm', 'cjs'],
  // Browser first, but nothing here is browser-only: WebCrypto is the same global under Node.
  platform:   'neutral',
  target:     'es2022',
  unbundle:   true,
  root:       'src',
  dts:        true,
  sourcemap:  true,
  clean:      true,
  exports:    { devExports: '@safebyok/source' },
  publint:    { level: 'warning' },
  attw:       { profile: 'strict', level: 'error' },
  failOnWarn: 'ci-only',
})
