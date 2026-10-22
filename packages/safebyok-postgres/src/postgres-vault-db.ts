import { Expectations, Refusals, TombstoneFormat, VaultDB, VaultError, VaultScope } from 'safebyok'
import type { VaultPropsExpectation, VaultDBOpts, VaultDelExpectation, BoxRecord, BoxExpectation, BoxDelExpectation, BoxDeletion, GatelessVaultProps, StoredVault, VaultProps } from 'safebyok'
import * as Columns from './columns'
import { VaultPropsColumns, ListedBoxColumns, BoxColumns, TombstoneColumns } from './columns'
import { VaultChangeChannel } from './vault-tables'

/** What this VaultDB needs of a Postgres driver: one statement, its parameters numbered `$1` on, and the rows it returns.
 * A `pg` Pool, Client or PoolClient is one as it stands, and so is a PGlite; postgres.js takes a
 * one-line wrapper. Every write is one statement, atomic on its own: no transaction is asked of the driver.
 *
 * @example new Pool({ connectionString })                                      // pg
 * @example new PGlite()                                                         // @electric-sql/pglite
 * @example { query: async (text, params) => ({ rows: await sql.unsafe(text, params) }) }  // postgres.js
 */
export type PostgresClient = {
  query(text: string, params: unknown[]): Promise<{ rows: unknown[] }>
}

/** Ends what a {@link PostgresListen} began; it may return a promise, which nothing awaits. */
export type PostgresUnlisten = () => unknown

/** The host's way to hear Postgres notifications on `channel`, always {@link VaultChangeChannel}.
 * It calls `onNotify` with each payload, and returns the unlisten, or a promise for it. A PGlite's
 * `listen` is one, called on its PGlite as the example does: passed bare, it loses its `this`.
 * With `pg`, one long-lived connection LISTENs for the whole server, and hands its notifications
 * to every VaultDB made per request (see the README).
 *
 * @example (channel, onNotify) => pglite.listen(channel, onNotify)
 */
export type PostgresListen = (channel: string, onNotify: (payload: string) => void) => PostgresUnlisten | Promise<PostgresUnlisten>

/** What {@link postgresVaultDB} is made with, once per request. */
export type PostgresVaultDBOpts = VaultDBOpts & {
  /** The database, such as your server's `pg` Pool. */
  client: PostgresClient
  /** The signed-in user this request is for, as your server's own auth established it, never as the browser claims it.
   * Null, undefined or empty when no one is signed in. Only that user's vaults are reached.
   */
  userId: string | null | undefined
  /** Where the VaultDB hears other writes, to call its subscribers; without it, it never calls them. */
  listen?: PostgresListen | undefined
  /** The most boxes one vault holds: a whole number above zero, or `Infinity`, the default, for no limit.
   * The server enforces it, as a best effort, so a modified browser cannot grow a vault far past it;
   * the browser's vault opens with no larger `maxBoxes`. With no limit nothing is counted, and the
   * host bounds how large a vault grows by its own quotas.
   */
  maxBoxes?: number | undefined
}

/** safebyok's storage in Postgres: a VaultDB over `VaultTablesSql`'s tables, made per request for the signed-in user.
 * It runs on your server, as the vault itself runs in the browser. Your route layer calls its verbs
 * for the browser's vault (the README has the recipe), or a GraphQL server does (`safebyok-graphql`).
 *
 * * **Who may reach a vault**: only `userId`. A verb naming another user's scope, or any while no
 *   one is signed in, refuses with kind `identity_revoked` before the database is asked anything.
 * * **Every write is one statement**, atomic as Postgres makes every statement. An update of the
 *   vault props that does not move their `gate_epoch` forward refuses as `stale_write`.
 * * **A vault is read in one statement**: `getVault` reads the vault props and their boxes from
 *   one snapshot, and `ensureVault` creates and reads them in one statement too.
 * * **Locks**: a box write holds its vault row `FOR SHARE` and its box `FOR UPDATE`. It waits on a
 *   write to the vault props or to the same box, never on another box's write.
 * * **A full vault**: a new box in a vault holding `maxBoxes` refuses with kind `vault_full`. The
 *   count is a best effort: writes one after another never pass the limit, but writers racing for
 *   the last places may all land.
 * * **Limits**: at most 1 MiB in one record and 640 bytes in one name, and no limit on a vault's bytes.
 *   `getCapacity` weighs each box as its row's JSON, a little more than the record's own.
 * * **Isolation**: every guarantee holds under READ COMMITTED, Postgres's default. Under REPEATABLE
 *   READ or SERIALIZABLE, some races fail with a serialization error instead, as `storage_unavailable`.
 * * **Other writes**: with `listen` and the triggers `VaultNotifySql` installs, `subscribe`
 *   hears every write to the vault, from any server and device. It also calls once as its listen
 *   begins, so a write made meanwhile is read. Without both, nothing is pushed.
 * * **Your database's own rules**: a statement refused for want of a privilege, or by a row-level
 *   security policy (`42501`), refuses with kind `not_permitted`, the driver's error its `cause`.
 *
 * @example
 *   const vaultDB = postgresVaultDB({ client: pool, userId: session.userId })
 *   await vaultDB.getVaultProps({ applabel: 'acme', user_id: session.userId, vaultlabel: 'main' })  // { ok: true, val: null }, or the vault props
 * @example
 *   const vaultDB = postgresVaultDB({ client: pool, userId: session.userId, maxBoxes: 250 })
 */
export const postgresVaultDB = (opts: PostgresVaultDBOpts): VaultDB => {
  const { client, userId, listen, maxBoxes = Infinity } = (opts as Partial<PostgresVaultDBOpts> | null | undefined) ?? {}
  if (! isPostgresClient(client)) {
    throw new VaultError('bad_option', 'postgresVaultDB needs a `client` with a `query(text, params)` method: a pg Pool or Client, a PGlite, or a wrapper around your driver.')
  }
  if (userId !== null && userId !== undefined && typeof userId !== 'string') {
    throw new VaultError('bad_option', "postgresVaultDB's `userId` is the signed-in user's id as text, or null when no one is signed in.")
  }
  if (listen !== undefined && typeof listen !== 'function') {
    throw new VaultError('bad_option', "postgresVaultDB's `listen`, when given, is a function: (channel, onNotify) => unlisten.")
  }
  if (! isBoxCount(maxBoxes)) {
    throw new VaultError('bad_option', "postgresVaultDB's `maxBoxes`, when given, is a whole number above zero, or Infinity for no limit.")
  }
  return new TablesVaultDB(client, userId === undefined || userId === '' ? null : userId, listen, maxBoxes, opts)
}

// A safe integer, so it reaches Postgres as the bigint it reads; Infinity reaches it as null, no limit.
const isBoxCount = (count: unknown): count is number => count === Infinity || (Number.isSafeInteger(count) && (count as number) > 0)

const isPostgresClient = (client: unknown): client is PostgresClient => (
  typeof client === 'object' && client !== null && typeof (client as { query?: unknown }).query === 'function'
)

// ------------------------------------------------------------------------------------- the SQL

// Every statement names its vault by these three parameters, first.
const ScopeIs = 'applabel = $1::text AND user_id = $2::text AND vaultlabel = $3::text'
const VaultPropsParamCount = VaultPropsColumns.length
// A box write's parameters: the scope, then $4 the expected vault_tok, $5 the expected
// revision_tok (a replace) or the box limit (an insert), and the box's own columns from $6.
const BoxParamsFrom = 6

// The boxes of the vault row `vaultRow` names, as one JSON array in text, `[]` for none: a
// subquery of the statement that reads or writes that row. Its scope is $1 to $3, as in every
// statement here, and each box's columns are as `selected` reads them, but its bigints, which JSON
// carries as exact whole numbers.
const VaultBoxesJsonSql = (vaultRow: string) => `(SELECT COALESCE(json_agg(listed), '[]'::json)::text FROM (
    SELECT ${Columns.jsonSelected(ListedBoxColumns)} FROM safebyok_boxes WHERE ${ScopeIs} AND vault_tok = ${vaultRow}.vault_tok
  ) AS listed) AS boxes`

// The vault props and their boxes, from one snapshot: no write lands between the two reads.
const GetVaultSql = `SELECT ${Columns.selected(VaultPropsColumns)}, ${VaultBoxesJsonSql('vault')}
  FROM safebyok_vaults AS vault WHERE ${ScopeIs}`

// A vault created where none stands, and the boxes of the vault props it returns. Its scope
// parameters are the vault props' first three columns, $1 to $3, as the listing's are. A tombstone
// in the scope is deleted in the same statement, and its counter becomes the new vault's
// `vault_epoch`, no lower than the draft's (which is 0): a new life with the counter carried on.
// Another device doing the same waits on the tombstone's row, finds it gone, and meets the new
// vault by its `ON CONFLICT`. The listing reads the statement's snapshot, filtered to the
// vault_tok the insert returns: vault props another device created after that snapshot are returned
// as they stand, with the boxes the snapshot holds of them, and never another vault's.
const EnsureVaultSql = `WITH carried AS (
    DELETE FROM safebyok_vault_tombstones WHERE ${ScopeIs} RETURNING vault_epoch
  ), ensured AS (
    INSERT INTO safebyok_vaults (${Columns.names(VaultPropsColumns)})
    SELECT ${Columns.placeholders(VaultPropsColumns, 1, { vault_epoch: `GREATEST(${Columns.placeholderOf(VaultPropsColumns, 'vault_epoch', 1)}, COALESCE((SELECT max(vault_epoch) FROM carried), 0))` })}
    ON CONFLICT (applabel, user_id, vaultlabel) DO UPDATE SET format = safebyok_vaults.format
    RETURNING ${Columns.selected(VaultPropsColumns)}
  )
  SELECT ensured.*, ${VaultBoxesJsonSql('ensured')} FROM ensured`

// The vault props written must name the vault they replace, as a vault_tok never changes, and move
// their gate_epoch forward, as every update does (line 3.2): a modified client cannot write vault
// props back over those it read. The vault row is read FOR UPDATE first, which locks it and reads
// it as it stands once locked, another writer's commit since the statement began included: what a
// miss reports is the winner. The UPDATE then writes only over that row, its vault_epoch the
// standing one plus one whatever the client sent. One row back, either way: `landed`, `stands`
// (whether vault props stood), and their columns as written, or as locked on a miss.
const PutVaultPropsSql = `WITH standing AS MATERIALIZED (
    SELECT ${Columns.selected(VaultPropsColumns)} FROM safebyok_vaults WHERE ${ScopeIs} FOR UPDATE
  ), written AS (
    UPDATE safebyok_vaults SET (${Columns.names(VaultPropsColumns)}) = ROW(${Columns.placeholders(VaultPropsColumns, 1, { vault_epoch: `vault_epoch + 1 + (${Columns.placeholderOf(VaultPropsColumns, 'vault_epoch', 1)} * 0)` })})
    WHERE ${ScopeIs}
      AND vault_tok = $${String(VaultPropsParamCount + 1)}::text AND gate_epoch = $${String(VaultPropsParamCount + 2)}::bigint
      AND vault_tok = ${Columns.placeholderOf(VaultPropsColumns, 'vault_tok', 1)}
      AND gate_epoch < ${Columns.placeholderOf(VaultPropsColumns, 'gate_epoch', 1)}
      AND EXISTS (SELECT 1 FROM standing)
    RETURNING ${Columns.selected(VaultPropsColumns)}
  )
  SELECT EXISTS (SELECT 1 FROM written) AS landed, EXISTS (SELECT 1 FROM standing) AS stands, stored.*
  FROM (SELECT 1) AS answer LEFT JOIN (
    SELECT * FROM written
    UNION ALL
    SELECT * FROM standing WHERE NOT EXISTS (SELECT 1 FROM written)
  ) AS stored ON true`

const GetBoxSql = `SELECT ${Columns.selected(BoxColumns)} FROM safebyok_boxes WHERE ${ScopeIs} AND boxlabel = $4::text`

// The vault row a box write lands beside: the vault's, of the expected vault_tok (line 3.3). It is
// read FOR SHARE, so a deletion of the vault waits until the write's statement ends, or the write
// waits for it, and then reads the vault row as it stands, never only as the statement's snapshot
// had it. Box writers share the lock, so they never wait on each other for the vault row.
const ExpectedVaultSql = `SELECT applabel, user_id, vaultlabel, vault_tok FROM safebyok_vaults
    WHERE ${ScopeIs} AND vault_tok = $4::text
    FOR SHARE`

// The box standing under the boxlabel, beside the expected vault: what a box write compares, and
// reports when it misses. FOR UPDATE locks it without writing it -- two writes to one boxlabel meet
// here, one after the other -- and reads it as it stands once locked, a box another writer
// committed since this statement began included, never only as the snapshot had it. It is read
// after the vault row, so a write takes its locks in the order a vault's deletion does. A box
// first inserted since this statement began is not in its snapshot, so not here: only the insert's
// ON CONFLICT meets it.
const StandingBoxSql = `SELECT ${Columns.selected(BoxColumns)} FROM safebyok_boxes
    WHERE ${ScopeIs} AND boxlabel = ${Columns.placeholderOf(BoxColumns, 'boxlabel', BoxParamsFrom)}
      AND EXISTS (SELECT 1 FROM vault)
    FOR UPDATE`

// The vault's boxes, and what they weigh: each row as JSON, in UTF-8 bytes (Postgres writes a
// jsonb column with a space after each colon and comma, so a little more than the record's own JSON).
const VaultBoxesSql = `FROM safebyok_boxes AS box WHERE ${ScopeIs}`
const BoxBytesSql = 'COALESCE(sum(octet_length(row_to_json(box)::text)), 0)::float8'

// How full the vault is, as of this statement: every box of the scope counted and weighed.
const GetCapacitySql = `SELECT count(*)::float8 AS box_count, ${BoxBytesSql} AS bytes_used ${VaultBoxesSql}`

// Each box write answers one row, whether or not it landed: `vault_stands`, whether the vault props
// it expects stood; `landed`, whether its own comparison passed and it wrote (null when no box
// stands to report); `was_full`, a first write's vault at its limit, with its `box_count`, and its
// `bytes_used` when the write is refused for it; and the box columns of what stands under the
// boxlabel now -- the box written, as its RETURNING hands it back, or the one standing, as the FOR
// UPDATE read it -- null when none does. One statement, so one snapshot and one round trip: the
// closing SELECT reads the CTEs' rows, and the boxes table again only to weigh a vault that refuses
// the write as full.

// A first box under its boxlabel: inserted only beside the vault props it expects, only where no
// box stands, and only while the vault holds fewer than $5 boxes -- or, for a null $5, no limit,
// when nothing is counted: Postgres runs the count, an uncorrelated subquery, only when the CASE
// asks for it. A box standing in the snapshot is locked and reported, and nothing is inserted. A
// box another writer inserted since the statement began is met by the ON CONFLICT, whose no-op
// DO UPDATE locks it and returns it as it now stands: then `xmax = 0` is false, since Postgres
// marks a row it locked, and only a row this statement inserted lands.
//
// Nothing is counted in advance: the limit is the count of the vault's boxes at the start of
// this statement, a best effort. Under READ COMMITTED, Postgres's default, writers racing for the
// last places each count from their own snapshot, may each find room, and all land: the vault goes
// a few past its limit (by at most one less than the number of racers), which the contract allows,
// and a refused write inserted nothing, since the refusal is the WHERE of one atomic statement. A
// vault deleted after the statement began is met by the vault row's FOR SHARE read, which finds it
// gone, or by the foreign key, which reads the vault row that stands now: that failure is caught as
// the vault gone (see insertBox), and no box ever lands in a vault but its own. A write refused as
// full weighs the vault's boxes for its capacity, in the same statement; no other write weighs them.
const InsertBoxSql = `WITH vault AS (
    ${ExpectedVaultSql}
  ), standing AS MATERIALIZED (
    ${StandingBoxSql}
  ), counted AS (
    SELECT CASE WHEN $5::bigint IS NULL THEN 0 ELSE (SELECT count(*) ${VaultBoxesSql}) END AS box_count
  ), written AS (
    INSERT INTO safebyok_boxes (applabel, user_id, vaultlabel, vault_tok, ${Columns.names(BoxColumns)})
    SELECT applabel, user_id, vaultlabel, vault_tok, ${Columns.placeholders(BoxColumns, BoxParamsFrom)}
    FROM vault, counted WHERE NOT EXISTS (SELECT 1 FROM standing) AND ($5::bigint IS NULL OR counted.box_count < $5::bigint)
    ON CONFLICT (applabel, user_id, vaultlabel, boxlabel) DO UPDATE SET format = safebyok_boxes.format
    RETURNING ${Columns.selected(BoxColumns)}, xmax = 0 AS landed
  )
  SELECT EXISTS (SELECT 1 FROM vault) AS vault_stands,
         COALESCE(counted.box_count >= $5::bigint, false) AS was_full,
         counted.box_count::float8 AS box_count,
         CASE WHEN counted.box_count >= $5::bigint AND EXISTS (SELECT 1 FROM vault) AND NOT EXISTS (SELECT 1 FROM standing)
           THEN (SELECT ${BoxBytesSql} ${VaultBoxesSql}) ELSE 0 END AS bytes_used,
         box.*
  FROM counted LEFT JOIN (SELECT * FROM written UNION ALL SELECT *, false FROM standing) AS box ON true`

// A box over the revision read, beside the vault props it expects: written only over the box
// standing locked, and only while it is at that revision.
const ReplaceBoxSql = `WITH vault AS (
    ${ExpectedVaultSql}
  ), standing AS MATERIALIZED (
    ${StandingBoxSql}
  ), written AS (
    UPDATE safebyok_boxes SET (${Columns.names(BoxColumns)}) = ROW(${Columns.placeholders(BoxColumns, BoxParamsFrom)})
    WHERE ${ScopeIs} AND vault_tok = $4::text
      AND boxlabel = ${Columns.placeholderOf(BoxColumns, 'boxlabel', BoxParamsFrom)}
      AND revision_tok = $5::text
      AND EXISTS (SELECT 1 FROM standing)
    RETURNING ${Columns.selected(BoxColumns)}
  )
  SELECT EXISTS (SELECT 1 FROM vault) AS vault_stands, false AS was_full, box.*
  FROM (SELECT 1) AS answer LEFT JOIN (
    SELECT *, true AS landed FROM written
    UNION ALL
    SELECT *, false FROM standing WHERE NOT EXISTS (SELECT 1 FROM written)
  ) AS box ON true`

// Lands while the vault props of that vault_tok stand, whether or not there was a box to delete,
// and answers one row then, saying what it removed: the revision_tok its DELETE returned, or null
// for none (the column is NOT NULL, so null is only ever no box). A box written meanwhile
// is one the DELETE waited on and then removed as it stands, its revision the one returned. No row
// when the vault props did not stand.
const DelBoxSql = `WITH deleted AS (
    DELETE FROM safebyok_boxes WHERE ${ScopeIs} AND boxlabel = $4::text AND vault_tok = $5::text
      AND EXISTS (SELECT 1 FROM safebyok_vaults WHERE ${ScopeIs} AND vault_tok = $5::text)
    RETURNING revision_tok
  )
  SELECT (SELECT revision_tok FROM deleted) AS deleted_tok FROM safebyok_vaults WHERE ${ScopeIs} AND vault_tok = $5::text`

// The vault props are deleted only at the vault_tok in $4 and, unless $5 is null, the gate_epoch in
// $5, and the tombstone takes their place in the same statement, its counter the vault's plus one.
// The boxes go with the vault props, by the foreign key's cascade. No row back when nothing was
// deleted, a tombstone standing alone included.
const DelVaultSql = `WITH deleted AS (
    DELETE FROM safebyok_vaults WHERE ${ScopeIs} AND vault_tok = $4::text AND ($5::bigint IS NULL OR gate_epoch = $5::bigint)
    RETURNING vault_epoch
  )
  INSERT INTO safebyok_vault_tombstones (${Columns.names(TombstoneColumns)})
  SELECT $1::text, $2::text, $3::text, '${TombstoneFormat}', deleted.vault_epoch + 1 FROM deleted
  ON CONFLICT (applabel, user_id, vaultlabel) DO UPDATE SET vault_epoch = EXCLUDED.vault_epoch
  RETURNING ${Columns.selected(TombstoneColumns)}`

// ------------------------------------------------------------------------------------ the adapter

/** The VaultDB {@link postgresVaultDB} makes: each write one statement, after checking the scope is the signed-in user's own. */
class TablesVaultDB extends VaultDB {
  // Postgres holds far more in one row; a mebibyte is what this adapter promises, as the other
  // in-tree adapters do, and more than most servers accept in one request.
  readonly maxRecordBytes = 1024 * 1024
  // Nothing here reads a vault under a budget: a vault is as many bytes as the database lets it grow.
  readonly maxVaultBytes = Infinity
  readonly maxBoxes: number
  // Each name is a column of its own, but a box's four make up one primary key, and a btree
  // entry holds at most 2704 bytes: four names of this many fit with room for its overhead.
  readonly maxNameBytes = MaxNameBytes

  private readonly client: PostgresClient
  private readonly userId: string | null
  private readonly listen: PostgresListen | undefined

  constructor(client: PostgresClient, userId: string | null, listen: PostgresListen | undefined, maxBoxes: number, vaultDBOpts: VaultDBOpts) {
    super(vaultDBOpts)
    this.client = client
    this.userId = userId
    this.listen = listen
    this.maxBoxes = maxBoxes
  }

  protected async doGetVault(scope: VaultScope): Promise<StoredVault> {
    this.mustReach(scope)
    const { rows } = await this.sent(GetVaultSql, scopeParams(scope))
    return rows.length === 0 ? { vaultProps: null, boxes: [] } : storedVaultOf(rows[0])
  }

  protected async doEnsureVault(draft: GatelessVaultProps): Promise<StoredVault> {
    this.mustReach(draft)
    const { rows } = await this.sent(EnsureVaultSql, Columns.paramsOf(draft, VaultPropsColumns))
    return storedVaultOf(rows[0])
  }

  // What a miss reports is the row as the statement's FOR UPDATE read it; what a write that lands
  // answers is the row as the statement's UPDATE left it.
  protected async doPutVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<unknown> {
    this.mustReach(vaultProps)
    const params = [...Columns.paramsOf(vaultProps, VaultPropsColumns), expected.vault_tok, expected.gate_epoch]
    const { rows } = await this.sent(PutVaultPropsSql, params)
    const answer = rows[0] as { landed: boolean, stands: boolean }
    if (answer.landed) { return Columns.recordOf(answer, VaultPropsColumns) }
    throw Refusals.staleVaultProps(answer.stands ? Columns.recordOf(answer, VaultPropsColumns) : null)
  }

  protected async doGetBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    this.mustReach(scope)
    const { rows } = await this.sent(GetBoxSql, [...scopeParams(scope), boxlabel])
    return rows.length === 0 ? null : Columns.recordOf(rows[0], BoxColumns)
  }

  // The box handed back, and the one a stale write reports, is the row as the statement that
  // wrote it, or locked it, returned it.
  protected async doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<unknown> {
    this.mustReach(scope)
    const boxParams = Columns.paramsOf(box, BoxColumns)
    const answer = expected.revision_tok === null
      ? await this.insertBox([...scopeParams(scope), expected.vault_tok, this.maxBoxes === Infinity ? null : this.maxBoxes, ...boxParams])
      : await this.replaceBox([...scopeParams(scope), expected.vault_tok, expected.revision_tok, ...boxParams])
    if (! answer.vault_stands) { throw Refusals.vaultMismatch() }
    const standing = answer.landed === null ? null : Columns.recordOf(answer, BoxColumns)
    if (answer.landed) { return standing }
    // A full vault refuses a new box; a boxlabel already taken, even in a full vault, is a box
    // the writer missed, which it would replace, and which is never refused for the count.
    if (standing === null && answer.was_full) { throw Refusals.vaultFull(this.capacityOf(answer)) }
    throw Refusals.staleBox(standing)
  }

  // Counted and weighed in one statement, against this VaultDB's limits.
  protected async doGetCapacity(scope: VaultScope): Promise<unknown> {
    this.mustReach(scope)
    const { rows } = await this.sent(GetCapacitySql, scopeParams(scope))
    return this.capacityOf(rows[0] as VaultTally)
  }

  /** How full a vault is, from what a statement counted and weighed, against this VaultDB's limits. */
  private capacityOf({ box_count: boxCount, bytes_used: bytesUsed }: VaultTally) {
    return { boxes: { used: boxCount, max: this.maxBoxes }, bytes: { used: bytesUsed, max: this.maxVaultBytes } }
  }

  // Runs ReplaceBoxSql and reads its one row.
  private async replaceBox(params: unknown[]): Promise<BoxAnswer> {
    const { rows } = await this.sent(ReplaceBoxSql, params)
    return rows[0] as BoxAnswer
  }

  // Runs InsertBoxSql and reads its one row. A foreign key violation is the vault deleted between
  // the statement's snapshot and the foreign key's check, which reads the vault row as it stands then.
  private async insertBox(params: unknown[]): Promise<BoxAnswer> {
    try {
      const { rows } = await this.sent(InsertBoxSql, params)
      return rows[0] as BoxAnswer
    } catch (err) {
      if ((err as { code?: unknown } | null)?.code === ForeignKeyViolation) { return { vault_stands: false, was_full: false, landed: null, box_count: 0, bytes_used: 0 } }
      throw err
    }
  }

  // What it removed is what the statement that removed it returned, compared as the listing reads
  // it: a column holding no revision that reads as one (an empty one) is the none a damaged
  // box is listed with.
  protected async doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<BoxDeletion | null> {
    this.mustReach(scope)
    const { rows } = await this.sent(DelBoxSql, [...scopeParams(scope), boxlabel, expected.vault_tok])
    if (rows.length === 0) { return null }
    const { deleted_tok: deletedTok } = rows[0] as { deleted_tok: string | null }
    return Expectations.deletionOf(deletedTok === null ? null : { revision_tok: deletedTok }, expected)
  }

  protected async doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<unknown> {
    this.mustReach(scope)
    const { rows } = await this.sent(DelVaultSql, [...scopeParams(scope), expected.vault_tok, expected.gate_epoch])
    return rows.length === 0 ? null : Columns.recordOf(rows[0], TombstoneColumns)
  }

  protected override doSubscribe(scope: VaultScope, onChange: () => void): () => void {
    this.mustReach(scope)
    if (! this.listen) { return noUnsubscribing }
    const heard = (payload: string) => {
      if (namesScope(payload, scope)) { onChange() }
    }
    const trouble = this.watchTrouble("This vault's Postgres listen failed to start, so other devices' changes will not reach it until it is opened again: check the `listen` handed to postgresVaultDB.")
    const unlistening = settled(Promise.resolve(this.listen(VaultChangeChannel, heard)), (err) => { trouble.failed(err) })
    // Once listening, it calls once: a write that landed while the listen began was never notified
    // to it, and its subscriber, which read the vault before, reads again now. The base class
    // calls no subscriber once unsubscribed, and unsubscribes once.
    void onceListening(unlistening, onChange)
    return () => { void endListen(unlistening, (err) => { this.logger.error("A Postgres unlisten failed, so its listen may still hear notifications. Nothing else is affected.", { call: 'subscribe' }, err instanceof Error ? err : null) }) }
  }

  /** The rows of one statement, sent as given.
   * The database refusing it by a rule of the host's, a privilege or a row-level security policy,
   * refuses as `not_permitted`, the driver's error its `cause`. Anything else it throws goes up as it came.
   */
  private async sent(text: string, params: unknown[]): Promise<{ rows: unknown[] }> {
    try {
      return await this.client.query(text, params)
    } catch (err) {
      if ((err as { code?: unknown } | null)?.code === InsufficientPrivilege) {
        throw Refusals.notPermitted(NotPermittedMessage, { cause: err })
      }
      throw err
    }
  }

  /** Refuses unless the signed-in user is the one `scope` names. */
  private mustReach(scope: Pick<VaultScope, 'user_id'>): void {
    if (this.userId === null) {
      throw new VaultError('identity_revoked', 'No one is signed in, so this vault cannot be reached: sign in, then try again.')
    }
    if (scope.user_id !== this.userId) {
      throw new VaultError('identity_revoked', 'This vault belongs to another user than the one signed in: a signed-in user reaches only their own vaults. If the user changed, open the vault for the new one.')
    }
  }
}

/** How many boxes a vault holds, and what they weigh, as a statement counted them. */
type VaultTally = { box_count: number, bytes_used: number }

/** The one row a box write answers, beside the columns of the box standing now, null where none does.
 * `landed` is null when no box stands to report. The tally is weighed only for a first write
 * that met a full vault, `was_full`.
 */
type BoxAnswer = VaultTally & { vault_stands: boolean, was_full: boolean, landed: boolean | null }

/** Postgres's error code for a foreign key violation: `23503`. */
const ForeignKeyViolation = '23503'

/** Postgres's error code for a privilege refused, `42501`, by a role's grants or a row-level security policy. */
const InsufficientPrivilege = '42501'

const NotPermittedMessage = "The vault's database refused this call by a rule of the app's own -- a privilege, or a row-level security policy -- so nothing was read or written. Signing in again will not help: the app's own rules decide who may."

/** The most bytes of UTF-8 a Postgres-backed name holds: a box's four names share one primary key, and a btree entry holds 2704 bytes. */
const MaxNameBytes = 640

const scopeParams = (scope: VaultScope): string[] => [scope.applabel, scope.user_id, scope.vaultlabel]

/** A vault as a statement read it, its vault props' columns beside its boxes as JSON text: the vault props as stored, and each box under its own boxlabel column. */
const storedVaultOf = (row: unknown): StoredVault => {
  const listed = JSON.parse((row as { boxes: string }).boxes) as Record<string, unknown>[]
  return {
    vaultProps: Columns.recordOf(row, VaultPropsColumns),
    boxes:      listed.map((box) => ({ boxlabel: box['boxlabel'] as string, box: Columns.recordOf(box, ListedBoxColumns) })),
  }
}

/** True when a notification's payload names `scope`, or names nothing readable, which costs a spurious refresh at worst. */
const namesScope = (payload: string, scope: VaultScope): boolean => {
  const named = VaultScope.safeParse(jsonOrNull(payload))
  if (! named.success) { return true }
  return named.data.applabel === scope.applabel && named.data.user_id === scope.user_id && named.data.vaultlabel === scope.vaultlabel
}

const jsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** The unlisten a {@link PostgresListen} hands back, or null when the listen failed, which `failed` hears.
 * Its subscriber then hears nothing more, as without a listen.
 */
const settled = async (unlisten: Promise<PostgresUnlisten>, failed: (err: unknown) => void): Promise<PostgresUnlisten | null> => {
  try {
    return await unlisten
  } catch (err) {
    failed(err)
    return null
  }
}

/** Calls `onListening` once the listen has begun, if it began. */
const onceListening = async (unlistening: Promise<PostgresUnlisten | null>, onListening: () => void): Promise<void> => {
  if (await unlistening) { onListening() }
}

/** Ends a listen once it has begun, handing `failed` anything the unlisten throws: the subscriber already hears nothing. */
const endListen = async (unlistening: Promise<PostgresUnlisten | null>, failed: (err: unknown) => void): Promise<void> => {
  const unlisten = await unlistening
  if (! unlisten) { return }
  try {
    await unlisten()
  } catch (err) {
    failed(err)
  }
}

const noUnsubscribing = (): void => undefined
