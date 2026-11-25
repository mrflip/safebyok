import { defineConfig } from 'tsdown'

// The same build as the core's: ESM and CommonJS, each with declarations and source maps.
// `exports` generates package.json's entry points from the build output, adding the
// `@safebyok/source` condition that the workspace's tsconfigs use. publint and attw check the
// package as a consumer would see it, and fail the build on anything they find. There are two
// entry points: `.` for the browser and `./server` for the server. `safebyok`, `graphql` and
// `@urql/core` are peer dependencies and stay external, so this adapter uses the host's own copy
// of safebyok (its VaultDB and VaultError) and of graphql (its GraphQLError).
export default defineConfig({
  entry:      ['src/index.ts', 'src/server.ts'],
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
