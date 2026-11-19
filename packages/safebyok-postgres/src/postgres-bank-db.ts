/** A bankDB adapter that keeps its rows in Postgres. */

import * as DB from 'safebyok-big/storage'
import type { Awaitable, BankScope, BoxTidyAsk, Capacity, Tidied, VaultError, VaultScope, WatchScope } from 'safebyok-big/storage'
import { BX } from 'safebyok-big/storage'
import type { BankTok, Boxlabel, UserID, VaultTok, Vaultlabel } from 'safebyok-big'
import {
  BirthBankSql, BirthBoxSql, BirthVaultSql, CountBoxesSql, DeleteEndedBoxesSql, DeleteEndedVaultsSql, EnsureBankSql, GetBankSql, GetBoxWithVaultSql,
  GetGateWithBankSql, GetVaultWithBankSql, ListBoxesWithVaultSql, PutGateSql, ReviseBankSql, ReviseBoxSql, ReviseVaultSql,
} from './bank-queries'
import * as Phrases from './phrases'

// == [The driver]: PostgresQueryable, PostgresClient, PostgresListen, isPostgresClient, PostgresBankDBOpts

/** A pool or connection that runs one parameterized statement and returns its rows. */
export type PostgresQueryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

/** A {@link PostgresQueryable} that also runs `work` as one transaction: a PGlite, or `pgClientOf(pool)`. */
export type PostgresClient = PostgresQueryable & { transaction: <ValT>(work: (tx: PostgresQueryable) => Promise<ValT>) => Promise<ValT> }

/** A host's LISTEN: calls `onNotify` with the text of each notification on `channel`, and returns a function that stops listening. */
export type PostgresListen = (channel: string, onNotify: (text: string) => void) => Awaitable<() => unknown>

/** True for a client with `query` and `transaction` functions. */
export function isPostgresClient(candidate: unknown): candidate is PostgresClient {
  return (typeof candidate === 'object') && (candidate !== null)
    && ('query' in candidate) && (typeof candidate.query === 'function')
    && ('transaction' in candidate) && (typeof candidate.transaction === 'function')
}

/** Options for `new PostgresBankDB(opts)`, in addition to {@link BX.AdapterBankDBOpts}:
 * - `client`   -- runs the queries and transactions
 * - `listen`   -- subscribes to Postgres notifications for `watch`, which hears nothing without it
 * - `maxBoxes` -- soft cap on the box rows of one vault life, tombstones included (default: `DefaultMaxBoxes`)
 */
export type PostgresBankDBOpts = Readonly<BX.AdapterBankDBOpts & { client: PostgresClient, listen?: PostgresListen, maxBoxes?: number }>

// `custom` and `fn` return the same client and listen objects they were given, so the driver's methods keep their `this`.
const postgresBankDBOpts = DB.objCheck(({ custom, fn, int }) => ({
  ...BX.adapterBankDBOpts.shape,
  client:   custom<PostgresClient>(isPostgresClient, 'Expected a client with query and transaction functions'),
  listen:   fn<PostgresListen>().optional(),
  maxBoxes: int.positive().optional(),
}), 'bad_record')
// --

// == [Notices]: bankChannelOf, channelOf, Told, toldOf

const bankChannelOfArgs = DB.Checker(({ user_id }) => user_id, 'bad_record')

/** Return the notification channel for `user_id`'s writes: the channel a `PostgresListen` subscribes to. */
export function bankChannelOf(user_id: UserID): string { return channelOf(bankChannelOfArgs.parse(user_id, { where: 'bankChannelOf' })) }

// Postgres identifiers are at most 63 bytes. A user_id whose channel name is longer cannot be notified, so a write that would notify for it fails.
/** The notification channel for `user_id`. */
function channelOf(user_id: UserID): string { return `safebyok_${user_id}` }

// Each notice comes from `safebyok_tell` in `bank-functions.ts`: a JSON object with the stored row's address under `at`,
// the row under `row` and the row above it under `parent`, whichever fit. A box row's address carries its vault's life.

/** A parsed notice: the stored row's address, and the rows that fit the byte-size limit. */
type Told = BankScope & {
  gatelabel?:  string | undefined
  vaultlabel?: Vaultlabel | undefined
  bank_tok?:   BankTok | undefined
  vault_tok?:  VaultTok | undefined
  boxlabel?:   Boxlabel | undefined
  heard?:      BX.Heard | undefined
}

const toldWhere = DB.objCheck(({ user_id, banklabel, str }) => ({
  user_id, banklabel, gatelabel: str.optional(), vaultlabel: str.optional(), bank_tok: str.optional(), vault_tok: str.optional(), boxlabel: str.optional(),
}), { refusalkind: 'bad_record', extras: 'strip' })

/** Parse a notification's text into a {@link Told}, or return null if it is not one of our notices. */
function toldOf(text: string): Told | null {
  const told = jsonOrNull(text) as { at?: unknown, row?: unknown, parent?: unknown } | null
  const whereReport = toldWhere.safeParse(told?.at)
  if ((told === null) || (! whereReport.success)) { return null }
  const { row, parent } = told
  if (row === undefined) { return whereReport.data }
  return { ...whereReport.data, heard: (parent === undefined) ? { row } : { row, parent } }
}

/** The JSON value in `text`, or null where it is not JSON. */
export function jsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch { return null }
}

// A bank or gate row has no vaultlabel, so only a watch of the whole bank hears it.
function isHeardIn(scope: WatchScope, told: Told): boolean {
  return (scope.user_id === told.user_id) && (scope.banklabel === told.banklabel) && ((scope.vaultlabel ?? told.vaultlabel) === told.vaultlabel)
}
// --

// == [Refusals]: refusalOf, isTransient, causeOf, codeOf, TransientSqlstate, TransientSystemCodes, PgConnectionLost

/** The VaultError for what a driver threw: `storage_unavailable` where a retry may mend it, else `unexpected_error`. A VaultError is kept as it is.
 * A lost connection, a conflict between transactions, a busy or read-only server: anything else fails the same way again.
 */
export function refusalOf(thrown: unknown): VaultError {
  if (DB.isVaultError(thrown)) { return thrown }
  return isTransient(thrown) ? DB.storageUnavailable(causeOf(thrown)) : DB.unexpectedError(causeOf(thrown))
}

/** True for a failure a retry may mend: a transient SQLSTATE, a socket's system error, or one of pg's own connection failures. */
function isTransient(thrown: unknown): boolean {
  const code = codeOf(thrown)
  if (code !== undefined) { return TransientSqlstate.test(code) || TransientSystemCodes.has(code) }
  return (thrown instanceof Error) && PgConnectionLost.has(thrown.message)
}

// A driver's error can include the statement's parameters, which may include a row. Keep only its message and code.
function causeOf(thrown: unknown): Error {
  const code = codeOf(thrown)
  return Object.assign(new Error(DB.sanitizeForeignError(thrown).message), (code === undefined) ? {} : { code })
}

/** The error code on `thrown`, a SQLSTATE such as 40001 or a system error such as ECONNRESET. Only capitals, digits and underbars are kept, so it cannot quote a row. */
function codeOf(thrown: unknown): string | undefined {
  const code: unknown = ((typeof thrown === 'object') && (thrown !== null) && ('code' in thrown)) ? thrown.code : undefined
  return ((typeof code === 'string') && /^[0-9A-Z][0-9A-Z_]{0,39}$/.test(code)) ? code : undefined
}

// SQLSTATE classes 08 (connection exception), 40 (transaction rollback: a serialization failure or deadlock), 53 (insufficient
// resources) and 57 (operator intervention: a cancelled statement, a server shutting down), 55P03 (lock not available), and
// 25006 (read-only SQL transaction: a write sent to a standby, as during a failover).
const TransientSqlstate = /^(?:(?:08|40|53|57)[0-9A-Z]{3}|55P03|25006)$/

// Node's system errors for a socket that could not connect, or that dropped, and a host name that could not be looked up for now.
const TransientSystemCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'ENETDOWN', 'EAI_AGAIN'])

// pg 8 throws these as plain Errors, with no code, so only the message tells them apart. A test checks each against the installed pg.
// A connection dropped or timed out is in `pg/lib/client.js`, a pool that found no connection in time in `pg-pool/index.js`.
/** The messages of pg's connection failures a retry may mend; a client the host ended itself is left out. */
export const PgConnectionLost: ReadonlySet<string> = new Set([
  'Connection terminated unexpectedly',
  'Client has encountered a connection error and is not queryable',
  'Query read timeout',
  'timeout expired',
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
])
// --

// == [What the database returns]: Verdict, GateAnswered, BankAnswered, VaultAnswered, BoxAnswered, storedVerdict, parentVaultRow, RowOfOtherAddress, checkedWrote, storedNothing
// A fetch returns rows alone. A write function also returns whether it wrote the record (`ok`), and if it did,
// the `act` and the `presence` of what was stored before.

/** A write function's verdict, unchecked. */
type Verdict = { ok?: boolean, act?: unknown, presence?: unknown }

/** The database's result for a `buildBank` or `putGate` ask, unchecked: the bank row, its gate row, and a write function's verdict. */
type GateAnswered = BX.GateFetched & Verdict

/** The database's result for a `delBank` ask, unchecked: the bank row, and a write function's verdict. */
type BankAnswered = BX.BankFetched & Verdict

/** The database's result for a vault ask, unchecked: the bank row, the vault row, and a write function's verdict. */
type VaultAnswered = BX.VaultFetched & Verdict

/** The database's result for a box ask, unchecked: the vault row, the box row, a write function's verdict, and for a birth the vault life's count of box rows. */
type BoxAnswered = BX.BoxFetched & Verdict & { boxcount?: number }

const { storedVerdict } = DB.Checkers('storage_issue', ({ obj, oneof }) => ({
  storedVerdict: obj({ act: oneof(DB.writeActVals), presence: oneof(BX.presenceVals) }),
}))

const parentVaultRow = BX.storedVaultRow.refusingAs('damaged_vault')

const RowOfOtherAddress = { kind: 'storage_issue', message: DB.rowOfOtherAddress } as const

// The classifier checked the rows, so a disagreement is our SQL function out of step with our classifier, never a damaged row.
/** Check that the write function wrote where the classifier finds a write, and return `stored` typed. */
function checkedWrote<StoredT extends { act: DB.BoxAct | DB.VaultAct | DB.ParentBankAct }>(answered: Verdict, stored: StoredT): StoredT {
  if ((! answered.ok) && BX.isWriteAct(stored.act)) { throw storedNothing() }
  return stored
}

/** The `unexpected_error` for a write function that stored nothing where the classifier finds a write. */
export function storedNothing(): VaultError { return DB.unexpectedError(new Error(Phrases.StoredNothing)) }
// --

/** A bankDB that keeps its rows in your Postgres: `new PostgresBankDB({ client: pgClientOf(pool) })`. */
export class PostgresBankDB extends DB.AdapterBankDB {
  // == [Props]: #client, #listen, #maxBoxes

  readonly #client: PostgresClient
  readonly #listen: PostgresListen | undefined
  readonly #maxBoxes: number
  // --

  // == [Construction]: constructor

  constructor(opts: PostgresBankDBOpts) {
    const { client, listen, maxBoxes = DB.DefaultMaxBoxes, ...adapterBankDBOpts } = postgresBankDBOpts.parse(opts)
    super(adapterBankDBOpts)
    this.#client = client
    this.#listen = listen
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Statements]: #query, #firstRow, #transact, #fetchBank, #fetchGate, #fetchVault, #fetchBox, #roomAt, #writeVault, #writeBox

  async #query(text: string, params: unknown[]): Promise<unknown[]> {
    try {
      return await rowsFrom(this.#client, text, params)
    } catch (err) { throw refusalOf(err) }
  }

  // Each statement it runs returns one row, whatever is stored.
  async #firstRow<RowT>(text: string, params: unknown[]): Promise<RowT> {
    const [row] = await this.#query(text, params)
    return row as RowT
  }

  async #transact<ValT>(work: (tx: PostgresQueryable) => Promise<ValT>): Promise<ValT> {
    try {
      return await this.#client.transaction(work)
    } catch (err) { throw refusalOf(err) }
  }

  /** The bank row stored at a scope, null for none. */
  async #fetchBank({ user_id, banklabel }: BankScope): Promise<BX.BankFetched> {
    const [fetched] = await this.#query(GetBankSql, [user_id, banklabel]) as BX.BankFetched[]
    return fetched ?? { bank: null }
  }

  /** A gate row and its bank row, each null for none, fetched in one statement. */
  async #fetchGate({ user_id, banklabel, gatelabel }: BankScope & { gatelabel: string }): Promise<BX.GateFetched> {
    return await this.#firstRow(GetGateWithBankSql, [user_id, banklabel, gatelabel])
  }

  /** A vault row and its bank row, each null for none, fetched in one statement. */
  async #fetchVault({ user_id, banklabel, vaultlabel }: VaultScope): Promise<BX.VaultFetched> {
    return await this.#firstRow(GetVaultWithBankSql, [user_id, banklabel, vaultlabel])
  }

  /** A box row and its vault row as `parent`, each null for none, fetched in one statement. */
  async #fetchBox({ user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel }: BX.BoxQuery): Promise<BX.BoxFetched> {
    return await this.#firstRow(GetBoxWithVaultSql, [user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel])
  }

  /** The capacity of a vault life with `used` box rows, tombstones included. */
  #roomAt(used: number): Capacity {
    return { boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }
  }

  /** Run a vault's write function `text` for the ask's record and the row it expects. */
  async #writeVault(ask: BX.VaultPutAsk | BX.VaultDelAsk, text: string): Promise<BX.VaultStored> {
    const answered = await this.#firstRow<VaultAnswered>(text, [JSON.stringify(ask.record), JSON.stringify(ask.expected)])
    return checkedWrote(answered, this.classifyStoredVault(ask, answered))
  }

  /** Run a box's write function `text` for the ask's record and the row it expects. */
  async #writeBox(ask: BX.BoxPutAsk | BX.BoxDelAsk, text: string): Promise<BX.BoxStored> {
    const answered = await this.#firstRow<BoxAnswered>(text, [JSON.stringify(ask.record), JSON.stringify(ask.expected), this.#maxBoxes])
    return checkedWrote(answered, this.classifyStoredBox(ask, answered))
  }
  // --

  // == [Classifying]: classifyBuildBank, classifyStoredGate, classifyDelBank, classifyStoredVault, classifyStoredBox
  // A write function checks an ask and writes its record in one call. When it wrote the record, its result is checked and returned
  // without classifying, with the row written as the database returned it. When it wrote nothing, or the ask is a get, the core's classifier classifies the ask against the rows returned.
  // If the classifier finds a write when the function wrote nothing, that is a fault, thrown where the function was called.

  protected override classifyBuildBank(ask: BX.BankBuildAsk, answered: GateAnswered): BX.BankBuildStored {
    if (answered.ok !== true) { return super.classifyBuildBank(ask, answered) }
    const { act, presence } = storedVerdict.parse(answered)
    return { ok: true, act, parent: BX.writtenBankOf(ask, answered.bank), gate: BX.writtenGateOf(ask.gate, answered.gate), presence }
  }

  protected override classifyStoredGate(ask: BX.GatePutAsk, answered: GateAnswered): BX.GateStored {
    if (answered.ok !== true) { return super.classifyStoredGate(ask, answered) }
    const { act, presence } = storedVerdict.parse(answered)
    const parent = BX.storedBankRow.parseConsistent(answered.bank, { ...DB.bankScope.parse(ask), bank_tok: ask.bank_tok }, RowOfOtherAddress)
    return { ok: true, act, parent, gate: BX.writtenGateOf(ask, answered.gate), presence }
  }

  protected override classifyDelBank(ask: BX.BankDelAsk, answered: BankAnswered): BX.BankDelStored {
    if (answered.ok !== true) { return super.classifyDelBank(ask, answered) }
    const { act, presence } = storedVerdict.parse(answered)
    return { ok: true, act, bank: BX.writtenBankOf(ask, answered.bank), presence }
  }

  protected override classifyStoredVault(ask: BX.VaultAsk, answered: VaultAnswered): BX.VaultStored {
    if ((answered.ok !== true) || (ask.op === 'get')) { return super.classifyStoredVault(ask, answered) }
    const { act, presence } = storedVerdict.parse(answered)
    const parent = BX.storedBankRow.parseConsistent(answered.bank, { ...DB.bankScope.parse(ask), bank_tok: ask.bank_tok }, RowOfOtherAddress)
    return { ok: true, act, parent, vault: BX.writtenVaultOf(ask, answered.vault), presence }
  }

  protected override classifyStoredBox(ask: BX.BoxAsk, answered: BoxAnswered): BX.BoxStored {
    const capacity = (answered.boxcount === undefined) ? null : this.#roomAt(answered.boxcount)
    if ((answered.ok !== true) || (ask.op === 'get')) { return super.classifyStoredBox(ask, { parent: answered.parent, box: answered.box, capacity }) }
    const { act, presence } = storedVerdict.parse(answered)
    const parent = parentVaultRow.parseConsistent(answered.parent, DB.vaultScope.parse(ask), RowOfOtherAddress)
    return { ok: true, act, parent, box: BX.writtenBoxOf(ask, answered.box), presence, capacity }
  }
  // --

  // == [Protected, the generic calls of AdapterBankDB]: doEnsureBank, doBuildBank, doPutGate, doDelBank, doGetVault, doPutVault, doDelVault, doListBoxes, doGetBox, doPutBox, doDelBox, doTidyGone, doWatch

  protected async doEnsureBank(ask: BX.BankEnsureAsk): Promise<BX.BankEnsureStored> {
    const fetched = await this.#firstRow<BX.BankEnsureFetched>(EnsureBankSql, [ask.user_id, ask.banklabel])
    return this.classifyEnsureBank(ask, fetched)
  }

  // A buildBank over a live bank writes nothing, and is classified against the rows the function returns.
  protected async doBuildBank(ask: BX.BankBuildAsk): Promise<BX.BankBuildStored> {
    const text     = (ask.expected.revision_seq === DB.VoidRevisionSeq) ? BirthBankSql : ReviseBankSql
    const answered = await this.#firstRow<GateAnswered>(text, [JSON.stringify(ask.record), JSON.stringify(ask.gate), JSON.stringify(ask.expected)])
    return checkedWrote(answered, this.classifyBuildBank(ask, answered))
  }

  // The function checks the bank row as it puts, so putGate always calls it: when nothing is stored, the
  // classifier answers from the rows it returns.
  protected async doPutGate(ask: BX.GatePutAsk): Promise<BX.GateStored> {
    const answered = await this.#firstRow<GateAnswered>(PutGateSql, [JSON.stringify(ask.record), JSON.stringify(ask.expected), ask.options.policies])
    return checkedWrote(answered, this.classifyStoredGate(ask, answered))
  }

  protected async doDelBank(ask: BX.BankDelAsk): Promise<BX.BankDelStored> {
    if (ask.expected.am !== 'a') {
      const fetched = await this.#fetchBank(ask)
      return this.classifyDelBank(ask, fetched)
    }
    const answered = await this.#firstRow<BankAnswered>(ReviseBankSql, [JSON.stringify(ask.record), null, JSON.stringify(ask.expected)])
    return checkedWrote(answered, this.classifyDelBank(ask, answered))
  }

  protected async doGetVault(ask: BX.VaultGetAsk): Promise<BX.VaultStored> {
    const fetched = await this.#fetchVault(ask)
    return this.classifyStoredVault(ask, fetched)
  }

  // A put or del calls the write function for the row it expects. A put whose options allow no write over that row is only
  // classified against the rows fetched: whatever is stored, the classifier finds no write for it.
  protected async doPutVault(ask: BX.VaultPutAsk): Promise<BX.VaultStored> {
    if (! mayReplace(ask)) {
      const fetched = await this.#fetchVault(ask)
      return this.classifyStoredVault(ask, fetched)
    }
    return await this.#writeVault(ask, isBirth(ask) ? BirthVaultSql : ReviseVaultSql)
  }

  protected async doDelVault(ask: BX.VaultDelAsk): Promise<BX.VaultStored> {
    if (ask.expected.am !== 'a') {
      const fetched = await this.#fetchVault(ask)
      return this.classifyStoredVault(ask, fetched)
    }
    return await this.#writeVault(ask, ReviseVaultSql)
  }

  protected async doListBoxes(ask: BX.BoxListAsk): Promise<BX.BoxesStored> {
    const { user_id, banklabel, vaultlabel, bank_tok, vault_tok } = ask
    const fetched = await this.#firstRow<BX.BoxesFetched>(ListBoxesWithVaultSql, [user_id, banklabel, vaultlabel, bank_tok, vault_tok])
    return this.classifyStoredBoxes(ask, fetched)
  }

  protected async doGetBox(ask: BX.BoxGetAsk): Promise<BX.BoxStored> {
    const fetched = await this.#fetchBox(ask)
    return this.classifyStoredBox(ask, fetched)
  }

  protected async doPutBox(ask: BX.BoxPutAsk): Promise<BX.BoxStored> {
    if (! mayReplace(ask)) {
      const fetched = await this.#fetchBox(ask)
      return this.classifyStoredBox(ask, fetched)
    }
    return await this.#writeBox(ask, isBirth(ask) ? BirthBoxSql : ReviseBoxSql)
  }

  protected async doDelBox(ask: BX.BoxDelAsk): Promise<BX.BoxStored> {
    if (ask.expected.am !== 'a') {
      const fetched = await this.#fetchBox(ask)
      return this.classifyStoredBox(ask, fetched)
    }
    return await this.#writeBox(ask, ReviseBoxSql)
  }

  // The vault rows go first, so the box rows under a vault row deleted here go with it.
  protected async doTidyGone({ user_id, banklabel }: BoxTidyAsk): Promise<Tidied> {
    return await this.#transact(async (tx) => {
      await tx.query(DeleteEndedVaultsSql, [user_id, banklabel])
      await tx.query(DeleteEndedBoxesSql, [user_id, banklabel])
      const [counted] = await rowsFrom(tx, CountBoxesSql, [user_id, banklabel]) as [{ boxcount: number }]
      return { totalCount: counted.boxcount, leftover: 'none' }
    })
  }

  protected override doWatch(scope: WatchScope, hear: (heard: BX.Heard) => void, onBadNews: (news: VaultError) => void): () => void {
    const listen = this.#listen
    if (listen === undefined) { return super.doWatch(scope, hear, onBadNews) }
    let isListening = true
    const onNotify = (text: string): void => {
      const told = toldOf(text)
      if ((told === null) || (! isListening) || (! isHeardIn(scope, told))) { return }
      void hearTold(told)
    }
    const hearTold = async (told: Told): Promise<void> => {
      const heard = await this.#heardOrNull(told, onFetchFailed)
      if ((heard !== null) && isListening) { hear(heard) }
    }
    // A listen that fails ends the watch before it heard anything.
    const onListenFailed = (news: VaultError): void => {
      if (! isListening) { return }
      isListening = false
      onBadNews(news)
    }
    const unwatch = (): void => {
      if (! isListening) { return }
      isListening = false
      void unlistenOnceListening(listening)
    }
    // A notice's fetch that would fail the same way again ends the watch.
    const onFetchFailed = (news: VaultError): void => {
      if (! isListening) { return }
      unwatch()
      onBadNews(news)
    }
    // Listen last, so a notice heard while `listen` runs finds every handler above.
    const listening = listenOrNull(listen, channelOf(scope.user_id), onNotify, onListenFailed)
    return unwatch
  }
  // --

  // == [Hearing]: #heardOrNull

  /** Return the rows a notice carried, or fetch them now if it carried none.
   * Returns null if that fetch fails, and hands `onFailed` its refusal where a retry would not mend it.
   */
  async #heardOrNull({ heard, gatelabel, vaultlabel, bank_tok, vault_tok, boxlabel, ...scope }: Told, onFailed: (news: VaultError) => void): Promise<BX.Heard | null> {
    if (heard !== undefined) { return heard }
    try {
      if ((vaultlabel !== undefined) && (bank_tok !== undefined) && (vault_tok !== undefined) && (boxlabel !== undefined)) {
        const { parent, box } = await this.#fetchBox({ ...scope, vaultlabel, bank_tok, vault_tok, boxlabel })
        return { row: box, parent }
      }
      if (vaultlabel !== undefined) {
        const { bank, vault } = await this.#fetchVault({ ...scope, vaultlabel })
        return { row: vault, parent: bank }
      }
      if (gatelabel !== undefined) {
        const { bank, gate } = await this.#fetchGate({ ...scope, gatelabel })
        return { row: gate, parent: bank }
      }
      const { bank } = await this.#fetchBank(scope)
      return { row: bank }
    } catch (err) {
      // A notice is only a hint: if its rows cannot be fetched for now, drop it.
      const refusal = refusalOf(err)
      if (! DB.isVaultError(refusal, 'storage_unavailable')) { onFailed(refusal) }
      return null
    }
  }
  // --
}

// == [Listening]: listenOrNull, unlistenOnceListening

/** Start listening and return the function that stops it. If listening fails, tell `onFailed` and return null. */
export async function listenOrNull(listen: PostgresListen, channel: string, onNotify: (text: string) => void, onFailed: (news: VaultError) => void): Promise<(() => unknown) | null> {
  try {
    return await listen(channel, onNotify)
  } catch (err) {
    onFailed(refusalOf(err))
    return null
  }
}

/** Stop listening once `listening` has started, ignoring a failure to stop. */
export async function unlistenOnceListening(listening: Promise<(() => unknown) | null>): Promise<void> {
  const unlisten = await listening
  try {
    await unlisten?.()
  } catch {
    // the watch already ignores notices, so a failed unlisten changes nothing
  }
}
// --

// == [Rows and asks]: rowsFrom, isBirth, mayReplace

async function rowsFrom(queryable: PostgresQueryable, text: string, params: unknown[]): Promise<unknown[]> {
  const { rows } = await queryable.query(text, params)
  return rows
}

/** True if a put expects no stored row, so its record is the first. */
function isBirth({ expected }: BX.BoxPutAsk | BX.VaultPutAsk): boolean {
  return expected.revision_seq === DB.VoidRevisionSeq
}

// The classifier reads `ifPresent` over a stored live row and `ifAbsent` over a tombstone or no row, and finds a write only
// when the stored row is the expected row. So only the option for the expected row can let this put write.
/** True if the put's options let it put its record over the row it expects:
 * - no row or a tombstone, under `ifAbsent: 'add'`
 * - a live row, under `ifPresent: 'repl'`
 */
function mayReplace(ask: BX.BoxPutAsk | BX.VaultPutAsk): boolean {
  const expectsLive = (! isBirth(ask)) && (ask.expected.am === 'a')
  return expectsLive ? (ask.ifPresent === 'repl') : (ask.ifAbsent === 'add')
}
// --
