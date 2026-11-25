import { defineConfig } from 'tsdown'

// The same build as the core's: ESM and CommonJS, each with declarations and source maps.
// `exports` writes package.json's entry points from what was built, and adds the `@safebyok/source`
// condition that the workspace's tsconfigs resolve. publint and attw check the package as a consumer
// would see it, and fail the build on any finding. `safebyok-big` is a peer dependency, so it stays
// external: this adapter must extend the AdapterBankDB and VaultError of the host's own copy.
export default defineConfig({
  entry:      ['src/index.ts'],
  format:     ['esm', 'cjs'],
  // Built for browsers, but not browser-only: it runs anywhere with an `indexedDB` global.
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
