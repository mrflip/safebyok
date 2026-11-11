/** A vaultDB adapter that stores its rows in Postgres. */

import * as DB from 'safebyok/storage'
import type {
  AdapterVaultDBOpts, Awaitable, BankScope, BoxAsk, BoxClassified, BoxDelAsk, BoxesFetched, BoxFetched, BoxGetAsk, BoxPutAsk, BoxQuery, Capacity, Heard,
  RowOfVault, Tidied, VaultAsk, VaultClassified, VaultDelAsk, VaultError, VaultFetched, VaultGetAsk, VaultPutAsk, VaultQuery, VaultScope, WatchScope,
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
 * - `maxBoxes` -- soft cap on the live boxes in one vault (default: `DefaultMaxBoxes`)
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

const vaultChannelOfInput = DB.Checker(({ user_id }) => user_id, 'bad_option')

/** Return the notification channel for `user_id`'s writes: the channel a `PostgresListen` subscribes to. */
export const vaultChannelOf = (user_id: string): string => channelOf(vaultChannelOfInput.parse(user_id, { where: 'vaultChannelOf' }))

// Postgres identifiers are at most 63 bytes. A user_id whose channel name is longer cannot be notified, so a write that would send a notice for it fails.
/** The notification channel for `user_id`. */
const channelOf = (user_id: string): string => `safebyok_${user_id}`

// The database sends each notice, from `safebyok_tell` in `vault-functions.ts`: one JSON object, with the address of the row
// stored under `at`, and under `vault` and `box` the rows it had room for.

/** A parsed notice: the address of the row stored, plus the rows the notice had room for. */
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

const jsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch { return null }
}

const isHeardIn = (scope: WatchScope, told: Told): boolean => (
  (scope.applabel === told.applabel) && (scope.user_id === told.user_id) && ((scope.vaultlabel ?? told.vaultlabel) === told.vaultlabel)
)
// --

// == [Refusals]: refusalOf, causeOf, codeOf

/** Convert a thrown value to a VaultError: a setup fault (SQLSTATE class 42) is an unexpected error, anything else is storage unavailable. */
const refusalOf = (thrown: unknown): VaultError => {
  if (DB.isVaultError(thrown)) { return thrown }
  if (codeOf(thrown)?.startsWith('42')) { return DB.unexpectedError(causeOf(thrown)) }
  return DB.storageUnavailable(causeOf(thrown))
}

// A driver's error can include the statement's parameters, which may include a row. Keep only its message and code.
const causeOf = (thrown: unknown): Error => {
  const code = codeOf(thrown)
  return Object.assign(new Error(DB.sanitizeForeignError(thrown).message), (code === undefined) ? {} : { code })
}

const codeOf = (thrown: unknown): string | undefined => (
  ((typeof thrown === 'object') && (thrown !== null) && ('code' in thrown) && (typeof thrown.code === 'string')) ? thrown.code : undefined
)
// --

// == [What the database answers]: VaultAnswered, BoxAnswered, storedVerdict, worldRow, RowOfOtherAddress
// A plain fetch answers rows alone. A write function also answers whether it stored the record (`ok`), and where it did,
// the `act` that came to and the `presence` of what was stored before.

/** What the database answers for a vault's ask, as it comes: the vault row, and a write function's verdict. */
type VaultAnswered = VaultFetched & { ok?: boolean, act?: unknown, presence?: unknown }

/** What the database answers for a box's ask, as it comes: the vault row and the box row, and a write function's verdict and its count of the vault's live boxes. */
type BoxAnswered = BoxFetched & { ok?: boolean, act?: unknown, presence?: unknown, boxcount?: number }

const { storedVerdict } = DB.Checkers('storage_issue', ({ obj, oneof }) => ({
  storedVerdict: obj({ act: oneof(DB.writeActVals), presence: oneof(DB.presenceVals) }),
}))

const worldRow = DB.storedVaultRow.refusingAs('damaged_vault')

const RowOfOtherAddress = { kind: 'storage_issue', message: DB.rowOfOtherAddress } as const

const StoredNothing = 'The database stored nothing for a write its rows allow.'
// --

/** The vault row a one-row answer has, null for none. */
const vaultOf = (rows: unknown[]): unknown => ((rows[0] as { vault?: unknown } | undefined)?.vault ?? null)

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

  /** A box row and its vault row as `world`, null for none, read in one statement. */
  async #fetchBox({ applabel, user_id, vaultlabel, vault_tok, boxlabel }: BoxQuery): Promise<BoxFetched> {
    const [fetched] = await this.#query(GetBoxWithVaultSql, [applabel, user_id, vaultlabel, vault_tok, boxlabel]) as BoxFetched[]
    return fetched ?? { world: null, box: null }
  }

  /** A vault's room, at a count of its live boxes. */
  #roomAt(used: number): Capacity {
    return { boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }
  }

  /** Run a vault's write function `text` for the ask's record and the row it expects. */
  async #writeVault(ask: VaultPutAsk | VaultDelAsk, text: string): Promise<VaultClassified> {
    const [answer] = await this.#query(text, [JSON.stringify(ask.record), JSON.stringify(ask.expected)]) as [VaultAnswered]
    const classified = this.classifyVault(ask, answer)
    if ((! answer.ok) && DB.isWriteAct(classified.act)) { throw DB.unexpectedError(new Error(StoredNothing)) }
    return classified
  }

  /** Run a box's write function `text` for the ask's record and the row it expects. */
  async #writeBox(ask: BoxPutAsk | BoxDelAsk, text: string): Promise<BoxClassified> {
    const [answer] = await this.#query(text, [JSON.stringify(ask.record), JSON.stringify(ask.expected), this.#maxBoxes]) as [BoxAnswered]
    const classified = this.classifyBox(ask, answer)
    if ((! answer.ok) && DB.isWriteAct(classified.act)) { throw DB.unexpectedError(new Error(StoredNothing)) }
    return classified
  }
  // --

  // == [Classifying]: classifyVault, classifyBox
  // A write function tests an ask and stores its record in one call. A record it stored is the answer as it stands, once its parts are checked:
  // nothing is classified. Where it stored nothing, or the ask was only fetched for, the core's classifier names what the ask comes to over the rows answered.
  // A write the classifier names over rows the function refused to store over is a fault, thrown where the function was called.

  protected override classifyVault(ask: VaultAsk, answered: VaultAnswered): VaultClassified {
    if ((answered.ok !== true) || (ask.op === 'get')) { return super.classifyVault(ask, answered) }
    const { act, presence } = storedVerdict.parse(answered)
    const vault = DB.storedVaultRow.parseConsistent(answered.vault, { ...DB.vaultScope.parse(ask), revision_tok: ask.record.revision_tok }, RowOfOtherAddress)
    return { ok: true, act, world: vault, vault, presence }
  }

  protected override classifyBox(ask: BoxAsk, answered: BoxAnswered): BoxClassified {
    const capacity = (answered.boxcount === undefined) ? null : this.#roomAt(answered.boxcount)
    if ((answered.ok !== true) || (ask.op === 'get')) { return super.classifyBox(ask, { world: answered.world, box: answered.box, capacity }) }
    const { act, presence } = storedVerdict.parse(answered)
    const world = worldRow.parseConsistent(answered.world, DB.vaultScope.parse(ask), RowOfOtherAddress)
    const box   = DB.storedBoxRow.parseConsistent(answered.box, { ...DB.boxQuery.parse(ask), revision_tok: ask.record.revision_tok }, RowOfOtherAddress)
    return { ok: true, act, world, box, presence, capacity }
  }
  // --

  // == [Protected, the generic calls of AdapterVaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected async doListVaults({ applabel, user_id }: BankScope): Promise<RowOfVault[]> {
    return await this.#query(ListVaultsSql, [applabel, user_id]) as RowOfVault[]
  }

  protected async doGetVault(ask: VaultGetAsk): Promise<VaultClassified> {
    return this.classifyVault(ask, await this.#fetchVault(ask))
  }

  protected async doListBoxes({ applabel, user_id, vaultlabel, vault_tok }: VaultQuery): Promise<BoxesFetched> {
    const [fetched] = await this.#query(ListBoxesWithVaultSql, [applabel, user_id, vaultlabel, vault_tok]) as BoxesFetched[]
    return fetched ?? { vault: null, boxes: [] }
  }

  protected async doGetBox(ask: BoxGetAsk): Promise<BoxClassified> {
    return this.classifyBox(ask, await this.#fetchBox(ask))
  }

  // A put or del calls the function that can store its record over the row it expects. An ask whose policy lets it store
  // nothing over that row is only classified, over the rows as fetched: whatever is stored, the classifier names no write for it.
  protected async doPutVault(ask: VaultPutAsk): Promise<VaultClassified> {
    if (! mayReplace(ask)) { return this.classifyVault(ask, await this.#fetchVault(ask)) }
    if (ask.gateVerb !== undefined) { return await this.#putGateVerb(ask) }
    return await this.#writeVault(ask, isBirth(ask) ? BirthVaultSql : ReviseVaultSql)
  }

  // A gate verb's tests read the gate of the row stored, and the classifier makes them. So its put is classified first, over
  // the row fetched. Where that names a write, the function stores the record only over that same revision of the row:
  // the row tested is the row replaced, or nothing is stored and the ask is classified again over the row as it now stands.
  async #putGateVerb(ask: VaultPutAsk): Promise<VaultClassified> {
    const classified = this.classifyVault(ask, await this.#fetchVault(ask))
    if (! DB.isWriteAct(classified.act)) { return classified }
    return await this.#writeVault(ask, ReviseVaultSql)
  }

  protected async doPutBox(ask: BoxPutAsk): Promise<BoxClassified> {
    if (! mayReplace(ask)) { return this.classifyBox(ask, await this.#fetchBox(ask)) }
    return await this.#writeBox(ask, isBirth(ask) ? BirthBoxSql : ReviseBoxSql)
  }

  protected async doDelVault(ask: VaultDelAsk): Promise<VaultClassified> {
    if (ask.expected.am !== 'a') { return this.classifyVault(ask, await this.#fetchVault(ask)) }
    return await this.#writeVault(ask, ReviseVaultSql)
  }

  protected async doDelBox(ask: BoxDelAsk): Promise<BoxClassified> {
    if (ask.expected.am !== 'a') { return this.classifyBox(ask, await this.#fetchBox(ask)) }
    return await this.#writeBox(ask, ReviseBoxSql)
  }

  protected async doTidyGone({ applabel, user_id }: BankScope): Promise<Tidied> {
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
    let isHeeding = true
    const onNotify = (text: string): void => {
      const told = toldOf(text)
      if ((told === null) || (! isHeeding) || (! isHeardIn(scope, told))) { return }
      void hearTold(told)
    }
    const hearTold = async (told: Told): Promise<void> => {
      const heard = await this.#heardOrNull(told)
      if ((heard !== null) && isHeeding) { hear(heard) }
    }
    // A listen that fails ends the watch before it heard anything.
    const onListenFailed = (news: VaultError): void => {
      if (! isHeeding) { return }
      isHeeding = false
      onBadNews(news)
    }
    const listening = listenOrNull(listen, channelOf(scope.user_id), onNotify, onListenFailed)
    return () => {
      if (! isHeeding) { return }
      isHeeding = false
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

/** Start listening and return the function that stops it; null, telling `onFailed`, where listening failed. */
const listenOrNull = async (listen: PostgresListen, channel: string, onNotify: (text: string) => void, onFailed: (news: VaultError) => void): Promise<(() => unknown) | null> => {
  try {
    return await listen(channel, onNotify)
  } catch (err) {
    onFailed(refusalOf(err))
    return null
  }
}

const unlistenOnceListening = async (listening: Promise<(() => unknown) | null>): Promise<void> => {
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


/** True where a put expects no row stored, so its record is a first one. */
function isBirth({ expected }: BoxPutAsk | VaultPutAsk): boolean {
  return expected.revision_seq === DB.VoidRevisionSeq
}

// The classifier reads `ifPresent` over a live row stored and `ifAbsent` over a tombstone or none, and names a write only where
// the row stored is the row expected. So the policy that could let this put store is the one for the row it expects.
/** True where a put's policies let it store its record over the row it expects: over none or a tombstone under `ifAbsent: 'add'`, over a live row under `ifPresent: 'repl'`. */
function mayReplace(ask: BoxPutAsk | VaultPutAsk): boolean {
  const expectsLive = (! isBirth(ask)) && (ask.expected.am === 'a')
  return expectsLive ? (ask.ifPresent === 'repl') : (ask.ifAbsent === 'add')
}
// --
