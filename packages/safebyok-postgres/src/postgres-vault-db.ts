import { Expectations, Refusals, VaultDB, VaultError, VaultScope } from 'safebyok'
import type { VaultPropsExpectation, VaultDBOpts, VaultDelExpectation, Box, BoxExpectation, BoxDelExpectation, BoxDeletion, StoredBox, VaultProps } from 'safebyok'
import * as Columns from './columns'
import { VaultPropsColumns, ListedBoxColumns, BoxColumns } from './columns'
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
   * The most boxes one vault holds: a whole number above zero, or `Infinity`, the default,
   * for none. A limit is enforced here, on the server, as a best effort, so a modified browser
   * cannot grow a vault far past it; the browser's vault opens with no larger `maxBoxes`. With
   * none, nothing is counted, and how large a vault grows is the host's to bound, by its own quotas.
   */
  maxBoxes?: number | undefined
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
 *   as does an update of the vault props that does not move their `unlock_epoch` forward.
 *   A box write reads its vault row `FOR SHARE`, so it lands only while those vault props
 *   stand for the vaultKey the box was sealed under: an update of the vault props waits for it
 *   to end, or it for the update, and box writes never wait for each other on the vault row.
 * * **A full vault**: a new box in a vault already holding `maxBoxes` refuses with kind
 *   `vault_full`, and the refused write stored nothing. The check is a best effort, made in the
 *   statement that inserts, by counting the vault's boxes as of that statement's start, with
 *   no lock on them and no counter kept: writes made one after another never take a vault past the limit,
 *   but writers racing for the last places may each find room, and all land. A box replacing
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
 * * **Your database's own rules**: a statement it refuses for want of a privilege, or by a
 *   row-level security policy (Postgres's `42501`), refuses with kind `not_permitted`, which locks
 *   nothing, the driver's error as its `cause`.
 * * **Trouble**: anything else the driver throws refuses with kind `storage_unavailable`, the
 *   driver's own error as its `cause`. Every refusal is a VaultError, whose `refusalkind` a wire
 *   can carry.
 *
 * @param opts - The `client`, the `userId` this request is for, an optional `listen`, an
 *   optional `maxBoxes`, and an optional `logger`, which hears a `listen` that fails (the default logger without one; a vault opened with no logger of its own hears it too).
 * @returns The VaultDB, holding at most 1 MiB in one record and `maxBoxes` boxes in one
 *   vault, setting no limit on a vault's bytes; its `listBoxRecords` lists a vault as stored, for
 *   a route to serve.
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
// A box write's parameters: the scope, then $4 the expected vault_id, $5 the expected
// vault_key_epoch, $6 the expected revision_tok (a replace) or the box limit (an insert), and
// the box's own columns from $7.
const BoxParamsFrom = 7

const GetVaultPropsSql = `SELECT ${Columns.selected(VaultPropsColumns)} FROM safebyok_vaults WHERE ${ScopeIs}`

// Another device's vault props may land between this statement's start and its insert: DO NOTHING
// would then return no row, so a no-op update instead returns the vault props that stand. Nothing
// changes, so a notify trigger, if the host installed one, tells no one.
const EnsureVaultPropsSql = `INSERT INTO safebyok_vaults (${Columns.names(VaultPropsColumns)})
  VALUES (${Columns.placeholders(VaultPropsColumns, 1)})
  ON CONFLICT (applabel, user_id, vaultlabel) DO UPDATE SET format = safebyok_vaults.format
  RETURNING ${Columns.selected(VaultPropsColumns)}`

// The vault props written must name the vault they replace, as a vault_id never changes, and move
// their unlock_epoch forward, as every update does (line 3.2): a modified client cannot write vault
// props back over those it read.
const PutVaultPropsSql = `UPDATE safebyok_vaults SET (${Columns.names(VaultPropsColumns)}) = ROW(${Columns.placeholders(VaultPropsColumns, 1)})
  WHERE ${ScopeIs}
    AND vault_id = $${String(VaultPropsParamCount + 1)}::text AND unlock_epoch = $${String(VaultPropsParamCount + 2)}::bigint
    AND vault_id = ${Columns.placeholderOf(VaultPropsColumns, 'vault_id', 1)}
    AND unlock_epoch < ${Columns.placeholderOf(VaultPropsColumns, 'unlock_epoch', 1)}
  RETURNING 1 AS landed`

const GetBoxSql = `SELECT ${Columns.selected(BoxColumns)} FROM safebyok_boxes WHERE ${ScopeIs} AND boxlabel = $4::text`

const ListBoxesSql = `SELECT ${Columns.selected(ListedBoxColumns)} FROM safebyok_boxes WHERE ${ScopeIs}`

// The vault row a box write lands beside: the vault's, of the expected vault_id, standing for
// the vaultKey the box was sealed under (line 3.8). It is read FOR SHARE, so an update of the
// vault props -- a rotation replacing the vaultKey -- waits until the write's statement ends, or the
// write waits for it, and then reads the vault props as they stand: the vault_key_epoch compared is
// the one standing when the write lands, never only the one in the statement's snapshot. Box
// writers share the lock, so they never wait on each other for the vault row (two writes to one
// boxlabel still meet at its row, or at the unique index).
const ExpectedVaultSql = `SELECT applabel, user_id, vaultlabel, vault_id FROM safebyok_vaults
    WHERE ${ScopeIs} AND vault_id = $4::text AND vault_key_epoch = $5::bigint
    FOR SHARE`

// A first box under its boxlabel: inserted only beside the vault props it expects, only where no
// box stands, and only while the vault holds fewer than $6 boxes -- or, for a null $6, no
// limit, when nothing is counted: Postgres runs the count, an uncorrelated subquery, only when the
// CASE asks for it. It answers one row that says why it did or did not land: whether it landed,
// whether the vault props it expects stood, whether the boxlabel was already taken, and whether
// the vault was already at its limit -- and, when it landed, the box's columns as the insert
// stored them, from its RETURNING, null otherwise.
//
// Nothing is counted in advance: the limit is the count of the vault's boxes at the start of
// this statement, a best effort. Under READ COMMITTED, Postgres's default, writers racing for the
// last places each count from their own snapshot, may each find room, and all land: the vault goes
// a few past its limit (by at most one less than the number of racers), which the contract allows,
// and a refused write inserted nothing, since the refusal is the WHERE of one atomic statement. A
// vault deleted after the statement began is met by the vault row's FOR SHARE read, which finds it
// gone, or by the foreign key, which reads the vault row that stands now: that failure is caught as
// a stale writer (see insertBox), and no box ever lands in a vault but its own.
const InsertBoxSql = `WITH vault AS (
    ${ExpectedVaultSql}
  ), counted AS (
    SELECT CASE WHEN $6::bigint IS NULL THEN 0 ELSE (SELECT count(*) FROM safebyok_boxes WHERE ${ScopeIs}) END AS standing
  ), inserted AS (
    INSERT INTO safebyok_boxes (applabel, user_id, vaultlabel, vault_id, ${Columns.names(BoxColumns)})
    SELECT applabel, user_id, vaultlabel, vault_id, ${Columns.placeholders(BoxColumns, BoxParamsFrom)}
    FROM vault, counted WHERE $6::bigint IS NULL OR counted.standing < $6::bigint
    ON CONFLICT (applabel, user_id, vaultlabel, boxlabel) DO NOTHING
    RETURNING ${Columns.selected(BoxColumns)}
  )
  SELECT EXISTS (SELECT 1 FROM inserted) AS landed,
         EXISTS (SELECT 1 FROM vault) AS vault_stands,
         EXISTS (SELECT 1 FROM safebyok_boxes WHERE ${ScopeIs} AND boxlabel = ${Columns.placeholderOf(BoxColumns, 'boxlabel', BoxParamsFrom)}) AS box_stood,
         COALESCE((SELECT standing FROM counted) >= $6::bigint, false) AS was_full,
         inserted.*
  FROM (SELECT 1) AS answer LEFT JOIN inserted ON true`

// A box over the revision read, beside the vault props it expects, answering with its columns
// as the update stored them: no row when it did not land.
const ReplaceBoxSql = `WITH vault AS (
    ${ExpectedVaultSql}
  )
  UPDATE safebyok_boxes SET (${Columns.names(BoxColumns)}) = ROW(${Columns.placeholders(BoxColumns, BoxParamsFrom)})
  WHERE ${ScopeIs} AND vault_id = $4::text AND revision_tok = $6::text
    AND boxlabel = ${Columns.placeholderOf(BoxColumns, 'boxlabel', BoxParamsFrom)}
    AND EXISTS (SELECT 1 FROM vault)
  RETURNING ${Columns.selected(BoxColumns)}`

// Lands while the vault props of that vault_id stand, whether or not there was a box to delete,
// and answers one row then, saying what it removed: the revision_tok its DELETE returned, or null
// for none (the column is NOT NULL, so null is only ever no box). A box written meanwhile
// is one the DELETE waited on and then removed as it stands, its revision the one returned. No row
// when the vault props did not stand.
const DelBoxSql = `WITH deleted AS (
    DELETE FROM safebyok_boxes WHERE ${ScopeIs} AND boxlabel = $4::text AND vault_id = $5::text
      AND EXISTS (SELECT 1 FROM safebyok_vaults WHERE ${ScopeIs} AND vault_id = $5::text)
    RETURNING revision_tok
  )
  SELECT (SELECT revision_tok FROM deleted) AS deleted_tok FROM safebyok_vaults WHERE ${ScopeIs} AND vault_id = $5::text`

// The boxes go with their vault props, by the foreign key's cascade, in the same statement.
const DelVaultSql = `DELETE FROM safebyok_vaults WHERE ${ScopeIs} AND vault_id = $4::text RETURNING 1 AS landed`

// ------------------------------------------------------------------------------------ the adapter

/** Each write one statement, first checking the scope is the signed-in user's own. */
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

  protected async doGetVaultProps(scope: VaultScope): Promise<unknown> {
    this.mustReach(scope)
    const { rows } = await this.sent(GetVaultPropsSql, scopeParams(scope))
    return rows.length === 0 ? null : Columns.recordOf(rows[0], VaultPropsColumns)
  }

  protected async doEnsureVaultProps(vaultProps: VaultProps): Promise<unknown> {
    this.mustReach(vaultProps)
    const { rows } = await this.sent(EnsureVaultPropsSql, Columns.paramsOf(vaultProps, VaultPropsColumns))
    return Columns.recordOf(rows[0], VaultPropsColumns)
  }

  protected async doPutVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<boolean> {
    this.mustReach(vaultProps)
    const params = [...Columns.paramsOf(vaultProps, VaultPropsColumns), expected.vault_id, expected.unlock_epoch]
    return landed(await this.sent(PutVaultPropsSql, params))
  }

  protected async doGetBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    this.mustReach(scope)
    const { rows } = await this.sent(GetBoxSql, [...scopeParams(scope), boxlabel])
    return rows.length === 0 ? null : Columns.recordOf(rows[0], BoxColumns)
  }

  // Each row is stored under its own boxlabel column, so that is the boxlabel it is listed under.
  protected async doListBoxes(scope: VaultScope): Promise<StoredBox[]> {
    this.mustReach(scope)
    const { rows } = await this.sent(ListBoxesSql, scopeParams(scope))
    return rows.map((row) => ({ boxlabel: (row as { boxlabel: string }).boxlabel, box: Columns.recordOf(row, ListedBoxColumns) }))
  }

  // The box handed back is the row as the statement that wrote it returned it.
  protected async doPutBox(scope: VaultScope, box: Box, expected: BoxExpectation): Promise<unknown> {
    this.mustReach(scope)
    const boxParams = Columns.paramsOf(box, BoxColumns)
    if (expected.revision_tok !== null) {
      const params = [...scopeParams(scope), expected.vault_id, expected.vault_key_epoch, expected.revision_tok, ...boxParams]
      const { rows } = await this.sent(ReplaceBoxSql, params)
      return rows.length === 0 ? null : Columns.recordOf(rows[0], BoxColumns)
    }
    const outcome = await this.insertBox([...scopeParams(scope), expected.vault_id, expected.vault_key_epoch, this.maxBoxes === Infinity ? null : this.maxBoxes, ...boxParams])
    if (outcome === null) { return null }
    if (outcome.landed) { return Columns.recordOf(outcome, BoxColumns) }
    // A vault gone or made anew, or its vaultKey replaced, or a boxlabel already taken (a box
    // the writer missed, which it would replace, and which is never refused for the count), is a
    // stale writer. Otherwise
    // the vault was at its limit when the statement began; and if it was not, a writer racing for
    // this boxlabel got in after the snapshot, and this one is only stale as well.
    if (! outcome.vault_stands || outcome.box_stood || ! outcome.was_full) { return null }
    throw Refusals.vaultFull(this.maxBoxes)
  }

  // Runs InsertBoxSql and reads its one row; null for the one failure that is only a stale writer:
  // its vault deleted between the statement's snapshot and the foreign key's check, which reads the
  // vault row as it stands then.
  private async insertBox(params: unknown[]): Promise<InsertBoxOutcome | null> {
    try {
      const { rows } = await this.sent(InsertBoxSql, params)
      return rows[0] as InsertBoxOutcome
    } catch (err) {
      if ((err as { code?: unknown } | null)?.code === ForeignKeyViolation) { return null }
      throw err
    }
  }

  // What it removed is what the statement that removed it returned, compared as the listing reads
  // it: a column holding no revision that reads as one (an empty one) is the none a damaged
  // box is listed with.
  protected async doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<BoxDeletion | null> {
    this.mustReach(scope)
    const { rows } = await this.sent(DelBoxSql, [...scopeParams(scope), boxlabel, expected.vault_id])
    if (rows.length === 0) { return null }
    const { deleted_tok: deletedTok } = rows[0] as { deleted_tok: string | null }
    return Expectations.deletionOf(deletedTok === null ? null : { revision_tok: deletedTok }, expected)
  }

  protected async doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<boolean> {
    this.mustReach(scope)
    return landed(await this.sent(DelVaultSql, [...scopeParams(scope), expected.vault_id]))
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

  /**
   * Sends one statement. The database refusing it by a rule of the host's -- a privilege this
   * connection's role lacks, or a row-level security policy -- refuses the call as
   * `not_permitted`, the driver's error as its `cause`; anything else it throws goes up as it came.
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

/**
 * The one row {@link InsertBoxSql} answers: why a first box write did, or did not, land, beside
 * the box's columns as inserted, null where it did not.
 */
type InsertBoxOutcome = { landed: boolean, vault_stands: boolean, box_stood: boolean, was_full: boolean }

/** Postgres's error code for a foreign key violation: `23503`. */
const ForeignKeyViolation = '23503'

/**
 * Postgres's error code for a privilege refused, `42501`: a table or column the connection's role
 * may not reach, or a row a row-level security policy refuses.
 */
const InsufficientPrivilege = '42501'

const NotPermittedMessage = "The vault's database refused this call by a rule of the app's own -- a privilege, or a row-level security policy -- so nothing was read or written. Signing in again will not help: the app's own rules decide who may."

/**
 * The most bytes of UTF-8 a Postgres-backed name holds: a box's primary key is its applabel,
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
