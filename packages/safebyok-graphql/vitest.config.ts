import { defineConfig } from 'vitest/config'

// The tests run the whole round trip in one Node process: an urql Client, a GraphQL server built
// from the resolvers, and safebyok-postgres's VaultDB on PGlite (a real Postgres compiled to
// WebAssembly). No database or GraphQL server needs to be running.
export default defineConfig({
  // Make everything load the same copy of graphql. graphql ships a development build next to its
  // standard one, selected by the `development` condition that Vite resolves with by default. Vite
  // loads src/ and would get the development build, while Node loads graphql-tools and urql and
  // gets the other. That makes two GraphQLError and two GraphQLSchema classes, and graphql throws
  // its "another module or realm" error. Without that condition, both get the same build.
  ssr: { resolve: { conditions: ['module', 'node'] } },
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
