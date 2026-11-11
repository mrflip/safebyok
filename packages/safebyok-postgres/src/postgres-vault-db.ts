/** A vaultDB adapter that stores its rows in Postgres. */

import * as DB from 'safebyok/storage'
import type {
  AdapterVaultDBOpts, Awaitable, BankScope, BoxClassified, BoxDelAsk, BoxesFetched, BoxFetched, BoxGetAsk, BoxPutAsk, BoxQuery, BoxRecord, BoxRow, BoxTombstone, Heard,
  RowOfBox, RowOfVault, Tidied, VaultClassified, VaultDelAsk, VaultError, VaultGetAsk, VaultPutAsk, VaultQuery, VaultRecord, VaultRow, VaultScope, VaultTombstone, WatchScope,
} from 'safebyok/storage'
import {
  BirthVaultSql, BoxAndRoomSql, BoxesOfLifeSql, BoxLivesSql, DeleteBoxLifeSql, GetBoxWithVaultSql, GetVaultSql, ListBoxesWithVaultSql, ListVaultsSql, LockVaultSql, NotifySql,
  WriteBoxSql, WriteVaultSql,
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

// == [Notices]: vaultChannelOf, VaultPropFields, BoxPropFields, noticeTextOf, toldOf

const vaultChannelOfInput = DB.Checker(({ user_id }) => user_id, 'bad_option')

/** Return the notification channel for `user_id`'s writes: the channel a `PostgresListen` subscribes to. */
export const vaultChannelOf = (user_id: string): string => channelOf(vaultChannelOfInput.parse(user_id, { where: 'vaultChannelOf' }))

// Postgres identifiers are at most 63 bytes. A user_id whose channel name is longer cannot be notified, so a write that would send a notice for it fails.
/** The notification channel for `user_id`. */
const channelOf = (user_id: string): string => `safebyok_${user_id}`

// A vault notice is the vault row as stored. A box notice is one JSON array, [...vault props, ...box props], in the order of
// these lists: the vault row without its wayins, then the box row without the fields the vault props already carry.
// A box tombstone's props stop at whisper_schema_version. A ciphered field is sent as [cipher_iv_b64, ciphertext_b64].
const VaultPropFields = ['applabel', 'user_id', 'vaultlabel', 'fmt', 'am', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'vault_tok', 'gate_epoch'] as const
const BoxPropFields = ['boxlabel', 'am', 'fmt', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'box_tok', 'whisper_codec', 'whisper_schema_version', 'sidecar', 'box_key_wrapped', 'whisper_ciphered'] as const
const CipheredFields: ReadonlySet<string> = new Set(['box_key_wrapped', 'whisper_ciphered'])

// Postgres rejects a notification payload of 8000 bytes or more.
const NoticeMaxBytes = 7999

/** A parsed notice: the scope of the write, plus the written rows when the notice was small enough to carry them. */
type Told = VaultScope & { vault_tok?: string | undefined, boxlabel?: string | undefined, heard?: Heard | undefined }

const toldWhere = DB.objCheck(({ applabel, user_id, vaultlabel, str }) => ({
  applabel, user_id, vaultlabel, vault_tok: str.optional(), boxlabel: str.optional(),
}), { refusalkind: 'bad_record', extras: 'strip' })

/** Build the notification text for a vault write, or for a write of `box` in that vault.
 * A notice too large for Postgres carries only the row's address. {@link toldOf} parses it back.
 */
const noticeTextOf = (vault: VaultRow, box?: BoxRow): string => {
  const text = JSON.stringify((box === undefined) ? vault : [...vaultPropsOf(vault), ...boxPropsOf(box)])
  if (new TextEncoder().encode(text).length <= NoticeMaxBytes) { return text }
  return JSON.stringify((box === undefined) ? vaultPropsOf(vault) : [...vaultPropsOf(vault), box.boxlabel])
}

/** Parse a notification's text into a {@link Told}, or return null if it is not one of our notices. */
const toldOf = (text: string): Told | null => {
  const sent = jsonOrNull(text)
  if (! Array.isArray(sent)) {
    const where = toldWhere.safeParse(sent)
    return where.success ? { ...scopeOf(where.data), heard: { vault: sent } } : null
  }
  const props: unknown[] = sent
  const boxProps = props.slice(VaultPropFields.length)
  const where = toldWhere.safeParse({ ...fieldsOf(VaultPropFields, props), boxlabel: boxProps[0] })
  if (! where.success) { return null }
  if (boxProps.length <= 1) { return where.data }
  const box = { ...scopeOf(where.data), vault_tok: where.data.vault_tok, ...fieldsOf(BoxPropFields, boxProps) }
  return { ...where.data, heard: { box } }
}

const vaultPropsOf = (vault: VaultRow): unknown[] => {
  const fields: Record<string, unknown> = { ...vault, gate_epoch: (vault.am === 'a') ? vault.gate.gate_epoch : null }
  return VaultPropFields.map((field) => fields[field])
}

const boxPropsOf = (box: BoxRow): unknown[] => {
  const fields: Record<string, unknown> = box
  return BoxPropFields.filter((field) => fields[field] !== undefined).map((field) => {
    if (! CipheredFields.has(field)) { return fields[field] }
    const { cipher_iv_b64, ciphertext_b64 } = fields[field] as BoxRecord['whisper_ciphered']
    return [cipher_iv_b64, ciphertext_b64]
  })
}

/** Zip `props` with `fieldnames` into an object, restoring each ciphered field from its [iv, ciphertext] pair. */
const fieldsOf = (fieldnames: readonly string[], props: unknown[]): Record<string, unknown> => (
  Object.fromEntries(props.slice(0, fieldnames.length).map((prop, idx) => {
    const field = fieldnames[idx] ?? ''
    if (! (CipheredFields.has(field) && Array.isArray(prop))) { return [field, prop] }
    const [cipher_iv_b64, ciphertext_b64] = prop as unknown[]
    return [field, { cipher_iv_b64, ciphertext_b64 }]
  }))
)

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

  // == [Statements]: #query, #transact, #fetchVault, #fetchBox, #fetchForBoxWrite, #writeBox

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
  async #fetchVault({ applabel, user_id, vaultlabel }: VaultScope): Promise<unknown> {
    return vaultOf(await this.#query(GetVaultSql, [applabel, user_id, vaultlabel]))
  }

  /** A box row and its vault row, null for none, read in one statement. */
  async #fetchBox({ applabel, user_id, vaultlabel, vault_tok, boxlabel }: BoxQuery): Promise<BoxFetched> {
    const [fetched] = await this.#query(GetBoxWithVaultSql, [applabel, user_id, vaultlabel, vault_tok, boxlabel]) as BoxFetched[]
    return fetched ?? { vault: null, box: null }
  }

  // The lock is a statement of its own. A statement that waits on the lock still reads everything else as of its start,
  // and would miss the box the writer it waited for has just stored.
  /** What a box's put or del is classified over: its vault row, locked for this transaction, its box row, and the vault's room. */
  async #fetchForBoxWrite(tx: PostgresQueryable, { applabel, user_id, vaultlabel, vault_tok, boxlabel }: BoxQuery): Promise<BoxFetched> {
    const vault = await lockedVaultRowOf(tx, { applabel, user_id, vaultlabel })
    const [{ box, used }] = await rowsFrom(tx, BoxAndRoomSql, [applabel, user_id, vaultlabel, vault_tok, boxlabel]) as [{ box: unknown, used: number }]
    return { vault, box, capacity: { boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } } }
  }

  // A box's put and its del are one step here: lock the vault, fetch, classify, and store what the classifier names.
  /** One transaction of a box's put or del. */
  async #writeBox(ask: BoxPutAsk | BoxDelAsk): Promise<BoxClassified> {
    return await this.#transact(async (tx) => {
      const classified = this.classifyBox(ask, await this.#fetchForBoxWrite(tx, ask.record))
      if (classified.write !== null) {
        await writeBoxRow(tx, classified.write)
        await notify(tx, ask.record, [noticeTextOf(classified.world, classified.write)])
      }
      return classified
    })
  }
  // --

  // == [Protected, the generic calls of AdapterVaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected async doListVaults({ applabel, user_id }: BankScope): Promise<RowOfVault[]> {
    return await this.#query(ListVaultsSql, [applabel, user_id]) as RowOfVault[]
  }

  protected async doGetVault(ask: VaultGetAsk): Promise<VaultClassified> {
    return this.classifyVault(ask, { vault: await this.#fetchVault(ask) })
  }

  protected async doListBoxes({ applabel, user_id, vaultlabel, vault_tok }: VaultQuery): Promise<BoxesFetched> {
    const [fetched] = await this.#query(ListBoxesWithVaultSql, [applabel, user_id, vaultlabel, vault_tok]) as BoxesFetched[]
    return fetched ?? { vault: null, boxes: [] }
  }

  protected async doGetBox(ask: BoxGetAsk): Promise<BoxClassified> {
    return this.classifyBox(ask, await this.#fetchBox(ask))
  }

  protected async doPutVault(ask: VaultPutAsk): Promise<VaultClassified> {
    return await this.#transact(async (tx) => {
      const vault = await lockedVaultRowOf(tx, ask.record)
      const classified = this.classifyVault(ask, { vault })
      if (classified.write === null) { return classified }
      // No row was there to lock for a vault's birth, so another writer's insert may land first: the ask is then classified over the row that did.
      if (! await writeVaultRow(tx, classified.write, vault)) { return this.classifyVault(ask, { vault: await vaultRowOf(tx, ask.record) }) }
      await notify(tx, ask.record, [noticeTextOf(classified.write)])
      return classified
    })
  }

  protected async doPutBox(ask: BoxPutAsk): Promise<BoxClassified> { return await this.#writeBox(ask) }

  protected async doDelVault(ask: VaultDelAsk): Promise<VaultClassified> {
    return await this.#transact(async (tx) => {
      const vault = await lockedVaultRowOf(tx, ask.record)
      const classified = this.classifyVault(ask, { vault })
      if (classified.write === null) { return classified }
      await writeVaultRow(tx, classified.write, vault)
      const texts = [noticeTextOf(classified.write)]
      const boxes = await boxesOfLife(tx, ask.record, ask.record.vault_tok)
      for (const { box } of boxes) {
        const boxTombstone = DB.boxTombstoneOf(box, ask.record.written_at)
        if (boxTombstone === null) { continue }
        await writeBoxRow(tx, boxTombstone)
        texts.push(noticeTextOf(classified.write, boxTombstone))
      }
      await notify(tx, ask.record, texts)
      return classified
    })
  }

  protected async doDelBox(ask: BoxDelAsk): Promise<BoxClassified> { return await this.#writeBox(ask) }

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

  protected override doWatch(scope: WatchScope, hear: (heard: Heard) => void): () => void {
    const listen = this.#listen
    if (listen === undefined) { return super.doWatch(scope, hear) }
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
    const listening = listenOrNull(listen, channelOf(scope.user_id), onNotify)
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
      if ((vault_tok === undefined) || (boxlabel === undefined)) { return { vault: await this.#fetchVault(scope) } }
      return await this.#fetchBox({ ...scope, vault_tok, boxlabel })
    } catch {
      return null  // a notice is only a hint: if its rows cannot be fetched, drop it
    }
  }
  // --
}

// == [Listening]: listenOrNull, unlistenOnceListening

/** Start listening and return the function that stops it, or null if listening failed. */
const listenOrNull = async (listen: PostgresListen, channel: string, onNotify: (text: string) => void): Promise<(() => unknown) | null> => {
  try {
    return await listen(channel, onNotify)
  } catch {
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

// == [Rows in a transaction]: rowsFrom, scopeOf, vaultRowOf, lockedVaultRowOf, writeVaultRow, boxesOfLife, writeBoxRow, notify

const rowsFrom = async (queryable: PostgresQueryable, text: string, params: unknown[]): Promise<unknown[]> => {
  const { rows } = await queryable.query(text, params)
  return rows
}

const scopeOf = ({ applabel, user_id, vaultlabel }: VaultScope): VaultScope => ({ applabel, user_id, vaultlabel })

const vaultRowOf = async (tx: PostgresQueryable, { applabel, user_id, vaultlabel }: VaultScope): Promise<unknown> => (
  vaultOf(await rowsFrom(tx, GetVaultSql, [applabel, user_id, vaultlabel]))
)

// Every write first locks its vault's row (SELECT ... FOR UPDATE). Writes to one vault then run one at a time, and each compares revisions against the row as currently stored.
const lockedVaultRowOf = async (tx: PostgresQueryable, { applabel, user_id, vaultlabel }: VaultScope): Promise<unknown> => (
  vaultOf(await rowsFrom(tx, LockVaultSql, [applabel, user_id, vaultlabel]))
)

/** Write the vault row. Returns false only when creating a vault (`ante` is null) and another writer's insert got there first. */
const writeVaultRow = async (tx: PostgresQueryable, row: VaultRecord | VaultTombstone, ante: unknown): Promise<boolean> => {
  const params = [JSON.stringify(row)]
  if (ante !== null) { await tx.query(WriteVaultSql, params); return true }
  const claimed = await rowsFrom(tx, BirthVaultSql, params)
  return claimed.length > 0
}

const boxesOfLife = async (tx: PostgresQueryable, { applabel, user_id, vaultlabel }: VaultScope, vault_tok: string): Promise<RowOfBox[]> => (
  await rowsFrom(tx, BoxesOfLifeSql, [applabel, user_id, vaultlabel, vault_tok]) as RowOfBox[]
)

const writeBoxRow = async (tx: PostgresQueryable, row: BoxRecord | BoxTombstone): Promise<void> => {
  await tx.query(WriteBoxSql, [JSON.stringify(row)])
}

// Postgres delivers a transaction's notifications when it commits, and discards them if it rolls back.
const notify = async (tx: PostgresQueryable, { user_id }: BankScope, texts: string[]): Promise<void> => {
  if (texts.length === 0) { return }
  await tx.query(NotifySql, [channelOf(user_id), texts])
}
// --
