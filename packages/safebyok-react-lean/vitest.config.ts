import { defineConfig } from 'vitest/config'

// The binding is React components and hooks, so the tests render them under jsdom.
export default defineConfig({
  test: {
    include:     ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    // Restore every spy before each test. tests/setup.ts unmounts each test's render.
    restoreMocks: true,
    setupFiles:   ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
