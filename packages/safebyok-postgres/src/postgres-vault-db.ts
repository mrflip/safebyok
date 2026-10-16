import { VaultDB, VaultError, VaultScope } from 'safebyok'
import type { BundleExpectation, EraseExpectation, Lockbox, LockboxExpectation, StoredLockbox, VaultBundle } from 'safebyok'
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

/**
 * The VaultDB {@link postgresVaultDB} makes, with one verb more for a server that carries its
 * verbs over a wire to a VaultDB in the browser: {@link PostgresVaultDB.listBoxRecords}.
 */
export type PostgresVaultDB = VaultDB & {
  /**
   * Every lockbox in `scope` as stored, its two ciphered fields left out, `format` kept and a
   * missing note missing: what the browser's VaultDB hands back from its own `doListBoxes`, to be
   * validated there. `listBoxes` gives summaries instead, the shape a vault shows, which a VaultDB
   * may not hand back. Refuses as `listBoxes` does: `bad_label` for a malformed scope,
   * `identity_revoked` for another user's, `storage_unavailable` for trouble.
   *
   * @example served.set('listBoxes', (vaultDB, [scope]) => vaultDB.listBoxRecords(scope))
   */
  listBoxRecords(scope: VaultScope): Promise<unknown[]>
}

/** What {@link postgresVaultDB} is made with, once per request. */
export type PostgresVaultDBOpts = {
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
   * The most lockboxes one vault holds: a whole number above zero, default 1000. Enforced here,
   * on the server, so a modified browser cannot grow a vault past it; the browser's vault opens
   * with no larger `maxLockboxes`. For no practical limit, pass a large number, such as
   * 1_200_300_400_500_600: the limit goes to Postgres as a bigint, where `Infinity` cannot.
   */
  maxLockboxes?: number | undefined
}

/** How many lockboxes a vault holds unless {@link PostgresVaultDBOpts.maxLockboxes} says otherwise. */
const DefaultMaxLockboxes = 1000

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
 *   while what it expects still stands, and a failed expectation refuses with kind `stale_write`.
 * * **A full vault**: a new lockbox in a vault already holding `maxLockboxes` refuses with kind
 *   `vault_full`, and the refused write stored nothing. The check is a best effort, made in the
 *   statement that inserts, by counting the vault's lockboxes as of that statement's start, with
 *   no lock and no counter kept: writes made one after another never take a vault past the limit,
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
 * @param opts - The `client`, the `userId` this request is for, an optional `listen`, and an
 *   optional `maxLockboxes`.
 * @returns The VaultDB, holding at most 1 MiB in one record and `maxLockboxes` lockboxes in one
 *   vault, setting no limit on a vault's bytes, with {@link PostgresVaultDB.listBoxRecords}
 *   beside its verbs for a route to serve.
 *
 * @example
 *   const vaultDB = postgresVaultDB({ client: pool, userId: session.userId })
 *   await vaultDB.readBundle({ applabel: 'acme', user_id: session.userId, vaultlabel: 'main' })
 * @example
 *   const vaultDB = postgresVaultDB({ client: pool, userId: session.userId, maxLockboxes: 250 })
 */
export const postgresVaultDB = (opts: PostgresVaultDBOpts): PostgresVaultDB => {
  const { client, userId, listen, maxLockboxes = DefaultMaxLockboxes } = (opts as Partial<PostgresVaultDBOpts> | null | undefined) ?? {}
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
    throw new VaultError('bad_option', "postgresVaultDB's `maxLockboxes`, when given, is a whole number above zero; for no practical limit, pass a large one, such as 1_200_300_400_500_600.")
  }
  return new TablesVaultDB(client, userId === undefined || userId === '' ? null : userId, listen, maxLockboxes)
}

// A safe integer, so it reaches Postgres as the bigint it reads.
const isLockboxCount = (count: unknown): count is number => Number.isSafeInteger(count) && (count as number) > 0

const isPostgresClient = (client: unknown): client is PostgresClient => (
  typeof client === 'object' && client !== null && typeof (client as { query?: unknown }).query === 'function'
)

// ------------------------------------------------------------------------------------- the SQL

// Every statement names its vault by these three parameters, first.
const ScopeIs = 'applabel = $1::text AND user_id = $2::text AND vaultlabel = $3::text'
const BundleParamCount = BundleColumns.length
const LockboxParamsFrom = 4

const ReadBundleSql = `SELECT ${Columns.selected(BundleColumns)} FROM safebyok_bundles WHERE ${ScopeIs}`

// Another device's bundle may land between this statement's start and its insert: DO NOTHING
// would then return no row, so a no-op update instead returns the bundle that stands. Nothing
// changes, so a notify trigger, if the host installed one, tells no one.
const CreateBundleSql = `INSERT INTO safebyok_bundles (${Columns.names(BundleColumns)})
  VALUES (${Columns.placeholders(BundleColumns, 1)})
  ON CONFLICT (applabel, user_id, vaultlabel) DO UPDATE SET format = safebyok_bundles.format
  RETURNING ${Columns.selected(BundleColumns)}`

// The bundle written must name the vault it replaces: a vault_id never changes.
const UpdateBundleSql = `UPDATE safebyok_bundles SET (${Columns.names(BundleColumns)}) = ROW(${Columns.placeholders(BundleColumns, 1)})
  WHERE ${ScopeIs}
    AND vault_id = $${String(BundleParamCount + 1)}::text AND unlock_epoch = $${String(BundleParamCount + 2)}::bigint
    AND vault_id = ${Columns.placeholderOf(BundleColumns, 'vault_id', 1)}
  RETURNING 1 AS landed`

const ReadBoxSql = `SELECT ${Columns.selected(LockboxColumns)} FROM safebyok_lockboxes WHERE ${ScopeIs} AND boxlabel = $4::text`

const ListBoxesSql = `SELECT ${Columns.selected(ListedLockboxColumns)} FROM safebyok_lockboxes WHERE ${ScopeIs}`

// A first lockbox under its boxlabel: inserted only beside a bundle of the expected vault_id, only
// where no lockbox stands, and only while the vault holds fewer than $5 lockboxes. It answers one
// row that says why it did or did not land, all read from the one snapshot the statement began
// with: whether it landed, whether the vault of that vault_id stood, whether the boxlabel was
// already taken, and whether the vault was already at its limit.
//
// Nothing is locked and nothing is counted in advance: the limit is the count of the vault's
// lockboxes at the start of this statement, a best effort. Under READ COMMITTED, Postgres's
// default, writers racing for the last places each count from their own snapshot, may each find
// room, and all land: the vault goes a few past its limit (by at most one less than the number of
// racers), which the contract allows, and a refused write inserted nothing, since the refusal is
// the WHERE of one atomic statement. The bundle is read from the snapshot too, so a vault erased
// after it began is met by the foreign key, which reads the bundle that stands now: that failure
// is caught as a stale writer (see insertBox), and no lockbox ever lands in a vault but its own.
const InsertBoxSql = `WITH vault AS (
    SELECT applabel, user_id, vaultlabel, vault_id FROM safebyok_bundles
    WHERE ${ScopeIs} AND vault_id = $4::text
  ), counted AS (
    SELECT count(*) AS standing FROM safebyok_lockboxes WHERE ${ScopeIs}
  ), inserted AS (
    INSERT INTO safebyok_lockboxes (applabel, user_id, vaultlabel, vault_id, ${Columns.names(LockboxColumns)})
    SELECT applabel, user_id, vaultlabel, vault_id, ${Columns.placeholders(LockboxColumns, LockboxParamsFrom + 2)}
    FROM vault, counted WHERE counted.standing < $5::bigint
    ON CONFLICT (applabel, user_id, vaultlabel, boxlabel) DO NOTHING
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM inserted) AS landed,
         EXISTS (SELECT 1 FROM vault) AS vault_stands,
         EXISTS (SELECT 1 FROM safebyok_lockboxes WHERE ${ScopeIs} AND boxlabel = ${Columns.placeholderOf(LockboxColumns, 'boxlabel', LockboxParamsFrom + 2)}) AS box_stood,
         (SELECT standing FROM counted) >= $5::bigint AS was_full`

// A lockbox over the revision read. Its vault_id column is its bundle's (the foreign key holds
// them together), so matching it is matching the bundle that stands.
const ReplaceBoxSql = `UPDATE safebyok_lockboxes SET (${Columns.names(LockboxColumns)}) = ROW(${Columns.placeholders(LockboxColumns, LockboxParamsFrom + 2)})
  WHERE ${ScopeIs} AND vault_id = $4::text AND revision_id = $5::text
    AND boxlabel = ${Columns.placeholderOf(LockboxColumns, 'boxlabel', LockboxParamsFrom + 2)}
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
class TablesVaultDB extends VaultDB implements PostgresVaultDB {
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

  constructor(client: PostgresClient, userId: string | null, listen: PostgresListen | undefined, maxLockboxes: number) {
    super()
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
      const params = [...scopeParams(scope), expected.vault_id, expected.revision_id, ...boxParams]
      return landed(await this.client.query(ReplaceBoxSql, params))
    }
    const outcome = await this.insertBox([...scopeParams(scope), expected.vault_id, this.maxLockboxes, ...boxParams])
    if (outcome === null) { return false }
    if (outcome.landed) { return true }
    // A vault gone or made anew, or a boxlabel already taken (a lockbox the writer missed, which
    // it would replace, and which is never refused for the count), is a stale writer. Otherwise
    // the vault was at its limit when the statement began; and if it was not, a writer racing for
    // this boxlabel got in after the snapshot, and this one is only stale as well.
    if (! outcome.vault_stands || outcome.box_stood || ! outcome.was_full) { return false }
    throw new VaultError('vault_full', `This vault already holds the ${String(this.maxLockboxes)} lockboxes its storage keeps in one vault: erase one before storing another.`)
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

  async listBoxRecords(scope: VaultScope): Promise<unknown[]> {
    const asked = heldScope(scope)
    if (asked === null) {
      throw new VaultError('bad_label', `A vault scope is an applabel, a user_id and a vaultlabel, each a name above the floor every name is held to and at most ${String(MaxNameBytes)} bytes of UTF-8.`)
    }
    try {
      const listed = await this.doListBoxes(asked)
      return listed.map((stored) => stored.lockbox)
    } catch (err) {
      if (err instanceof VaultError) { throw err }
      throw new VaultError('storage_unavailable', "The vault's storage could not be reached, or failed partway: try again shortly. The storage adapter's own error is this error's cause.", { cause: err })
    }
  }

  protected override doSubscribe(scope: VaultScope, onChange: () => void): () => void {
    this.mustReach(scope)
    if (! this.listen) { return noUnsubscribing }
    let listening = true
    const heard = (payload: string) => {
      if (listening && namesScope(payload, scope)) { onChange() }
    }
    const unlistening = settled(this.listen(VaultChangeChannel, heard))
    // Once listening, it calls once: a write that landed while the listen began was never notified
    // to it, and its subscriber, which read the vault before, reads again now.
    void onceListening(unlistening, () => {
      if (listening) { onChange() }
    })
    return () => {
      if (! listening) { return }
      listening = false
      void endListen(unlistening)
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

/** The one row {@link InsertBoxSql} answers: why a first lockbox write did, or did not, land. */
type InsertBoxOutcome = { landed: boolean, vault_stands: boolean, box_stood: boolean, was_full: boolean }

/** Postgres's error code for a foreign key violation: `23503`. */
const ForeignKeyViolation = '23503'

/**
 * The most bytes of UTF-8 a Postgres-backed name holds: a lockbox's primary key is its applabel,
 * user_id, vaultlabel and boxlabel together, and Postgres refuses a btree entry over 2704 bytes.
 */
const MaxNameBytes = 640

/** `scope`, once its names pass the floor and each fits in {@link MaxNameBytes}; null otherwise. */
const heldScope = (scope: unknown): VaultScope | null => {
  const checked = VaultScope.safeParse(scope)
  if (! checked.success) { return null }
  const { applabel, user_id: userId, vaultlabel } = checked.data
  return [applabel, userId, vaultlabel].every((part) => new TextEncoder().encode(part).length <= MaxNameBytes) ? checked.data : null
}

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
 * failed. A listen that rejects has nobody to throw to, and its subscriber hears nothing more, as
 * without a listen.
 */
const settled = async (unlisten: PostgresUnlisten | Promise<PostgresUnlisten>): Promise<PostgresUnlisten | null> => {
  try {
    return await unlisten
  } catch {
    return null
  }
}

/** Calls `onListening` once the listen has begun, if it began. */
const onceListening = async (unlistening: Promise<PostgresUnlisten | null>, onListening: () => void): Promise<void> => {
  if (await unlistening) { onListening() }
}

/**
 * Ends a listen once it has begun -- at once, or as it arrives -- with anything the unlisten
 * throws or rejects with ignored: there is nobody to tell, and the subscriber already hears nothing.
 */
const endListen = async (unlistening: Promise<PostgresUnlisten | null>): Promise<void> => {
  const unlisten = await unlistening
  if (! unlisten) { return }
  try {
    await unlisten()
  } catch {
    // The listen is as ended as this side can make it.
  }
}

const noUnsubscribing = (): void => undefined
