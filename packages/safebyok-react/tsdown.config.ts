import { defineConfig } from 'tsdown'

// The same build as the core's: ESM and CommonJS, each with declarations and source maps. `exports`
// writes package.json's entry points from what was built. publint and attw check the package the way a
// consumer would, and fail the build on anything they find. `safebyok` and `react` are peer dependencies,
// so they stay external and this package uses the host's single copy of each. The entry also gets the
// core's `@safebyok/source` condition, for the workspace's tsconfigs.
//
// `safebyok-react/devmode` is a separate entry. Its inspection panels show raw rows and whispers, so only
// a host that imports that entry by name gets them. The main entry never includes them.
export default defineConfig({
  entry:      ['src/index.ts', 'src/devmode/index.ts'],
  root:       'src',
  format:     ['esm', 'cjs'],
  // 'browser' would be ignored for the CommonJS build, which tsdown 0.23.5 reports as an error. Nothing
  // here bundles code that varies by platform, so 'neutral' builds the same files.
  platform:   'neutral',
  target:     'es2022',
  dts:        true,
  sourcemap:  true,
  clean:      true,
  // A checker's declared type refers to zod's types, through safebyok's validators. zod is a peer dependency
  // of safebyok, so any host that has the core already has it. Keep it external, like safebyok.
  deps:       { neverBundle: [/^zod(\/|$)/] },
  exports:    { devExports: '@safebyok/source' },
  publint:    { level: 'warning' },
  attw:       { profile: 'strict', level: 'error' },
  failOnWarn: 'ci-only',
})
