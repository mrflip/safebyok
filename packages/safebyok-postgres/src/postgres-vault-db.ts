/** A vaultDB adapter that stores its rows in Postgres. */

import * as DB from 'safebyok/storage'
import type {
  AdapterVaultDBOpts, Awaitable, BoxAsk, BoxDelAsk, BoxesFetched, BoxesStored, BoxFetched, BoxGetAsk, BoxListAsk, BoxPutAsk, BoxTidyAsk, BoxQuery, BoxStored, Capacity, Heard,
  RowOfVault, Tidied, VaultAsk, VaultDelAsk, VaultError, VaultFetched, VaultGetAsk, VaultListAsk, VaultPutAsk, VaultScope, VaultsStored, VaultStored, WatchScope,
} from 'safebyok/storage'
import {
  BirthBoxSql, BirthVaultSql, BoxLivesSql, DeleteBoxLifeSql, GetBoxWithVaultSql, GetVaultSql, ListBoxesWithVaultSql, ListVaultsSql, ReviseBoxSql, ReviseVaultSql,
} from './vault-queries'

// == [The driver]: PostgresQueryable, PostgresClient, PostgresListen, PostgresVaultDBOpts

/** A pool or connection that runs one parameterized statement and returns its rows. */
export type PostgresQueryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

/** A {@link PostgresQueryable} that also runs `work` as one transaction: a PGlite, or `pgClientOf(pool)`. */
export type PostgresClient = PostgresQueryable & { transaction: <ValT>(work: (tx: PostgresQueryable) => Promise<ValT>) => Promise<ValT> }

/** A host's LISTEN: calls `onNotify` with the text of each notification on `channel`, and returns a function that stops listening. */
export type PostgresListen = (channel: string, onNotify: (text: string) => void) => Awaitable<() => unknown>

/** Options for `new PostgresVaultDB(opts)`, in addition to {@link AdapterVaultDBOpts}:
 * - `client`   -- runs the queries and transactions
 * - `listen`   -- subscribes to Postgres notifications, so `watch` hears other devices' writes; without it, `watch` hears nothing
 * - `maxBoxes` -- soft cap on the box rows of one vault life, live and deleted together (default: `DefaultMaxBoxes`)
 */
export type PostgresVaultDBOpts = Readonly<AdapterVaultDBOpts & { client: PostgresClient, listen?: PostgresListen, maxBoxes?: number }>

const isPostgresClient = (candidate: unknown): candidate is PostgresClient => (
  (typeof candidate === 'object') && (candidate !== null)
  && ('query' in candidate) && (typeof candidate.query === 'function')
  && ('transaction' in candidate) && (typeof candidate.transaction === 'function')
)

// `custom` and `fn` return the same client and listen objects they were given, so the driver's methods keep their `this`.
const postgresVaultDBOpts = DB.objCheck(({ custom, fn, int }) => ({
  ...DB.adapterVaultDBOpts.shape,
  client:   custom<PostgresClient>(isPostgresClient, 'Expected a client with query and transaction functions'),
  listen:   fn<PostgresListen>().optional(),
  maxBoxes: int.positive().optional(),
}), 'bad_option')
// --

// == [Notices]: vaultChannelOf, channelOf, Told, toldOf

const vaultChannelOfArgs = DB.Checker(({ user_id }) => user_id, 'bad_option')

/** Return the notification channel for `user_id`'s writes: the channel a `PostgresListen` subscribes to. */
export function vaultChannelOf(user_id: string): string { return channelOf(vaultChannelOfArgs.parse(user_id, { where: 'vaultChannelOf' })) }

// Postgres identifiers are at most 63 bytes. A user_id whose channel name is longer cannot be notified, so a write that would send a notice for it fails.
/** The notification channel for `user_id`. */
function channelOf(user_id: string): string { return `safebyok_${user_id}` }

// Each notice comes from `safebyok_tell` in `vault-functions.ts`: a JSON object with the stored row's address under `at`,
// and under `vault` and `box` whichever rows fit.

/** A parsed notice: the stored row's address, and the rows that fit the byte-size limit. */
type Told = VaultScope & { vault_tok?: string | undefined, boxlabel?: string | undefined, heard?: Heard | undefined }

const toldWhere = DB.objCheck(({ applabel, user_id, vaultlabel, str }) => ({
  applabel, user_id, vaultlabel, vault_tok: str.optional(), boxlabel: str.optional(),
}), { refusalkind: 'bad_record', extras: 'strip' })

/** Parse a notification's text into a {@link Told}, or return null if it is not one of our notices. */
function toldOf(text: string): Told | null {
  const sent = jsonOrNull(text) as { at?: unknown, vault?: unknown, box?: unknown } | null
  const where = toldWhere.safeParse(sent?.at)
  if ((sent === null) || (! where.success)) { return null }
  const { vault, box } = sent
  if ((vault === undefined) && (box === undefined)) { return where.data }
  return { ...where.data, heard: { vault, box } }
}

function jsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch { return null }
}

function isHeardIn(scope: WatchScope, told: Told): boolean {
  return (scope.applabel === told.applabel) && (scope.user_id === told.user_id) && ((scope.vaultlabel ?? told.vaultlabel) === told.vaultlabel)
}
// --

// == [Refusals]: refusalOf, causeOf, codeOf

/** Convert a thrown value to a VaultError: a setup fault (SQLSTATE class 42) is an unexpected error, anything else is storage unavailable. */
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

// == [What the database returns]: VaultAnswered, BoxAnswered, storedVerdict, worldRow, RowOfOtherAddress
// A fetch returns rows alone. A write function also returns whether it stored the record (`ok`), and if it did,
// the `act` and the `presence` of what was stored before.

/** The database's result for a vault request, unchecked: the vault row, and a write function's verdict. */
type VaultAnswered = VaultFetched & { ok?: boolean, act?: unknown, presence?: unknown }

/** The database's result for a box request, unchecked: the vault row, the box row, a write function's verdict, and for a birth the vault life's count of box rows. */
type BoxAnswered = BoxFetched & { ok?: boolean, act?: unknown, presence?: unknown, boxcount?: number }

const { storedVerdict } = DB.Checkers('storage_issue', ({ obj, oneof }) => ({
  storedVerdict: obj({ act: oneof(DB.writeActVals), presence: oneof(DB.presenceVals) }),
}))

const worldRow = DB.storedVaultRow.refusingAs('damaged_vault')

const RowOfOtherAddress = { kind: 'storage_issue', message: DB.rowOfOtherAddress } as const

const StoredNothing = 'The database stored nothing for a write its rows allow.'
// --

/** The vault row in a one-row result, or null for none. */
function vaultOf(rows: unknown[]): unknown { return ((rows[0] as { vault?: unknown } | undefined)?.vault ?? null) }

/** A vaultDB that stores its rows in your Postgres: `new PostgresVaultDB({ client: pgClientOf(pool) })`. */
export class PostgresVaultDB extends DB.AdapterVaultDB {
  // == [Props]: #client, #listen, #maxBoxes

  readonly #client: PostgresClient
  readonly #listen: PostgresListen | undefined
  readonly #maxBoxes: number
  // --

  // == [Construction]: constructor

  constructor(opts: PostgresVaultDBOpts) {
    const { client, listen, maxBoxes = DB.DefaultMaxBoxes, ...adapterVaultDBOpts } = postgresVaultDBOpts.parse(opts)
    super(adapterVaultDBOpts)
    this.#client = client
    this.#listen = listen
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Statements]: #query, #transact, #fetchVault, #fetchBox, #roomAt, #writeVault, #writeBox

  async #query(text: string, params: unknown[]): Promise<unknown[]> {
    try {
      return await rowsFrom(this.#client, text, params)
    } catch (err) { throw refusalOf(err) }
  }

  async #transact<ValT>(work: (tx: PostgresQueryable) => Promise<ValT>): Promise<ValT> {
    try {
      return await this.#client.transaction(work)
    } catch (err) { throw refusalOf(err) }
  }

  /** The vault row stored at a scope, null for none. */
  async #fetchVault({ applabel, user_id, vaultlabel }: VaultScope): Promise<VaultFetched> {
    return { vault: vaultOf(await this.#query(GetVaultSql, [applabel, user_id, vaultlabel])) }
  }

  /** A box row and its vault row as `world`, each null for none, fetched in one statement. */
  async #fetchBox({ applabel, user_id, vaultlabel, vault_tok, boxlabel }: BoxQuery): Promise<BoxFetched> {
    const [fetched] = await this.#query(GetBoxWithVaultSql, [applabel, user_id, vaultlabel, vault_tok, boxlabel]) as BoxFetched[]
    return fetched ?? { world: null, box: null }
  }

  /** The capacity of a vault life with `used` box rows, live and deleted. */
  #roomAt(used: number): Capacity {
    return { boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }
  }

  /** Run a vault's write function `text` for the ask's record and the row it expects. */
  async #writeVault(ask: VaultPutAsk | VaultDelAsk, text: string): Promise<VaultStored> {
    const [answered] = await this.#query(text, [JSON.stringify(ask.record), JSON.stringify(ask.expected)]) as [VaultAnswered]
    const stored = this.classifyStoredVault(ask, answered)
    if ((! answered.ok) && DB.isWriteAct(stored.act)) { throw DB.unexpectedError(new Error(StoredNothing)) }
    return stored
  }

  /** Run a box's write function `text` for the ask's record and the row it expects. */
  async #writeBox(ask: BoxPutAsk | BoxDelAsk, text: string): Promise<BoxStored> {
    const [answered] = await this.#query(text, [JSON.stringify(ask.record), JSON.stringify(ask.expected), this.#maxBoxes]) as [BoxAnswered]
    const stored = this.classifyStoredBox(ask, answered)
    if ((! answered.ok) && DB.isWriteAct(stored.act)) { throw DB.unexpectedError(new Error(StoredNothing)) }
    return stored
  }
  // --

  // == [Classifying]: classifyStoredVault, classifyStoredBox
  // A write function checks an ask and stores its record in one call. When it stored the record, its result is checked and returned
  // without classifying. When it stored nothing, or the ask is a get, the core's classifier classifies the ask against the rows returned.
  // If the classifier finds a write when the function stored nothing, that is a fault, thrown by `#writeVault` or `#writeBox`.

  protected override classifyStoredVault(ask: VaultAsk, answered: VaultAnswered): VaultStored {
    if ((answered.ok !== true) || (ask.op === 'get')) { return super.classifyStoredVault(ask, answered) }
    const { act, presence } = storedVerdict.parse(answered)
    const vault = DB.storedVaultRow.parseConsistent(answered.vault, { ...DB.vaultScope.parse(ask), revision_tok: ask.record.revision_tok }, RowOfOtherAddress)
    return { ok: true, act, world: vault, vault, presence }
  }

  protected override classifyStoredBox(ask: BoxAsk, answered: BoxAnswered): BoxStored {
    const capacity = (answered.boxcount === undefined) ? null : this.#roomAt(answered.boxcount)
    if ((answered.ok !== true) || (ask.op === 'get')) { return super.classifyStoredBox(ask, { world: answered.world, box: answered.box, capacity }) }
    const { act, presence } = storedVerdict.parse(answered)
    const world = worldRow.parseConsistent(answered.world, DB.vaultScope.parse(ask), RowOfOtherAddress)
    const box   = DB.storedBoxRow.parseConsistent(answered.box, { ...DB.boxQuery.parse(ask), revision_tok: ask.record.revision_tok }, RowOfOtherAddress)
    return { ok: true, act, world, box, presence, capacity }
  }
  // --

  // == [Protected, the generic calls of AdapterVaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected async doListVaults(ask: VaultListAsk): Promise<VaultsStored> {
    const vaults = await this.#query(ListVaultsSql, [ask.applabel, ask.user_id]) as RowOfVault[]
    return this.classifyStoredVaults(ask, vaults)
  }

  protected async doGetVault(ask: VaultGetAsk): Promise<VaultStored> {
    const fetched = await this.#fetchVault(ask)
    return this.classifyStoredVault(ask, fetched)
  }

  protected async doListBoxes(ask: BoxListAsk): Promise<BoxesStored> {
    const { applabel, user_id, vaultlabel, vault_tok } = ask
    const [fetched] = await this.#query(ListBoxesWithVaultSql, [applabel, user_id, vaultlabel, vault_tok]) as BoxesFetched[]
    return this.classifyStoredBoxes(ask, fetched ?? { world: null, boxes: [] })
  }

  protected async doGetBox(ask: BoxGetAsk): Promise<BoxStored> {
    const fetched = await this.#fetchBox(ask)
    return this.classifyStoredBox(ask, fetched)
  }

  // A put or del calls the write function for the row it expects. A put whose options allow no write over that row is only
  // classified against the rows fetched: whatever is stored, the classifier finds no write for it.
  protected async doPutVault(ask: VaultPutAsk): Promise<VaultStored> {
    if (! mayReplace(ask)) {
      const fetched = await this.#fetchVault(ask)
      return this.classifyStoredVault(ask, fetched)
    }
    if (ask.gateVerb !== undefined) { return await this.#putGateVerb(ask) }
    return await this.#writeVault(ask, isBirth(ask) ? BirthVaultSql : ReviseVaultSql)
  }

  // The classifier runs a gate verb's checks, which read the stored row's gate, so its put is classified first, against the
  // fetched row. If that finds a write, the function stores the record only over that same revision of the row. Either the
  // row checked is the row replaced, or nothing is stored and the ask is classified again against the row as it now stands.
  async #putGateVerb(ask: VaultPutAsk): Promise<VaultStored> {
    const fetched = await this.#fetchVault(ask)
    const stored  = this.classifyStoredVault(ask, fetched)
    if (! DB.isWriteAct(stored.act)) { return stored }
    return await this.#writeVault(ask, ReviseVaultSql)
  }

  protected async doPutBox(ask: BoxPutAsk): Promise<BoxStored> {
    if (! mayReplace(ask)) {
      const fetched = await this.#fetchBox(ask)
      return this.classifyStoredBox(ask, fetched)
    }
    return await this.#writeBox(ask, isBirth(ask) ? BirthBoxSql : ReviseBoxSql)
  }

  protected async doDelVault(ask: VaultDelAsk): Promise<VaultStored> {
    if (ask.expected.am !== 'a') {
      const fetched = await this.#fetchVault(ask)
      return this.classifyStoredVault(ask, fetched)
    }
    return await this.#writeVault(ask, ReviseVaultSql)
  }

  protected async doDelBox(ask: BoxDelAsk): Promise<BoxStored> {
    if (ask.expected.am !== 'a') {
      const fetched = await this.#fetchBox(ask)
      return this.classifyStoredBox(ask, fetched)
    }
    return await this.#writeBox(ask, ReviseBoxSql)
  }

  protected async doTidyGone({ applabel, user_id }: BoxTidyAsk): Promise<Tidied> {
    return await this.#transact(async (tx) => {
      /** The number of box rows stored for one vault life. */
      type BoxLife = { vaultlabel: string, vault_tok: string, boxcount: number }

      // Query the box lives before the vaults. Each statement reads its own snapshot, so a vault row read second is at least as new as the boxes counted first.
      const lives = await rowsFrom(tx, BoxLivesSql, [applabel, user_id]) as BoxLife[]
      const vaultrows = await rowsFrom(tx, ListVaultsSql, [applabel, user_id]) as RowOfVault[]
      const vaults = new Map(vaultrows.map(({ vaultlabel, vault }) => [vaultlabel, vault]))
      let totalCount = 0
      for (const { vaultlabel, vault_tok, boxcount } of lives) {
        if (DB.isLifeOver(vaults.get(vaultlabel) ?? null, vault_tok)) {
          await tx.query(DeleteBoxLifeSql, [applabel, user_id, vaultlabel, vault_tok])
        } else { totalCount += boxcount }
      }
      return { totalCount }
    })
  }

  protected override doWatch(scope: WatchScope, hear: (heard: Heard) => void, onBadNews: (news: VaultError) => void): () => void {
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
  async #heardOrNull({ heard, vault_tok, boxlabel, ...scope }: Told): Promise<Heard | null> {
    if (heard !== undefined) { return heard }
    try {
      if ((vault_tok === undefined) || (boxlabel === undefined)) { return await this.#fetchVault(scope) }
      const { world, box } = await this.#fetchBox({ ...scope, vault_tok, boxlabel })
      return { vault: world, box }
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
function isBirth({ expected }: BoxPutAsk | VaultPutAsk): boolean {
  return expected.revision_seq === DB.VoidRevisionSeq
}

// The classifier reads `ifPresent` over a stored live row and `ifAbsent` over a tombstone or no row, and finds a write only
// when the stored row is the expected row. So only the option for the expected row can let this put store.
/** True if the put's options let it store its record over the row it expects:
 * - no row or a tombstone, under `ifAbsent: 'add'`
 * - a live row, under `ifPresent: 'repl'`
 */
function mayReplace(ask: BoxPutAsk | VaultPutAsk): boolean {
  const expectsLive = (! isBirth(ask)) && (ask.expected.am === 'a')
  return expectsLive ? (ask.ifPresent === 'repl') : (ask.ifAbsent === 'add')
}
// --
