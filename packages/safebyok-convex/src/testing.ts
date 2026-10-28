import { ConvexClient } from 'convex/browser'
import type { ConvexClientOptions } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { Base64, ConvexError, convexToJson, jsonToConvex } from 'convex/values'
import type { JSONValue, Value } from 'convex/values'
import { Validator } from 'safebyok'

/** A Convex deployment in memory that the real Convex clients talk to, unmodified, over a fake WebSocket.
 * A `ConvexClient` connects through {@link FakeDeployment.client}, and any other client, such as
 * `ConvexReactClient`, through {@link FakeDeployment.connectWith}. It is for the tests of an
 * adapter, a binding, or an app that holds a Convex client.
 *
 * `convex-test` runs the host's safebyok functions and the component beneath; this answers the
 * sync-protocol messages a client sends for queries and mutations, as convex 1.47 sends them. It
 * imports `convex` and `safebyok` and nothing else: `convex-test` stays with you, and its
 * `defineTestApp(...).defineModules(...)` is the `host`.
 *
 * It stands in for the network and a real server, so it cannot prove them:
 * * Calls run one at a time, in arrival order, so no two transactions ever race.
 * * After every mutation it reruns every watched query and pushes those whose results changed,
 *   where Convex reruns only those the write touched: the same results, sooner or later.
 * * Each socket is signed in as one user from the start, in place of `setAuth` and a JWT, until
 *   `signOut()` signs every one out.
 * * There is no reconnecting, no ping, no chunked transition, and no action.
 *
 * Its clients log quietly: what a client says with `log` is dropped, and what it says with `warn`
 * or `error` goes to the console, so a warning no test meant to provoke still shows. A real
 * client prints each mutation a function refuses, with `error`, so a test that provokes a
 * refusal on purpose hands in a logger of its own to catch it: a `safebyok` `TH.spyLogger()`
 * keeps each call in `calls`, silently, for the test to look at (see the third example). To see
 * everything the client says, `logger: console` does.
 *
 * Refuses 'bad_option' for a `host` without an `api` and a `createTest` function, or `opts` with
 * a field it does not take or a `logger` lacking `log`, `warn` and `error` functions.
 *
 * @param host - The host app to run: its `api` and a backend that runs its functions.
 * @param opts - `logger`: an object with `log`, `warn` and `error` functions (`logVerbose` too, if
 *   you want the client's verbose lines) that every client made here is given, in place of the
 *   quiet one. A `VaultLogger` fits.
 * @returns The deployment: connect clients to it, and `close()` it after the test.
 *
 * @example
 *   const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
 *   const host = app.defineModules({ safebyok: new SafebyokComponent(app.components.safebyok).api({ getUserId }) })
 *   const deployment = fakeDeployment(host)
 *   const client = deployment.client('u1')
 *   await client.query(deployment.api.safebyok.getVault, { ...scope })
 *   await deployment.close()
 *
 * @example
 *   const deployment = fakeDeployment(host)
 *   const reactClient = deployment.connectWith('u1', (address, opts) => new ConvexReactClient(address, opts))
 *   await reactClient.mutation(deployment.api.safebyok.ensureVault, { draft })
 *
 * @example Catch what a client logs, to test it
 *   const heard = spyLogger()
 *   const deployment = fakeDeployment(host, { logger: heard.logger })
 *   await deployment.client(null).mutation(deployment.api.safebyok.ensureVault, { draft }).catch(() => undefined)
 *   heard.calls.map((call) => call.level)   // => ['error']: the refusal the client would have printed
 */
export const fakeDeployment = <Host extends FakeHost>(host: Host, opts: FakeDeploymentOpts = {}): FakeDeployment<Host> => new FakeDeployment(host, opts)

/** What the clients of a {@link FakeDeployment} are given for `logger`: what they log, and where. */
export type FakeClientLogger = Pick<ConvexLogger, 'log' | 'warn' | 'error'> & Partial<Pick<ConvexLogger, 'logVerbose'>>

/** The options of {@link fakeDeployment}. */
export type FakeDeploymentOpts = {
  /** Where each client's lines go, in place of the quiet default: `console` for all of them, a spy to catch them. */
  logger?: FakeClientLogger | undefined
}

type ConvexLogger = Exclude<NonNullable<ConvexClientOptions['logger']>, boolean>

/** What {@link fakeDeployment} needs of a host: its `api`, and a backend that runs its functions. */
export type FakeHost = {
  api:        unknown
  createTest: () => FakeBackend
}

/** The in-memory backend `convex-test` makes: it runs a function as a signed-in identity, or as no one. */
export type FakeBackend = {
  query:        (ref: FunctionReference<'query'>, args: Record<string, Value>) => Promise<unknown>
  mutation:     (ref: FunctionReference<'mutation'>, args: Record<string, Value>) => Promise<unknown>
  withIdentity: (identity: { subject: string }) => FakeBackend
}

/** What a Convex client's constructor is given: the address, and the options that plug it into the fake, its `logger` the deployment's.
 * Hand them on as they come, `new ConvexReactClient(address, opts)`, and the client logs as the deployment was told.
 */
export type FakeClientOpts = { webSocketConstructor: typeof WebSocket, unsavedChangesWarning: false, logger: ConvexLogger }

/** The fake deployment's handle on one connected socket: the user it is signed in as, its watches. */
type Session = {
  socket:  FakeSocket
  subject: string | null
  version: { querySet: number, ts: number, identity: number }
  watched: Map<number, { udfPath: string, args: Record<string, Value>, said: string }>
}

type ClientMessage =
  | { type: 'Connect' }
  | { type: 'ModifyQuerySet', newVersion: number, modifications: ({ type: 'Add', queryId: number, udfPath: string, args: JSONValue[] } | { type: 'Remove', queryId: number })[] }
  | { type: 'Mutation', requestId: number, udfPath: string, args: JSONValue[] }
  | { type: 'Authenticate' | 'Action' | 'Event' }

type QueryModification =
  | { type: 'QueryUpdated', queryId: number, value: JSONValue, logLines: string[], journal: null }
  | { type: 'QueryFailed', queryId: number, errorMessage: string, errorData?: JSONValue, logLines: string[], journal: null }
  | { type: 'QueryRemoved', queryId: number }

// What the options and the host hold, checked only: what is kept is the caller's own object, `this` and all.
const { fakeHost, fakeDeploymentOpts } = Validator('bad_option', ({ obj, custom }) => {
  const fn = custom<(...args: never[]) => unknown>((candidate) => typeof candidate === 'function')
  const logger = obj({ log: fn, warn: fn, error: fn, logVerbose: fn.optional() })
  return {
    fakeHost:           obj({ api: custom<object>((candidate) => typeof candidate === 'object' && candidate !== null), createTest: fn }),
    fakeDeploymentOpts: obj({ logger: logger.optional() }).strict(),
  }
})

// A client wants all four calls of a logger. Each given one is bound to its logger, so a logger built as a class keeps its `this`; verbose lines go nowhere unless it has them. Left out, `log` and `logVerbose` are dropped and `warn` and `error` reach the console.
const loggerFor = (logger: FakeClientLogger | undefined): ConvexLogger => (
  logger === undefined ? QuietLogger : {
    log:        logger.log.bind(logger),
    warn:       logger.warn.bind(logger),
    error:      logger.error.bind(logger),
    logVerbose: logger.logVerbose?.bind(logger) ?? (() => undefined),
  }
)

/** The logger a deployment's clients have unless given one. */
const QuietLogger: ConvexLogger = {
  log:        () => undefined,
  logVerbose: () => undefined,
  // eslint-disable-next-line no-console -- the quiet default's one job: a warning or error no test caught still reaches the console
  warn:       (...args: unknown[]) => { console.warn(...args) },
  // eslint-disable-next-line no-console -- see warn above
  error:      (...args: unknown[]) => { console.error(...args) },
}

// Any address will do: no socket ever reaches it.
const FakeAddress = 'https://fake-deployment-123.convex.cloud'

/** The deployment {@link fakeDeployment} makes. */
export class FakeDeployment<Host extends FakeHost> {
  /** The host's api, to call and to watch through a client. */
  readonly api: Host['api']
  private readonly backend: FakeBackend
  private readonly sessions = new Map<FakeSocket, Session>()
  private readonly clients: { close(): Promise<void> }[] = []
  private readonly logger: ConvexLogger
  private ts = 1
  private work: Promise<void> = Promise.resolve()

  constructor(host: Host, opts: FakeDeploymentOpts) {
    fakeHost.parse(host)
    fakeDeploymentOpts.parse(opts)
    this.api = host.api
    this.backend = host.createTest()
    this.logger = loggerFor(opts.logger)
  }

  /** A real `ConvexClient` on this deployment, signed in as `subject`, or as no one. */
  client(subject: string | null): ConvexClient {
    return this.connectWith(subject, (address, opts) => new ConvexClient(address, opts))
  }

  /** A client of any other kind on this deployment, signed in as `subject`, or as no one, and closed with the rest.
   * `make` constructs it from the address and options it is given. This is how `ConvexReactClient`
   * connects, without this module importing React.
   */
  connectWith<Client extends { close: () => Promise<void> }>(subject: string | null, make: (address: string, opts: FakeClientOpts) => Client): Client {
    const client = make(FakeAddress, { webSocketConstructor: this.socketsFor(subject), unsavedChangesWarning: false, logger: this.logger })
    this.clients.push(client)
    return client
  }

  /** The backend itself, called directly as `subject`: to arrange or inspect what is stored. */
  as(subject: string | null): ReturnType<Host['createTest']> {
    return this.backendAs(subject) as ReturnType<Host['createTest']>
  }

  /** The functions every connected socket watches right now, by path: the live queries a client holds open here. */
  watching(): string[] {
    return Array.from(this.sessions.values(), (session) => Array.from(session.watched.values(), (watch) => watch.udfPath)).flat()
  }

  /** Signs every connected socket out, as a client's `clearAuth` would, and pushes each watched query that now answers differently. */
  signOut(): void {
    this.enqueue(async () => {
      for (const session of this.sessions.values()) { session.subject = null }
      await this.pushChanges()
    })
  }

  /** Closes every client made here, so none keeps a timer running past its test; a second call closes nothing twice. */
  async close(): Promise<void> {
    await Promise.all(this.clients.splice(0).map((client) => client.close()))
  }

  private backendAs(subject: string | null): FakeBackend {
    return subject === null ? this.backend : this.backend.withIdentity({ subject })
  }

  // Each socket the client constructs plugs into this deployment, signed in as `subject`.
  private socketsFor(subject: string | null): typeof WebSocket {
    const line: SocketLine = {
      opened:  (socket) => { this.sessions.set(socket, { socket, subject, version: { querySet: 0, ts: 0, identity: 0 }, watched: new Map() }) },
      heard:   (socket, message) => { this.enqueue(() => this.heard(socket, message)) },
      hungUp:  (socket) => { this.sessions.delete(socket) },
    }
    return class extends FakeSocket {
      constructor() { super(line) }
    } as unknown as typeof WebSocket
  }

  // One message at a time, in arrival order: a fake failing is a bug in the test, so it rejects
  // where vitest reports it, and the queue carries on.
  private enqueue(job: () => Promise<void>) {
    const before = this.work
    const done = (async () => {
      await before
      await job()
    })()
    this.work = (async () => {
      try {
        await done
      } catch {
        // The queue carries on past a failed job.
      }
    })()
    void done
  }

  private async heard(socket: FakeSocket, message: ClientMessage): Promise<void> {
    const session = this.sessions.get(socket)
    if (! session) { return }
    if (message.type === 'ModifyQuerySet') {
      const changes: QueryModification[] = []
      for (const modification of message.modifications) {
        if (modification.type === 'Remove') {
          session.watched.delete(modification.queryId)
          changes.push({ type: 'QueryRemoved', queryId: modification.queryId })
          continue
        }
        const args = jsonToConvex(modification.args[0] ?? {}) as Record<string, Value>
        const result = await this.run(session, modification.udfPath, args, modification.queryId)
        session.watched.set(modification.queryId, { udfPath: modification.udfPath, args, said: JSON.stringify(result) })
        changes.push(result)
      }
      this.transition(session, changes, message.newVersion)
    } else if (message.type === 'Mutation') {
      await this.mutate(session, message)
    }
    // Connect needs no answer; Authenticate, Action and Event are not spoken here.
  }

  private async mutate(session: Session, message: Extract<ClientMessage, { type: 'Mutation' }>): Promise<void> {
    const args = jsonToConvex(message.args[0] ?? {}) as Record<string, Value>
    try {
      const result: unknown = await this.backendAs(session.subject).mutation(makeFunctionReference<'mutation'>(message.udfPath), args)
      this.ts += 1
      session.socket.deliver({ type: 'MutationResponse', requestId: message.requestId, success: true, result: convexToJson(result as Value), ts: encodeTs(this.ts), logLines: [] })
    } catch (err) {
      session.socket.deliver({ type: 'MutationResponse', requestId: message.requestId, success: false, logLines: [], ...failureOf(err) })
      return
    }
    await this.pushChanges()
  }

  // Every session hears of the latest timestamp -- after a mutation, the mutating one needs it to
  // resolve its call -- with each watched query that now answers differently.
  private async pushChanges(): Promise<void> {
    for (const other of this.sessions.values()) {
      const changes: QueryModification[] = []
      for (const [queryId, watch] of other.watched) {
        const result = await this.run(other, watch.udfPath, watch.args, queryId)
        const said = JSON.stringify(result)
        if (said === watch.said) {
          continue
        }

        other.watched.set(queryId, { ...watch, said })
        changes.push(result)
      }
      this.transition(other, changes, other.version.querySet)
    }
  }

  private async run(session: Session, udfPath: string, args: Record<string, Value>, queryId: number): Promise<QueryModification> {
    try {
      const result: unknown = await this.backendAs(session.subject).query(makeFunctionReference<'query'>(udfPath), args)
      return { type: 'QueryUpdated', queryId, value: convexToJson(result as Value), logLines: [], journal: null }
    } catch (err) {
      const { result: errorMessage, errorData } = failureOf(err)
      return { type: 'QueryFailed', queryId, errorMessage, logLines: [], journal: null, ...(errorData !== undefined && { errorData }) }
    }
  }

  private transition(session: Session, modifications: QueryModification[], querySet: number) {
    const startVersion = session.version
    const endVersion = { querySet, ts: this.ts, identity: startVersion.identity }
    session.version = endVersion
    session.socket.deliver({
      type:         'Transition',
      startVersion: { ...startVersion, ts: encodeTs(startVersion.ts) },
      endVersion:   { ...endVersion, ts: encodeTs(endVersion.ts) },
      modifications,
    })
  }
}

/** A failed call as the protocol reports it: the message, and a ConvexError's data. */
const failureOf = (err: unknown): { result: string, errorData?: JSONValue } => {
  const result = err instanceof Error ? err.message : String(err)
  return err instanceof ConvexError ? { result, errorData: convexToJson(err.data as Value) } : { result }
}

/** A timestamp as the protocol writes one: eight bytes, little-endian, in base64. */
const encodeTs = (ts: number): string => {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(ts), true)
  return Base64.fromByteArray(bytes)
}

/** How a fake socket reaches its deployment. */
type SocketLine = {
  opened(socket: FakeSocket): void
  heard(socket: FakeSocket, message: ClientMessage): void
  hungUp(socket: FakeSocket): void
}

/** Just enough of a WebSocket for a Convex client: it opens at once, and delivers the deployment's replies later, as a network would. */
class FakeSocket {
  onopen:    ((event: object) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose:   ((event: { code: number, reason: string }) => void) | null = null
  onerror:   ((event: object) => void) | null = null

  private readonly line: SocketLine

  constructor(line: SocketLine) {
    this.line = line
    line.opened(this)
    setTimeout(() => { this.onopen?.({}) })
  }

  send(text: string) { this.line.heard(this, JSON.parse(text) as ClientMessage) }

  close() {
    this.line.hungUp(this)
    setTimeout(() => { this.onclose?.({ code: 1000, reason: '' }) })
  }

  deliver(message: object) {
    const text = JSON.stringify(message)
    setTimeout(() => { this.onmessage?.({ data: text }) })
  }
}
