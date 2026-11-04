import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include:     ['tests/**/*.test.ts'],
    environment: 'node',
    // Every spy is put back before each test, so no test inherits another's.
    restoreMocks: true,
    // Snapshots mirror the test tree under one hidden directory, rather than dropping a
    // `__snapshots__` beside every test file.
    resolveSnapshotPath: (testpath, extension) => (
      path.join('tests', '.snapshots', path.relative(path.join(import.meta.dirname, 'tests'), testpath) + extension)
    ),
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
