import type { AnyVariables, Client, CombinedError, OperationResult } from '@urql/core'
import type * as Z from 'zod'
import * as DB from 'safebyok/storage'
import type {
  Answer, BankListed, BankScope, BoxAnswer, BoxDelAsk, BoxesListed, BoxGetAsk, BoxPutAsk, BoxRow, GateVerbOpts, GoodAnswer, ListAct, Notice, OkAct,
  ReqParams, Tidied, VaultAnswer, VaultDB, VaultDelAsk, VaultGetAsk, VaultPutAsk, VaultQuery, VaultRecord, VaultRow, WatchScope,
} from 'safebyok/storage'
import { VaultOperations } from './vault-operations'

// == [Options]: GraphQLVaultClient, GraphQLVaultDBOpts, graphQLVaultDBOpts

/** The part of an urql Client that {@link GraphQLVaultDB} uses. */
export type GraphQLVaultClient = Pick<Client, 'query' | 'mutation' | 'subscription'>

/** Options for `new GraphQLVaultDB(opts)`. */
export interface GraphQLVaultDBOpts {
  /** Your app's urql Client, pointed at a server that serves `vaultResolvers`. */
  client: GraphQLVaultClient
}

const isGraphQLVaultClient = (candidate: unknown): candidate is GraphQLVaultClient => (
  (typeof candidate === 'object') && (candidate !== null)
  && ('query' in candidate) && (typeof candidate.query === 'function')
  && ('mutation' in candidate) && (typeof candidate.mutation === 'function')
  && ('subscription' in candidate) && (typeof candidate.subscription === 'function')
)

// `custom` returns the same client object it was given, so the client's methods keep their `this`.
const graphQLVaultDBOpts = DB.objCheck(({ custom }) => ({
  client: custom<GraphQLVaultClient>(isGraphQLVaultClient, 'Expected an urql Client, with query, mutation and subscription functions'),
}), 'bad_option')

true satisfies Z.core.util.AssertEqual<GraphQLVaultDBOpts, Z.input<typeof graphQLVaultDBOpts>>
// --

// == [The VaultDB]: GraphQLVaultDB

/** A browser-side vaultDB that sends each call to your GraphQL server: `new GraphQLVaultDB({ client })`. */
export class GraphQLVaultDB implements VaultDB {
  // == [Props]: #client, IsVaultDB

  readonly #client: GraphQLVaultClient

  // A class getter, not an own field, so the brand is left out of JSON and of object spreads.
  /** The brand that marks this object as a vaultDB, recognized even across duplicate copies of safebyok. */
  get [DB.IsVaultDB](): true { return true }
  // --

  // == [Construction]: constructor

  constructor(opts: GraphQLVaultDBOpts) {
    const { client } = graphQLVaultDBOpts.parse(opts)
    this.#client = client
  }
  // --

  // == [Gets]: listVaults, tryListVaults, getVault, tryGetVault, listBoxes, tryListBoxes, getBox, tryGetBox

  /** List the bank's vaults, tombstones included. Rows that fail validation are returned in `damaged_rows`. */
  async listVaults(scope: BankScope): Promise<GoodAnswer<BankListed, ListAct, BankScope>> { return goodAnswerOf(await this.tryListVaults(scope)) }

  /** Non-throwing form of {@link listVaults}. */
  async tryListVaults(scope: BankScope): Promise<Answer<BankListed, ListAct, BankScope>> {
    return await answerOf('listVaults', () => DB.reqParams.parse(DB.bankScope.parse(scope)), async () => {
      const answer = await this.#runQuery(VaultOperations.listVaults, 'safebyokListVaults', DB.bankScope.parse(scope))
      return DB.listVaultsAnswer.parse(listedAnswerOf(answer))
    })
  }

  /** Get the vault row at a scope, whatever its life.
   * With `ifAbsent: 'nil'`, `val` is null if no row is stored, or the tombstone if one is. Otherwise both refuse.
   */
  async getVault(ask: VaultGetAsk): Promise<GoodAnswer<VaultRow | null, OkAct>> { return goodAnswerOf(await this.tryGetVault(ask)) }

  /** Non-throwing form of {@link getVault}. */
  async tryGetVault(ask: VaultGetAsk): Promise<VaultAnswer> {
    return await answerOf('getVault', () => DB.reqParamsOf(DB.vaultGet.parse(ask)), async () => {
      const answer = await this.#runQuery(VaultOperations.getVault, 'safebyokGetVault', { ask: DB.vaultGet.parse(ask) })
      return DB.getVaultAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** List the boxes of the vault life `vault_tok`, in sparse form. Rows that fail validation are returned in `damaged_rows`. */
  async listBoxes(asked: VaultQuery): Promise<GoodAnswer<BoxesListed, ListAct>> { return goodAnswerOf(await this.tryListBoxes(asked)) }

  /** Non-throwing form of {@link listBoxes}. */
  async tryListBoxes(asked: VaultQuery): Promise<Answer<BoxesListed, ListAct>> {
    return await answerOf('listBoxes', () => DB.reqParams.parse(DB.vaultQuery.parse(asked)), async () => {
      const answer = await this.#runQuery(VaultOperations.listBoxes, 'safebyokListBoxes', DB.vaultQuery.parse(asked))
      return DB.listBoxesAnswer.parse(listedAnswerOf(answer))
    })
  }

  /** Get the box row under this `vault_tok`, with its vault row as `world`.
   * With `ifAbsent: 'nil'`, `val` is null if no row is stored, or the tombstone if one is. Otherwise both refuse.
   */
  async getBox(ask: BoxGetAsk): Promise<GoodAnswer<BoxRow | null, OkAct>> { return goodAnswerOf(await this.tryGetBox(ask)) }

  /** Non-throwing form of {@link getBox}. */
  async tryGetBox(ask: BoxGetAsk): Promise<BoxAnswer> {
    return await answerOf('getBox', () => DB.reqParamsOf(DB.boxGet.parse(ask)), async () => {
      const answer = await this.#runQuery(VaultOperations.getBox, 'safebyokGetBox', { ask: DB.boxGet.parse(ask) })
      return DB.getBoxAnswer.parse(rowAnswerOf(answer))
    })
  }
  // --

  // == [Puts]: putVault, tryPutVault, putBox, tryPutBox

  /** Store `ask.record` over the vault row `ask.expected`, as `ifPresent` and `ifAbsent` allow.
   * Under the `passed` act, nothing is stored, and `val` is the live row found.
   */
  async putVault(ask: VaultPutAsk): Promise<GoodAnswer<VaultRow | null, OkAct>> { return goodAnswerOf(await this.tryPutVault(ask)) }

  /** Non-throwing form of {@link putVault}. */
  async tryPutVault(ask: VaultPutAsk): Promise<VaultAnswer> {
    return await answerOf('putVault', () => DB.reqParamsOf(DB.vaultPut.parse(ask)), async () => {
      const answer = await this.#runMutation(VaultOperations.putVault, 'safebyokPutVault', { ask: DB.vaultPut.parse(ask) })
      return DB.putVaultAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Store `ask.record` over the box row `ask.expected`, in a vault live under its `vault_tok`, as `ifPresent` and `ifAbsent` allow.
   * Under the `passed` act, nothing is stored, and `val` is the live row found.
   */
  async putBox(ask: BoxPutAsk): Promise<GoodAnswer<BoxRow | null, OkAct>> { return goodAnswerOf(await this.tryPutBox(ask)) }

  /** Non-throwing form of {@link putBox}. */
  async tryPutBox(ask: BoxPutAsk): Promise<BoxAnswer> {
    return await answerOf('putBox', () => DB.reqParamsOf(DB.boxPut.parse(ask)), async () => {
      const answer = await this.#runMutation(VaultOperations.putBox, 'safebyokPutBox', { ask: DB.boxPut.parse(ask) })
      return DB.putBoxAnswer.parse(rowAnswerOf(answer))
    })
  }
  // --

  // == [Gate verbs]: replacePassphrase, tryReplacePassphrase, addPasskey, tryAddPasskey, revokePasskey, tryRevokePasskey

  /** Replace the vault's passphrase wayin. `record` is the vault row at `opts.prior` with the new wayin and its `gate_epoch` plus one. */
  async replacePassphrase(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'replaced'>> { return goodAnswerOf(await this.tryReplacePassphrase(record, opts)) }

  /** Non-throwing form of {@link replacePassphrase}. */
  async tryReplacePassphrase(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'replaced'>> {
    return await answerOf('replacePassphrase', () => DB.reqParams.parse({ ...DB.vaultRecord.parse(record), ...DB.gateVerbOpts.parse(opts) }), async () => {
      const answer = await this.#runMutation(VaultOperations.replacePassphrase, 'safebyokReplacePassphrase', { record: DB.vaultRecord.parse(record), opts: DB.gateVerbOpts.parse(opts) })
      return DB.replacePassphraseAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Add a passkey wayin to a vault that has none. `record` is the vault row at `opts.prior` with the passkey wayin and its `gate_epoch` plus one. */
  async addPasskey(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'added'>> { return goodAnswerOf(await this.tryAddPasskey(record, opts)) }

  /** Non-throwing form of {@link addPasskey}. */
  async tryAddPasskey(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'added'>> {
    return await answerOf('addPasskey', () => DB.reqParams.parse({ ...DB.passkeyAddRecord.parse(record), ...DB.gateVerbOpts.parse(opts) }), async () => {
      const answer = await this.#runMutation(VaultOperations.addPasskey, 'safebyokAddPasskey', { record: DB.passkeyAddRecord.parse(record), opts: DB.gateVerbOpts.parse(opts) })
      return DB.addPasskeyAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Remove the vault's passkey wayin. `record` is the vault row at `opts.prior` without it and its `gate_epoch` plus one.
   * A stored row that already has no passkey is returned unchanged.
   */
  async revokePasskey(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'revoked'>> { return goodAnswerOf(await this.tryRevokePasskey(record, opts)) }

  /** Non-throwing form of {@link revokePasskey}. */
  async tryRevokePasskey(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'revoked'>> {
    return await answerOf('revokePasskey', () => DB.reqParams.parse({ ...DB.passkeyRevokeRecord.parse(record), ...DB.gateVerbOpts.parse(opts) }), async () => {
      const answer = await this.#runMutation(VaultOperations.revokePasskey, 'safebyokRevokePasskey', { record: DB.passkeyRevokeRecord.parse(record), opts: DB.gateVerbOpts.parse(opts) })
      return DB.revokePasskeyAnswer.parse(rowAnswerOf(answer))
    })
  }
  // --

  // == [Dels]: delBox, tryDelBox, delVault, tryDelVault, tidyGone, tryTidyGone

  /** Store the tombstone `ask.record` over the live box row `ask.expected`. */
  async delBox(ask: BoxDelAsk): Promise<GoodAnswer<BoxRow | null, OkAct>> { return goodAnswerOf(await this.tryDelBox(ask)) }

  /** Non-throwing form of {@link delBox}. */
  async tryDelBox(ask: BoxDelAsk): Promise<BoxAnswer> {
    return await answerOf('delBox', () => DB.reqParamsOf(DB.boxDel.parse(ask)), async () => {
      const answer = await this.#runMutation(VaultOperations.delBox, 'safebyokDelBox', { ask: DB.boxDel.parse(ask) })
      return DB.delBoxAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** Store the tombstone `ask.record` over the live vault row `ask.expected`, and delete the boxes of that vault life. */
  async delVault(ask: VaultDelAsk): Promise<GoodAnswer<VaultRow | null, OkAct>> { return goodAnswerOf(await this.tryDelVault(ask)) }

  /** Non-throwing form of {@link delVault}. */
  async tryDelVault(ask: VaultDelAsk): Promise<VaultAnswer> {
    return await answerOf('delVault', () => DB.reqParamsOf(DB.vaultDel.parse(ask)), async () => {
      const answer = await this.#runMutation(VaultOperations.delVault, 'safebyokDelVault', { ask: DB.vaultDel.parse(ask) })
      return DB.delVaultAnswer.parse(rowAnswerOf(answer))
    })
  }

  /** For hosts: remove the box rows left by vault lives that have ended, and count the box rows that remain. */
  async tidyGone(scope: BankScope): Promise<GoodAnswer<Tidied, 'tidied', BankScope>> { return goodAnswerOf(await this.tryTidyGone(scope)) }

  /** Non-throwing form of {@link tidyGone}. */
  async tryTidyGone(scope: BankScope): Promise<Answer<Tidied, 'tidied', BankScope>> {
    return await answerOf('tidyGone', () => DB.reqParams.parse(DB.bankScope.parse(scope)), async () => {
      const answer = await this.#runMutation(VaultOperations.tidyGone, 'safebyokTidyGone', DB.bankScope.parse(scope))
      return DB.tidyGoneAnswer.parse(tidiedAnswerOf(answer))
    })
  }
  // --

  // == [Watch]: watch

  /** Call `onNotice` when a row changes in a bank or a vault. Returns a function that stops the watch.
   * If the stream fails or the server ends it, `onBadNews` is called once and the watch does not resubscribe.
   * A watch that ends because the session is no longer signed in (`identity_revoked`) stops without calling it.
   */
  watch(scope: WatchScope, onNotice: (notice: Notice) => void, onBadNews?: (news: DB.VaultError) => void): () => void {
    const { applabel, user_id, vaultlabel = null } = DB.watchScope.parse(scope)
    const variables = { applabel, user_id, vaultlabel }
    const watching: { isOn: boolean, subscription?: { unsubscribe: () => void } } = { isOn: true }
    let heardData: unknown
    // Report an ended stream once and never resubscribe. The host decides what to do next.
    function end(news: DB.VaultError | null): void {
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
      // When a stream over fetch closes, its final result repeats the previous notice's data. Do not deliver it twice.
      const refusal = (result.data === heardData) ? null : hearNotice(result, onNotice)
      heardData = result.data
      if (refusal !== null) {
        end(DB.isVaultError(refusal, 'identity_revoked') ? null : refusal)
      } else if (! result.hasNext) {
        end(new DB.VaultError('storage_unavailable', DB.WatchEnded, { meta: { call: 'watch' } }))
      }
    })
    // If the stream ended synchronously inside subscribe(), `end` ran before `watching.subscription` was set. Unsubscribe now.
    if (! watching.isOn) { watching.subscription.unsubscribe() }
    return () => { end(null) }
  }
  // --

  // == [Operations]: #runQuery, #runMutation

  /** Run a query against the server, bypassing any cache, and return its `fieldname` field. */
  async #runQuery(document: string, fieldname: string, variables: AnyVariables): Promise<unknown> {
    return fieldOf(await this.#client.query(document, variables, { requestPolicy: 'network-only' }).toPromise(), fieldname)
  }

  /** Run a mutation and return its `fieldname` field. */
  async #runMutation(document: string, fieldname: string, variables: AnyVariables): Promise<unknown> {
    return fieldOf(await this.#client.mutation(document, variables).toPromise(), fieldname)
  }
  // --
}
// --

// == [Answers]: answerOf, goodAnswerOf, fieldOf, troubleOf, schemaNotServed, networkTroubleOf, statusOf, codeOf, hearNotice

/** Run `ask` and return its answer, converting a thrown refusal into a bad answer.
 * A request that `checked` refuses is never sent.
 */
async function answerOf<ValT, ActT extends string, WorldT>(call: string, checked: () => ReqParams, ask: () => Promise<Answer<ValT, ActT, WorldT>>): Promise<Answer<ValT, ActT, WorldT>> {
  const asked = await DB.outcomeOf(checked)
  if (! asked.ok) { return DB.badAnswerOf(asked.err) }
  const req_params = asked.val
  const outcome = await DB.outcomeOf(ask)
  if (outcome.ok) { return outcome.val }
  const err = Object.assign(outcome.err, { meta: { ...outcome.err.meta, call, req_params } })
  return { ok: false, err, act: err.refusalkind, world: null, req_params }
}

/** Return a good answer, or throw a bad answer's refusal. */
function goodAnswerOf<ValT, ActT extends string, WorldT>(answer: Answer<ValT, ActT, WorldT>): GoodAnswer<ValT, ActT, WorldT> {
  if (! answer.ok) { throw answer.err }
  return answer
}

/** Return the `fieldname` field of an operation's result, or throw the refusal for a failed operation. */
function fieldOf({ error: err, data }: OperationResult<unknown>, fieldname: string): unknown {
  if (err !== undefined) { throw troubleOf(err) }
  if ((typeof data !== 'object') || (data === null) || ! Object.hasOwn(data, fieldname)) { throw schemaNotServed() }
  return (data as Record<string, unknown>)[fieldname]
}

/** Convert a failed operation to a refusal: `storage_unavailable` for a network failure, `unexpected_error` for a GraphQL error. */
function troubleOf(err: CombinedError): DB.VaultError { return (err.networkError === undefined) ? schemaNotServed() : networkTroubleOf(err) }

// A GraphQL error means the client and server disagree about the schema. A retry will not fix that, so it is never
// reported as a storage condition. The refusal carries no cause, so the server's error text never reaches the caller:
// a variable-coercion error can quote the variable sent, which is the record.
/** Make the `unexpected_error` for a server response that lacks what was asked for. */
function schemaNotServed(): DB.VaultError { return new DB.VaultError('unexpected_error', DB.SchemaNotServed) }

// A network error's message can be the response body, which may quote the record sent. Build a new cause from
// fields that cannot quote it: the error's name, the HTTP status, and a code such as ECONNREFUSED.
/** Convert a failed request to `storage_unavailable`. Its cause carries only the error's name, the HTTP status and an error code. */
function networkTroubleOf({ networkError, response }: CombinedError): DB.VaultError {
  const thrownName = networkError?.name ?? 'Error'
  const status = statusOf(response)
  const code = codeOf(networkError) ?? codeOf(networkError?.cause)
  const cause = Object.assign(new Error(DB.fetchFailed(thrownName, status, code)), { thrownName }, (status !== null) && { status }, (code !== null) && { code })
  return DB.storageUnavailable(cause)
}

/** The HTTP status of the failed response, or null. */
function statusOf(response: unknown): number | null {
  const status: unknown = (typeof response === 'object') && (response !== null) && ('status' in response) ? response.status : null
  return Number.isSafeInteger(status) ? status as number : null
}

/** The error code on `thrown`, such as ECONNREFUSED, or null. Only an all-caps identifier is accepted, so it cannot quote data. */
function codeOf(thrown: unknown): string | null {
  const code: unknown = (typeof thrown === 'object') && (thrown !== null) && ('code' in thrown) ? thrown.code : null
  return (typeof code === 'string') && /^[A-Z][A-Z0-9_]{0,39}$/.test(code) ? code : null
}

/** Pass the notice in `result` to `onNotice`. Returns the refusal if the notice ends the watch, else null. */
function hearNotice({ data }: OperationResult<unknown>, onNotice: (notice: Notice) => void): DB.VaultError | null {
  // A notice is only a hint to fetch again, so a malformed notice is ignored.
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

// An exchange such as urql's cacheExchange adds `__typename` to every selection in a document. Remove it one selection
// at a time, never with a deep strip: a sidecar, a meta or a damaged row may have a `__typename` field of its own.

/** A function that removes `__typename` from one selection's value. */
type Drop = (val: unknown) => unknown

/** Return `bag` without its `__typename`, applying each drop in `nested` to the field it names. */
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

/** The drop for a vault or box row, including a vault's gate and a box's ciphered fields. */
const rowOf: Drop = (val) => dropTypename(val, { gate: gateOf, box_key_wrapped: dropTypename, whisper_ciphered: dropTypename })

/** The drop for a list of rows. */
const rowsOf: Drop = (val) => (Array.isArray(val) ? val.map((row) => rowOf(row)) : val)

/** The drop for a listing: its rows, but not its `damaged_rows`. */
const listedOf: Drop = (val) => dropTypename(val, { vaults: rowsOf, boxes: rowsOf })

const reqParamsOf: Drop = (val) => dropTypename(val, { expected: dropTypename })

/** Make the drop for an answer or a notice, using `valDrop` for its `val`. */
function answerDrop(valDrop: Drop): Drop { return (val) => dropTypename(val, { val: valDrop, world: rowOf, dbhas: rowOf, req_params: reqParamsOf, err: dropTypename }) }

const rowAnswerOf = answerDrop(rowOf)
const listedAnswerOf = answerDrop(listedOf)
const tidiedAnswerOf = answerDrop(dropTypename)
// --
