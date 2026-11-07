import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// One config serves both: `vite` for the dev server, `vitest` for the tests. The machinery's
// tests (auth scaffold, Anthropic) are plain TypeScript and run under node; each component's
// renders under jsdom, by a `@vitest-environment jsdom` line at the top of its file.
export default defineConfig({
  plugins: [react()],
  test: {
    include:     ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Above the 5 s asyncUtilTimeout that tests/setup.ts gives each wait, so that a wait that
    // never ends fails with its own message, and not as the test's timeout.
    testTimeout: 15_000,
    // Every spy and stubbed global is put back before each test, and tests/setup.ts unmounts
    // each test's render.
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
