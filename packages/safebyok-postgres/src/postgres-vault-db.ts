/** The vaultDB over Postgres: two tables of jsonb rows, each generic call one statement or one transaction. */

import * as DB from 'safebyok/storage'
import type { Awaitable, BankScope, BoxesFetched, BoxFetched, BoxLanding, BoxQuery, BoxRecord, BoxRow, BoxTombstone, DelOpts, Heard, Landing, PutOptsGiven, RowOfBox, RowOfVault, Tidied, VaultDBOpts, VaultError, VaultQuery, VaultRecord, VaultRow, VaultScope, VaultTombstone, WatchScope } from 'safebyok/storage'

// == [The driver]: PostgresQueryable, PostgresClient, PostgresListen, PostgresVaultDBOpts

/** A pool or connection that runs one parameterized statement and hands back its rows: pg's Pool, PGlite, or a transaction of either. */
export type PostgresQueryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

/** A {@link PostgresQueryable} that also runs `work` as one transaction, committed once `work` resolves: a PGlite, or `pgClientOf(pool)`. */
export type PostgresClient = PostgresQueryable & { transaction: <ValT>(work: (tx: PostgresQueryable) => Promise<ValT>) => Promise<ValT> }

/** Calls `onNotify` with the text of each notification sent on `channel`, and answers how to stop. */
export type PostgresListen = (channel: string, onNotify: (text: string) => void) => Awaitable<() => unknown>

/** What a PostgresVaultDB is made with: the client it stores rows through, and the listen its watch hears other devices' writes by. */
export type PostgresVaultDBOpts = Readonly<VaultDBOpts & { client: PostgresClient, listen?: PostgresListen, maxBoxes?: number }>

const isPostgresClient = (candidate: unknown): candidate is PostgresClient => (
  (typeof candidate === 'object') && (candidate !== null)
  && ('query' in candidate) && (typeof candidate.query === 'function')
  && ('transaction' in candidate) && (typeof candidate.transaction === 'function')
)

// `custom` and `fn` hand back the very client and listen given, so a driver's methods keep their `this`.
const postgresVaultDBOpts = DB.objCheck(({ custom, fn, uint }) => ({
  ...DB.vaultDBOpts.shape,
  client:   custom<PostgresClient>(isPostgresClient, 'Expected a client with query and transaction functions'),
  listen:   fn<PostgresListen>().optional(),
  maxBoxes: uint.optional(),
}), 'bad_option')
// --

// == [The statements]: the SQL each generic call runs

const ListVaultsSql = 'SELECT vaultlabel, vault FROM safebyok_vaults WHERE applabel = $1 AND user_id = $2 ORDER BY vaultlabel'
const GetVaultSql = 'SELECT vault FROM safebyok_vaults WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3'
const LockVaultSql = `${GetVaultSql} FOR UPDATE`
const BirthVaultSql = `INSERT INTO safebyok_vaults (applabel, user_id, vaultlabel, vault) VALUES ($1, $2, $3, $4::text::jsonb)
  ON CONFLICT (applabel, user_id, vaultlabel) DO NOTHING RETURNING vaultlabel`
const StoreVaultSql = `INSERT INTO safebyok_vaults (applabel, user_id, vaultlabel, vault) VALUES ($1, $2, $3, $4::text::jsonb)
  ON CONFLICT (applabel, user_id, vaultlabel) DO UPDATE SET vault = EXCLUDED.vault`

const BoxesOfLifeSql = 'SELECT boxlabel, box FROM safebyok_boxes WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4 ORDER BY boxlabel'
const GetBoxSql = 'SELECT box FROM safebyok_boxes WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4 AND boxlabel = $5'
const StoreBoxSql = `INSERT INTO safebyok_boxes (applabel, user_id, vaultlabel, vault_tok, boxlabel, box) VALUES ($1, $2, $3, $4, $5, $6::text::jsonb)
  ON CONFLICT (applabel, user_id, vaultlabel, vault_tok, boxlabel) DO UPDATE SET box = EXCLUDED.box`
const BoxLivesSql = `SELECT vaultlabel, vault_tok, count(*)::int AS boxcount FROM safebyok_boxes WHERE applabel = $1 AND user_id = $2
  GROUP BY vaultlabel, vault_tok ORDER BY vaultlabel, vault_tok`
const DeleteBoxLifeSql = 'DELETE FROM safebyok_boxes WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4'

// Reads that pair a box with its vault are one statement, so both rows come from one snapshot.
const VaultOfScope = '(SELECT vault FROM safebyok_vaults WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3)'
const GetBoxWithVaultSql = `SELECT ${VaultOfScope} AS vault, (${GetBoxSql}) AS box`
const ListBoxesWithVaultSql = `SELECT ${VaultOfScope} AS vault, COALESCE((
  SELECT jsonb_agg(jsonb_build_object('boxlabel', boxlabel, 'box', box) ORDER BY boxlabel)
  FROM safebyok_boxes WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3 AND vault_tok = $4
), '[]'::jsonb) AS boxes`

const NotifySql = 'SELECT pg_notify($1, told) FROM unnest($2::text[]) AS told'
// --

// == [Notices]: vaultChannelOf, VaultPropFields, BoxPropFields, noticeTextOf, toldOf

const vaultChannelOfInput = DB.Checker(({ user_id }) => user_id, 'bad_option')

/** The channel the notices of `user_id`'s writes are sent on, which a `PostgresListen` you hand the vaultDB listens to. */
export const vaultChannelOf = (user_id: string): string => channelOf(vaultChannelOfInput.parse(user_id, { where: 'vaultChannelOf' }))

// A user_id whose channel passes 63 bytes, Postgres's longest identifier, cannot be notified: a write under it that would send a notice refuses.
/** The channel the notices of `user_id`'s writes are sent on. */
const channelOf = (user_id: string): string => `safebyok_${user_id}`

// A vault's notice is its row as stored. A box's is one JSON array, [...vault props, ...box props], in the order of these lists:
// the vault row without its wayins, then the box row without what the vault props already say. A box tombstone's props end at
// whisper_schema_version, and a ciphered field is [cipher_iv_b64, ciphertext_b64].
const VaultPropFields = ['applabel', 'user_id', 'vaultlabel', 'fmt', 'am', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'vault_tok', 'gate_epoch'] as const
const BoxPropFields = ['boxlabel', 'am', 'fmt', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'box_tok', 'whisper_codec', 'whisper_schema_version', 'sidecar', 'box_key_wrapped', 'whisper_ciphered'] as const
const CipheredFields: ReadonlySet<string> = new Set(['box_key_wrapped', 'whisper_ciphered'])

// Postgres refuses a notification of 8000 bytes or more.
const NoticeMaxBytes = 7999

/** What a notice tells its listeners: where the write landed, and the rows as stored when they fit in a notification. */
type Told = VaultScope & { vault_tok?: string | undefined, boxlabel?: string | undefined, heard?: Heard | undefined }

const toldWhere = DB.objCheck(({ applabel, user_id, vaultlabel, str }) => ({
  applabel, user_id, vaultlabel, vault_tok: str.optional(), boxlabel: str.optional(),
}), { refusalkind: 'bad_record', extras: 'strip' })

/** The notification text for `vault`, or for `box` under it, as {@link toldOf} reads it back. */
const noticeTextOf = (vault: VaultRow, box?: BoxRow): string => {
  const text = JSON.stringify((box === undefined) ? vault : [...vaultPropsOf(vault), ...boxPropsOf(box)])
  if (new TextEncoder().encode(text).length <= NoticeMaxBytes) { return text }
  return JSON.stringify((box === undefined) ? vaultPropsOf(vault) : [...vaultPropsOf(vault), box.boxlabel])
}

/** The {@link Told} in a notification's text, read as {@link noticeTextOf} writes it, or null for text no write of ours sent. */
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

/** The fields `props` hold, named in the order of `fieldnames`, a ciphered field's pair made whole again. */
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

/** The refusal a throw stands for: a VaultError as it came, a missing table or privilege a fault in setup, anything else the database out of reach. */
const refusalOf = (thrown: unknown): VaultError => {
  if (DB.isVaultError(thrown)) { return thrown }
  if (codeOf(thrown)?.startsWith('42')) { return DB.unexpectedError(causeOf(thrown)) }
  return DB.storageUnavailable(causeOf(thrown))
}

// A driver's error can carry the statement's parameters, a row among them, so the cause keeps only its message and code.
const causeOf = (thrown: unknown): Error => {
  const code = codeOf(thrown)
  return Object.assign(new Error(DB.sanitizeForeignError(thrown).message), (code === undefined) ? {} : { code })
}

const codeOf = (thrown: unknown): string | undefined => (
  ((typeof thrown === 'object') && (thrown !== null) && ('code' in thrown) && (typeof thrown.code === 'string')) ? thrown.code : undefined
)
// --

/** True when a put under `opts` may land over `ante`, the row it would replace. */
const isPutAllowed = (ante: unknown, { prior, ifAbsent, ifPresent }: PutOptsGiven): boolean => (
  DB.isRowAt(ante, prior) && (DB.isLiveRow(ante) ? (ifPresent === 'repl') : (ifAbsent === 'add'))
)

const firstOf = (rows: unknown[], column: string): unknown => ((rows[0] as Record<string, unknown> | undefined)?.[column] ?? null)

/** A vaultDB in your Postgres, through the client you already have: `new PostgresVaultDB({ client: pgClientOf(pool) })`. */
export class PostgresVaultDB extends DB.VaultDB {
  // == [Props]: #client, #listen, #maxBoxes

  readonly #client: PostgresClient
  readonly #listen: PostgresListen | undefined
  readonly #maxBoxes: number
  // --

  // == [Construction]: constructor

  constructor(opts: PostgresVaultDBOpts) {
    const { client, listen, maxBoxes = Infinity, ...vaultDBOpts } = postgresVaultDBOpts.parse(opts)
    super(vaultDBOpts)
    this.#client = client
    this.#listen = listen
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Statements]: #query, #transact, #demandRoom

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

  // Best effort, not a hard cap: exact at moderate write rates; a strict cap would need concurrency machinery in every adapter.
  /** Demands room in the vault for a new live box, under its soft cap `maxBoxes`. */
  async #demandRoom(tx: PostgresQueryable, record: BoxRecord, ante: unknown): Promise<void> {
    if ((this.#maxBoxes === Infinity) || DB.isLiveRow(ante)) { return }
    const boxes = await boxesOfLife(tx, record, record.vault_tok)
    const used = boxes.filter(({ box }) => DB.isLiveRow(box)).length
    if (used >= this.#maxBoxes) { throw DB.vaultFull({ boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }) }
  }
  // --

  // == [Protected, the generic calls of VaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected async doListVaults({ applabel, user_id }: BankScope): Promise<RowOfVault[]> {
    return await this.#query(ListVaultsSql, [applabel, user_id]) as RowOfVault[]
  }

  protected async doGetVault({ applabel, user_id, vaultlabel }: VaultScope): Promise<unknown> {
    return firstOf(await this.#query(GetVaultSql, [applabel, user_id, vaultlabel]), 'vault')
  }

  protected async doListBoxes({ applabel, user_id, vaultlabel, vault_tok }: VaultQuery): Promise<BoxesFetched> {
    const [fetched] = await this.#query(ListBoxesWithVaultSql, [applabel, user_id, vaultlabel, vault_tok]) as BoxesFetched[]
    return fetched ?? { vault: null, boxes: [] }
  }

  protected async doGetBox({ applabel, user_id, vaultlabel, vault_tok, boxlabel }: BoxQuery): Promise<BoxFetched> {
    const [fetched] = await this.#query(GetBoxWithVaultSql, [applabel, user_id, vaultlabel, vault_tok, boxlabel]) as BoxFetched[]
    return fetched ?? { vault: null, box: null }
  }

  protected async doPutVault(record: VaultRecord, opts: PutOptsGiven): Promise<Landing> {
    return await this.#transact(async (tx) => {
      const ante = await lockedVaultRowOf(tx, record)
      if (! isPutAllowed(ante, opts)) { return { landed: false, ante } }
      if (! await storeVaultRow(tx, record, ante)) { return { landed: false, ante: await vaultRowOf(tx, record) } }
      await notify(tx, record, [noticeTextOf(record)])
      return { landed: true, ante }
    })
  }

  protected async doPutBox(record: BoxRecord, opts: PutOptsGiven): Promise<BoxLanding> {
    return await this.#transact(async (tx) => {
      const vault = await lockedVaultRowOf(tx, record)
      const ante = await boxRowOf(tx, record, record.boxlabel)
      const landed = DB.isCheckedLiveVault(vault, record.vault_tok) && isPutAllowed(ante, opts)
      if (landed) {
        await this.#demandRoom(tx, record, ante)
        await storeBoxRow(tx, record, record.boxlabel, record)
        await notify(tx, record, [noticeTextOf(vault as VaultRecord, record)])  // isCheckedLiveVault has checked it
      }
      return { landed, ante, vault }
    })
  }

  protected async doDelVault(tombstone: VaultTombstone, { prior }: DelOpts): Promise<Landing> {
    return await this.#transact(async (tx) => {
      const ante = await lockedVaultRowOf(tx, tombstone)
      const isOurs = DB.isLiveRowUnder(ante, tombstone.vault_tok)
      const isDamaged = (ante !== null) && (! DB.vaultRow.safeParse(ante).success)
      const landed = (isOurs && DB.isRowAt(ante, prior)) || DB.isDamagedVaultAt(ante, tombstone, prior)
      // A live row of this life, or damage, that the tombstone does not name stops the del whole; any other row lets a repeat sweep the boxes.
      if ((! landed) && (isOurs || isDamaged)) { return { landed, ante } }
      if (landed) { await storeVaultRow(tx, tombstone, ante) }
      // Past the stop above, a row that is not ours is a tombstone, another life's row, or none; only a tombstone of this life tells its boxes.
      const vault = landed ? tombstone : ante as VaultRow | null
      const world = (vault?.vault_tok === tombstone.vault_tok) ? vault : null
      const texts = landed ? [noticeTextOf(tombstone)] : []
      const boxes = await boxesOfLife(tx, tombstone, tombstone.vault_tok)
      for (const { boxlabel, box } of boxes) {
        const boxTombstone = DB.boxTombstoneOf(box, tombstone.written_at)
        if (boxTombstone === null) { continue }
        await storeBoxRow(tx, tombstone, boxlabel, boxTombstone)
        if (world !== null) { texts.push(noticeTextOf(world, boxTombstone)) }
      }
      await notify(tx, tombstone, texts)
      return { landed, ante }
    })
  }

  protected async doDelBox(tombstone: BoxTombstone, { prior }: DelOpts): Promise<BoxLanding> {
    return await this.#transact(async (tx) => {
      const vault = await lockedVaultRowOf(tx, tombstone)
      const ante = await boxRowOf(tx, tombstone, tombstone.boxlabel)
      const isDeletable = (DB.isLiveRow(ante) && DB.isRowAt(ante, prior)) || DB.isDamagedBoxAt(ante, tombstone, prior)
      const landed = DB.isCheckedLiveVault(vault, tombstone.vault_tok) && isDeletable
      if (landed) {
        await storeBoxRow(tx, tombstone, tombstone.boxlabel, tombstone)
        await notify(tx, tombstone, [noticeTextOf(vault as VaultRecord, tombstone)])  // isCheckedLiveVault has checked it
      }
      return { landed, ante, vault }
    })
  }

  protected async doTidyGone({ applabel, user_id }: BankScope): Promise<Tidied> {
    return await this.#transact(async (tx) => {
      /** One life's box rows in a bank, counted. */
      type BoxLife = { vaultlabel: string, vault_tok: string, boxcount: number }

      // Lives before vaults: each statement reads its own snapshot, and a vault row read after its boxes is as new as they are or newer.
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

  /** The rows `told` carries, or for a notice that came without them, the rows as they stand now; null when those cannot be read. */
  async #heardOrNull({ heard, vault_tok, boxlabel, ...scope }: Told): Promise<Heard | null> {
    if (heard !== undefined) { return heard }
    try {
      if ((vault_tok === undefined) || (boxlabel === undefined)) { return { vault: await this.doGetVault(scope) } }
      return await this.doGetBox({ ...scope, vault_tok, boxlabel })
    } catch {
      return null  // a notice is a hint, and one that cannot be read afresh is let go
    }
  }
  // --
}

// == [Listening]: listenOrNull, unlistenOnceListening

/** Starts `listen` at once, answering how to stop, or null when it failed: a watch that hears nothing is all a watch promises. */
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
    // the watch has already stopped hearing, whatever the driver's unlisten makes of it
  }
}
// --

// == [Rows in a transaction]: rowsFrom, scopeOf, vaultRowOf, lockedVaultRowOf, storeVaultRow, boxRowOf, boxesOfLife, storeBoxRow, notify

const rowsFrom = async (queryable: PostgresQueryable, text: string, params: unknown[]): Promise<unknown[]> => {
  const { rows } = await queryable.query(text, params)
  return rows
}

const scopeOf = ({ applabel, user_id, vaultlabel }: VaultScope): VaultScope => ({ applabel, user_id, vaultlabel })

const vaultRowOf = async (tx: PostgresQueryable, { applabel, user_id, vaultlabel }: VaultScope): Promise<unknown> => (
  firstOf(await rowsFrom(tx, GetVaultSql, [applabel, user_id, vaultlabel]), 'vault')
)

// Every write locks its vault's row first, so writes under one vault take turns, and a compare-and-set checks the revision of the row it replaces as stored at that moment.
const lockedVaultRowOf = async (tx: PostgresQueryable, { applabel, user_id, vaultlabel }: VaultScope): Promise<unknown> => (
  firstOf(await rowsFrom(tx, LockVaultSql, [applabel, user_id, vaultlabel]), 'vault')
)

/** Stores `row` as the vault row over `ante`, answering false when there was none and another device's birth landed first. */
const storeVaultRow = async (tx: PostgresQueryable, row: VaultRecord | VaultTombstone, ante: unknown): Promise<boolean> => {
  const params = [row.applabel, row.user_id, row.vaultlabel, JSON.stringify(row)]
  if (ante !== null) { await tx.query(StoreVaultSql, params); return true }
  const claimed = await rowsFrom(tx, BirthVaultSql, params)
  return claimed.length > 0
}

const boxRowOf = async (tx: PostgresQueryable, { applabel, user_id, vaultlabel, vault_tok }: VaultQuery, boxlabel: string): Promise<unknown> => (
  firstOf(await rowsFrom(tx, GetBoxSql, [applabel, user_id, vaultlabel, vault_tok, boxlabel]), 'box')
)

const boxesOfLife = async (tx: PostgresQueryable, { applabel, user_id, vaultlabel }: VaultScope, vault_tok: string): Promise<RowOfBox[]> => (
  await rowsFrom(tx, BoxesOfLifeSql, [applabel, user_id, vaultlabel, vault_tok]) as RowOfBox[]
)

const storeBoxRow = async (tx: PostgresQueryable, { applabel, user_id, vaultlabel, vault_tok }: VaultQuery, boxlabel: string, row: BoxRecord | BoxTombstone): Promise<void> => {
  await tx.query(StoreBoxSql, [applabel, user_id, vaultlabel, vault_tok, boxlabel, JSON.stringify(row)])
}

// Notifications sent in a transaction go out when it commits, and not at all when it rolls back.
const notify = async (tx: PostgresQueryable, { user_id }: BankScope, texts: string[]): Promise<void> => {
  if (texts.length === 0) { return }
  await tx.query(NotifySql, [channelOf(user_id), texts])
}
// --
