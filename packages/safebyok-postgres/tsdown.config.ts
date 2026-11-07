import { defineConfig } from 'tsdown'

// The same build as the core's: ESM and CommonJS, each with declarations and source maps;
// `exports` writes package.json's entry points from what was built, with the `@safebyok/source`
// condition the workspace's tsconfigs ask for; publint and attw read the package as a consumer
// would, and fail the build on anything they find. `safebyok` is a peer, so it stays external and
// the host's one copy is the one whose AdapterVaultDB and VaultError this adapter extends.
export default defineConfig({
  entry:      ['src/index.ts'],
  format:     ['esm', 'cjs'],
  // The host's server, whichever it is: Node, Bun, Deno, an edge runtime. Nothing here is any one's.
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
