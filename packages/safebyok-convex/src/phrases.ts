/** Every sentence safebyok-convex's own checks say, so their wording is reviewed in one place. */

// == [Options]: ClientExpected, ApiExpected, ComponentExpected, ConvexVaultDBAdvice, SafebyokComponentAdvice, SafebyokApiAdvice

/** A client that is not a Convex client. */
export const ClientExpected = 'Expected a Convex client: query and mutation, and onUpdate or watchQuery'

/** An api that is not the safebyok functions' module. */
export const ApiExpected = 'Expected the module of safebyok functions, each under its own name'

/** A component that is not one. */
export const ComponentExpected = 'Expected an installed component'

/** What a host does about options `ConvexVaultDB` refused. */
export const ConvexVaultDBAdvice = "Hand it your app's Convex client (a ConvexClient, or your ConvexReactClient) and `api.safebyok` from your convex/_generated/api: the module, not the whole `api`."

/** What a host does about a component `SafebyokComponent` refused. */
export const SafebyokComponentAdvice = 'Hand it components.safebyok from your generated api: install it with app.use(safebyok) in convex.config.ts, then run Convex codegen.'

/** What a host does about options `SafebyokComponent.api` refused. */
export const SafebyokApiAdvice = 'Hand it { getUserId }, a function answering who is signed in: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null.'
// --
