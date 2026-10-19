import { Refusals, Sanitizer, VaultDB, VaultError, RefusalKindVals } from 'safebyok'
import type { VaultPropsExpectation, VaultDBOpts, VaultDelExpectation, BoxRecord, BoxExpectation, BoxDelExpectation, StoredBox, VaultProps, RefusalKind, VaultScope } from 'safebyok'
import type { AnyVariables, Client, CombinedError, OperationResult } from '@urql/core'
import { VaultPropsFields, ListedBoxFields, BoxFields, ScopeFields, recordOf, selectionOf } from './fields'

/**
 * What graphqlVaultDB needs of an urql Client: its three ways to send an operation. The Client
 * your app already has is one, whatever its exchanges.
 */
export type GraphqlVaultClient = Pick<Client, 'query' | 'mutation' | 'subscription'>

/** What {@link graphqlVaultDB} is made with. */
export type GraphqlVaultDBOpts = VaultDBOpts & {
  /** Your app's urql Client, its `url` your GraphQL server's. */
  client: GraphqlVaultClient
  /**
   * The most boxes one vault holds, as the VaultDB behind your server enforces it: a whole
   * number above zero, or `Infinity` for a server that sets none. Default: `Infinity`, as the
   * Postgres VaultDB sets none unless told. Declare your server's own, so that `Vault.make`
   * refuses a vault asking for more up front, rather than the server at the first box past it.
   */
  maxBoxes?: number | undefined
}

/** The most bytes of UTF-8 the Postgres VaultDB behind the server holds in one name. */
const ServerMaxNameBytes = 640

/**
 * safebyok's storage over GraphQL, in the browser: a VaultDB whose every verb is one operation,
 * sent through your app's urql Client to a server serving `VaultSchemaSdl` with `vaultResolvers`
 * (from `safebyok-graphql/server`), which runs each on a VaultDB made there for the signed-in
 * user. Hand it to `Vault.make` as its `vaultDB`.
 *
 * * **Every query goes to the network** (`requestPolicy: 'network-only'`): your Client's cache
 *   never answers for a vault.
 * * **A refusal crosses**: the server's VaultError comes back as the same VaultError, kind and
 *   message, the GraphQL error it crossed as for its `cause`. A GraphQL error your server's own
 *   auth raises with `extensions.code` `FORBIDDEN` refuses with kind `not_permitted`, which locks
 *   nothing; one with `UNAUTHENTICATED` is `storage_unavailable`, as a token expired mid-refresh
 *   is not a user gone. Anything else that goes wrong -- the network, a server that is not serving
 *   the schema -- refuses with kind `storage_unavailable`, urql's own error as its `cause`.
 * * **Other writes** reach `subscribe` through the `safebyokVaultChanged` subscription, when your
 *   Client has a way to send subscriptions (a `subscriptionExchange` over graphql-ws, say, or
 *   `fetchSubscriptions`); without one, nothing is pushed, and the vault refreshes after its own
 *   writes as before. A subscription that fails is not retried: it is logged, once for a failing
 *   streak, and calls `onChange`, so the vault reads again and meets the trouble itself.
 * * **Misuse crosses as misuse**: a record or expectation at fault is refused as `bad_record`,
 *   by this VaultDB before it is sent (an epoch past GraphQL's 32-bit `Int` included) or by the
 *   server's own after, crossing by its kind. A
 *   GraphQL validation error (`BAD_USER_INPUT`, `GRAPHQL_VALIDATION_FAILED`) is therefore the
 *   server's schema at odds with what this version sends, never the record, and refuses with kind
 *   `bad_option`, quoting nothing of what the server said, which may quote the variables.
 *
 * @param opts - Your app's urql `client`; optionally, the `maxBoxes` your server holds a vault
 *   to, and a `logger`, the default logger without one (a vault opened with no logger of its own hears it too).
 * @returns The VaultDB, holding at most 1 MiB in one record, as the Postgres VaultDB behind it
 *   does, and `maxBoxes` boxes in one vault, setting no limit on a vault's bytes.
 *
 * @example
 *   const vaultDB = graphqlVaultDB({ client: new Client({ url: '/api/graphql', exchanges: [fetchExchange] }) })
 *   const vault = Vault.make({ ...browserOpts(), applabel: 'acme', userId, vaultlabel: 'main', vaultDB })
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

const Scope = '$scope: SafebyokVaultScopeInput!'
const VaultPropsSelection = selectionOf(VaultPropsFields)

const GetVaultPropsDoc = `query SafebyokGetVaultProps(${Scope}) {
  safebyokGetVaultProps(scope: $scope) { ${VaultPropsSelection} }
}`
const GetBoxDoc = `query SafebyokGetBox(${Scope}, $boxlabel: String!) {
  safebyokGetBox(scope: $scope, boxlabel: $boxlabel) { ${selectionOf(BoxFields)} }
}`
const ListBoxesDoc = `query SafebyokListBoxes(${Scope}) {
  safebyokListBoxes(scope: $scope) { ${selectionOf(ListedBoxFields)} }
}`
const EnsureVaultPropsDoc = `mutation SafebyokEnsureVaultProps($vaultProps: SafebyokVaultPropsInput!) {
  safebyokEnsureVaultProps(vaultProps: $vaultProps) { ${VaultPropsSelection} }
}`
const PutVaultPropsDoc = `mutation SafebyokPutVaultProps($vaultProps: SafebyokVaultPropsInput!, $expected: SafebyokVaultPropsExpectationInput!) {
  safebyokPutVaultProps(vaultProps: $vaultProps, expected: $expected)
}`
const PutBoxDoc = `mutation SafebyokPutBox(${Scope}, $box: SafebyokBoxInput!, $expected: SafebyokBoxExpectationInput!) {
  safebyokPutBox(scope: $scope, box: $box, expected: $expected) { ${selectionOf(BoxFields)} }
}`
const DelBoxDoc = `mutation SafebyokDelBox(${Scope}, $boxlabel: String!, $expected: SafebyokBoxDelExpectationInput!) {
  safebyokDelBox(scope: $scope, boxlabel: $boxlabel, expected: $expected) { outcome }
}`
const DelVaultDoc = `mutation SafebyokDelVault(${Scope}, $expected: SafebyokVaultDelExpectationInput!) {
  safebyokDelVault(scope: $scope, expected: $expected)
}`
const VaultChangedDoc = `subscription SafebyokVaultChanged(${Scope}) {
  safebyokVaultChanged(scope: $scope) { ${selectionOf(ScopeFields)} }
}`

/**
 * Every operation graphqlVaultDB sends, by the root field it asks for: the documents a host whose
 * GraphQL server accepts only allowlisted (persisted) operations registers, and a test holds to
 * the schema. They change only as the SDL ({@link VaultSchemaSdl}) does, and are versioned with
 * the package, which moves its client and its server together.
 *
 * @example
 *   for (const document of Object.values(VaultOperations)) { allowlist.register(document) }
 */
export const VaultOperations = {
  safebyokGetVaultProps:    GetVaultPropsDoc,
  safebyokGetBox:           GetBoxDoc,
  safebyokListBoxes:        ListBoxesDoc,
  safebyokEnsureVaultProps: EnsureVaultPropsDoc,
  safebyokPutVaultProps:    PutVaultPropsDoc,
  safebyokPutBox:           PutBoxDoc,
  safebyokDelBox:           DelBoxDoc,
  safebyokDelVault:         DelVaultDoc,
  safebyokVaultChanged:     VaultChangedDoc,
} as const

// ------------------------------------------------------------------------------------ the adapter

/** Each verb one operation; the base class validates both ways, and the server checks the user. */
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

  protected async doGetVaultProps(scope: VaultScope): Promise<unknown> {
    const { safebyokGetVaultProps } = await this.asked(GetVaultPropsDoc, { scope: scopeOut(scope) })
    return recordOf(safebyokGetVaultProps, VaultPropsFields)
  }

  protected async doEnsureVaultProps(vaultProps: VaultProps): Promise<unknown> {
    checkInts('vault props record', vaultProps)
    const { safebyokEnsureVaultProps } = await this.told(EnsureVaultPropsDoc, { vaultProps: recordOf(vaultProps, VaultPropsFields) })
    return recordOf(safebyokEnsureVaultProps, VaultPropsFields)
  }

  // A stale write refuses on the server and crosses as its kind, so a write that answers landed.
  protected async doPutVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<boolean> {
    checkInts('vault props record', vaultProps)
    checkInts('vault props expectation', expected)
    const { vault_id, unlock_epoch } = expected
    await this.told(PutVaultPropsDoc, { vaultProps: recordOf(vaultProps, VaultPropsFields), expected: { vault_id, unlock_epoch } })
    return true
  }

  protected async doGetBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    const { safebyokGetBox } = await this.asked(GetBoxDoc, { scope: scopeOut(scope), boxlabel })
    return recordOf(safebyokGetBox, BoxFields)
  }

  // Each row is stored under its own boxlabel, which the server's listing carries as a field.
  protected async doListBoxes(scope: VaultScope): Promise<StoredBox[]> {
    const { safebyokListBoxes } = await this.asked(ListBoxesDoc, { scope: scopeOut(scope) })
    return (safebyokListBoxes as unknown[]).map((listed) => {
      const box = recordOf(listed, ListedBoxFields)
      return { boxlabel: (box as { boxlabel: string }).boxlabel, box }
    })
  }

  // A stale write refuses on the server and crosses as its kind, so a write that answers landed,
  // with the box as the server's storage holds it.
  protected async doPutBox(scope: VaultScope, box: BoxRecord, expected: BoxExpectation): Promise<unknown> {
    checkInts('box', box)
    const { vault_id, revision_tok, vault_key_epoch } = expected
    const { safebyokPutBox } = await this.told(PutBoxDoc, { scope: scopeOut(scope), box: recordOf(box, BoxFields), expected: { vault_id, revision_tok, vault_key_epoch } })
    return recordOf(safebyokPutBox, BoxFields)
  }

  // A stale delete refuses on the server and crosses as its kind, so a delete that answers landed,
  // with what the server's storage removed.
  protected async doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown> {
    const { vault_id, revision_tok } = expected
    const { safebyokDelBox } = await this.told(DelBoxDoc, { scope: scopeOut(scope), boxlabel, expected: { vault_id, revision_tok } })
    return safebyokDelBox
  }

  protected async doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<boolean> {
    await this.told(DelVaultDoc, { scope: scopeOut(scope), expected: { vault_id: expected.vault_id } })
    return true
  }

  protected override doSubscribe(scope: VaultScope, onChange: () => void): () => void {
    const trouble = this.watchTrouble("This vault's GraphQL subscription failed, so other devices' changes may not show until the vault next reads. The vault reads again now, and meets the trouble itself.")
    const subscription = this.client.subscription(VaultChangedDoc, { scope: scopeOut(scope) }).subscribe((result) => {
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

const scopeOut = (scope: VaultScope) => recordOf(scope, ScopeFields)

/** The most a GraphQL `Int` carries, a signed 32-bit integer, where the core takes any safe integer. */
const GraphqlIntMax = 2_147_483_647

/** The fields a record or expectation sends as an `Int!`, each a whole number above zero once the base class has checked it. */
const IntFields = ['unlock_epoch', 'vault_key_epoch', 'whisper_schema_version'] as const

/**
 * Refuses `outgoing` with kind 'bad_record', before it is sent, unless each of its `Int!` fields
 * fits a GraphQL `Int`, as no vault builds an epoch that large. A box's expectation names the
 * box's own `vault_key_epoch`, so checking the box checks it.
 */
const checkInts = (said: string, outgoing: Partial<Record<typeof IntFields[number], number>>) => {
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

/**
 * The server's refusal as the VaultError it was, when one carries a kind, the GraphQL error as its
 * cause; a GraphQL server's own `FORBIDDEN` as `not_permitted`, likewise; a GraphQL validation
 * error as misuse, quoting nothing of it, as it may quote the variables; otherwise urql's error,
 * as it is, which the base class says as storage trouble.
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

/**
 * What a GraphQL server's own `FORBIDDEN` says: its message is the host's, and may say more, so it
 * rides along as the cause.
 */
const ForbiddenMessage = "The vault's GraphQL server refused the signed-in user this call by a rule of the app's own. Signing in again will not help: the app's own rules decide who may."

/** The `extensions.code`s a GraphQL server marks a malformed operation or variable with. */
const MisuseCodes: ReadonlySet<string> = new Set(['BAD_USER_INPUT', 'GRAPHQL_VALIDATION_FAILED'])

const isKind = (kind: unknown): kind is RefusalKind => (RefusalKindVals as readonly unknown[]).includes(kind)
