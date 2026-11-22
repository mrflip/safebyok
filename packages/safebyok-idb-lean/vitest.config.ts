import { defineConfig } from 'vitest/config'

// The tests run under Node against fake-indexeddb, which gives IndexedDB's real semantics
// (transactions, structured clone) without a browser.
export default defineConfig({
  test: {
    include:     ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
