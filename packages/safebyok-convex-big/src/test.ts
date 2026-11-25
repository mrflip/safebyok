/// <reference types="vite/client" />
import type { TestConvexRoot } from 'convex-test'
import { componentsGeneric } from 'convex/server'
import type { GenericDataModel } from 'convex/server'
import type { ComponentApi } from './component-api'
import schema from './component/schema'

/** The component's function modules, for `convex-test` to load. */
export const modules = import.meta.glob('./component/**/*.ts')

/** The component's schema, for `convex-test`. */
export { default as schema } from './component/schema'

/** Install the safebyok component in a `convex-test` instance, and return its `components.safebyok` reference.
 *
 * @example
 *   const app = defineTestApp({ schema, components: { safebyok: { register } } })
 *   new SafebyokBankComponent(app.components.safebyok).api({ getUserId })
 */
export const register = <ComponentPath extends string = 'safebyok'>(
  testRoot: Pick<TestConvexRoot<GenericDataModel>, 'registerComponent'>,
  componentPath: ComponentPath = 'safebyok' as ComponentPath,
): ComponentApi<ComponentPath> => {
  testRoot.registerComponent(componentPath, schema, modules)
  // This is what the host's generated `components` object is at runtime. Its type is derived from the component's functions.
  return (componentsGeneric() as Record<string, unknown>)[componentPath] as ComponentApi<ComponentPath>
}
