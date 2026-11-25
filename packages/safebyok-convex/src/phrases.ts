/** The messages and advice of safebyok-convex's own checks. */

// Gathered here so their wording can be reviewed in one place.

// == [Options]: ClientExpected, ApiExpected, ComponentExpected, ConvexVaultDBAdvice, SafebyokVaultComponentAdvice, SafebyokVaultApiAdvice

/** Message for a `client` option that is not a Convex client. */
export const ClientExpected = 'Expected a Convex client: query and mutation, and onUpdate or watchQuery'

/** Message for an `api` option that is not the module of safebyok functions. */
export const ApiExpected = 'Expected the module of safebyok functions, each under its own name'

/** Message for a value that is not an installed component. */
export const ComponentExpected = 'Expected an installed component'

/** Advice for a host whose `ConvexVaultDB` options were refused. */
export const ConvexVaultDBAdvice = "Hand it your app's Convex client (a ConvexClient, or your ConvexReactClient) and `api.safebyokVault` from your convex/_generated/api: the module, not the whole `api`."

/** Advice for a host whose component was refused by `SafebyokVaultComponent`. */
export const SafebyokVaultComponentAdvice = 'Hand it components.safebyok from your generated api: install it with app.use(safebyok) in convex.config.ts, then run Convex codegen.'

/** Advice for a host whose `SafebyokVaultComponent.api` options were refused. */
export const SafebyokVaultApiAdvice = 'Hand it { getUserId }, a function answering who is signed in: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null.'
// --

// == [Answers]: SidecarKeyRefused, StoredOutOfStep

/** Message for a box whose sidecar holds a key Convex refuses to store. */
export const SidecarKeyRefused = "A key in this box's sidecar is one Convex will not store: it starts with `$`, holds a character outside printable ASCII, or runs past 1024 characters. Rename the key, or keep such keys inside a string of your own. This refusal's cause names the key."

/** Message for a component and a client that disagree on whether a write was stored. */
export const StoredOutOfStep = 'The component stored the record where this copy of safebyok found no write, or stored nothing where it found one.'
// --
