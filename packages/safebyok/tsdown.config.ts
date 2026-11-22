import { defineConfig } from 'tsdown'

// The lean core, built as safebyok-big is (its tsdown.config.ts says why each setting is there). Each entry is a subpath:
// `safebyok`, the front door of what a host touches, `safebyok/core` and `safebyok/storage`; `safebyok/utils`, the helpers
// that pull in none of the vault; `safebyok/browser`, so the Argon2id deriver and zxcvbn reach only a host that imports
// them; and `safebyok/testing`, the battery an adapter's tests run, built from tests/ and so named in an object beside
// the list.
export default defineConfig({
  entry:      ['src/index.ts', 'src/browser.ts', 'src/core.ts', 'src/storage.ts', 'src/utils.ts', { testing: 'tests/test-helpers.ts' }],
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
