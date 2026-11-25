import type { ApiFromModules, FunctionReference } from 'convex/server'
import type * as Things from './component/things'

/** The safebyok component's functions as a host references them: the type of `components.safebyok`. */
export type ComponentApi<Componentpath extends string | undefined = string | undefined> =
  ForComponent<ApiFromModules<{ things: typeof Things }>, Componentpath>

/** Retype every function reference in `Api` as a component's: internal, and addressed under `Componentpath`. */
type ForComponent<Api, Componentpath extends string | undefined> =
  Api extends FunctionReference<infer Fnkind, infer _Visibility, infer ArgsT, infer ReturnT>
    ? FunctionReference<Fnkind, 'internal', ArgsT, ReturnT, Componentpath>
    : { [Ckey in keyof Api]: ForComponent<Api[Ckey], Componentpath> }
