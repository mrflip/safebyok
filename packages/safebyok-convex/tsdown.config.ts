import { defineConfig } from 'tsdown'

// Built the way Convex's own component template is: ESM only and unbundled, so each module of the
// component keeps its own file under dist/component/, beside its convex.config.js and _generated/.
// A host's Convex CLI finds the component through convex.config.js and bundles that directory's
// modules itself when it deploys. `exports` in package.json is written by hand, because two of its
// entries follow Convex's conventions and are not built entry points: the types-only
// `./_generated/component.js`, and `./test`, which ships as source because its `import.meta.glob`
// must find the component's .ts modules. `./testing` is built like the client: it is a fake
// deployment for tests, and imports only `convex`. publint and attw check the package as a consumer
// would see it. attw skips `./test`, which only a test runner that resolves like a bundler (vitest) loads.
export default defineConfig({
  entry:      ['src/index.ts', 'src/server.ts', 'src/testing.ts', 'src/component-api.ts', 'src/component/**/*.ts'],
  format:     ['esm'],
  unbundle:   true,
  // The component runs in Convex's isolates and the client runs in browsers, so nothing here may depend on one platform.
  platform:   'neutral',
  target:     'es2022',
  dts:        true,
  sourcemap:  true,
  clean:      true,
  publint:    { level: 'warning' },
  attw:       { profile: 'esm-only', level: 'error', excludeEntrypoints: ['./test'] },
  failOnWarn: 'ci-only',
})
