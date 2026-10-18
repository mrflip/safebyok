import { Refusals, VaultDB, VaultError, VaultScope } from 'safebyok'
import type { BundleExpectation, VaultDBOpts, EraseExpectation, Lockbox, LockboxExpectation, StoredLockbox, VaultBundle } from 'safebyok'
import * as Columns from './columns'
import { BundleColumns, ListedLockboxColumns, LockboxColumns } from './columns'
import { VaultChangeChannel } from './vault-tables'

/**
 * What this VaultDB needs of a Postgres driver: one statement, its parameters numbered `$1`, `$2`
 * and on, and the rows it returns. A `pg` Pool, Client or PoolClient is one as it stands, and so
 * is a PGlite; postgres.js takes a one-line wrapper. Every statement this VaultDB sends is one
 * statement, so each is atomic on its own, and every write is one: no transaction is asked of the
 * driver.
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

/**
 * The host's way to hear Postgres notifications on `channel` (always {@link VaultChangeChannel}):
 * call `onNotify` with each one's payload, and return the unlisten, or a promise for it. A
 * PGlite's `listen` is one, called on its PGlite as the example does: passed bare, it loses its
 * `this`. With `pg`, one long-lived connection LISTENs for the whole server, and this hands its
 * notifications to every VaultDB made per request (see the README).
 *
 * @example (channel, onNotify) => pglite.listen(channel, onNotify)
 */
export type PostgresListen = (channel: string, onNotify: (payload: string) => void) => PostgresUnlisten | Promise<PostgresUnlisten>

/** What {@link postgresVaultDB} is made with, once per request. */
export type PostgresVaultDBOpts = VaultDBOpts & {
  /** The database: a {@link PostgresClient}, such as your server's `pg` Pool. */
  client: PostgresClient
  /**
   * The signed-in user this request is for, as your server's own auth established it -- never
   * as the browser claims it -- or null (or undefined, or empty) when no one is signed in. Only
   * that user's vaults are reached.
   */
  userId: string | null | undefined
  /** Where the VaultDB hears other writes, to call its subscribers; without it, it never calls. */
  listen?: PostgresListen | undefined
  /**
   * The most lockboxes one vault holds: a whole number above zero, or `Infinity`, the default,
   * for none. A limit is enforced here, on the server, as a best effort, so a modified browser
   * cannot grow a vault far past it; the browser's vault opens with no larger `maxLockboxes`. With
   * none, nothing is counted, and how large a vault grows is the host's to bound, by its own quotas.
   */
  maxLockboxes?: number | undefined
}

/**
 * safebyok's storage in Postgres: a VaultDB over the tables {@link VaultTablesSql} makes, run on
 * your server -- Postgres has nowhere to run a vault's verbs, and the vault itself runs in the
 * browser -- made per request for the signed-in user. Your route layer calls its verbs for the
 * browser's vault (the README has the recipe), or a GraphQL server does (`safebyok-graphql`).
 *
 * * **Who may reach a vault**: only `userId`. A verb naming any other user's scope, or any at
 *   all while no one is signed in, refuses with a VaultError of kind `identity_revoked` before
 *   the database is asked anything: the user the browser's vault was opened for is not the one
 *   signed in, and that vault locks itself.
 * * **Every write is one statement**, atomic as Postgres makes every statement: a write lands only
 *   while what it expects still stands, and a failed expectation refuses with kind `stale_write`,
 *   as does a bundle update that does not move its `unlock_epoch` forward.
 *   A lockbox write reads its vault's bundle row `FOR SHARE`, so it lands only while that bundle
 *   stands for the vaultKey the lockbox was sealed under: a bundle update waits for it to end, or
 *   it for the update, and lockbox writes never wait for each other on the bundle.
 * * **A full vault**: a new lockbox in a vault already holding `maxLockboxes` refuses with kind
 *   `vault_full`, and the refused write stored nothing. The check is a best effort, made in the
 *   statement that inserts, by counting the vault's lockboxes as of that statement's start, with
 *   no lock on them and no counter kept: writes made one after another never take a vault past the limit,
 *   but writers racing for the last places may each find room, and all land. A lockbox replacing
 *   one already there is never refused for the count, and a stale writer is told from a full
 *   vault by the same statement.
 * * **Isolation**: every guarantee above holds under READ COMMITTED, Postgres's default. Under
 *   REPEATABLE READ or SERIALIZABLE (a host's session default, or its own transaction around a
 *   call), some races fail with a serialization error instead, as `storage_unavailable`, and
 *   the call may simply be tried again.
 * * **Other writes**: with `listen` and the optional triggers `VaultNotifySql` installs,
 *   `subscribe` hears every write to the vault, from any server and any device, and calls once as
 *   its listen begins, so a write made while it began is read too; without either, nothing is
 *   pushed.
 * * **Trouble**: anything the driver throws refuses with kind `storage_unavailable`, the driver's
 *   own error as its `cause`. Every refusal is a VaultError, whose `kind` a wire can carry.
 *
 * @param opts - The `client`, the `userId` this request is for, an optional `listen`, an
 *   optional `maxLockboxes`, and an optional `logger`, which hears a `listen` that fails (the default logger without one; a vault opened with no logger of its own hears it too).
 * @returns The VaultDB, holding at most 1 MiB in one record and `maxLockboxes` lockboxes in one
 *   vault, setting no limit on a vault's bytes; its `listBoxRecords` lists a vault as stored, for
 *   a route to serve.
 *
 * @example
 *   const vaultDB = postgresVaultDB({ client: pool, userId: session.userId })
 *   await vaultDB.readBundle({ applabel: 'acme', user_id: session.userId, vaultlabel: 'main' })
 * @example
 *   const vaultDB = postgresVaultDB({ client: pool, userId: session.userId, maxLockboxes: 250 })
 */
export const postgresVaultDB = (opts: PostgresVaultDBOpts): VaultDB => {
  const { client, userId, listen, maxLockboxes = Infinity } = (opts as Partial<PostgresVaultDBOpts> | null | undefined) ?? {}
  if (! isPostgresClient(client)) {
    throw new VaultError('bad_option', 'postgresVaultDB needs a `client` with a `query(text, params)` method: a pg Pool or Client, a PGlite, or a wrapper around your driver.')
  }
  if (userId !== null && userId !== undefined && typeof userId !== 'string') {
    throw new VaultError('bad_option', "postgresVaultDB's `userId` is the signed-in user's id as text, or null when no one is signed in.")
  }
  if (listen !== undefined && typeof listen !== 'function') {
    throw new VaultError('bad_option', "postgresVaultDB's `listen`, when given, is a function: (channel, onNotify) => unlisten.")
  }
  if (! isLockboxCount(maxLockboxes)) {
    throw new VaultError('bad_option', "postgresVaultDB's `maxLockboxes`, when given, is a whole number above zero, or Infinity for no limit.")
  }
  return new TablesVaultDB(client, userId === undefined || userId === '' ? null : userId, listen, maxLockboxes, opts)
}

// A safe integer, so it reaches Postgres as the bigint it reads; Infinity reaches it as null, no limit.
const isLockboxCount = (count: unknown): count is number => count === Infinity || (Number.isSafeInteger(count) && (count as number) > 0)

const isPostgresClient = (client: unknown): client is PostgresClient => (
  typeof client === 'object' && client !== null && typeof (client as { query?: unknown }).query === 'function'
)

// ------------------------------------------------------------------------------------- the SQL

// Every statement names its vault by these three parameters, first.
const ScopeIs = 'applabel = $1::text AND user_id = $2::text AND vaultlabel = $3::text'
const BundleParamCount = BundleColumns.length
// A lockbox write's parameters: the scope, then $4 the expected vault_id, $5 the expected
// vault_key_epoch, $6 the expected revision_id (a replace) or the lockbox limit (an insert), and
// the lockbox's own columns from $7.
const LockboxParamsFrom = 7

const ReadBundleSql = `SELECT ${Columns.selected(BundleColumns)} FROM safebyok_bundles WHERE ${ScopeIs}`

// Another device's bundle may land between this statement's start and its insert: DO NOTHING
// would then return no row, so a no-op update instead returns the bundle that stands. Nothing
// changes, so a notify trigger, if the host installed one, tells no one.
const CreateBundleSql = `INSERT INTO safebyok_bundles (${Columns.names(BundleColumns)})
  VALUES (${Columns.placeholders(BundleColumns, 1)})
  ON CONFLICT (applabel, user_id, vaultlabel) DO UPDATE SET format = safebyok_bundles.format
  RETURNING ${Columns.selected(BundleColumns)}`

// The bundle written must name the vault it replaces, as a vault_id never changes, and move its
// unlock_epoch forward, as every update does (line 3.2): a modified client cannot write a bundle
// back over the one it read.
const UpdateBundleSql = `UPDATE safebyok_bundles SET (${Columns.names(BundleColumns)}) = ROW(${Columns.placeholders(BundleColumns, 1)})
  WHERE ${ScopeIs}
    AND vault_id = $${String(BundleParamCount + 1)}::text AND unlock_epoch = $${String(BundleParamCount + 2)}::bigint
    AND vault_id = ${Columns.placeholderOf(BundleColumns, 'vault_id', 1)}
    AND unlock_epoch < ${Columns.placeholderOf(BundleColumns, 'unlock_epoch', 1)}
  RETURNING 1 AS landed`

const ReadBoxSql = `SELECT ${Columns.selected(LockboxColumns)} FROM safebyok_lockboxes WHERE ${ScopeIs} AND boxlabel = $4::text`

const ListBoxesSql = `SELECT ${Columns.selected(ListedLockboxColumns)} FROM safebyok_lockboxes WHERE ${ScopeIs}`

// The bundle a lockbox write lands beside: the vault's, of the expected vault_id, standing for the
// vaultKey the lockbox was sealed under (line 3.8). It is read FOR SHARE, so a bundle update -- a
// rotation replacing the vaultKey -- waits until the write's statement ends, or the write waits
// for it, and then reads the bundle as it stands: the vault_key_epoch compared is the one standing
// when the write lands, never only the one in the statement's snapshot. Lockbox writers share the
// lock, so they never wait on each other for the bundle (two writes to one boxlabel still meet at
// its row, or at the unique index).
const ExpectedVaultSql = `SELECT applabel, user_id, vaultlabel, vault_id FROM safebyok_bundles
    WHERE ${ScopeIs} AND vault_id = $4::text AND vault_key_epoch = $5::bigint
    FOR SHARE`

// A first lockbox under its boxlabel: inserted only beside the bundle it expects, only where no
// lockbox stands, and only while the vault holds fewer than $6 lockboxes -- or, for a null $6, no
// limit, when nothing is counted: Postgres runs the count, an uncorrelated subquery, only when the
// CASE asks for it. It answers one row that
// says why it did or did not land: whether it landed, whether the bundle it expects stood, whether
// the boxlabel was already taken, and whether the vault was already at its limit.
//
// Nothing is counted in advance: the limit is the count of the vault's lockboxes at the start of
// this statement, a best effort. Under READ COMMITTED, Postgres's default, writers racing for the
// last places each count from their own snapshot, may each find room, and all land: the vault goes
// a few past its limit (by at most one less than the number of racers), which the contract allows,
// and a refused write inserted nothing, since the refusal is the WHERE of one atomic statement. A
// vault erased after the statement began is met by the bundle's FOR SHARE read, which finds it
// gone, or by the foreign key, which reads the bundle that stands now: that failure is caught as a
// stale writer (see insertBox), and no lockbox ever lands in a vault but its own.
const InsertBoxSql = `WITH vault AS (
    ${ExpectedVaultSql}
  ), counted AS (
    SELECT CASE WHEN $6::bigint IS NULL THEN 0 ELSE (SELECT count(*) FROM safebyok_lockboxes WHERE ${ScopeIs}) END AS standing
  ), inserted AS (
    INSERT INTO safebyok_lockboxes (applabel, user_id, vaultlabel, vault_id, ${Columns.names(LockboxColumns)})
    SELECT applabel, user_id, vaultlabel, vault_id, ${Columns.placeholders(LockboxColumns, LockboxParamsFrom)}
    FROM vault, counted WHERE $6::bigint IS NULL OR counted.standing < $6::bigint
    ON CONFLICT (applabel, user_id, vaultlabel, boxlabel) DO NOTHING
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM inserted) AS landed,
         EXISTS (SELECT 1 FROM vault) AS vault_stands,
         EXISTS (SELECT 1 FROM safebyok_lockboxes WHERE ${ScopeIs} AND boxlabel = ${Columns.placeholderOf(LockboxColumns, 'boxlabel', LockboxParamsFrom)}) AS box_stood,
         COALESCE((SELECT standing FROM counted) >= $6::bigint, false) AS was_full`

// A lockbox over the revision read, beside the bundle it expects.
const ReplaceBoxSql = `WITH vault AS (
    ${ExpectedVaultSql}
  )
  UPDATE safebyok_lockboxes SET (${Columns.names(LockboxColumns)}) = ROW(${Columns.placeholders(LockboxColumns, LockboxParamsFrom)})
  WHERE ${ScopeIs} AND vault_id = $4::text AND revision_id = $6::text
    AND boxlabel = ${Columns.placeholderOf(LockboxColumns, 'boxlabel', LockboxParamsFrom)}
    AND EXISTS (SELECT 1 FROM vault)
  RETURNING 1 AS landed`

// Lands while the bundle of that vault_id stands, whether or not there was a lockbox to erase.
const EraseBoxSql = `WITH erased AS (
    DELETE FROM safebyok_lockboxes WHERE ${ScopeIs} AND boxlabel = $4::text AND vault_id = $5::text
      AND EXISTS (SELECT 1 FROM safebyok_bundles WHERE ${ScopeIs} AND vault_id = $5::text)
  )
  SELECT 1 AS landed FROM safebyok_bundles WHERE ${ScopeIs} AND vault_id = $5::text`

// The lockboxes go with their bundle, by the foreign key's cascade, in the same statement.
const EraseVaultSql = `DELETE FROM safebyok_bundles WHERE ${ScopeIs} AND vault_id = $4::text RETURNING 1 AS landed`

// ------------------------------------------------------------------------------------ the adapter

/** Each write one statement, first checking the scope is the signed-in user's own. */
class TablesVaultDB extends VaultDB {
  // Postgres holds far more in one row; a mebibyte is what this adapter promises, as the other
  // in-tree adapters do, and more than most servers accept in one request.
  readonly maxRecordBytes = 1024 * 1024
  // Nothing here reads a vault under a budget: a vault is as many bytes as the database lets it grow.
  readonly maxVaultBytes = Infinity
  readonly maxLockboxes: number
  // Each name is a column of its own, but a lockbox's four make up one primary key, and a btree
  // entry holds at most 2704 bytes: four names of this many fit with room for its overhead.
  readonly maxNameBytes = MaxNameBytes

  private readonly client: PostgresClient
  private readonly userId: string | null
  private readonly listen: PostgresListen | undefined

  constructor(client: PostgresClient, userId: string | null, listen: PostgresListen | undefined, maxLockboxes: number, vaultDBOpts: VaultDBOpts) {
    super(vaultDBOpts)
    this.client = client
    this.userId = userId
    this.listen = listen
    this.maxLockboxes = maxLockboxes
  }

  protected async doReadBundle(scope: VaultScope): Promise<unknown> {
    this.mustReach(scope)
    const { rows } = await this.client.query(ReadBundleSql, scopeParams(scope))
    return rows.length === 0 ? null : Columns.recordOf(rows[0], BundleColumns)
  }

  protected async doCreateBundle(bundle: VaultBundle): Promise<unknown> {
    this.mustReach(bundle)
    const { rows } = await this.client.query(CreateBundleSql, Columns.paramsOf(bundle, BundleColumns))
    return Columns.recordOf(rows[0], BundleColumns)
  }

  protected async doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation): Promise<boolean> {
    this.mustReach(bundle)
    const params = [...Columns.paramsOf(bundle, BundleColumns), expected.vault_id, expected.unlock_epoch]
    return landed(await this.client.query(UpdateBundleSql, params))
  }

  protected async doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    this.mustReach(scope)
    const { rows } = await this.client.query(ReadBoxSql, [...scopeParams(scope), boxlabel])
    return rows.length === 0 ? null : Columns.recordOf(rows[0], LockboxColumns)
  }

  // Each row is stored under its own boxlabel column, so that is the boxlabel it is listed under.
  protected async doListBoxes(scope: VaultScope): Promise<StoredLockbox[]> {
    this.mustReach(scope)
    const { rows } = await this.client.query(ListBoxesSql, scopeParams(scope))
    return rows.map((row) => ({ boxlabel: (row as { boxlabel: string }).boxlabel, lockbox: Columns.recordOf(row, ListedLockboxColumns) }))
  }

  protected async doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<boolean> {
    this.mustReach(scope)
    const boxParams = Columns.paramsOf(lockbox, LockboxColumns)
    if (expected.revision_id !== null) {
      const params = [...scopeParams(scope), expected.vault_id, expected.vault_key_epoch, expected.revision_id, ...boxParams]
      return landed(await this.client.query(ReplaceBoxSql, params))
    }
    const outcome = await this.insertBox([...scopeParams(scope), expected.vault_id, expected.vault_key_epoch, this.maxLockboxes === Infinity ? null : this.maxLockboxes, ...boxParams])
    if (outcome === null) { return false }
    if (outcome.landed) { return true }
    // A vault gone or made anew, or its vaultKey replaced, or a boxlabel already taken (a lockbox
    // the writer missed, which it would replace, and which is never refused for the count), is a
    // stale writer. Otherwise
    // the vault was at its limit when the statement began; and if it was not, a writer racing for
    // this boxlabel got in after the snapshot, and this one is only stale as well.
    if (! outcome.vault_stands || outcome.box_stood || ! outcome.was_full) { return false }
    throw Refusals.vaultFull(this.maxLockboxes)
  }

  // Runs InsertBoxSql and reads its one row; null for the one failure that is only a stale writer:
  // its vault erased between the statement's snapshot and the foreign key's check, which reads the
  // bundle as it stands then.
  private async insertBox(params: unknown[]): Promise<InsertBoxOutcome | null> {
    try {
      const { rows } = await this.client.query(InsertBoxSql, params)
      return rows[0] as InsertBoxOutcome
    } catch (err) {
      if ((err as { code?: unknown } | null)?.code === ForeignKeyViolation) { return null }
      throw err
    }
  }

  protected async doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation): Promise<boolean> {
    this.mustReach(scope)
    return landed(await this.client.query(EraseBoxSql, [...scopeParams(scope), boxlabel, expected.vault_id]))
  }

  protected async doEraseVault(scope: VaultScope, expected: EraseExpectation): Promise<boolean> {
    this.mustReach(scope)
    return landed(await this.client.query(EraseVaultSql, [...scopeParams(scope), expected.vault_id]))
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

/** The one row {@link InsertBoxSql} answers: why a first lockbox write did, or did not, land. */
type InsertBoxOutcome = { landed: boolean, vault_stands: boolean, box_stood: boolean, was_full: boolean }

/** Postgres's error code for a foreign key violation: `23503`. */
const ForeignKeyViolation = '23503'

/**
 * The most bytes of UTF-8 a Postgres-backed name holds: a lockbox's primary key is its applabel,
 * user_id, vaultlabel and boxlabel together, and Postgres refuses a btree entry over 2704 bytes.
 */
const MaxNameBytes = 640

const scopeParams = (scope: VaultScope): string[] => [scope.applabel, scope.user_id, scope.vaultlabel]

/** True when a write's `RETURNING` or `SELECT` says it landed: one row back. */
const landed = ({ rows }: { rows: unknown[] }): boolean => rows.length > 0

/**
 * True when a notification's payload names `scope`, or names nothing readable: an empty payload
 * (a scope too long for one), or one in an unexpected shape, costs a spurious refresh at worst.
 */
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

/**
 * What a {@link PostgresListen} hands back, once it has: the unlisten, or null when the listen
 * failed, which `failed` hears. Its subscriber then hears nothing more, as without a listen.
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

/**
 * Ends a listen once it has begun -- at once, or as it arrives -- with anything the unlisten
 * throws or rejects with handed to `failed`: the subscriber already hears nothing.
 */
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
