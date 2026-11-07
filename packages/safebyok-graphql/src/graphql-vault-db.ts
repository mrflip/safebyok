import type { AnyVariables, Client, OperationResult } from '@urql/core'
import type * as Z from 'zod'
import * as DB from 'safebyok/storage'
import type {
  AddPasskeyParams, Answer, BankListed, BankScope, BoxesListed, BoxQuery, BoxRecord, BoxRow, BoxTombstone, DelAct, DelOpts, GoodAnswer, GotAct,
  IfAbsentOpts, ListAct, Notice, PutAct, PutOpts, PutVaultOpts, ReplacePassphraseParams, ReqParams, RevokePasskeyParams, VaultDBVerbs, VaultQuery,
  VaultRecord, VaultRow, VaultScope, VaultTombstone, WatchScope,
} from 'safebyok/storage'
import { VaultOperations } from './vault-operations'

// == [Options]: GraphQLVaultClient, GraphQLVaultDBOpts, graphQLVaultDBOpts

/** What a {@link GraphQLVaultDB} needs of your app's urql Client. */
export type GraphQLVaultClient = Pick<Client, 'query' | 'mutation' | 'subscription'>

/** What a {@link GraphQLVaultDB} is made with. */
export interface GraphQLVaultDBOpts {
  /** Your app's urql Client, pointed at a server serving `vaultResolvers`. */
  client: GraphQLVaultClient
  /** Taken as a VaultDB takes it, and never enforced here: the server's store holds a record's limit. */
  maxRecordBytes?: number | undefined
}

const isGraphQLVaultClient = (candidate: unknown): candidate is GraphQLVaultClient => (
  (typeof candidate === 'object') && (candidate !== null)
  && ('query' in candidate) && (typeof candidate.query === 'function')
  && ('mutation' in candidate) && (typeof candidate.mutation === 'function')
  && ('subscription' in candidate) && (typeof candidate.subscription === 'function')
)

// `custom` hands back the very client given, so its methods keep their `this`.
const graphQLVaultDBOpts = DB.objCheck(({ custom }) => ({
  client: custom<GraphQLVaultClient>(isGraphQLVaultClient, 'Expected an urql Client, with query, mutation and subscription functions'),
  ...DB.vaultDBOpts.shape,
}), 'bad_option')

true satisfies Z.core.util.AssertEqual<GraphQLVaultDBOpts, Z.input<typeof graphQLVaultDBOpts>>
// --

// == [The VaultDB]: GraphQLVaultDB

/** A vaultDB in the browser whose storage is your GraphQL server: `new GraphQLVaultDB({ client })`. */
export class GraphQLVaultDB implements VaultDBVerbs {
  // == [Props]: #client, IsVaultDB

  readonly #client: GraphQLVaultClient

  // A getter on the class, never an own field, so the brand neither serializes nor rides along in a spread.
  /** True: the brand a model knows a vaultDB by, from whichever copy of safebyok. */
  get [DB.IsVaultDB](): true { return true }
  // --

  // == [Construction]: constructor

  constructor(opts: GraphQLVaultDBOpts) {
    const { client } = graphQLVaultDBOpts.parse(opts)
    this.#client = client
  }
  // --

  // == [Gets]: listVaults, tryListVaults, getVault, tryGetVault, listBoxes, tryListBoxes, getBox, tryGetBox

  /** The bank's vaults, live or deleted, with the rows past reading in `damaged_rows`. */
  async listVaults(scope: BankScope): Promise<GoodAnswer<BankListed, ListAct, BankScope>> { return goodAnswerOf(await this.tryListVaults(scope)) }

  async tryListVaults(scope: BankScope): Promise<Answer<BankListed, ListAct, BankScope>> {
    return await answerOf('listVaults', DB.reqParamsOf(scope), async () => {
      const answer = await this.#asked(VaultOperations.listVaults, 'safebyokListVaults', DB.bankScope.parse(scope))
      return DB.listVaultsAnswer.parse(listedAnswerOf(answer))
    })
  }

  /** The vault by scope alone, whatever its life. */
  async getVault(scope: VaultScope, opts?: IfAbsentOpts): Promise<GoodAnswer<VaultRecord | null, GotAct>> { return goodAnswerOf(await this.tryGetVault(scope, opts)) }

  async tryGetVault(scope: VaultScope, opts: IfAbsentOpts = {}): Promise<Answer<VaultRecord | null, GotAct>> {
    return await answerOf('getVault', DB.reqParamsOf(scope), async () => {
      const answer = await this.#asked(VaultOperations.getVault, 'safebyokGetVault', { ...DB.vaultScope.parse(scope), opts: DB.ifAbsentOpts.parse(opts) })
      return DB.getVaultAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** The boxes under this `vault_tok`, sparse, with the rows past reading in `damaged_rows`. */
  async listBoxes(asked: VaultQuery): Promise<GoodAnswer<BoxesListed, ListAct>> { return goodAnswerOf(await this.tryListBoxes(asked)) }

  async tryListBoxes(asked: VaultQuery): Promise<Answer<BoxesListed, ListAct>> {
    return await answerOf('listBoxes', DB.reqParamsOf(asked), async () => {
      const answer = await this.#asked(VaultOperations.listBoxes, 'safebyokListBoxes', DB.vaultQuery.parse(asked))
      return DB.listBoxesAnswer.parse(listedAnswerOf(answer))
    })
  }

  /** The box under this `vault_tok`, its vault row as `world`. */
  async getBox(asked: BoxQuery, opts?: IfAbsentOpts): Promise<GoodAnswer<BoxRecord | null, GotAct>> { return goodAnswerOf(await this.tryGetBox(asked, opts)) }

  async tryGetBox(asked: BoxQuery, opts: IfAbsentOpts = {}): Promise<Answer<BoxRecord | null, GotAct>> {
    return await answerOf('getBox', DB.reqParamsOf(asked), async () => {
      const answer = await this.#asked(VaultOperations.getBox, 'safebyokGetBox', { ...DB.boxQuery.parse(asked), opts: DB.ifAbsentOpts.parse(opts) })
      return DB.getBoxAnswer.parse(rowAnswerOf(answer))
    })
  }
  // --

  // == [Puts]: putVault, tryPutVault, putBox, tryPutBox

  /** Stores a vault's birth, or its rebirth over a tombstone. */
  async putVault(record: VaultRecord, opts: PutVaultOpts): Promise<GoodAnswer<VaultRow, PutAct>> { return goodAnswerOf(await this.tryPutVault(record, opts)) }

  async tryPutVault(record: VaultRecord, opts: PutVaultOpts): Promise<Answer<VaultRow, PutAct>> {
    return await answerOf('putVault', DB.reqParamsOf({ ...record, ...opts }), async () => {
      const answer = await this.#told(VaultOperations.putVault, 'safebyokPutVault', { record: DB.vaultRecord.parse(record), opts: DB.putVaultOpts.parse(opts) })
      return DB.putVaultAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Stores a box under a vault live at its `vault_tok`, as `opts` allow. */
  async putBox(record: BoxRecord, opts: PutOpts): Promise<GoodAnswer<BoxRow, PutAct>> { return goodAnswerOf(await this.tryPutBox(record, opts)) }

  async tryPutBox(record: BoxRecord, opts: PutOpts): Promise<Answer<BoxRow, PutAct>> {
    return await answerOf('putBox', DB.reqParamsOf({ ...record, ...opts }), async () => {
      const answer = await this.#told(VaultOperations.putBox, 'safebyokPutBox', { record: DB.boxRecord.parse(record), opts: DB.putOpts.parse(opts) })
      return DB.putBoxAnswer.parse(rowAnswerOf(answer))
    })
  }
  // --

  // == [Gate verbs]: replacePassphrase, tryReplacePassphrase, addPasskey, tryAddPasskey, revokePasskey, tryRevokePasskey

  /** Lays the new passphrase wayin on the vault row at this revision, leaving its passkey wayin as stored. */
  async replacePassphrase(params: ReplacePassphraseParams): Promise<GoodAnswer<VaultRecord, 'replaced'>> { return goodAnswerOf(await this.tryReplacePassphrase(params)) }

  async tryReplacePassphrase(params: ReplacePassphraseParams): Promise<Answer<VaultRecord, 'replaced'>> {
    return await answerOf('replacePassphrase', DB.reqParamsOf(params), async () => {
      const answer = await this.#told(VaultOperations.replacePassphrase, 'safebyokReplacePassphrase', { params: DB.replacePassphraseParams.parse(params) })
      return DB.replacePassphraseAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Lays a passkey wayin on a vault row holding none. */
  async addPasskey(params: AddPasskeyParams): Promise<GoodAnswer<VaultRecord, 'added'>> { return goodAnswerOf(await this.tryAddPasskey(params)) }

  async tryAddPasskey(params: AddPasskeyParams): Promise<Answer<VaultRecord, 'added'>> {
    return await answerOf('addPasskey', DB.reqParamsOf(params), async () => {
      const answer = await this.#told(VaultOperations.addPasskey, 'safebyokAddPasskey', { params: DB.passkeyAddParams.parse(params) })
      return DB.addPasskeyAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Takes the passkey wayin off the vault row. */
  async revokePasskey(params: RevokePasskeyParams): Promise<GoodAnswer<VaultRecord, 'revoked'>> { return goodAnswerOf(await this.tryRevokePasskey(params)) }

  async tryRevokePasskey(params: RevokePasskeyParams): Promise<Answer<VaultRecord, 'revoked'>> {
    return await answerOf('revokePasskey', DB.reqParamsOf(params), async () => {
      const answer = await this.#told(VaultOperations.revokePasskey, 'safebyokRevokePasskey', { params: DB.revokePasskeyParams.parse(params) })
      return DB.revokePasskeyAnswer.parse(rowAnswerOf(answer))
    })
  }
  // --

  // == [Dels]: delBox, tryDelBox, delVault, tryDelVault

  /** Deletes a box at `prior`: its live row, or the damaged row `damaged_rows` lists. */
  async delBox(tombstone: BoxTombstone, opts: DelOpts): Promise<GoodAnswer<BoxTombstone, DelAct>> { return goodAnswerOf(await this.tryDelBox(tombstone, opts)) }

  async tryDelBox(tombstone: BoxTombstone, opts: DelOpts): Promise<Answer<BoxTombstone, DelAct>> {
    return await answerOf('delBox', DB.reqParamsOf({ ...tombstone, ...opts }), async () => {
      const answer = await this.#told(VaultOperations.delBox, 'safebyokDelBox', { tombstone: DB.boxTombstone.parse(tombstone), opts: DB.delOpts.parse(opts) })
      return DB.delBoxAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Deletes a vault at `prior`, its live row or the damaged row `damaged_rows` lists, with the boxes of its life. */
  async delVault(tombstone: VaultTombstone, opts: DelOpts): Promise<GoodAnswer<VaultTombstone, DelAct>> { return goodAnswerOf(await this.tryDelVault(tombstone, opts)) }

  async tryDelVault(tombstone: VaultTombstone, opts: DelOpts): Promise<Answer<VaultTombstone, DelAct>> {
    return await answerOf('delVault', DB.reqParamsOf({ ...tombstone, ...opts }), async () => {
      const answer = await this.#told(VaultOperations.delVault, 'safebyokDelVault', { tombstone: DB.vaultTombstone.parse(tombstone), opts: DB.delOpts.parse(opts) })
      return DB.delVaultAnswer.parse(rowAnswerOf(answer))
    })
  }
  // --

  // == [Watch]: watch

  /** Tells `onNotice` of rows that change under a bank or a vault, and returns how to stop. */
  watch(scope: WatchScope, onNotice: (notice: Notice) => void): () => void {
    const { applabel, user_id, vaultlabel = null } = DB.watchScope.parse(scope)
    const variables = { applabel, user_id, vaultlabel }
    let isWatching = true
    let subscription = { unsubscribe: noop }
    let cancelPause = noop
    const subscribe = (): void => {
      let isRevoked = false
      let heardData: unknown
      subscription = this.#client.subscription(VaultOperations.watch, variables).subscribe((result) => {
        // The closing result of a stream over fetch repeats the data of the notice before it.
        if (result.data !== heardData) { isRevoked ||= heedNotice(result, onNotice) }
        heardData = result.data
        if (isWatching && ! isRevoked && ! result.hasNext) { cancelPause = afterAPause(subscribe) }
      })
    }
    subscribe()
    return () => {
      isWatching = false
      cancelPause()
      subscription.unsubscribe()
    }
  }
  // --

  // == [Operations]: #asked, #told

  /** The `fieldname` of a query's answer, from the server and never a cache. */
  async #asked(document: string, fieldname: string, variables: AnyVariables): Promise<unknown> {
    return fieldOf(await this.#client.query(document, variables, { requestPolicy: 'network-only' }).toPromise(), fieldname)
  }

  /** The `fieldname` of a mutation's answer. */
  async #told(document: string, fieldname: string, variables: AnyVariables): Promise<unknown> {
    return fieldOf(await this.#client.mutation(document, variables).toPromise(), fieldname)
  }
  // --
}
// --

// == [Answers]: answerOf, goodAnswerOf, fieldOf, heedNotice

/** What `ask` answers, or a bad answer holding the refusal it threw. */
const answerOf = async <ValT, ActT extends string, WorldT>(call: string, req_params: ReqParams, ask: () => Promise<Answer<ValT, ActT, WorldT>>): Promise<Answer<ValT, ActT, WorldT>> => {
  const outcome = await DB.outcomeOf(ask)
  if (outcome.ok) { return outcome.val }
  const err = Object.assign(outcome.err, { meta: { ...outcome.err.meta, call, req_params } })
  return { ok: false, err, act: err.refusalkind, world: null, req_params }
}

/** `answer` where it is good, else its refusal thrown. */
const goodAnswerOf = <ValT, ActT extends string, WorldT>(answer: Answer<ValT, ActT, WorldT>): GoodAnswer<ValT, ActT, WorldT> => {
  if (! answer.ok) { throw answer.err }
  return answer
}

/** The `fieldname` of an operation's answer, or the refusal a failed operation stands for. */
const fieldOf = ({ error: err, data }: OperationResult<unknown>, fieldname: string): unknown => {
  if (err?.networkError !== undefined) { throw DB.storageUnavailable(err) }
  // A GraphQL error is a client and server out of step, which no retry mends: never a condition of storage. It is
  // refused with no cause, so that no GraphQL error's server text crosses: a variable-coercion error can quote the
  // variable sent, which is the record.
  if ((err !== undefined) || (typeof data !== 'object') || (data === null) || ! Object.hasOwn(data, fieldname)) {
    throw new DB.VaultError('unexpected_error', DB.SchemaNotServed)
  }
  return (data as Record<string, unknown>)[fieldname]
}

/** Hands `onNotice` the notice `result` carries, answering true for the notice that ends the watch for good. */
const heedNotice = ({ error: err, data }: OperationResult<unknown>, onNotice: (notice: Notice) => void): boolean => {
  // A notice is a hint to fetch again, so a failed one, or one of the wrong shape, is passed over.
  if ((err !== undefined) || (typeof data !== 'object') || (data === null)) { return false }
  const crossed = DB.crossedNotice.safeParse(rowAnswerOf((data as Record<string, unknown>)['safebyokWatch']))
  if (! crossed.success) { return false }
  if (crossed.data.ok) {
    onNotice(crossed.data.val)
    return false
  }
  return DB.isVaultError(crossed.data.err, 'identity_revoked')
}
// --

// == [Resubscribing]: ResubscribeMillis, afterAPause, noop

// A pause, so a server that ends each stream at once is not asked again in a tight loop.
const ResubscribeMillis = 1000

/** Calls `resubscribe` after a pause, and returns how to cancel it. */
const afterAPause = (resubscribe: () => void): () => void => {
  const timer = setTimeout(resubscribe, ResubscribeMillis)
  return () => { clearTimeout(timer) }
}

const noop = (): void => undefined
// --

// == [Typenames]: Drop, dropTypename, wayinOf, gateOf, rowOf, rowsOf, listedOf, answerDrop, rowAnswerOf, listedAnswerOf

// An exchange such as urql's cacheExchange adds `__typename` to each selection a document makes. It is dropped
// selection by selection, never by a deep strip: a sidecar, a meta or a damaged row may hold a `__typename` of its own.

/** How one selection drops its `__typename`. */
type Drop = (val: unknown) => unknown

/** `bag` without `__typename`, in itself and in each field `nested` names. */
const dropTypename = (bag: unknown, nested: Record<string, Drop> = {}): unknown => {
  if ((typeof bag !== 'object') || (bag === null) || Array.isArray(bag)) { return bag }
  const { __typename: _typename, ...fields } = bag as Record<string, unknown>
  for (const [fieldname, drop] of Object.entries(nested)) {
    if (Object.hasOwn(fields, fieldname)) { fields[fieldname] = drop(fields[fieldname]) }
  }
  return fields
}

const wayinOf: Drop = (val) => dropTypename(val, { vault_key_wayin_wrapped: dropTypename })
const gateOf: Drop = (val) => dropTypename(val, { passphrase_wayin: wayinOf, passkey_wayin: wayinOf })

/** A vault or box row's selection: a vault's gate, a box's ciphered fields. */
const rowOf: Drop = (val) => dropTypename(val, { gate: gateOf, box_key_wrapped: dropTypename, whisper_ciphered: dropTypename })

/** A list of rows' selections. */
const rowsOf: Drop = (val) => (Array.isArray(val) ? val.map((row) => rowOf(row)) : val)

/** A listing's selection: its rows, never its `damaged_rows`. */
const listedOf: Drop = (val) => dropTypename(val, { vaults: rowsOf, boxes: rowsOf })

const reqParamsOf: Drop = (val) => dropTypename(val, { prior: dropTypename })

/** An answer's or a notice's selection, its `val` through `valDrop`. */
const answerDrop = (valDrop: Drop): Drop => (val) => dropTypename(val, { val: valDrop, world: rowOf, dbhas: rowOf, req_params: reqParamsOf, err: dropTypename })

const rowAnswerOf = answerDrop(rowOf)
const listedAnswerOf = answerDrop(listedOf)
// --
