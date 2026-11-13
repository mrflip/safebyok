import { defineConfig } from 'tsdown'

// The same build as the core's: ESM and CommonJS, each with declarations and source maps.
// `exports` generates package.json's entry points from the build output, adding the
// `@safebyok/source` condition that the workspace's tsconfigs use. publint and attw check the
// package as a consumer would see it, and fail the build on anything they find. `safebyok` is a
// peer dependency and stays external, so this adapter extends the AdapterBankDB and VaultError of
// the host's own copy.
export default defineConfig({
  entry:      ['src/index.ts'],
  format:     ['esm', 'cjs'],
  // Runs on whatever server the host has (Node, Bun, Deno, an edge runtime), so it uses no runtime-specific API.
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
