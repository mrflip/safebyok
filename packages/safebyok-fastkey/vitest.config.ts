import { defineConfig } from 'vitest/config'

// The tests run under Node, which has the same WebAssembly and WebCrypto globals as a browser.
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
