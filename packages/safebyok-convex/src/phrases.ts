/** The messages of safebyok-convex's own checks, gathered so their wording can be reviewed in one place. */

// == [Options]: ClientExpected, ApiExpected, ComponentExpected, ConvexBankDBAdvice, SafebyokBankComponentAdvice, SafebyokBankApiAdvice

/** Message for a `client` option that is not a Convex client. */
export const ClientExpected = 'Expected a Convex client: query and mutation, and onUpdate or watchQuery'

/** Message for an `api` option that is not the module of safebyok functions. */
export const ApiExpected = 'Expected the module of safebyok functions, each under its own name'

/** Message for a value that is not an installed component. */
export const ComponentExpected = 'Expected an installed component'

/** Advice for a host whose `ConvexBankDB` options were refused. */
export const ConvexBankDBAdvice = "Hand it your app's Convex client (a ConvexClient, or your ConvexReactClient) and `api.safebyokBank` from your convex/_generated/api: the module, not the whole `api`."

/** Advice for a host whose component was refused by `SafebyokBankComponent`. */
export const SafebyokBankComponentAdvice = 'Hand it components.safebyok from your generated api: install it with app.use(safebyok) in convex.config.ts, then run Convex codegen.'

/** Advice for a host whose `SafebyokBankComponent.api` options were refused. */
export const SafebyokBankApiAdvice = 'Hand it { getUserId }, a function answering who is signed in: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null.'
// --

// == [Answers]: StoredOutOfStep

/** Message for a write whose component stored the record where the classifier here found no write, or stored nothing where it found one. */
export const StoredOutOfStep = 'The component stored the record where this copy of safebyok found no write, or stored nothing where it found one.'
// --
