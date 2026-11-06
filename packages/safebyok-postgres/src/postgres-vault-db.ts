/** The vaultDB over Postgres: two tables of jsonb rows, each generic call one statement or one transaction. */

import * as SX from 'safebyok/storage'
import type { Awaitable, BankScope, BoxesFetched, BoxFetched, BoxLanding, BoxQuery, BoxRecord, BoxTombstone, DelOpts, Heard, Landing, PutOptsGiven, RowOfBox, RowOfVault, Tidied, VaultDBOpts, VaultError, VaultQuery, VaultRecord, VaultScope, VaultTombstone, WatchScope } from 'safebyok/storage'

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
const postgresVaultDBOpts = SX.objCheck(({ custom, fn, uint }) => ({
  ...SX.vaultDBOpts.shape,
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

// == [Notices]: vaultChannelOf, Told, toldCheck, toldTextOf, toldOf

// A user_id whose channel passes 63 bytes, Postgres's longest identifier, cannot be notified: a write under it that would send a notice refuses.
/** The channel the notices of `user_id`'s writes are sent on, which a `PostgresListen` you hand the vaultDB listens to. */
export const vaultChannelOf = (user_id: string): string => `safebyok_${user_id}`

/** What a write tells its listeners: where it landed, and the rows as stored when they fit in a notification. */
type Told = VaultScope & { vault_tok?: string | undefined, boxlabel?: string | undefined, heard?: Heard | undefined }

// Postgres refuses a notification of 8000 bytes or more.
const NoticeMaxBytes = 7999

const toldCheck = SX.objCheck(({ applabel, user_id, vaultlabel, str, obj, unk }) => ({
  applabel, user_id, vaultlabel,
  vault_tok: str.optional(),
  boxlabel:  str.optional(),
  heard:     obj({ vault: unk, box: unk.optional() }).optional(),
}), { refusalkind: 'bad_record', extras: 'strip' })

/** The notification text of `told`: without its rows when they will not fit, which a listener then reads afresh. */
const toldTextOf = (told: Told): string => {
  const text = JSON.stringify(told)
  if (new TextEncoder().encode(text).length <= NoticeMaxBytes) { return text }
  return JSON.stringify({ ...told, heard: undefined })
}

/** The {@link Told} in a notification's text, or null for text no write of ours sent. */
const toldOf = (text: string): Told | null => {
  try {
    const parsed = toldCheck.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch { return null }
}

const isHeardIn = (scope: WatchScope, told: Told): boolean => (
  (scope.applabel === told.applabel) && (scope.user_id === told.user_id) && ((scope.vaultlabel ?? told.vaultlabel) === told.vaultlabel)
)
// --

// == [Refusals]: refusalOf, causeOf, codeOf

/** The refusal a throw stands for: a VaultError as it came, a missing table or privilege a fault in setup, anything else the database out of reach. */
const refusalOf = (thrown: unknown): VaultError => {
  if (SX.isVaultError(thrown)) { return thrown }
  if (codeOf(thrown)?.startsWith('42')) { return SX.unexpectedError(causeOf(thrown)) }
  return SX.storageUnavailable(causeOf(thrown))
}

// A driver's error can carry the statement's parameters, a row among them, so the cause keeps only its message and code.
const causeOf = (thrown: unknown): Error => {
  const code = codeOf(thrown)
  return Object.assign(new Error(SX.sanitizeForeignError(thrown).message), (code === undefined) ? {} : { code })
}

const codeOf = (thrown: unknown): string | undefined => (
  ((typeof thrown === 'object') && (thrown !== null) && ('code' in thrown) && (typeof thrown.code === 'string')) ? thrown.code : undefined
)
// --

/** True when a put under `opts` may land over `ante`, the row it would replace. */
const isPutAllowed = (ante: unknown, { prior, ifAbsent, ifPresent }: PutOptsGiven): boolean => (
  SX.isRowAt(ante, prior) && (SX.isLiveRow(ante) ? (ifPresent === 'repl') : (ifAbsent === 'add'))
)

const firstOf = (rows: unknown[], column: string): unknown => ((rows[0] as Record<string, unknown> | undefined)?.[column] ?? null)

/** A vaultDB in your Postgres, through the client you already have: `new PostgresVaultDB({ client: pgClientOf(pool) })`. */
export class PostgresVaultDB extends SX.VaultDB {
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

  /** Demands room in the vault for a new live box, under its `maxBoxes`. */
  async #demandRoom(tx: PostgresQueryable, record: BoxRecord, ante: unknown): Promise<void> {
    if ((this.#maxBoxes === Infinity) || SX.isLiveRow(ante)) { return }
    const boxes = await boxesOfLife(tx, record, record.vault_tok)
    const used = boxes.filter(({ box }) => SX.isLiveRow(box)).length
    if (used >= this.#maxBoxes) { throw SX.vaultFull({ boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }) }
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
      await notify(tx, record, [{ ...scopeOf(record), heard: { vault: record } }])
      return { landed: true, ante }
    })
  }

  protected async doPutBox(record: BoxRecord, opts: PutOptsGiven): Promise<BoxLanding> {
    return await this.#transact(async (tx) => {
      const vault = await lockedVaultRowOf(tx, record)
      const ante = await boxRowOf(tx, record, record.boxlabel)
      const landed = SX.isCheckedLiveVault(vault, record.vault_tok) && isPutAllowed(ante, opts)
      if (landed) {
        await this.#demandRoom(tx, record, ante)
        await storeBoxRow(tx, record, record.boxlabel, record)
        await notify(tx, record, [boxToldOf(record, record.boxlabel, { vault, box: record })])
      }
      return { landed, ante, vault }
    })
  }

  protected async doDelVault(tombstone: VaultTombstone, { prior }: DelOpts): Promise<Landing> {
    return await this.#transact(async (tx) => {
      const ante = await lockedVaultRowOf(tx, tombstone)
      const isOurs = SX.isLiveRowUnder(ante, tombstone.vault_tok)
      const isDamaged = (ante !== null) && (! SX.vaultRow.safeParse(ante).success)
      const landed = (isOurs && SX.isRowAt(ante, prior)) || SX.isDamagedVaultAt(ante, tombstone, prior)
      // A live row of this life, or damage, that the tombstone does not name stops the del whole; any other row lets a repeat sweep the boxes.
      if ((! landed) && (isOurs || isDamaged)) { return { landed, ante } }
      if (landed) { await storeVaultRow(tx, tombstone, ante) }
      const vault = landed ? tombstone : ante
      const told: Told[] = landed ? [{ ...scopeOf(tombstone), heard: { vault } }] : []
      const boxes = await boxesOfLife(tx, tombstone, tombstone.vault_tok)
      for (const { boxlabel, box } of boxes) {
        const boxTombstone = SX.boxTombstoneOf(box, tombstone.written_at)
        if (boxTombstone === null) { continue }
        await storeBoxRow(tx, tombstone, boxlabel, boxTombstone)
        told.push(boxToldOf(tombstone, boxlabel, { vault, box: boxTombstone }))
      }
      await notify(tx, tombstone, told)
      return { landed, ante }
    })
  }

  protected async doDelBox(tombstone: BoxTombstone, { prior }: DelOpts): Promise<BoxLanding> {
    return await this.#transact(async (tx) => {
      const vault = await lockedVaultRowOf(tx, tombstone)
      const ante = await boxRowOf(tx, tombstone, tombstone.boxlabel)
      const isDeletable = (SX.isLiveRow(ante) && SX.isRowAt(ante, prior)) || SX.isDamagedBoxAt(ante, tombstone, prior)
      const landed = SX.isCheckedLiveVault(vault, tombstone.vault_tok) && isDeletable
      if (landed) {
        await storeBoxRow(tx, tombstone, tombstone.boxlabel, tombstone)
        await notify(tx, tombstone, [boxToldOf(tombstone, tombstone.boxlabel, { vault, box: tombstone })])
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
        if (SX.isLifeOver(vaults.get(vaultlabel) ?? null, vault_tok)) {
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
    const listening = listenOrNull(listen, vaultChannelOf(scope.user_id), onNotify)
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

// == [Rows in a transaction]: rowsFrom, scopeOf, boxToldOf, vaultRowOf, lockedVaultRowOf, storeVaultRow, boxRowOf, boxesOfLife, storeBoxRow, notify

const rowsFrom = async (queryable: PostgresQueryable, text: string, params: unknown[]): Promise<unknown[]> => {
  const { rows } = await queryable.query(text, params)
  return rows
}

const scopeOf = ({ applabel, user_id, vaultlabel }: VaultScope): VaultScope => ({ applabel, user_id, vaultlabel })

const boxToldOf = (where: VaultScope & { vault_tok: string }, boxlabel: string, heard: Heard): Told => (
  { ...scopeOf(where), vault_tok: where.vault_tok, boxlabel, heard }
)

const vaultRowOf = async (tx: PostgresQueryable, { applabel, user_id, vaultlabel }: VaultScope): Promise<unknown> => (
  firstOf(await rowsFrom(tx, GetVaultSql, [applabel, user_id, vaultlabel]), 'vault')
)

// Every write locks its vault's row first, so writes under one vault take turns, and a box cap counts what is there.
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
const notify = async (tx: PostgresQueryable, { user_id }: BankScope, told: Told[]): Promise<void> => {
  if (told.length === 0) { return }
  await tx.query(NotifySql, [vaultChannelOf(user_id), told.map((each) => toldTextOf(each))])
}
// --
