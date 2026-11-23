import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// One config serves both `vite` (the dev server and the build) and `vitest` (the tests). The tests run under jsdom, over
// fake-indexeddb (tests/setup.ts).
export default defineConfig({
  plugins: [react()],
  // The dojo builds to one chunk of about 600 kB, over Vite's 500 kB warning: it is a local page, never deployed.
  build:   { chunkSizeWarningLimit: 1000, target: 'es2022' },
  test: {
    include:     ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
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
