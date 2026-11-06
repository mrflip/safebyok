import type { AnyVariables, Client, CombinedError, OperationResult } from '@urql/core'
import * as SX from 'safebyok/storage'
import type { BankScope, BoxesFetched, BoxFetched, BoxLanding, BoxQuery, BoxRecord, BoxTombstone, DelOpts, Heard, Landing, PutOptsGiven, RowOfVault, Tidied, VaultQuery, VaultRecord, VaultScope, VaultTombstone, WatchScope } from 'safebyok/storage'

// == [Operations]: VaultOperations

/** The operations a {@link GraphQLVaultDB} sends, by generic call, for a server that allows only the operations it knows. */
export const VaultOperations = {
  listVaults: `query SafebyokListVaults($applabel: String!, $user_id: String!) {
  safebyokListVaults(applabel: $applabel, user_id: $user_id) { vaultlabel vault }
}`,
  getVault: `query SafebyokGetVault($applabel: String!, $user_id: String!, $vaultlabel: String!) {
  safebyokGetVault(applabel: $applabel, user_id: $user_id, vaultlabel: $vaultlabel)
}`,
  listBoxes: `query SafebyokListBoxes($applabel: String!, $user_id: String!, $vaultlabel: String!, $vault_tok: String!) {
  safebyokListBoxes(applabel: $applabel, user_id: $user_id, vaultlabel: $vaultlabel, vault_tok: $vault_tok) { vault boxes { boxlabel box } }
}`,
  getBox: `query SafebyokGetBox($applabel: String!, $user_id: String!, $vaultlabel: String!, $boxlabel: String!, $vault_tok: String!) {
  safebyokGetBox(applabel: $applabel, user_id: $user_id, vaultlabel: $vaultlabel, boxlabel: $boxlabel, vault_tok: $vault_tok) { vault box }
}`,
  putVault: `mutation SafebyokPutVault($record: SafebyokJson!, $opts: SafebyokJson!) {
  safebyokPutVault(record: $record, opts: $opts) { landed ante }
}`,
  putBox: `mutation SafebyokPutBox($record: SafebyokJson!, $opts: SafebyokJson!) {
  safebyokPutBox(record: $record, opts: $opts) { landed ante vault }
}`,
  delVault: `mutation SafebyokDelVault($tombstone: SafebyokJson!, $opts: SafebyokJson!) {
  safebyokDelVault(tombstone: $tombstone, opts: $opts) { landed ante }
}`,
  delBox: `mutation SafebyokDelBox($tombstone: SafebyokJson!, $opts: SafebyokJson!) {
  safebyokDelBox(tombstone: $tombstone, opts: $opts) { landed ante vault }
}`,
  tidyGone: `mutation SafebyokTidyGone($applabel: String!, $user_id: String!) {
  safebyokTidyGone(applabel: $applabel, user_id: $user_id) { totalCount }
}`,
  heard: `subscription SafebyokHeard($applabel: String!, $user_id: String!, $vaultlabel: String) {
  safebyokHeard(applabel: $applabel, user_id: $user_id, vaultlabel: $vaultlabel)
}`,
} as const
// --

// == [Answers]: what the server answers, checked before the base class reads it

// An answer of the wrong shape is a server serving some other schema, or none: the rows inside it
// are left unknown, for the base class to check as it checks every store's.
const answers = SX.Checkers('record_conflict', ({ obj, arr, str, unk, bool, uint }) => {
  const rowsOfVault  = arr(obj({ vaultlabel: str, vault: unk }))
  const boxesFetched = obj({ vault: unk, boxes: arr(obj({ boxlabel: str, box: unk })) })
  const boxFetched   = obj({ vault: unk, box: unk })
  const landing      = obj({ landed: bool, ante: unk })
  const boxLanding   = obj({ landed: bool, ante: unk, vault: unk })
  const tidied       = obj({ totalCount: uint })
  const heard        = obj({ vault: unk, box: unk.optional() })
  return { rowsOfVault, boxesFetched, boxFetched, landing, boxLanding, tidied, heard }
})

/** A refusal as the server's resolvers send one in a GraphQL error's `extensions`. */
const refusalSent = SX.objCheck(({ oneof, arr, str }) => ({
  kind:       oneof(SX.refusalKindVals),
  capacity:   SX.capacity.optional(),
  fieldnames: arr(str).optional(),
}), { refusalkind: 'record_conflict', extras: 'strip' })
// --

// == [The VaultDB]: GraphQLVaultClient, GraphQLVaultDBOpts, GraphQLVaultDB

/** What a {@link GraphQLVaultDB} needs of your app's urql Client. */
export type GraphQLVaultClient = Pick<Client, 'query' | 'mutation' | 'subscription'>

/** What a {@link GraphQLVaultDB} is made with: your app's urql Client, pointed at a server serving `vaultResolvers`. */
export type GraphQLVaultDBOpts = SX.VaultDBOpts & { client: GraphQLVaultClient }

const isGraphQLVaultClient = (candidate: unknown): candidate is GraphQLVaultClient => (
  (typeof candidate === 'object') && (candidate !== null)
  && ('query' in candidate) && (typeof candidate.query === 'function')
  && ('mutation' in candidate) && (typeof candidate.mutation === 'function')
  && ('subscription' in candidate) && (typeof candidate.subscription === 'function')
)

// `custom` hands back the very client given, so its methods keep their `this`.
const graphQLVaultDBOpts = SX.objCheck(({ custom }) => ({
  ...SX.vaultDBOpts.shape,
  client: custom<GraphQLVaultClient>(isGraphQLVaultClient, 'Expected an urql Client, with query, mutation and subscription functions'),
}), 'bad_option')

/** A vaultDB in the browser whose storage is your GraphQL server: `new GraphQLVaultDB({ client })`. */
export class GraphQLVaultDB extends SX.VaultDB {
  // == [Props]: #client

  readonly #client: GraphQLVaultClient
  // --

  // == [Construction]: constructor

  constructor(opts: GraphQLVaultDBOpts) {
    const { client, ...vaultDBOpts } = graphQLVaultDBOpts.parse(opts)
    super(vaultDBOpts)
    this.#client = client
  }
  // --

  // == [Operations]: #asked, #told

  /** The `field` of a query's answer, from the server and never a cache. */
  async #asked(document: string, field: string, variables: AnyVariables): Promise<unknown> {
    return fieldOf(await this.#client.query(document, variables, { requestPolicy: 'network-only' }).toPromise(), field)
  }

  /** The `field` of a mutation's answer. */
  async #told(document: string, field: string, variables: AnyVariables): Promise<unknown> {
    return fieldOf(await this.#client.mutation(document, variables).toPromise(), field)
  }
  // --

  // == [Protected, the generic calls of VaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected async doListVaults(scope: BankScope): Promise<RowOfVault[]> {
    return answers.rowsOfVault.parse(await this.#asked(VaultOperations.listVaults, 'safebyokListVaults', scope))
  }

  protected async doGetVault(scope: VaultScope): Promise<unknown> {
    return await this.#asked(VaultOperations.getVault, 'safebyokGetVault', scope)
  }

  protected async doListBoxes(asked: VaultQuery): Promise<BoxesFetched> {
    return answers.boxesFetched.parse(await this.#asked(VaultOperations.listBoxes, 'safebyokListBoxes', asked))
  }

  protected async doGetBox(asked: BoxQuery): Promise<BoxFetched> {
    return answers.boxFetched.parse(await this.#asked(VaultOperations.getBox, 'safebyokGetBox', asked))
  }

  protected async doPutVault(record: VaultRecord, opts: PutOptsGiven): Promise<Landing> {
    return answers.landing.parse(await this.#told(VaultOperations.putVault, 'safebyokPutVault', { record, opts }))
  }

  protected async doPutBox(record: BoxRecord, opts: PutOptsGiven): Promise<BoxLanding> {
    return answers.boxLanding.parse(await this.#told(VaultOperations.putBox, 'safebyokPutBox', { record, opts }))
  }

  protected async doDelVault(tombstone: VaultTombstone, opts: DelOpts): Promise<Landing> {
    return answers.landing.parse(await this.#told(VaultOperations.delVault, 'safebyokDelVault', { tombstone, opts }))
  }

  protected async doDelBox(tombstone: BoxTombstone, opts: DelOpts): Promise<BoxLanding> {
    return answers.boxLanding.parse(await this.#told(VaultOperations.delBox, 'safebyokDelBox', { tombstone, opts }))
  }

  protected async doTidyGone(scope: BankScope): Promise<Tidied> {
    return answers.tidied.parse(await this.#told(VaultOperations.tidyGone, 'safebyokTidyGone', scope))
  }

  protected override doWatch(scope: WatchScope, hear: (heard: Heard) => void): () => void {
    // A notice is a hint to fetch again, so a subscription's error, or a notice of the wrong shape, is passed over.
    const subscription = this.#client.subscription(VaultOperations.heard, scope).subscribe(({ data }) => {
      const heard = answers.heard.safeParse((data as { safebyokHeard?: unknown } | undefined)?.safebyokHeard)
      if (heard.success) { hear(heard.data) }
    })
    return () => { subscription.unsubscribe() }
  }
  // --
}
// --

// == [Helpers]: fieldOf, refusalOf

/** The `field` of an operation's answer, or the refusal it failed with. */
const fieldOf = (result: OperationResult, field: string): unknown => {
  if (result.error !== undefined) { throw refusalOf(result.error) }
  const data = result.data as Record<string, unknown> | null | undefined
  if ((data === null) || (data === undefined) || ! Object.hasOwn(data, field)) {
    throw new SX.VaultError('record_conflict', 'The GraphQL server answered without what was asked of it: is it serving safebyok-graphql\'s VaultSchemaSdl?')
  }
  return data[field]
}

/** The refusal a failed operation stands for: the one the server's resolvers sent, or else `storage_unavailable`, urql's error its cause. */
const refusalOf = (err: CombinedError): SX.VaultError => {
  for (const { message, extensions } of err.graphQLErrors) {
    const sent = refusalSent.safeParse(extensions)
    if (sent.success) {
      const { kind, capacity, fieldnames } = sent.data
      return new SX.VaultError(kind, message, { meta: { ...(capacity && { capacity }), ...(fieldnames && { fieldnames }) }, cause: err })
    }
  }
  return SX.storageUnavailable(err)
}
// --
