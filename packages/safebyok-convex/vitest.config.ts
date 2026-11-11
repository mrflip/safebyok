import { defineConfig } from 'vitest/config'

// convex-test runs the component's functions in-process, in the edge runtime, which resembles
// Convex's own isolates. It must be inlined so that its `import.meta.glob` is transformed.
export default defineConfig({
  test: {
    include:     ['tests/**/*.test.ts'],
    environment: 'edge-runtime',
    server:      { deps: { inline: ['convex-test'] } },
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.ts'],
      exclude:  ['src/component/_generated/**'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
