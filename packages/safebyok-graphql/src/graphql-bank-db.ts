import type { AnyVariables, Client, CombinedError, OperationResult } from '@urql/core'
import type * as Z from 'zod'
import * as DB from 'safebyok/storage'
import { BX } from 'safebyok/storage'
import type { BankScope, BoxTidyAsk, GateVerb, GoodAct, GotAct, ListAct, OkAct, Tidied, WatchScope } from 'safebyok/storage'
import { BankOperations } from './bank-operations'

// == [Options]: GraphQLBankClient, GraphQLBankDBOpts, graphQLBankDBOpts

/** The part of an urql Client that {@link GraphQLBankDB} uses. */
export type GraphQLBankClient = Pick<Client, 'query' | 'mutation' | 'subscription'>

/** Options for `new GraphQLBankDB(opts)`. */
export interface GraphQLBankDBOpts {
  /** Your app's urql Client, pointed at a server that serves `bankResolvers`. */
  client: GraphQLBankClient
}

const isGraphQLBankClient = (candidate: unknown): candidate is GraphQLBankClient => (
  (typeof candidate === 'object') && (candidate !== null)
  && ('query' in candidate) && (typeof candidate.query === 'function')
  && ('mutation' in candidate) && (typeof candidate.mutation === 'function')
  && ('subscription' in candidate) && (typeof candidate.subscription === 'function')
)

// `custom` returns the same client object it was given, so the client's methods keep their `this`.
const graphQLBankDBOpts = DB.objCheck(({ custom }) => ({
  client: custom<GraphQLBankClient>(isGraphQLBankClient, 'Expected an urql Client, with query, mutation and subscription functions'),
}), 'bad_option')

true satisfies Z.core.util.AssertEqual<GraphQLBankDBOpts, Z.input<typeof graphQLBankDBOpts>>
// --

// == [The BankDB]: GraphQLBankDB

/** A browser-side bankDB that sends each call to your GraphQL server: `new GraphQLBankDB({ client })`. */
export class GraphQLBankDB implements BX.BankDB {
  // == [Props]: #client, IsBankDB

  readonly #client: GraphQLBankClient

  // A class getter, not an own field, so the brand is left out of JSON and of object spreads.
  /** The brand that marks this object as a bankDB, recognized even across duplicate copies of safebyok. */
  get [DB.IsBankDB](): true { return true }
  // --

  // == [Construction]: constructor

  constructor(opts: GraphQLBankDBOpts) {
    const { client } = graphQLBankDBOpts.parse(opts)
    this.#client = client
  }
  // --

  // == [Bank verbs]: ensureBank, tryEnsureBank, buildBank, tryBuildBank, delBank, tryDelBank
  // Each verb checks its ask, sends it, and parses the answer that crosses back. An ask that fails its check is never sent.

  /** Get the bank row, and for a live bank its `main` gate row and its vault rows.
   * A vault row that fails its checks is listed in `damaged_rows`. `val` is null when no live bank is stored.
   */
  async ensureBank(ask: BX.BankEnsureAsk): Promise<BX.GoodAnswer<BX.BankEnsured | null, GotAct>> { return goodAnswerOf(await this.tryEnsureBank(ask)) }

  /** Non-throwing form of {@link ensureBank}. */
  async tryEnsureBank(ask: BX.BankEnsureAsk): Promise<BX.EnsureBankAnswer> {
    try {
      const { user_id, banklabel } = BX.bankEnsure.parse(ask)
      const crossed = await this.#runQuery(BankOperations.ensureBank, 'safebyokEnsureBank', { user_id, banklabel })
      return BX.ensureBankAnswer.parse(ensuredAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'ensureBank', ask) }
  }

  /** Store the bank record `ask.record` and its `main` gate row `ask.gate` together, over no bank or its tombstone.
   * Under the `passed` act, nothing is stored, and `val` is the live bank's gate row.
   */
  async buildBank(ask: BX.BankBuildAsk): Promise<BX.GoodAnswer<BX.GateRecord, OkAct>> { return goodAnswerOf(await this.tryBuildBank(ask)) }

  /** Non-throwing form of {@link buildBank}. */
  async tryBuildBank(ask: BX.BankBuildAsk): Promise<BX.GateAnswer> {
    try {
      const checked = BX.bankBuild.parse(ask)
      const crossed = await this.#runMutation(BankOperations.buildBank, 'safebyokBuildBank', { ask: checked })
      return BX.buildBankAnswer.parse(rowAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'buildBank', ask) }
  }

  /** Store the tombstone `ask.record` over the live bank row `ask.expected`, and delete every gate, vault and box row under the bank. */
  async delBank(ask: BX.BankDelAsk): Promise<BX.GoodAnswer<BX.BankRow | null, OkAct, null>> { return goodAnswerOf(await this.tryDelBank(ask)) }

  /** Non-throwing form of {@link delBank}. */
  async tryDelBank(ask: BX.BankDelAsk): Promise<BX.DelBankAnswer> {
    try {
      const checked = BX.bankDel.parse(ask)
      const crossed = await this.#runMutation(BankOperations.delBank, 'safebyokDelBank', { ask: checked })
      return BX.delBankAnswer.parse(rowAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'delBank', ask) }
  }
  // --

  // == [Gate verbs]: replacePassphrase, tryReplacePassphrase, addPasskey, tryAddPasskey, revokePasskey, tryRevokePasskey

  /** Store the gate record `ask.record`, whose only change is to replace the passphrase wayin. Refuses `gate_issue` for any other change. */
  async replacePassphrase(ask: BX.GateVerbAsk): Promise<BX.GoodAnswer<BX.GateRecord, OkAct>> { return goodAnswerOf(await this.tryReplacePassphrase(ask)) }

  /** Non-throwing form of {@link replacePassphrase}. */
  async tryReplacePassphrase(ask: BX.GateVerbAsk): Promise<BX.GateAnswer> {
    try {
      const crossed = await this.#runMutation(BankOperations.replacePassphrase, 'safebyokReplacePassphrase', { ask: gateVerbAskOf('replacePassphrase', ask) })
      return BX.replacePassphraseAnswer.parse(rowAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'replacePassphrase', { ...ask, gateVerb: 'replacePassphrase' }) }
  }

  /** Store the gate record `ask.record`, whose only change is to add a passkey wayin.
   * Refuses `camped` when a passkey wayin is already stored, and `gate_issue` for any other change.
   */
  async addPasskey(ask: BX.GateVerbAsk): Promise<BX.GoodAnswer<BX.GateRecord, OkAct>> { return goodAnswerOf(await this.tryAddPasskey(ask)) }

  /** Non-throwing form of {@link addPasskey}. */
  async tryAddPasskey(ask: BX.GateVerbAsk): Promise<BX.GateAnswer> {
    try {
      const crossed = await this.#runMutation(BankOperations.addPasskey, 'safebyokAddPasskey', { ask: gateVerbAskOf('addPasskey', ask) })
      return BX.addPasskeyAnswer.parse(rowAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'addPasskey', { ...ask, gateVerb: 'addPasskey' }) }
  }

  /** Store the gate record `ask.record`, whose only change is to remove the passkey wayin. Refuses `gate_issue` for any other change.
   * Under the `passed` act, nothing is stored: the gate row has no passkey wayin, and `val` is that row.
   */
  async revokePasskey(ask: BX.GateVerbAsk): Promise<BX.GoodAnswer<BX.GateRecord, OkAct>> { return goodAnswerOf(await this.tryRevokePasskey(ask)) }

  /** Non-throwing form of {@link revokePasskey}. */
  async tryRevokePasskey(ask: BX.GateVerbAsk): Promise<BX.GateAnswer> {
    try {
      const crossed = await this.#runMutation(BankOperations.revokePasskey, 'safebyokRevokePasskey', { ask: gateVerbAskOf('revokePasskey', ask) })
      return BX.revokePasskeyAnswer.parse(rowAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'revokePasskey', { ...ask, gateVerb: 'revokePasskey' }) }
  }
  // --

  // == [Vault verbs]: getVault, tryGetVault, putVault, tryPutVault, delVault, tryDelVault

  /** Get the vault row at a scope, whatever its life, in a bank live under `bank_tok`.
   * With `ifAbsent: 'nil'`, `val` is null for no row, or the tombstone stored; otherwise both refuse.
   */
  async getVault(ask: BX.VaultGetAsk): Promise<BX.GoodAnswer<BX.VaultRow | null, OkAct>> { return goodAnswerOf(await this.tryGetVault(ask)) }

  /** Non-throwing form of {@link getVault}. */
  async tryGetVault(ask: BX.VaultGetAsk): Promise<BX.VaultAnswer> {
    try {
      const checked = BX.vaultGet.parse(ask)
      const crossed = await this.#runQuery(BankOperations.getVault, 'safebyokGetVault', { ask: checked })
      return BX.getVaultAnswer.parse(rowAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'getVault', ask) }
  }

  /** Store `ask.record` over the vault row `ask.expected`, in a bank live under `bank_tok`, as `ifPresent` and `ifAbsent` allow.
   * Under the `passed` act, nothing is stored, and `val` is the live row found.
   */
  async putVault(ask: BX.VaultPutAsk): Promise<BX.GoodAnswer<BX.VaultRow | null, OkAct>> { return goodAnswerOf(await this.tryPutVault(ask)) }

  /** Non-throwing form of {@link putVault}. */
  async tryPutVault(ask: BX.VaultPutAsk): Promise<BX.VaultAnswer> {
    try {
      const checked = BX.vaultPut.parse(ask)
      const crossed = await this.#runMutation(BankOperations.putVault, 'safebyokPutVault', { ask: checked })
      return BX.putVaultAnswer.parse(rowAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'putVault', ask) }
  }

  /** Store the tombstone `ask.record` over the live vault row `ask.expected`, and delete the boxes of that vault life. */
  async delVault(ask: BX.VaultDelAsk): Promise<BX.GoodAnswer<BX.VaultRow | null, OkAct>> { return goodAnswerOf(await this.tryDelVault(ask)) }

  /** Non-throwing form of {@link delVault}. */
  async tryDelVault(ask: BX.VaultDelAsk): Promise<BX.VaultAnswer> {
    try {
      const checked = BX.vaultDel.parse(ask)
      const crossed = await this.#runMutation(BankOperations.delVault, 'safebyokDelVault', { ask: checked })
      return BX.delVaultAnswer.parse(rowAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'delVault', ask) }
  }
  // --

  // == [Box verbs]: listBoxes, tryListBoxes, getBox, tryGetBox, putBox, tryPutBox, delBox, tryDelBox

  /** List a vault's boxes, sparse, with its vault row as `parent`. Refuses when the vault is not live under `bank_tok` and `vault_tok`. */
  async listBoxes(ask: BX.BoxListAsk): Promise<BX.GoodAnswer<BX.BoxesListed, ListAct, BX.VaultRow>> { return goodAnswerOf(await this.tryListBoxes(ask)) }

  /** Non-throwing form of {@link listBoxes}. When the vault row refuses, `parent` is that stored row. */
  async tryListBoxes(ask: BX.BoxListAsk): Promise<BX.ListBoxesAnswer> {
    try {
      const { user_id, banklabel, vaultlabel, bank_tok, vault_tok } = BX.boxList.parse(ask)
      const crossed = await this.#runQuery(BankOperations.listBoxes, 'safebyokListBoxes', { user_id, banklabel, vaultlabel, bank_tok, vault_tok })
      return BX.listBoxesAnswer.parse(listedAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'listBoxes', ask) }
  }

  /** Get a box row, with its vault row as `parent`. Refuses when the vault is not live under `bank_tok` and `vault_tok`.
   * With `ifAbsent: 'nil'`, `val` is null for no row, or the tombstone stored; otherwise both refuse.
   */
  async getBox(ask: BX.BoxGetAsk): Promise<BX.GoodAnswer<BX.BoxRow | null, OkAct, BX.VaultRow>> { return goodAnswerOf(await this.tryGetBox(ask)) }

  /** Non-throwing form of {@link getBox}. */
  async tryGetBox(ask: BX.BoxGetAsk): Promise<BX.BoxAnswer> {
    try {
      const checked = BX.boxGet.parse(ask)
      const crossed = await this.#runQuery(BankOperations.getBox, 'safebyokGetBox', { ask: checked })
      return BX.getBoxAnswer.parse(rowAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'getBox', ask) }
  }

  /** Store `ask.record` over the box row `ask.expected`, in a vault live under `bank_tok` and `vault_tok`, as `ifPresent` and `ifAbsent` allow.
   * Under the `passed` act, nothing is stored, and `val` is the live row found.
   */
  async putBox(ask: BX.BoxPutAsk): Promise<BX.GoodAnswer<BX.BoxRow | null, OkAct, BX.VaultRow>> { return goodAnswerOf(await this.tryPutBox(ask)) }

  /** Non-throwing form of {@link putBox}. */
  async tryPutBox(ask: BX.BoxPutAsk): Promise<BX.BoxAnswer> {
    try {
      const checked = BX.boxPut.parse(ask)
      const crossed = await this.#runMutation(BankOperations.putBox, 'safebyokPutBox', { ask: checked })
      return BX.putBoxAnswer.parse(rowAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'putBox', ask) }
  }

  /** Store the tombstone `ask.record` over the live box row `ask.expected`. */
  async delBox(ask: BX.BoxDelAsk): Promise<BX.GoodAnswer<BX.BoxRow | null, OkAct, BX.VaultRow>> { return goodAnswerOf(await this.tryDelBox(ask)) }

  /** Non-throwing form of {@link delBox}. */
  async tryDelBox(ask: BX.BoxDelAsk): Promise<BX.BoxAnswer> {
    try {
      const checked = BX.boxDel.parse(ask)
      const crossed = await this.#runMutation(BankOperations.delBox, 'safebyokDelBox', { ask: checked })
      return BX.delBoxAnswer.parse(rowAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'delBox', ask) }
  }
  // --

  // == [Housekeeping]: tidyGone, tryTidyGone

  /** For hosts: delete the vault and box rows of an ended life under the bank, and count the box rows left. */
  async tidyGone(ask: BoxTidyAsk): Promise<BX.GoodAnswer<Tidied, 'tidied', BankScope>> { return goodAnswerOf(await this.tryTidyGone(ask)) }

  /** Non-throwing form of {@link tidyGone}. */
  async tryTidyGone(ask: BoxTidyAsk): Promise<BX.TidyGoneAnswer> {
    try {
      const { user_id, banklabel } = DB.boxTidy.parse(ask)
      const crossed = await this.#runMutation(BankOperations.tidyGone, 'safebyokTidyGone', { user_id, banklabel })
      return BX.tidyGoneAnswer.parse(tidiedAnswerOf(crossed))
    } catch (err) { return answerForRefusal(err, 'tidyGone', ask) }
  }
  // --

  // == [Watch]: watch

  /** Call `onNotice` when a row changes in a bank or a vault. Returns a function that stops the watch.
   * If the stream fails or the server ends it, `onBadNews` is called once and the watch does not resubscribe.
   * A watch that ends because the session is no longer signed in (`identity_revoked`) stops without calling it.
   */
  watch(scope: WatchScope, onNotice: (notice: BX.Notice) => void, onBadNews?: (news: DB.VaultError) => void): () => void {
    const { user_id, banklabel, vaultlabel = null } = DB.watchScope.parse(scope)
    const variables = { user_id, banklabel, vaultlabel }
    const watching: { isOn: boolean, subscription?: { unsubscribe: () => void } } = { isOn: true }
    let heardData: unknown
    // Report an ended stream once and never resubscribe. The host decides what to do next.
    function end(news: DB.VaultError | null): void {
      watching.isOn = false
      watching.subscription?.unsubscribe()
      if (news !== null) { onBadNews?.(news) }
    }
    watching.subscription = this.#client.subscription(BankOperations.watch, variables).subscribe((result) => {
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
        end(new DB.VaultError('storage_unavailable', DB.WatchEnded, { meta: { oplabel: 'watch' } }))
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

// == [Asks and answers]: gateVerbAskOf, answerForRefusal, goodAnswerOf, fieldOf, troubleOf, schemaNotServed, networkTroubleOf, statusOf, codeOf, hearNotice

// The mutation names the verb, so the ask sent leaves it out.
/** `ask` checked as the gate verb `gateVerb`'s, without its `gateVerb`: what that verb's mutation sends. */
function gateVerbAskOf(gateVerb: GateVerb, ask: BX.GateVerbAsk): BX.GateVerbAsk {
  const { gateVerb: _gateVerb, ...sent } = BX.gatePut.parse({ ...ask, gateVerb })
  return sent
}

// Every throw in a verb ends up here: an ask that fails its check, a server out of reach, or an answer that fails its own.
/** The bad answer for a verb that threw: a refusal as it came, anything else `unexpected_error`.
 * Its meta names the `oplabel`, and carries what it may of the ask as `ask`.
 */
function answerForRefusal(thrown: unknown, oplabel: string, ask: unknown): BX.BadAnswer {
  const refusal = DB.isVaultError(thrown) ? thrown : DB.unexpectedError(thrown)
  // An ask that failed its check has no metadata to trust: its refusal carries none.
  const loggableAsk = BX.loggableAsk.safeParse(ask)
  return BX.badAnswerOf(Object.assign(refusal, { meta: { ...refusal.meta, oplabel, ask: loggableAsk.success ? loggableAsk.data : {} } }))
}

/** Return a good answer, or throw a bad answer's refusal. */
function goodAnswerOf<ValT, ActT extends GoodAct, ParentT>(answer: BX.Answer<ValT, ActT, ParentT>): BX.GoodAnswer<ValT, ActT, ParentT> {
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
function hearNotice({ data }: OperationResult<unknown>, onNotice: (notice: BX.Notice) => void): DB.VaultError | null {
  // A notice is only a hint to fetch again, so a malformed notice is ignored.
  if ((typeof data !== 'object') || (data === null)) { return null }
  const crossed = BX.crossedNotice.safeParse(rowAnswerOf((data as Record<string, unknown>)['safebyokWatch']))
  if (! crossed.success) { return null }
  if (crossed.data.ok) {
    onNotice(crossed.data.val)
    return null
  }
  return crossed.data.err
}
// --

// == [Wire forms]: Drop, dropTypename, wayinOf, wayinsOf, rowOf, rowsOf, ensuredOf, listedOf, askOf, answerDrop, rowAnswerOf, ensuredAnswerOf, listedAnswerOf, tidiedAnswerOf

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

// GraphQL answers a gate that has no passkey wayin with `passkey0: null`, where the gate row leaves it out.
/** The drop for a gate's wayins, which also leaves out a null `passkey0`. */
const wayinsOf: Drop = (val) => {
  const wayins = dropTypename(val, { main: wayinOf, passkey0: wayinOf })
  if ((typeof wayins !== 'object') || (wayins === null) || ((wayins as Record<string, unknown>)['passkey0'] !== null)) { return wayins }
  const { passkey0: _passkey0, ...main } = wayins as Record<string, unknown>
  return main
}

/** The drop for a bank, gate, vault or box row, including a gate's wayins and a box's ciphered fields. */
const rowOf: Drop = (val) => dropTypename(val, { wayins: wayinsOf, box_key_wrapped: dropTypename, whisper_ciphered: dropTypename })

/** The drop for a list of rows. */
const rowsOf: Drop = (val) => (Array.isArray(val) ? val.map((row) => rowOf(row)) : val)

/** The drop for what ensureBank answers: its gates and its vaults, but not its `damaged_rows`. */
const ensuredOf: Drop = (val) => dropTypename(val, { gates: (gates) => dropTypename(gates, { main: rowOf }), vaults: rowsOf })

/** The drop for a listing of boxes: its rows, but not its `damaged_rows`. */
const listedOf: Drop = (val) => dropTypename(val, { boxes: rowsOf })

const askOf: Drop = (val) => dropTypename(val, { expected: dropTypename, record: dropTypename, gate: dropTypename })

/** Make the drop for an answer or a notice, using `valDrop` for its `val`. */
function answerDrop(valDrop: Drop): Drop { return (val) => dropTypename(val, { val: valDrop, parent: rowOf, dbhas: rowOf, ask: askOf, err: dropTypename }) }

const rowAnswerOf = answerDrop(rowOf)
const ensuredAnswerOf = answerDrop(ensuredOf)
const listedAnswerOf = answerDrop(listedOf)
const tidiedAnswerOf = answerDrop(dropTypename)
// --
