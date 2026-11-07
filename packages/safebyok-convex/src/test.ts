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

/** Install the safebyok component in a `convex-test` instance, answering it as `components.safebyok`.
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
