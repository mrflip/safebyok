import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// One config serves both `vite` (the dev server) and `vitest` (the tests). The tests of the plain
// TypeScript modules (the auth scaffold, the Anthropic call) run under node. Each component test runs
// under jsdom, selected by a `@vitest-environment jsdom` line at the top of its file.
export default defineConfig({
  plugins: [react()],
  // Two pages, each with its own bundle, so the landing page's bundle carries none of the labs' developer tools.
  build: { rolldownOptions: { input: { landing: 'index.html', labs: 'labs.html' } } },
  test: {
    include:     ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Longer than the 5 s asyncUtilTimeout that tests/setup.ts gives each wait, so a wait that
    // never finishes fails with its own message instead of as a test timeout.
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
