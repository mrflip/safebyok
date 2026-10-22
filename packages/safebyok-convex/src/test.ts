/// <reference types="vite/client" />
import type { TestConvexRoot } from 'convex-test'
import { componentsGeneric } from 'convex/server'
import type { GenericDataModel } from 'convex/server'
import type { ComponentApi } from './component-api'
import schema from './component/schema'

/** The component's function modules, as `convex-test` loads them (under Vite, as vitest runs). */
export const modules = import.meta.glob('./component/**/*.ts')

export { default as schema } from './component/schema'

/** Install the safebyok component into a `convex-test` instance, to test the host's own functions against it in memory.
 *
 * @param testRoot - The test instance, from `convexTest(...)` or `defineTestApp(...).createTest()`.
 * @param componentPath - The name the host passed `app.use`, if not `safebyok`.
 * @returns The component's functions as the host references them, `components.safebyok`.
 *
 * @example
 *   const CVX = convexTest(schema, modules)
 *   register(CVX)
 *   await CVX.withIdentity({ subject: 'u1' }).query(api.safebyok.getVault, { scope })
 *
 * @example
 *   const app = defineTestApp({ schema, components: { safebyok: { register } } })
 *   new SafebyokComponent(app.components.safebyok).api({ getUserId })
 */
export const register = <ComponentPath extends string = 'safebyok'>(
  testRoot: Pick<TestConvexRoot<GenericDataModel>, 'registerComponent'>,
  componentPath: ComponentPath = 'safebyok' as ComponentPath,
): ComponentApi<ComponentPath> => {
  testRoot.registerComponent(componentPath, schema, modules)
  // What the host's generated `components` is at runtime; its type comes from the functions.
  return (componentsGeneric() as Record<string, unknown>)[componentPath] as ComponentApi<ComponentPath>
}
