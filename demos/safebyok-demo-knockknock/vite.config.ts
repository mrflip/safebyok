import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// One config serves both `vite` (the dev server and the build) and `vitest` (the tests). The tests of the plain
// TypeScript modules run under node. Each test that needs a DOM runs under jsdom, selected by a
// `@vitest-environment jsdom` line at the top of its file.
export default defineConfig({
  plugins: [react()],
  // zxcvbn's dictionaries, which the strength meter loads, make one chunk of about a megabyte.
  build:   { chunkSizeWarningLimit: 1500 },
  test: {
    include:     ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Longer than the 5 s asyncUtilTimeout that tests/setup.ts gives each wait, so a wait that
    // never settles fails with its own message instead of as a test timeout.
    testTimeout: 15_000,
    // Restore every spy and stubbed global before each test. tests/setup.ts unmounts what each
    // test rendered.
    restoreMocks:  true,
    unstubGlobals: true,
    setupFiles:    ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
