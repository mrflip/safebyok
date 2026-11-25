import { defineConfig } from 'vitest/config'

// convex-test runs the component's functions in-process, under the edge runtime Convex's own
// isolates resemble; it must be inlined so that its `import.meta.glob` is transformed. The
// packages under test are read as a consumer would, through their built `dist/` (this package's
// `pretest` builds them), except `safebyok-convex-big/test`, which ships as source.
export default defineConfig({
  test: {
    include:     ['tests/**/*.test.ts'],
    environment: 'edge-runtime',
    server:      { deps: { inline: ['convex-test'] } },
  },
})
