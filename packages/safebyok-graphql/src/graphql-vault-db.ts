import type { AnyVariables, Client, CombinedError, OperationResult } from '@urql/core'
import type * as Z from 'zod'
import * as DB from 'safebyok/storage'
import type {
  Answer, BankListed, BankScope, BoxesListed, BoxQuery, BoxRecord, BoxRow, BoxTombstone, DelAct, DelOpts, GateVerbOpts, GoodAnswer, GotAct,
  IfAbsentOpts, ListAct, Notice, PutAct, PutOpts, PutVaultOpts, ReqParams, VaultDB, VaultQuery,
  Tidied, VaultRecord, VaultRow, VaultScope, VaultTombstone, WatchScope,
} from 'safebyok/storage'
import { VaultOperations } from './vault-operations'

// == [Options]: GraphQLVaultClient, GraphQLVaultDBOpts, graphQLVaultDBOpts

/** What a {@link GraphQLVaultDB} needs of your app's urql Client. */
export type GraphQLVaultClient = Pick<Client, 'query' | 'mutation' | 'subscription'>

/** What a {@link GraphQLVaultDB} is made with. */
export interface GraphQLVaultDBOpts {
  /** Your app's urql Client, pointed at a server serving `vaultResolvers`. */
  client: GraphQLVaultClient
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
}), 'bad_option')

true satisfies Z.core.util.AssertEqual<GraphQLVaultDBOpts, Z.input<typeof graphQLVaultDBOpts>>
// --

// == [The VaultDB]: GraphQLVaultDB

/** A vaultDB in the browser whose storage is your GraphQL server: `new GraphQLVaultDB({ client })`. */
export class GraphQLVaultDB implements VaultDB {
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

  /** Puts a vault's birth, or its rebirth over a tombstone. */
  async putVault(record: VaultRecord, opts: PutVaultOpts): Promise<GoodAnswer<VaultRow, PutAct>> { return goodAnswerOf(await this.tryPutVault(record, opts)) }

  async tryPutVault(record: VaultRecord, opts: PutVaultOpts): Promise<Answer<VaultRow, PutAct>> {
    return await answerOf('putVault', DB.reqParamsOf({ ...record, ...opts }), async () => {
      const answer = await this.#told(VaultOperations.putVault, 'safebyokPutVault', { record: DB.vaultRecord.parse(record), opts: DB.putVaultOpts.parse(opts) })
      return DB.putVaultAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Puts a box under a vault live at its `vault_tok`, as `opts` allow. */
  async putBox(record: BoxRecord, opts: PutOpts): Promise<GoodAnswer<BoxRow, PutAct>> { return goodAnswerOf(await this.tryPutBox(record, opts)) }

  async tryPutBox(record: BoxRecord, opts: PutOpts): Promise<Answer<BoxRow, PutAct>> {
    return await answerOf('putBox', DB.reqParamsOf({ ...record, ...opts }), async () => {
      const answer = await this.#told(VaultOperations.putBox, 'safebyokPutBox', { record: DB.boxRecord.parse(record), opts: DB.putOpts.parse(opts) })
      return DB.putBoxAnswer.parse(rowAnswerOf(answer))
    })
  }
  // --

  // == [Gate verbs]: replacePassphrase, tryReplacePassphrase, addPasskey, tryAddPasskey, revokePasskey, tryRevokePasskey

  /** Puts `record`, the vault row at `opts.prior` with a new passphrase wayin and its `gate_epoch` one up. */
  async replacePassphrase(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'replaced'>> { return goodAnswerOf(await this.tryReplacePassphrase(record, opts)) }

  async tryReplacePassphrase(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'replaced'>> {
    return await answerOf('replacePassphrase', DB.reqParamsOf({ ...record, ...opts }), async () => {
      const answer = await this.#told(VaultOperations.replacePassphrase, 'safebyokReplacePassphrase', { record: DB.vaultRecord.parse(record), opts: DB.gateVerbOpts.parse(opts) })
      return DB.replacePassphraseAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Puts `record`, the vault row at `opts.prior`, which has no passkey wayin, with one laid on and its `gate_epoch` one up. */
  async addPasskey(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'added'>> { return goodAnswerOf(await this.tryAddPasskey(record, opts)) }

  async tryAddPasskey(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'added'>> {
    return await answerOf('addPasskey', DB.reqParamsOf({ ...record, ...opts }), async () => {
      const answer = await this.#told(VaultOperations.addPasskey, 'safebyokAddPasskey', { record: DB.vaultRecord.parse(record), opts: DB.gateVerbOpts.parse(opts) })
      return DB.addPasskeyAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Puts `record`, the vault row at `opts.prior` with no passkey wayin and its `gate_epoch` one up; a row with none answers as stored. */
  async revokePasskey(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'revoked'>> { return goodAnswerOf(await this.tryRevokePasskey(record, opts)) }

  async tryRevokePasskey(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'revoked'>> {
    return await answerOf('revokePasskey', DB.reqParamsOf({ ...record, ...opts }), async () => {
      const answer = await this.#told(VaultOperations.revokePasskey, 'safebyokRevokePasskey', { record: DB.vaultRecord.parse(record), opts: DB.gateVerbOpts.parse(opts) })
      return DB.revokePasskeyAnswer.parse(rowAnswerOf(answer))
    })
  }
  // --

  // == [Dels]: delBox, tryDelBox, delVault, tryDelVault, tidyGone, tryTidyGone

  /** Deletes a box's live row at `prior`. */
  async delBox(tombstone: BoxTombstone, opts: DelOpts): Promise<GoodAnswer<BoxTombstone, DelAct>> { return goodAnswerOf(await this.tryDelBox(tombstone, opts)) }

  async tryDelBox(tombstone: BoxTombstone, opts: DelOpts): Promise<Answer<BoxTombstone, DelAct>> {
    return await answerOf('delBox', DB.reqParamsOf({ ...tombstone, ...opts }), async () => {
      const answer = await this.#told(VaultOperations.delBox, 'safebyokDelBox', { tombstone: DB.boxTombstone.parse(tombstone), opts: DB.delOpts.parse(opts) })
      return DB.delBoxAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Deletes a vault's live row at `prior`, with the boxes of its life. */
  async delVault(tombstone: VaultTombstone, opts: DelOpts): Promise<GoodAnswer<VaultTombstone, DelAct>> { return goodAnswerOf(await this.tryDelVault(tombstone, opts)) }

  async tryDelVault(tombstone: VaultTombstone, opts: DelOpts): Promise<Answer<VaultTombstone, DelAct>> {
    return await answerOf('delVault', DB.reqParamsOf({ ...tombstone, ...opts }), async () => {
      const answer = await this.#told(VaultOperations.delVault, 'safebyokDelVault', { tombstone: DB.vaultTombstone.parse(tombstone), opts: DB.delOpts.parse(opts) })
      return DB.delVaultAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** For hosts: removes the box rows of tombstoned or vanished vaults, and counts those left. */
  async tidyGone(scope: BankScope): Promise<GoodAnswer<Tidied, 'tidied', BankScope>> { return goodAnswerOf(await this.tryTidyGone(scope)) }

  async tryTidyGone(scope: BankScope): Promise<Answer<Tidied, 'tidied', BankScope>> {
    return await answerOf('tidyGone', DB.reqParamsOf(scope), async () => {
      const answer = await this.#told(VaultOperations.tidyGone, 'safebyokTidyGone', DB.bankScope.parse(scope))
      return DB.tidyGoneAnswer.parse(tidiedAnswerOf(answer))
    })
  }
  // --

  // == [Watch]: watch

  /** Tells `onNotice` of rows that change under a bank or a vault, and `onBadNews` of a stream that ends unbidden; returns how to stop. */
  watch(scope: WatchScope, onNotice: (notice: Notice) => void, onBadNews?: (news: DB.VaultError) => void): () => void {
    const { applabel, user_id, vaultlabel = null } = DB.watchScope.parse(scope)
    const variables = { applabel, user_id, vaultlabel }
    const watching: { isOn: boolean, subscription?: { unsubscribe: () => void } } = { isOn: true }
    let heardData: unknown
    // A stream that ends is told once and never subscribed again: what to do about it is the host's to decide.
    const end = (news: DB.VaultError | null): void => {
      watching.isOn = false
      watching.subscription?.unsubscribe()
      if (news !== null) { onBadNews?.(news) }
    }
    watching.subscription = this.#client.subscription(VaultOperations.watch, variables).subscribe((result) => {
      if (! watching.isOn) { return }
      if (result.error !== undefined) {
        end(troubleOf(result.error))
        return
      }
      // The closing result of a stream over fetch repeats the data of the notice before it.
      const refusal = (result.data === heardData) ? null : heedNotice(result, onNotice)
      heardData = result.data
      if (refusal !== null) {
        end(DB.isVaultError(refusal, 'identity_revoked') ? null : refusal)
      } else if (! result.hasNext) {
        end(new DB.VaultError('storage_unavailable', DB.WatchEnded, { meta: { call: 'watch' } }))
      }
    })
    // A stream that ended as it began ended before `end` had its subscription to stop.
    if (! watching.isOn) { watching.subscription.unsubscribe() }
    return () => { end(null) }
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

// == [Answers]: answerOf, goodAnswerOf, fieldOf, troubleOf, schemaNotServed, networkTroubleOf, statusOf, codeOf, heedNotice

/** What `ask` answers, or a bad answer with the refusal it threw. */
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
  if (err !== undefined) { throw troubleOf(err) }
  if ((typeof data !== 'object') || (data === null) || ! Object.hasOwn(data, fieldname)) { throw schemaNotServed() }
  return (data as Record<string, unknown>)[fieldname]
}

/** The refusal a failed operation stands for: `storage_unavailable` where the request failed, else `unexpected_error`. */
const troubleOf = (err: CombinedError): DB.VaultError => (err.networkError === undefined) ? schemaNotServed() : networkTroubleOf(err)

// A GraphQL error is a client and server out of step, which no retry mends: never a condition of storage. It is refused
// with no cause, so that no GraphQL error's server text crosses: a variable-coercion error can quote the variable sent,
// which is the record.
/** A server whose answer lacks what was asked, as `unexpected_error`. */
const schemaNotServed = (): DB.VaultError => new DB.VaultError('unexpected_error', DB.SchemaNotServed)

// A network error's message can be the response's body, which may quote the record sent, so the cause is made fresh
// from the fields that cannot: the error's name, the HTTP status, and a code such as ECONNREFUSED.
/** A failed request as `storage_unavailable`, its cause naming the error, the HTTP status and a code alone. */
const networkTroubleOf = ({ networkError, response }: CombinedError): DB.VaultError => {
  const thrownName = networkError?.name ?? 'Error'
  const status = statusOf(response)
  const code = codeOf(networkError) ?? codeOf(networkError?.cause)
  const cause = Object.assign(new Error(DB.fetchFailed(thrownName, status, code)), { thrownName }, (status !== null) && { status }, (code !== null) && { code })
  return DB.storageUnavailable(cause)
}

/** The HTTP status of the response a request failed on, or null. */
const statusOf = (response: unknown): number | null => {
  const status: unknown = (typeof response === 'object') && (response !== null) && ('status' in response) ? response.status : null
  return Number.isSafeInteger(status) ? status as number : null
}

/** A code such as ECONNREFUSED that `thrown` has, or null: only a word of capitals, which quotes nothing. */
const codeOf = (thrown: unknown): string | null => {
  const code: unknown = (typeof thrown === 'object') && (thrown !== null) && ('code' in thrown) ? thrown.code : null
  return (typeof code === 'string') && /^[A-Z][A-Z0-9_]{0,39}$/.test(code) ? code : null
}

/** Hands `onNotice` the notice `result` carries, answering the refusal of a notice that ends the watch, or null. */
const heedNotice = ({ data }: OperationResult<unknown>, onNotice: (notice: Notice) => void): DB.VaultError | null => {
  // A notice is a hint to fetch again, so one of the wrong shape is passed over.
  if ((typeof data !== 'object') || (data === null)) { return null }
  const crossed = DB.crossedNotice.safeParse(rowAnswerOf((data as Record<string, unknown>)['safebyokWatch']))
  if (! crossed.success) { return null }
  if (crossed.data.ok) {
    onNotice(crossed.data.val)
    return null
  }
  return crossed.data.err
}
// --

// == [Typenames]: Drop, dropTypename, wayinOf, gateOf, rowOf, rowsOf, listedOf, answerDrop, rowAnswerOf, listedAnswerOf, tidiedAnswerOf

// An exchange such as urql's cacheExchange adds `__typename` to each selection a document makes. It is dropped
// selection by selection, never by a deep strip: a sidecar, a meta or a damaged row may have a `__typename` of its own.

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
const tidiedAnswerOf = answerDrop(dropTypename)
// --
