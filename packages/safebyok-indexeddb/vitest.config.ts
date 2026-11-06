import { defineConfig } from 'vitest/config'

// The tests run under Node, against fake-indexeddb: IndexedDB's own semantics -- transactions,
// structured clone -- with no browser.
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
