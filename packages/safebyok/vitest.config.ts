import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include:      ['tests/**/*.test.ts'],
    environment:  'node',
    // Every spy is put back before each test, so no test inherits another's.
    restoreMocks: true,
  },
})
