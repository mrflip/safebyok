import type { ApiFromModules, FunctionReference } from 'convex/server'
import type * as Vaults from './component/vaults'

/** The safebyok component's functions as a host references them, the type of its `components.safebyok`. */
export type ComponentApi<ComponentPath extends string | undefined = string | undefined> =
  ForComponent<ApiFromModules<{ vaults: typeof Vaults }>, ComponentPath>

/** Each function reference re-addressed as a component's, visible to its host only. */
type ForComponent<Api, ComponentPath extends string | undefined> =
  Api extends FunctionReference<infer Fnkind, infer _Visibility, infer ArgsT, infer ReturnT>
    ? FunctionReference<Fnkind, 'internal', ArgsT, ReturnT, ComponentPath>
    : { [Ckey in keyof Api]: ForComponent<Api[Ckey], ComponentPath> }
