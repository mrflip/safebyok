import { defineConfig } from 'vitest/config'

// The adapter runs on a server, so the tests run under Node. They use PGlite, a real Postgres
// compiled to WebAssembly that runs in-process, so no database server is needed.
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
