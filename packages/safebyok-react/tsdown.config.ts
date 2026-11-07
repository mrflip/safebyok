import { defineConfig } from 'tsdown'

// The same build as the core's (ESM and CommonJS, each with declarations and source maps; `exports`
// writes package.json's entry points from what was built; publint and attw read the package as a
// consumer would and fail the build on anything they find). `safebyok` and `react` are peers, so
// they stay external and the host's single copy of each is the one the binding uses. Its entry also
// gains the core's `@safebyok/source` condition, for the workspace's tsconfigs.
//
// `safebyok-react/devmode` is its own entry, so the inspection panels, which show raw rows and
// whispers, reach only a host that names them, and never ride in on the front door.
export default defineConfig({
  entry:      ['src/index.ts', 'src/devmode/index.ts'],
  root:       'src',
  format:     ['esm', 'cjs'],
  // The binding is React components and hooks, so unlike the core it is for browsers (and the
  // frameworks that render on them) only.
  platform:   'browser',
  target:     'es2022',
  dts:        true,
  sourcemap:  true,
  clean:      true,
  exports:    { devExports: '@safebyok/source' },
  publint:    { level: 'warning' },
  attw:       { profile: 'strict', level: 'error' },
  failOnWarn: 'ci-only',
})
