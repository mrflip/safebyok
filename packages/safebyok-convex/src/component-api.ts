import type { ApiFromModules, FunctionReference } from 'convex/server'
import type * as Vaults from './component/vaults'

/** The safebyok component's functions as its host app references them: the type of `components.safebyok`.
 * It is what `SafebyokComponent` takes.
 *
 * @example
 *   import { components } from './_generated/api'
 *   const vaults: ComponentApi = components.safebyok
 */
export type ComponentApi<ComponentPath extends string | undefined = string | undefined> =
  ForComponent<ApiFromModules<{ vaults: typeof Vaults }>, ComponentPath>

/** Each function reference re-addressed as a component's: visible to its host only. */
type ForComponent<Api, ComponentPath extends string | undefined> =
  Api extends FunctionReference<infer FnKind, infer _Visibility, infer ArgsT, infer ReturnT>
    ? FunctionReference<FnKind, 'internal', ArgsT, ReturnT, ComponentPath>
    : { [Ckey in keyof Api]: ForComponent<Api[Ckey], ComponentPath> }
