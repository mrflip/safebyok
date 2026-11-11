/** A vaultDB adapter that stores its rows in Postgres. */

import * as DB from 'safebyok/storage'
import type {
  AdapterVaultDBOpts, Awaitable, BankScope, BoxClassified, BoxDelAsk, BoxesFetched, BoxFetched, BoxGetAsk, BoxPutAsk, BoxQuery, BoxRecord, BoxRow, Capacity, Heard,
  RowOfVault, Tidied, VaultClassified, VaultDelAsk, VaultError, VaultFetched, VaultGetAsk, VaultPutAsk, VaultQuery, VaultRow, VaultScope, WatchScope,
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

// == [Notices]: vaultChannelOf, VaultWhereFields, BoxWhereFields, BoxPropFields, noticeTextOf, toldOf

const vaultChannelOfInput = DB.Checker(({ user_id }) => user_id, 'bad_option')

/** Return the notification channel for `user_id`'s writes: the channel a `PostgresListen` subscribes to. */
export const vaultChannelOf = (user_id: string): string => channelOf(vaultChannelOfInput.parse(user_id, { where: 'vaultChannelOf' }))

// Postgres identifiers are at most 63 bytes. A user_id whose channel name is longer cannot be notified, so a write that would send a notice for it fails.
/** The notification channel for `user_id`. */
const channelOf = (user_id: string): string => `safebyok_${user_id}`

// A vault notice is the vault row as stored. A box notice is one JSON array, [...the box's address, ...its other props], in the order of
// these lists: it is made of the box row alone, so a box's write can send it in the statement that stores the row.
// A box tombstone's props stop at whisper_schema_version. A ciphered field is sent as [cipher_iv_b64, ciphertext_b64].
// A notice too large for Postgres carries only the row's address: a vault's as an array of its three labels.
const VaultWhereFields = ['applabel', 'user_id', 'vaultlabel'] as const
const BoxWhereFields = [...VaultWhereFields, 'vault_tok', 'boxlabel'] as const
const BoxPropFields = ['am', 'fmt', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'box_tok', 'whisper_codec', 'whisper_schema_version', 'sidecar', 'box_key_wrapped', 'whisper_ciphered'] as const
const CipheredFields: ReadonlySet<string> = new Set(['box_key_wrapped', 'whisper_ciphered'])

// Postgres rejects a notification payload of 8000 bytes or more.
const NoticeMaxBytes = 7999

/** A parsed notice: the scope of the write, plus the written rows when the notice was small enough to carry them. */
type Told = VaultScope & { vault_tok?: string | undefined, boxlabel?: string | undefined, heard?: Heard | undefined }

const toldWhere = DB.objCheck(({ applabel, user_id, vaultlabel, str }) => ({
  applabel, user_id, vaultlabel, vault_tok: str.optional(), boxlabel: str.optional(),
}), { refusalkind: 'bad_record', extras: 'strip' })

/** Build the notification text for a write of `row`, a vault row or a box row.
 * A notice too large for Postgres carries only the row's address. {@link toldOf} parses it back.
 */
function noticeTextOf(row: VaultRow | BoxRow): string {
  const fields: Record<string, unknown> = row
  const isBox = 'boxlabel' in row
  const where = (isBox ? BoxWhereFields : VaultWhereFields).map((field) => fields[field])
  const text = JSON.stringify(isBox ? [...where, ...boxPropsOf(row)] : row)
  return (new TextEncoder().encode(text).length <= NoticeMaxBytes) ? text : JSON.stringify(where)
}

/** Parse a notification's text into a {@link Told}, or return null if it is not one of our notices. */
function toldOf(text: string): Told | null {
  const sent = jsonOrNull(text)
  if (! Array.isArray(sent)) {
    const where = toldWhere.safeParse(sent)
    return where.success ? { ...scopeOf(where.data), heard: { vault: sent } } : null
  }
  const props: unknown[] = sent
  const where = toldWhere.safeParse(fieldsOf(BoxWhereFields, props))
  if (! where.success) { return null }
  const boxProps = props.slice(BoxWhereFields.length)
  if (boxProps.length === 0) { return where.data }
  return { ...where.data, heard: { box: { ...where.data, ...fieldsOf(BoxPropFields, boxProps) } } }
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

  /** A box row and its vault row, null for none, read in one statement. */
  async #fetchBox({ applabel, user_id, vaultlabel, vault_tok, boxlabel }: BoxQuery): Promise<BoxFetched> {
    const [fetched] = await this.#query(GetBoxWithVaultSql, [applabel, user_id, vaultlabel, vault_tok, boxlabel]) as BoxFetched[]
    return fetched ?? { vault: null, box: null }
  }

  /** A vault's room, at a count of its live boxes. */
  #roomAt(used: number): Capacity {
    return { boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }
  }

  // One statement tests the ask and stores its record. Where it stored, its answer is checked and is the answer.
  // Where it did not, the classifier names the refusal from the row it found.
  /** Run a vault's write `text`, with `cited` the expected fields it tests after the write's own parameters. */
  async #writeVault(ask: VaultPutAsk | VaultDelAsk, text: string, cited: unknown[]): Promise<VaultClassified> {
    const { applabel, user_id, vaultlabel } = ask.record
    const params = [applabel, user_id, vaultlabel, JSON.stringify(ask.record), channelOf(user_id), noticeTextOf(ask.record)]
    /** The one row a vault's write statement answers. */
    type VaultWriteAnswer = { ok: boolean, act: unknown, vault: unknown, presence: unknown }
    const [answer] = await this.#query(text, [...params, ...cited]) as [VaultWriteAnswer]
    if (answer.ok) { return DB.vaultWrittenOf(ask, answer) }
    const classified = this.classifyVault(ask, { vault: answer.vault })
    if (classified.write === null) { return classified }
    // Another writer's row came after the statement began, so it was not found: the ask is classified over what is stored now.
    return unwritten(this.classifyVault(ask, await this.#fetchVault(ask.record)))
  }

  /** Run a box's write `text`, with `cited` the expected fields it tests after the write's own parameters. */
  async #writeBox(ask: BoxPutAsk | BoxDelAsk, text: string, cited: unknown[]): Promise<BoxClassified> {
    const { applabel, user_id, vaultlabel, vault_tok, boxlabel } = ask.record
    const params = [applabel, user_id, vaultlabel, vault_tok, boxlabel, JSON.stringify(ask.record), this.#maxBoxes, channelOf(user_id), noticeTextOf(ask.record)]
    /** The one row a box's write statement answers. */
    type BoxWriteAnswer = { ok: boolean, act: unknown, world: unknown, box: unknown, presence: unknown, boxcount: number }
    const [answer] = await this.#query(text, [...params, ...cited]) as [BoxWriteAnswer]
    const capacity = this.#roomAt(answer.boxcount)
    if (answer.ok) { return DB.boxWrittenOf(ask, { ...answer, capacity }) }
    const classified = this.classifyBox(ask, { vault: answer.world, box: answer.box, capacity })
    if (classified.write === null) { return classified }
    // Another writer's row came after the statement began, so it was not found: the ask is classified over what is stored now.
    return unwritten(this.classifyBox(ask, { ...await this.#fetchBox(ask.record), capacity }))
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

  // A put or del runs the statement that can store its record over the row it expects. An ask whose policy lets it store
  // nothing over that row is only classified, over the rows as fetched.
  protected async doPutVault(ask: VaultPutAsk): Promise<VaultClassified> {
    const { expected } = ask
    if (! mayPutOver(ask)) { return this.classifyVault(ask, await this.#fetchVault(ask.record)) }
    if (expected.revision_seq === DB.VoidRevisionSeq) { return await this.#writeVault(ask, BirthVaultSql, []) }
    return await this.#writeVault(ask, ReviseVaultSql, [expected.revision_tok, expected.am])
  }

  protected async doPutBox(ask: BoxPutAsk): Promise<BoxClassified> {
    const { expected } = ask
    if (! mayPutOver(ask)) { return this.classifyBox(ask, await this.#fetchBox(ask.record)) }
    if (expected.revision_seq === DB.VoidRevisionSeq) { return await this.#writeBox(ask, BirthBoxSql, []) }
    return await this.#writeBox(ask, ReviseBoxSql, [expected.revision_tok, expected.am])
  }

  protected async doDelVault(ask: VaultDelAsk): Promise<VaultClassified> {
    const { expected } = ask
    if (expected.am !== 'a') { return this.classifyVault(ask, await this.#fetchVault(ask.record)) }
    return await this.#writeVault(ask, ReviseVaultSql, [expected.revision_tok, expected.am])
  }

  protected async doDelBox(ask: BoxDelAsk): Promise<BoxClassified> {
    const { expected } = ask
    if (expected.am !== 'a') { return this.classifyBox(ask, await this.#fetchBox(ask.record)) }
    return await this.#writeBox(ask, ReviseBoxSql, [expected.revision_tok, expected.am])
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
      if ((vault_tok === undefined) || (boxlabel === undefined)) { return await this.#fetchVault(scope) }
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

// == [Rows and asks]: rowsFrom, scopeOf, mayPutOver, unwritten

async function rowsFrom(queryable: PostgresQueryable, text: string, params: unknown[]): Promise<unknown[]> {
  const { rows } = await queryable.query(text, params)
  return rows
}

function scopeOf({ applabel, user_id, vaultlabel }: VaultScope): VaultScope { return { applabel, user_id, vaultlabel } }

/** True where a put's policies let it store its record over the row it expects: over none or a tombstone under `ifAbsent: 'add'`, over a live row under `ifPresent: 'repl'`. */
function mayPutOver({ expected, ifAbsent, ifPresent }: BoxPutAsk | VaultPutAsk): boolean {
  return (expected.am === 'a') ? (ifPresent === 'repl') : (ifAbsent === 'add')
}

/** A refusal classified over the rows as stored now. Throws where the classifier would still store the record: the statement and the classifier disagree. */
function unwritten<ClassifiedT extends BoxClassified | VaultClassified>(classified: ClassifiedT): ClassifiedT {
  if (classified.write !== null) { throw DB.unexpectedError(new Error('The database stored nothing for a write its rows allow.')) }
  return classified
}
// --
