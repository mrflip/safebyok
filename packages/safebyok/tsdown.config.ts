import { defineConfig } from 'tsdown'

// The lean core, built as safebyok-big is (its tsdown.config.ts says why each setting is there). Each entry is a subpath:
// `safebyok`, the front door of what a host touches, `safebyok/core` and `safebyok/storage`.
export default defineConfig({
  entry:      ['src/index.ts', 'src/core.ts', 'src/storage.ts'],
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
