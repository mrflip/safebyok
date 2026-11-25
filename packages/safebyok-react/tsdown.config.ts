import { defineConfig } from 'tsdown'

// The same build as the core's: ESM and CommonJS, each with declarations and source maps. `exports`
// writes package.json's entry points from what was built. publint and attw check the package the way a
// consumer would, and fail the build on anything they find. `react` and react-query are peer dependencies,
// so they stay external and this package uses the host's single copy of each. The entry also gets the
// core's `@safebyok/source` condition, for the workspace's tsconfigs. `testing`, for a host's own tests, is built from
// tests/ and so named in an object beside the list; vitest is its optional peer, as it is the core's.
export default defineConfig({
  entry:      ['src/index.ts', 'src/parts/index.ts', 'src/kit/index.ts', { testing: 'tests/testing.ts' }],
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
  // of safebyok, so any host that has the core already has it. Keep it external, like safebyok. safebyok's
  // declarations re-export safebyok-big's types: followed, they report idb-keyval as bundled, though nothing of
  // it is, and tsdown writes it into package.json as an inlined dependency at each build.
  deps:       { neverBundle: [/^zod(\/|$)/, /^@tanstack\//, /^safebyok-big(\/|$)/] },
  exports:    { devExports: '@safebyok/source' },
  // The three entries a host imports start with 'use client', so a Next.js Server Component can import a part or a form.
  // A directive written in the entries' sources survives the build but warns on each, and `failOnWarn` fails CI on a warning.
  banner:     ({ fileName }) => (/^(parts\/|kit\/)?index\.c?js$/.test(fileName) ? "'use client';" : undefined),
  publint:    { level: 'warning' },
  attw:       { profile: 'strict', level: 'error' },
  failOnWarn: 'ci-only',
})
