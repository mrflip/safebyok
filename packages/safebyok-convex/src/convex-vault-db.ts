import { getFunctionName } from 'convex/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'
import { Sanitizer, VaultDB, VaultError } from 'safebyok'
import type { VaultPropsExpectation, VaultDBOpts, VaultDelExpectation, Box, BoxExpectation, BoxDelExpectation, StoredBox, VaultProps, VaultScope } from 'safebyok'
import { MaxVaultBoxes } from './component/tallies'
import { isSafebyokErrorData } from './refusals'
import type { SafebyokApi } from './server'

/**
 * The calls every Convex client makes alike: a query once, and a mutation. `ConvexClient` and
 * `ConvexReactClient` both have them.
 */
export type ConvexCalls = {
  query<QueryRef extends FunctionReference<'query'>>(queryRef: QueryRef, args: FunctionArgs<QueryRef>): Promise<FunctionReturnType<QueryRef>>
  mutation<MutationRef extends FunctionReference<'mutation'>>(mutationRef: MutationRef, args: FunctionArgs<MutationRef>): Promise<FunctionReturnType<MutationRef>>
}

/** What {@link convexVaultDB} uses of a `ConvexClient` (from `convex/browser`): its calls, and `onUpdate`. */
export type ConvexWatchingClient = ConvexCalls & {
  onUpdate<QueryRef extends FunctionReference<'query'>>(
    queryRef: QueryRef,
    args: FunctionArgs<QueryRef>,
    callback: (result: FunctionReturnType<QueryRef>) => unknown,
    onError?: (err: Error) => unknown,
  ): () => void
}

/** What {@link convexVaultDB} uses of a `ConvexReactClient` (from `convex/react`): its calls, and `watchQuery`. */
export type ConvexReactWatchingClient = ConvexCalls & {
  watchQuery<QueryRef extends FunctionReference<'query'>>(queryRef: QueryRef, args: FunctionArgs<QueryRef>): {
    onUpdate(callback: () => void): () => void
  }
}

/**
 * The Convex client a vault talks through: a `ConvexClient`, or the `ConvexReactClient` a React
 * app already has, so the vault shares its socket and its signed-in user.
 */
export type ConvexVaultClient = ConvexWatchingClient | ConvexReactWatchingClient

/** What {@link convexVaultDB} is made with. */
export type ConvexVaultDBOpts = VaultDBOpts & {
  /** Your app's Convex client: a `ConvexClient`, or your `ConvexReactClient`. */
  client: ConvexVaultClient
  /**
   * The safebyok functions as your clients reference them: `api.safebyok`, from your
   * `convex/_generated/api`, when you re-export them from `convex/safebyok.ts`.
   */
  api: SafebyokApi
}

/**
 * safebyok's storage over Convex: a VaultDB whose every verb is one call to the safebyok functions
 * your app serves (see `safebyok-convex/server`), through the Convex client your app already has.
 * Hand it to `Vault.make` as its `vaultDB`.
 *
 * * **Who may reach a vault** is your Convex backend's call: a vault call made while signed out,
 *   or for another user's vault, refuses with a VaultError of kind `identity_revoked`, and the
 *   vault locks itself. A sign-out reaches an open vault through its live `watchVault` query, so
 *   it locks even while idle. Close it when your user signs out all the same.
 * * **Other devices' writes** reach this one live: the vault subscribes to the safebyok function
 *   `watchVault`, and refreshes when it changes.
 * * **A full vault**: the component holds every vault to limits of its own, whatever a client
 *   asks, and refuses a write past them with kind `vault_full`. A vault within its
 *   `maxBoxes` stays well inside them.
 * * **Offline**, a call waits for the connection, as every Convex call does, rather than failing.
 *   A failure Convex reports (a deployment missing the safebyok functions, say) refuses with kind
 *   `storage_unavailable`, carrying nothing of Convex's own error, which on a dev deployment may
 *   quote the call's arguments: your deployment's logs have it, or, for trouble before the call
 *   left, the browser console, where the Convex client reports its connection.
 *
 * @param opts - Your app's Convex `client`, the safebyok functions as its `api`, and optionally a
 *   `logger`, the default logger without one (a vault opened with no logger of its own hears it too): it hears a ConvexClient watch that fails.
 * @returns The VaultDB, holding at most 1 MiB in one record, Convex's document limit, and 8 MiB
 *   in one vault, half of what one Convex function may read (deleting a vault reads it twice), in
 *   at most 8,000 boxes, the component's own limit.
 *
 * @example
 *   import { api } from '../convex/_generated/api'
 *   const vaultDB = convexVaultDB({ client: convex, api: api.safebyok })
 *   const vault = Vault.make({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, ...browserOpts() })
 */
export const convexVaultDB = (opts: ConvexVaultDBOpts): VaultDB => {
  const { client, api } = (opts as Partial<ConvexVaultDBOpts> | null | undefined) ?? {}
  if (! isConvexClient(client)) {
    throw new VaultError('bad_option', 'convexVaultDB needs a Convex client: a ConvexClient from convex/browser, or the ConvexReactClient your app already has.')
  }
  if (! isSafebyokApi(api)) {
    throw new VaultError('bad_option', 'convexVaultDB needs the safebyok functions your app serves, as `api.safebyok` from your convex/_generated/api: the module, not the whole `api`.')
  }
  return new ConvexVaultDB({ ...opts, client, api })
}

/** Each verb one call to the function of the same purpose; the base class validates both ways. */
class ConvexVaultDB extends VaultDB {
  readonly maxRecordBytes = ConvexDocumentBytes
  // Listing, watching and deleting each read the whole vault in one transaction, and deleting reads
  // every row twice: half the read budget is what a vault can hold and still be deleted whole.
  readonly maxVaultBytes = ConvexTransactionReadBytes / 2
  // The component's own limit, which it enforces whatever a client asks.
  readonly maxBoxes = MaxVaultBoxes
  // Each name is a field of its own, any text Convex holds: the floor's 1 KiB bounds them.
  readonly maxNameBytes = Infinity

  private readonly client: ConvexVaultClient
  private readonly api:    SafebyokApi

  constructor(opts: ConvexVaultDBOpts) {
    super(opts)
    this.client = opts.client
    this.api    = opts.api
  }

  protected doGetVaultProps(scope: VaultScope): Promise<unknown> {
    return refusing(() => this.client.query(this.api.getVaultProps, { scope }))
  }

  protected doEnsureVaultProps(vaultProps: VaultProps): Promise<unknown> {
    return refusing(() => this.client.mutation(this.api.ensureVaultProps, { vaultProps }))
  }

  protected doPutVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<boolean> {
    return refusing(() => this.client.mutation(this.api.putVaultProps, { vaultProps, expected }))
  }

  protected doGetBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    return refusing(() => this.client.query(this.api.getBox, { scope, boxlabel }))
  }

  // Each row is stored under its own boxlabel column, so that is the boxlabel it is listed under.
  protected async doListBoxes(scope: VaultScope): Promise<StoredBox[]> {
    const rows = await refusing(() => this.client.query(this.api.listBoxSummaries, { scope }))
    return rows.map((row) => ({ boxlabel: row.boxlabel, box: row }))
  }

  protected doPutBox(scope: VaultScope, box: Box, expected: BoxExpectation): Promise<unknown> {
    return refusing(() => this.client.mutation(this.api.putBox, { scope, box, expected }))
  }

  protected doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown> {
    return refusing(() => this.client.mutation(this.api.delBox, { scope, boxlabel, expected }))
  }

  protected doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<boolean> {
    return refusing(() => this.client.mutation(this.api.delVault, { scope, expected }))
  }

  // Every result `watchVault` delivers calls `onChange`, the first included. The vault subscribes
  // before its first read, so the first result may already hold a write that read missed; and a
  // ConvexReactClient already watching this vault delivers no first result at all, only changes.
  // A refresh that finds nothing new costs two queries and no render.
  //
  // Convex counts a query's watchers, and each of its unsubscribes counts down again however often
  // it is called: a second call would end another watch of the vault (the app's own, or another
  // vault handle's) on the same client. The base class's subscribe calls an unsubscribe once.
  protected override doSubscribe(scope: VaultScope, onChange: () => void): () => void {
    const args = { scope }
    if ('watchQuery' in this.client) {
      return this.client.watchQuery(this.api.watchVault, args).onUpdate(() => { onChange() })
    }
    // A failing watch has nobody to throw to: without this handler, ConvexClient throws it from
    // inside its socket. It is logged, once for a failing streak, and calls onChange, as a
    // ConvexReactClient's watch does, so the vault looks again and meets the trouble itself: a
    // sign-out locks it.
    const trouble = this.watchTrouble("This vault's live Convex watch failed, so other devices' changes may not show until the vault next reads. The vault reads again now, and meets the trouble itself.")
    const heard = () => { trouble.delivered(); onChange() }
    const failed = (err: Error) => { trouble.failed(err); onChange() }
    return this.client.onUpdate(this.api.watchVault, args, heard, failed)
  }
}

/** Convex's most for one document, in bytes. */
const ConvexDocumentBytes = 1_048_576

/** Convex's most for one function to read, in bytes: 16 MiB. */
const ConvexTransactionReadBytes = 16_777_216

const ConvexTroubleMessage = "The vault's storage could not be reached, or failed partway: try again shortly. Convex's own error is not carried here, as it may quote the call: see your Convex deployment's logs, or, for trouble before the call left, the browser console, where the Convex client reports its connection."

/**
 * `call`, with a refusal from safebyok's functions -- a `ConvexError` carrying one of its kinds --
 * turned into the VaultError of that kind, and anything else into `storage_unavailable`, carrying
 * nothing of Convex's error. A thunk, since a client may throw before it hands back a promise:
 * `ConvexReactClient.query` throws at once a refusal it already holds for that query.
 */
const refusing = async <ValT>(call: () => Promise<ValT>): Promise<ValT> => {
  try {
    return await call()
  } catch (err) {
    if (err instanceof ConvexError && isSafebyokErrorData(err.data)) {
      // Rebuilt by the sanitizer too: one rule, and nothing of Convex's error rides along.
      throw Sanitizer.refusalFor(err, err.data.kind, err.data.message)
    }
    // On a dev deployment, Convex's own error -- its validator refusing the arguments, say --
    // quotes the call's arguments: scope, names, sidecars and ciphertext. The sanitizer drops it.
    throw Sanitizer.refusalFor(err, 'storage_unavailable', ConvexTroubleMessage)
  }
}

const isConvexClient = (client: unknown): client is ConvexVaultClient => {
  if (typeof client !== 'object' || client === null) { return false }
  const methods = client as Partial<Record<'query' | 'mutation' | 'onUpdate' | 'watchQuery', unknown>>
  return typeof methods.query === 'function' && typeof methods.mutation === 'function'
    && (typeof methods.onUpdate === 'function' || typeof methods.watchQuery === 'function')
}

const SafebyokFnNames = [
  'getVaultProps', 'ensureVaultProps', 'putVaultProps', 'getBox', 'listBoxSummaries', 'putBox', 'delBox', 'delVault', 'watchVault',
] as const

// Each function must name itself as `<module>:<function>`. The whole generated `api` answers any
// property, so `api.getVaultProps` exists -- but names no module, and Convex refuses to name it.
const isSafebyokApi = (api: unknown): api is SafebyokApi => {
  if (typeof api !== 'object' || api === null) { return false }
  const fnRefs = api as Partial<Record<string, FunctionReference<'query' | 'mutation'>>>
  return SafebyokFnNames.every((fnName) => {
    const fnRef = fnRefs[fnName]
    if (fnRef === undefined) { return false }
    try {
      return getFunctionName(fnRef).endsWith(`:${fnName}`)
    } catch {
      return false
    }
  })
}
