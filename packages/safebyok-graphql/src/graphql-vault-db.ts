import { Refusals, Sanitizer, VaultDB, VaultError, RefusalKindVals } from 'safebyok'
import type { VaultRecordExpectation, VaultDBOpts, VaultDelExpectation, BoxRecord, BoxGetExpectation, BoxExpectation, BoxDelExpectation, VaultReadResponse, VaultRecord, RefusalKind, RefusalMeta, VaultScope } from 'safebyok'
import type { AnyVariables, Client, CombinedError, OperationResult } from '@urql/core'
import { VaultRecordFields, BoxSparseFields, BoxDamagedFields, BoxFields, ScopeFields, VaultTombstoneFields, recordOf, selectionOf } from './fields'

/** What graphqlVaultDB needs of an urql Client: its three ways to send an operation.
 * The Client your app already has is one, whatever its exchanges.
 */
export type GraphqlVaultClient = Pick<Client, 'query' | 'mutation' | 'subscription'>

/** What {@link graphqlVaultDB} is made with. */
export type GraphqlVaultDBOpts = VaultDBOpts & {
  /** Your app's urql Client, its `url` your GraphQL server's. */
  client: GraphqlVaultClient
  /** The most boxes one vault holds, as the VaultDB behind your server enforces it: a whole number above zero, or `Infinity`, the default, for none.
   * Declare your server's own, so that `Bank.make` refuses a vault asking for more up front,
   * rather than the server at the first box past it.
   */
  maxBoxes?: number | undefined
}

/** The most bytes of UTF-8 the Postgres VaultDB behind the server holds in one name. */
const ServerMaxNameBytes = 640

/** safebyok's storage over GraphQL, in the browser: a VaultDB whose every verb is one operation through your app's urql Client.
 * The server serves `VaultSchemaSdl` with `vaultResolvers`, from `safebyok-graphql/server`, and
 * runs each operation on a VaultDB made there for the signed-in user.
 *
 * * **Every query goes to the network**: your Client's cache never answers for a vault.
 * * **Limits** are those of the Postgres VaultDB behind the server: 1 MiB in one record, 640 bytes
 *   in one name, `maxBoxes` boxes, and no limit on a vault's bytes.
 * * **A refusal crosses**: the server's VaultError comes back as the same VaultError, kind and
 *   message, the GraphQL error its `cause`. A stale write, and a box write into a full vault,
 *   come back in the mutation's body (`landed: false`) with what stands or how full the vault is,
 *   never in an error's `extensions`, and are thrown here as the same VaultError, `meta` and all.
 *   A GraphQL error your server's own auth raises with `extensions.code` `FORBIDDEN` refuses with
 *   kind `not_permitted`. One with `UNAUTHENTICATED` is `storage_unavailable`, as a token expired
 *   mid-refresh is not a user gone.
 * * **Other writes** reach `subscribe` through the `safebyokVaultChanged` subscription, when your
 *   Client can send subscriptions (a `subscriptionExchange` over graphql-ws, say, or
 *   `fetchSubscriptions`). Without one, nothing is pushed. A subscription that fails is not
 *   retried: the vault reads again, and meets the trouble itself.
 * * **Misuse crosses as misuse**: a record or expectation at fault refuses as `bad_record`, here
 *   before it is sent (an epoch past GraphQL's 32-bit `Int` included) or on the server. So a
 *   GraphQL validation error means the server's schema is at odds with what this version sends:
 *   it refuses with kind `bad_option`, quoting nothing of what the server said.
 *
 * @example
 *   const vaultDB = graphqlVaultDB({ client: new Client({ url: '/api/graphql', exchanges: [fetchExchange] }) })
 *   const bank = Bank.make({ ...browserOpts(), applabel: 'acme', user_id: session.user_id, vaultDB })   // as the user signs in
 * @example
 *   const vaultDB = graphqlVaultDB({ client, maxBoxes: 250 })  // the server's postgresVaultDB holds 250
 */
export const graphqlVaultDB = (opts: GraphqlVaultDBOpts): VaultDB => {
  const { client, maxBoxes = Infinity } = (opts as Partial<GraphqlVaultDBOpts> | null | undefined) ?? {}
  if (! isUrqlClient(client)) {
    throw new VaultError('bad_option', "graphqlVaultDB needs a `client`, an urql Client: your app's own, made with `new Client({ url, exchanges })` from @urql/core or urql.")
  }
  if (! isBoxCount(maxBoxes)) {
    throw new VaultError('bad_option', "graphqlVaultDB's `maxBoxes`, when given, is a whole number above zero, or Infinity for a server that sets no limit.")
  }
  return new UrqlVaultDB({ ...opts, client, maxBoxes })
}

const isBoxCount = (count: unknown): count is number => (
  count === Infinity || (Number.isSafeInteger(count) && (count as number) > 0)
)

const isUrqlClient = (client: unknown): client is GraphqlVaultClient => {
  if (typeof client !== 'object' || client === null) { return false }
  const sends = client as Partial<Record<keyof GraphqlVaultClient, unknown>>
  return typeof sends.query === 'function' && typeof sends.mutation === 'function' && typeof sends.subscription === 'function'
}

// ---------------------------------------------------------------------------------- the operations

// A vault's three names, each an argument of its own: the server's VaultDB holds `user_id` to the
// user its own auth signed in.
const ScopeVariables = '$applabel: String!, $user_id: String!, $vaultlabel: String!'
const ScopeArgs = 'applabel: $applabel, user_id: $user_id, vaultlabel: $vaultlabel'
const VaultRecordSelection = selectionOf(VaultRecordFields)

const VaultSelection = `vault { ${VaultRecordSelection} } boxes { ${selectionOf(BoxSparseFields)} } damagedBoxes { ${selectionOf(BoxDamagedFields)} }`

const GetVaultDoc = `query SafebyokGetVault(${ScopeVariables}) {
  safebyokGetVault(${ScopeArgs}) { ${VaultSelection} }
}`
const EnsureVaultDoc = `mutation SafebyokEnsureVault($draft: SafebyokVaultRecordInput!) {
  safebyokEnsureVault(draft: $draft) { ${VaultSelection} }
}`
const GetBoxDoc = `query SafebyokGetBox(${ScopeVariables}, $boxlabel: String!, $expected: SafebyokBoxGetExpectationInput!) {
  safebyokGetBox(${ScopeArgs}, boxlabel: $boxlabel, expected: $expected) { ${selectionOf(BoxFields)} }
}`
const GetCapacityDoc = `query SafebyokGetCapacity(${ScopeVariables}) {
  safebyokGetCapacity(${ScopeArgs}) { boxes { used max } bytes { used max } }
}`
const PutVaultRecordDoc = `mutation SafebyokPutVaultRecord($vaultRecord: SafebyokVaultRecordInput!, $expected: SafebyokVaultRecordExpectationInput!) {
  safebyokPutVaultRecord(vaultRecord: $vaultRecord, expected: $expected) { landed refusalkind message vault_stored }
}`
const PutBoxDoc = `mutation SafebyokPutBox(${ScopeVariables}, $box: SafebyokBoxInput!, $expected: SafebyokBoxExpectationInput!) {
  safebyokPutBox(${ScopeArgs}, box: $box, expected: $expected) { landed refusalkind message box_stored capacity { boxes { used max } bytes { used max } } }
}`
const DelBoxDoc = `mutation SafebyokDelBox(${ScopeVariables}, $boxlabel: String!, $expected: SafebyokBoxDelExpectationInput!) {
  safebyokDelBox(${ScopeArgs}, boxlabel: $boxlabel, expected: $expected) { outcome }
}`
const DelVaultDoc = `mutation SafebyokDelVault(${ScopeVariables}, $expected: SafebyokVaultDelExpectationInput!) {
  safebyokDelVault(${ScopeArgs}, expected: $expected) { ${selectionOf(VaultTombstoneFields)} }
}`
const VaultChangedDoc = `subscription SafebyokVaultChanged(${ScopeVariables}) {
  safebyokVaultChanged(${ScopeArgs}) { ${selectionOf(ScopeFields)} }
}`

/** Every operation graphqlVaultDB sends, by the root field it asks for: the documents to register with a server that allows only listed operations.
 * They change only as `VaultSchemaSdl` does, versioned with the package, which moves its client
 * and its server together.
 *
 * @example
 *   for (const document of Object.values(VaultOperations)) { allowlist.register(document) }
 */
export const VaultOperations = {
  safebyokGetVault:         GetVaultDoc,
  safebyokEnsureVault:      EnsureVaultDoc,
  safebyokGetBox:           GetBoxDoc,
  safebyokGetCapacity:      GetCapacityDoc,
  safebyokPutVaultRecord:   PutVaultRecordDoc,
  safebyokPutBox:           PutBoxDoc,
  safebyokDelBox:           DelBoxDoc,
  safebyokDelVault:         DelVaultDoc,
  safebyokVaultChanged:     VaultChangedDoc,
} as const

// ------------------------------------------------------------------------------------ the adapter

/** The VaultDB {@link graphqlVaultDB} makes: each verb one operation, the server checking the user. */
class UrqlVaultDB extends VaultDB {
  // What the Postgres VaultDB behind the server holds in one record, and about what a GraphQL
  // server accepts in one request by default.
  readonly maxRecordBytes = 1024 * 1024
  // Nothing here reads a vault under a budget: the server's storage sets what it sets.
  readonly maxVaultBytes = Infinity
  readonly maxBoxes: number
  // What the Postgres VaultDB behind the server holds in one name, so a longer one is refused here,
  // before the wire.
  readonly maxNameBytes = ServerMaxNameBytes

  private readonly client: GraphqlVaultClient

  constructor(opts: GraphqlVaultDBOpts & { maxBoxes: number }) {
    super(opts)
    this.client = opts.client
    this.maxBoxes = opts.maxBoxes
  }

  // A vault is read in one query, and ensured in one mutation: the server's VaultDB reads it in
  // one step, and splits its boxes, which this VaultDB's base class checks again.
  protected async doGetVault(scope: VaultScope): Promise<VaultReadResponse> {
    const { safebyokGetVault } = await this.asked(GetVaultDoc, scopeOut(scope))
    return vaultReadOf(safebyokGetVault)
  }

  protected async doEnsureVault(draft: VaultRecord & { gate: null }): Promise<VaultReadResponse> {
    const { safebyokEnsureVault } = await this.told(EnsureVaultDoc, { draft: recordOf(draft, VaultRecordFields) })
    return vaultReadOf(safebyokEnsureVault)
  }

  // A write that lands answers with the vault record as the server's storage holds it; a stale
  // one answers in the body, not landed, with what stands, which the base class checks: it is
  // refused here as the VaultError the server's VaultDB made of it.
  protected async doPutVaultRecord(vaultRecord: VaultRecord, expected: VaultRecordExpectation): Promise<unknown> {
    checkInts('vault record', vaultRecord)
    checkInts('vault record expectation', expected)
    const { vault_tok, gate_epoch } = expected
    const { safebyokPutVaultRecord } = await this.told(PutVaultRecordDoc, { vaultRecord: recordOf(vaultRecord, VaultRecordFields), expected: { vault_tok, gate_epoch } })
    const answer = safebyokPutVaultRecord as WriteAnswer
    if (answer.landed) { return recordOf(answer.vault_stored, VaultRecordFields) }
    throw refusalOfAnswer(answer, 'vault_stored')
  }

  // A read whose vault record is not the one expected refuses on the server, in the step that
  // reads the box, and crosses as its kind.
  protected async doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation): Promise<unknown> {
    const { vault_tok } = expected
    const { safebyokGetBox } = await this.asked(GetBoxDoc, { ...scopeOut(scope), boxlabel, expected: { vault_tok } })
    return recordOf(safebyokGetBox, BoxFields)
  }

  // A write that misses answers in the body, not landed -- a stale one with what stands, a full
  // vault with how full it is, which the base class checks -- and is refused here as the VaultError
  // the server's VaultDB made of it; one that landed answers with the box as the server's storage holds it.
  protected async doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<unknown> {
    checkInts('box', box)
    const { vault_tok, revision_tok } = expected
    const { safebyokPutBox } = await this.told(PutBoxDoc, { ...scopeOut(scope), box: recordOf(box, BoxFields), expected: { vault_tok, revision_tok } })
    const answer = safebyokPutBox as WriteAnswer
    if (answer.landed) { return recordOf(answer.box_stored, BoxFields) }
    throw refusalOfAnswer(answer, 'box_stored')
  }

  // How full the vault is, as the server's storage reckons it: the base class checks it.
  protected async doGetCapacity(scope: VaultScope): Promise<unknown> {
    const { safebyokGetCapacity } = await this.asked(GetCapacityDoc, scopeOut(scope))
    return safebyokGetCapacity
  }

  // A stale delete refuses on the server and crosses as its kind, so a delete that answers landed,
  // with what the server's storage removed.
  protected async doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown> {
    const { vault_tok, revision_tok } = expected
    const { safebyokDelBox } = await this.told(DelBoxDoc, { ...scopeOut(scope), boxlabel, expected: { vault_tok, revision_tok } })
    return safebyokDelBox
  }

  // A stale delete refuses on the server and crosses as its kind, so a delete that answers landed,
  // with the tombstone the server's storage left.
  protected async doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<unknown> {
    checkInts('delete expectation', expected)
    const { vault_tok, gate_epoch } = expected
    const { safebyokDelVault } = await this.told(DelVaultDoc, { ...scopeOut(scope), expected: { vault_tok, gate_epoch } })
    return recordOf(safebyokDelVault, VaultTombstoneFields)
  }

  protected override doSubscribe(scope: VaultScope, onChange: () => void): () => void {
    const trouble = this.watchTrouble("This vault's GraphQL subscription failed, so other devices' changes may not show until the vault next reads. The vault reads again now, and meets the trouble itself.")
    const subscription = this.client.subscription(VaultChangedDoc, scopeOut(scope)).subscribe((result) => {
      if (result.error) {
        trouble.failed(result.error)
        onChange()
      } else if (result.data) {
        trouble.delivered()
        onChange()
      }
    })
    return () => { subscription.unsubscribe() }
  }

  /** The answer to a query, from the server and never a cache. */
  private async asked(document: string, variables: AnyVariables): Promise<Record<string, unknown>> {
    return answerOf(await this.client.query(document, variables, { requestPolicy: 'network-only' }).toPromise())
  }

  /** The answer to a mutation. */
  private async told(document: string, variables: AnyVariables): Promise<Record<string, unknown>> {
    return answerOf(await this.client.mutation(document, variables).toPromise())
  }
}

// The three names as the operations take them, each a variable of its own.
const scopeOut = ({ applabel, user_id, vaultlabel }: VaultScope) => ({ applabel, user_id, vaultlabel })

/** A vault as the server sent it, or null for none, passed through as the VaultDB's half answers: its vault record, its sound boxes and its damaged ones.
 * Each record is rebuilt from its own fields alone, so GraphQL's `__typename` stays behind before
 * the base class's strict checks; a list that is no list goes up as it came, for them to refuse.
 * A field the answer leaves out altogether is no answer, as from a server that does not serve
 * safebyok-graphql's schema and checks no operation against its own.
 */
const vaultReadOf = (sent: unknown): VaultReadResponse => {
  if (sent === undefined) { throw new Error('The GraphQL server answered without the vault it was asked for: is it serving safebyok-graphql?') }
  if (sent === null) { return { vault: null, boxes: [], damagedBoxes: [] } }
  const { vault, boxes, damagedBoxes } = sent as Record<string, unknown>
  return {
    vault:        recordOf(vault, VaultRecordFields),
    boxes:        recordsOf(boxes, BoxSparseFields),
    damagedBoxes: recordsOf(damagedBoxes, BoxDamagedFields),
  } as VaultReadResponse
}

/** Each record of `sent`, rebuilt from `fields` alone; `sent` as it came when it is no list. */
const recordsOf = (sent: unknown, fields: Parameters<typeof recordOf>[1]): unknown => (Array.isArray(sent) ? sent.map((record) => recordOf(record, fields)) : sent)

/** The most a GraphQL `Int` carries, a signed 32-bit integer, where the core takes any safe integer. */
const GraphqlIntMax = 2_147_483_647

/** The fields a record or expectation sends as an `Int!`, each a whole number above zero once the base class has checked it. */
const IntFields = ['gate_epoch', 'vault_epoch', 'whisper_schema_version'] as const

/** Refuse `outgoing` with kind 'bad_record', before it is sent, unless each of its `Int!` fields fits a GraphQL `Int`.
 * No vault builds an epoch that large.
 */
const checkInts = (said: string, outgoing: Partial<Record<typeof IntFields[number], number | null>>) => {
  const over = IntFields.find((field) => (outgoing[field] ?? 0) > GraphqlIntMax)
  if (over !== undefined) {
    throw new VaultError('bad_record', `Nothing was written: that ${said}'s ${over} is past ${String(GraphqlIntMax)}, the most GraphQL carries in an Int, and so not one a vault builds. Hand a VaultDB only the records and expectations a vault builds.`)
  }
}

/** An operation's data, or what it was refused with: the server's VaultError, or urql's error. */
const answerOf = (result: OperationResult): Record<string, unknown> => {
  if (result.error) { throw refusalOf(result.error) }
  if (! result.data) {
    throw new Error('The GraphQL server answered with neither data nor an error: is it serving safebyok-graphql?')
  }
  return result.data as Record<string, unknown>
}

/** What a failed operation refuses with: the server's VaultError, when one carries a kind, or urql's error as it is.
 * A crossed VaultError keeps its message and the GraphQL error as its cause; what a refusal learned
 * crosses in a write's answer, not here ({@link refusalOfAnswer}).
 * A GraphQL server's own `FORBIDDEN` becomes `not_permitted`. A GraphQL validation error becomes
 * `bad_option`, quoting nothing of it, as it may quote the variables. urql's error, as it is, the
 * base class says as `storage_unavailable`.
 */
const refusalOf = (err: CombinedError): Error => {
  for (const refused of err.graphQLErrors) {
    const { kind } = refused.extensions
    if (isKind(kind)) { return new VaultError(kind, refused.message, { cause: refused }) }
  }
  const forbidden = err.graphQLErrors.find(({ extensions: { code } }) => code === 'FORBIDDEN')
  if (forbidden) { return Refusals.notPermitted(ForbiddenMessage, { cause: forbidden }) }
  // Never the record's fault, nor 'bad_record': every variable has passed the base class's checks,
  // the ones the server's VaultDB makes, and checkInts', so a validation error says the server
  // serves another schema.
  if (err.graphQLErrors.some(({ extensions: { code } }) => typeof code === 'string' && MisuseCodes.has(code))) {
    return Sanitizer.refusalFor(err, 'bad_option', "The GraphQL server refused this operation's shape or variables: the schema it serves is not the one this version of safebyok-graphql sends. Serve VaultSchemaSdl from the same version.")
  }
  return err
}

/** What a GraphQL server's own `FORBIDDEN` says: its message is the host's, and may say more, so it rides along as the cause. */
const ForbiddenMessage = "The vault's GraphQL server refused the signed-in user this call by a rule of the app's own. Signing in again will not help: the app's own rules decide who may."

/** The `extensions.code`s a GraphQL server marks a malformed operation or variable with. */
const MisuseCodes: ReadonlySet<string> = new Set(['BAD_USER_INPUT', 'GRAPHQL_VALIDATION_FAILED'])

/** What a box write or an update of the vault record answers: `landed`, or the kind and message of its refusal, with the fact that kind carries (`box_stored`, `vault_stored` or `capacity`). */
type WriteAnswer = {
  landed:              boolean
  refusalkind?:        unknown
  message?:            unknown
  box_stored?:         unknown
  vault_stored?:       unknown
  capacity?:           unknown
}

/** The VaultError a write's answer refused with, its kind and message as the server's VaultDB made them: a stale write's `standing` and a full vault's `capacity` as its meta.
 * What stands is handed on unchecked, null for none: the base class checks a `stale_write`'s as it
 * checks a record, and a `vault_full`'s as `getCapacity` checks its answer. An answer that says
 * neither a kind nor a message is the server's bug, `corrupt_record`.
 */
const refusalOfAnswer = (answer: WriteAnswer, standing: 'box_stored' | 'vault_stored'): VaultError => {
  const { refusalkind, message, capacity } = answer
  if (typeof message !== 'string' || ! isKind(refusalkind)) {
    return new VaultError('corrupt_record', "The GraphQL server refused a write without saying why: is it serving safebyok-graphql of the same version as this app's client? Serve VaultSchemaSdl and vaultResolvers from it.")
  }
  if (refusalkind === 'stale_write') { return new VaultError(refusalkind, message, { meta: { [standing]: answer[standing] ?? null } }) }
  if (refusalkind !== 'vault_full' || capacity === null || capacity === undefined) { return new VaultError(refusalkind, message) }
  return new VaultError(refusalkind, message, { meta: { capacity: capacity as Exclude<RefusalMeta['capacity'], undefined> } })
}

const isKind = (kind: unknown): kind is RefusalKind => (RefusalKindVals as readonly unknown[]).includes(kind)
