import { defineConfig } from 'tsdown'

// The lean core, built as safebyok-big is (its tsdown.config.ts says why each setting is there). Each entry is a subpath:
// `safebyok/core` now, `safebyok/storage` to come; `safebyok` itself waits on the instance sugar.
export default defineConfig({
  entry:      ['src/index.ts', 'src/core.ts'],
  format:     ['esm', 'cjs'],
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
