/** A bankDB adapter that stores its rows in Postgres. */

import * as DB from 'safebyok-big/storage'
import type { Awaitable, BankScope, BoxTidyAsk, Capacity, Tidied, VaultError, VaultScope, WatchScope } from 'safebyok-big/storage'
import { BX } from 'safebyok-big/storage'
import {
  BirthBankSql, BirthBoxSql, BirthVaultSql, CountBoxesSql, DeleteEndedBoxesSql, DeleteEndedVaultsSql, EnsureBankSql, GetBankSql, GetBoxWithVaultSql,
  GetGateWithBankSql, GetVaultWithBankSql, ListBoxesWithVaultSql, PutGateSql, ReviseBankSql, ReviseBoxSql, ReviseVaultSql,
} from './bank-queries'

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
}), 'bad_option')
// --

// == [Notices]: bankChannelOf, channelOf, Told, toldOf

const bankChannelOfArgs = DB.Checker(({ user_id }) => user_id, 'bad_option')

/** Return the notification channel for `user_id`'s writes: the channel a `PostgresListen` subscribes to. */
export function bankChannelOf(user_id: string): string { return channelOf(bankChannelOfArgs.parse(user_id, { where: 'bankChannelOf' })) }

// Postgres identifiers are at most 63 bytes. A user_id whose channel name is longer cannot be notified, so a write that would send a notice for it fails.
/** The notification channel for `user_id`. */
function channelOf(user_id: string): string { return `safebyok_${user_id}` }

// Each notice comes from `safebyok_tell` in `bank-functions.ts`: a JSON object with the stored row's address under `at`,
// the row under `row` and the row above it under `parent`, whichever fit. A box row's address carries its vault's life.

/** A parsed notice: the stored row's address, and the rows that fit the byte-size limit. */
type Told = BankScope & {
  gatelabel?:  string | undefined
  vaultlabel?: string | undefined
  bank_tok?:   string | undefined
  vault_tok?:  string | undefined
  boxlabel?:   string | undefined
  heard?:      BX.Heard | undefined
}

const toldWhere = DB.objCheck(({ user_id, banklabel, str }) => ({
  user_id, banklabel, gatelabel: str.optional(), vaultlabel: str.optional(), bank_tok: str.optional(), vault_tok: str.optional(), boxlabel: str.optional(),
}), { refusalkind: 'bad_record', extras: 'strip' })

/** Parse a notification's text into a {@link Told}, or return null if it is not one of our notices. */
function toldOf(text: string): Told | null {
  const sent = jsonOrNull(text) as { at?: unknown, row?: unknown, parent?: unknown } | null
  const where = toldWhere.safeParse(sent?.at)
  if ((sent === null) || (! where.success)) { return null }
  const { row, parent } = sent
  if (row === undefined) { return where.data }
  return { ...where.data, heard: (parent === undefined) ? { row } : { row, parent } }
}

function jsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch { return null }
}

// A bank or gate row has no vaultlabel, so only a watch of the whole bank hears it.
function isHeardIn(scope: WatchScope, told: Told): boolean {
  return (scope.user_id === told.user_id) && (scope.banklabel === told.banklabel) && ((scope.vaultlabel ?? told.vaultlabel) === told.vaultlabel)
}
// --

// == [Refusals]: refusalOf, causeOf, codeOf

/** The VaultError for `thrown`: `unexpected_error` for a setup fault (SQLSTATE class 42), else `storage_unavailable`. */
function refusalOf(thrown: unknown): VaultError {
  if (DB.isVaultError(thrown)) { return thrown }
  if (codeOf(thrown)?.startsWith('42')) { return DB.unexpectedError(causeOf(thrown)) }
  return DB.storageUnavailable(causeOf(thrown))
}

// A driver's error can include the statement's parameters, which may include a row. Keep only its message and code.
function causeOf(thrown: unknown): Error {
  const code = codeOf(thrown)
  return Object.assign(new Error(DB.sanitizeForeignError(thrown).message), (code === undefined) ? {} : { code })
}

function codeOf(thrown: unknown): string | undefined {
  return ((typeof thrown === 'object') && (thrown !== null) && ('code' in thrown) && (typeof thrown.code === 'string')) ? thrown.code : undefined
}
// --

// == [What the database returns]: Verdict, GateAnswered, BankAnswered, VaultAnswered, BoxAnswered, storedVerdict, parentVaultRow, RowOfOtherAddress, StoredNothing
// A fetch returns rows alone. A write function also returns whether it stored the record (`ok`), and if it did,
// the `act` and the `presence` of what was stored before.

/** A write function's verdict, unchecked. */
type Verdict = { ok?: boolean, act?: unknown, presence?: unknown }

/** The database's result for a `buildBank` ask or a gate verb's, unchecked: the bank row, its gate row, and a write function's verdict. */
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

const StoredNothing = 'The database stored nothing for a write its rows allow.'
// --

/** A bankDB that stores its rows in your Postgres: `new PostgresBankDB({ client: pgClientOf(pool) })`. */
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
    const stored = this.classifyStoredVault(ask, answered)
    if ((! answered.ok) && BX.isWriteAct(stored.act)) { throw DB.unexpectedError(new Error(StoredNothing)) }
    return stored
  }

  /** Run a box's write function `text` for the ask's record and the row it expects. */
  async #writeBox(ask: BX.BoxPutAsk | BX.BoxDelAsk, text: string): Promise<BX.BoxStored> {
    const answered = await this.#firstRow<BoxAnswered>(text, [JSON.stringify(ask.record), JSON.stringify(ask.expected), this.#maxBoxes])
    const stored = this.classifyStoredBox(ask, answered)
    if ((! answered.ok) && BX.isWriteAct(stored.act)) { throw DB.unexpectedError(new Error(StoredNothing)) }
    return stored
  }
  // --

  // == [Classifying]: classifyBuildBank, classifyStoredGate, classifyDelBank, classifyStoredVault, classifyStoredBox
  // A write function checks an ask and stores its record in one call. When it stored the record, its result is checked and returned
  // without classifying, with the row written as the database returned it. When it stored nothing, or the ask is a get, the core's classifier classifies the ask against the rows returned.
  // If the classifier finds a write when the function stored nothing, that is a fault, thrown where the function was called.

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

  // A buildBank over a live bank stores nothing, and is classified against the rows the function returns.
  protected async doBuildBank(ask: BX.BankBuildAsk): Promise<BX.BankBuildStored> {
    const text     = (ask.expected.revision_seq === DB.VoidRevisionSeq) ? BirthBankSql : ReviseBankSql
    const answered = await this.#firstRow<GateAnswered>(text, [JSON.stringify(ask.record), JSON.stringify(ask.gate), JSON.stringify(ask.expected)])
    const stored   = this.classifyBuildBank(ask, answered)
    if ((! answered.ok) && BX.isWriteAct(stored.act)) { throw DB.unexpectedError(new Error(StoredNothing)) }
    return stored
  }

  // The function checks the bank row as it stores, so a gate verb always calls it: when nothing is stored, the
  // classifier answers from the rows it returns.
  protected async doPutGate(ask: BX.GatePutAsk): Promise<BX.GateStored> {
    const answered = await this.#firstRow<GateAnswered>(PutGateSql, [JSON.stringify(ask.record), JSON.stringify(ask.expected)])
    const stored   = this.classifyStoredGate(ask, answered)
    if ((! answered.ok) && BX.isWriteAct(stored.act)) { throw DB.unexpectedError(new Error(StoredNothing)) }
    return stored
  }

  protected async doDelBank(ask: BX.BankDelAsk): Promise<BX.BankDelStored> {
    if (ask.expected.am !== 'a') {
      const fetched = await this.#fetchBank(ask)
      return this.classifyDelBank(ask, fetched)
    }
    const answered = await this.#firstRow<BankAnswered>(ReviseBankSql, [JSON.stringify(ask.record), null, JSON.stringify(ask.expected)])
    const stored   = this.classifyDelBank(ask, answered)
    if ((! answered.ok) && BX.isWriteAct(stored.act)) { throw DB.unexpectedError(new Error(StoredNothing)) }
    return stored
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
      const heard = await this.#heardOrNull(told)
      if ((heard !== null) && isListening) { hear(heard) }
    }
    // A listen that fails ends the watch before it heard anything.
    const onListenFailed = (news: VaultError): void => {
      if (! isListening) { return }
      isListening = false
      onBadNews(news)
    }
    const listening = listenOrNull(listen, channelOf(scope.user_id), onNotify, onListenFailed)
    return () => {
      if (! isListening) { return }
      isListening = false
      void unlistenOnceListening(listening)
    }
  }
  // --

  // == [Hearing]: #heardOrNull

  /** Return the rows a notice carried, or fetch them now if it carried none. Returns null if that fetch fails. */
  async #heardOrNull({ heard, gatelabel, vaultlabel, bank_tok, vault_tok, boxlabel, ...scope }: Told): Promise<BX.Heard | null> {
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
    } catch {
      return null  // a notice is only a hint: if its rows cannot be fetched, drop it
    }
  }
  // --
}

// == [Listening]: listenOrNull, unlistenOnceListening

/** Start listening and return the function that stops it. If listening fails, tell `onFailed` and return null. */
async function listenOrNull(listen: PostgresListen, channel: string, onNotify: (text: string) => void, onFailed: (news: VaultError) => void): Promise<(() => unknown) | null> {
  try {
    return await listen(channel, onNotify)
  } catch (err) {
    onFailed(refusalOf(err))
    return null
  }
}

async function unlistenOnceListening(listening: Promise<(() => unknown) | null>): Promise<void> {
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
// when the stored row is the expected row. So only the option for the expected row can let this put store.
/** True if the put's options let it store its record over the row it expects:
 * - no row or a tombstone, under `ifAbsent: 'add'`
 * - a live row, under `ifPresent: 'repl'`
 */
function mayReplace(ask: BX.BoxPutAsk | BX.VaultPutAsk): boolean {
  const expectsLive = (! isBirth(ask)) && (ask.expected.am === 'a')
  return expectsLive ? (ask.ifPresent === 'repl') : (ask.ifAbsent === 'add')
}
// --
