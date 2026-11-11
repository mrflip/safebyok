import { ConvexClient } from 'convex/browser'
import type { ConvexClientOptions } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { Base64, ConvexError, convexToJson, jsonToConvex } from 'convex/values'
import type { JSONValue, Value } from 'convex/values'
import { Checkers } from 'safebyok/storage'

// The fake replaces the network and the server, so it tests neither. Calls run one at a time, in
// arrival order. Every watched query reruns after each mutation. Each socket is signed in as one
// user from the start. There is no reconnecting, ping or action. Clients discard `log` lines, and
// send `warn` and `error` to the console unless given a logger.
/** Make an in-memory Convex deployment that runs `host` under convex-test, for real Convex clients to reach over a fake WebSocket. */
export function fakeDeployment<Host extends FakeHost>(host: Host, opts: FakeDeploymentOpts = {}): FakeDeployment<Host> { return new FakeDeployment(host, opts) }

/** A logger for the clients of a {@link FakeDeployment}: `log`, `warn` and `error`, and optionally `logVerbose`. */
export type FakeClientLogger = Pick<ConvexLogger, 'log' | 'warn' | 'error'> & Partial<Pick<ConvexLogger, 'logVerbose'>>

/** Options for {@link fakeDeployment}. */
export type FakeDeploymentOpts = {
  /** Where every client's log lines go: pass `console` to see them all, or a spy to capture them.
   * By default `log` lines are discarded, and `warn` and `error` go to the console.
   */
  logger?: FakeClientLogger | undefined
}

type ConvexLogger = Exclude<NonNullable<ConvexClientOptions['logger']>, boolean>

/** The host handed to {@link fakeDeployment}: its `api`, and a `createTest` that makes the backend to run its functions. */
export type FakeHost = {
  api:        unknown
  createTest: () => FakeBackend
}

/** The in-memory backend that `convex-test` makes. It runs a function as a signed-in identity, or as no one. */
export type FakeBackend = {
  query:        (ref: FunctionReference<'query'>, args: Record<string, Value>) => Promise<unknown>
  mutation:     (ref: FunctionReference<'mutation'>, args: Record<string, Value>) => Promise<unknown>
  withIdentity: (identity: { subject: string }) => FakeBackend
}

/** The options to pass a Convex client's constructor so that it reaches the fake: `new ConvexReactClient(address, opts)`. */
export type FakeClientOpts = { webSocketConstructor: typeof WebSocket, unsavedChangesWarning: false, logger: ConvexLogger }

/** The fake deployment's record of one connected socket: the user it is signed in as, and the queries it watches. */
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

// These only validate the host and the options. The deployment keeps the caller's own objects, so their methods keep their `this`.
const { fakeHost, fakeDeploymentOpts } = Checkers('bad_option', ({ obj, custom }) => {
  const fn = custom<(...args: never[]) => unknown>((candidate) => typeof candidate === 'function')
  const logger = obj({ log: fn, warn: fn, error: fn, logVerbose: fn.optional() })
  return {
    fakeHost:           obj({ api: custom<object>((candidate) => typeof candidate === 'object' && candidate !== null), createTest: fn }),
    fakeDeploymentOpts: obj({ logger: logger.optional() }).strict(),
  }
})

// A Convex client needs all four logger methods. Each method given is bound to its logger, so a logger built as a class keeps its `this`.
// A logger without `logVerbose` discards verbose lines. With no logger at all, `log` and `logVerbose` are discarded and `warn` and `error` go to the console.
function loggerFor(logger: FakeClientLogger | undefined): ConvexLogger {
  return logger === undefined ? QuietLogger : {
    log:        logger.log.bind(logger),
    warn:       logger.warn.bind(logger),
    error:      logger.error.bind(logger),
    logVerbose: logger.logVerbose?.bind(logger) ?? (() => undefined),
  }
}

/** The default logger for a deployment's clients. */
const QuietLogger: ConvexLogger = {
  log:        () => undefined,
  logVerbose: () => undefined,
  // eslint-disable-next-line no-console -- the default logger must still show a warning or error that no test caught
  warn:       (...args: unknown[]) => { console.warn(...args) },
  // eslint-disable-next-line no-console -- see warn above
  error:      (...args: unknown[]) => { console.error(...args) },
}

// Any address works: no socket ever connects to it.
const FakeAddress = 'https://fake-deployment-123.convex.cloud'

/** The deployment {@link fakeDeployment} makes. */
export class FakeDeployment<Host extends FakeHost> {
  /** The host's `api`, for calling and watching its functions through a client. */
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

  /** Make a real `ConvexClient` connected to this deployment, signed in as `subject`, or as no one when `subject` is null. */
  client(subject: string | null): ConvexClient {
    return this.connectWith(subject, (address, opts) => new ConvexClient(address, opts))
  }

  /** Connect a client built by `make` (a `ConvexReactClient`, say) to this deployment, signed in as `subject`, or as no one when `subject` is null. */
  connectWith<Client extends { close: () => Promise<void> }>(subject: string | null, make: (address: string, opts: FakeClientOpts) => Client): Client {
    const client = make(FakeAddress, { webSocketConstructor: this.socketsFor(subject), unsavedChangesWarning: false, logger: this.logger })
    this.clients.push(client)
    return client
  }

  /** Return the backend, acting as `subject`, to set up or inspect stored data directly.
   * A change made this way is not pushed to watchers: use `arrange` for that.
   */
  as(subject: string | null): ReturnType<Host['createTest']> {
    return this.backendAs(subject) as ReturnType<Host['createTest']>
  }

  /** Run `change` on the backend, then push every watched query whose result changed. */
  async arrange<T>(change: (backend: ReturnType<Host['createTest']>) => Promise<T>): Promise<T> {
    const answer = await this.enqueue(async () => {
      const changed = await change(this.backend as ReturnType<Host['createTest']>)
      this.ts += 1
      await this.pushChanges()
      return changed
    })
    // A socket delivers on a timer, so wait one timer turn for every push to arrive before returning.
    await new Promise((resolve) => { setTimeout(resolve) })
    return answer
  }

  /** List the function path of every query a connected socket is watching right now. */
  watching(): string[] {
    return Array.from(this.sessions.values(), (session) => Array.from(session.watched.values(), (watch) => watch.udfPath)).flat()
  }

  /** Sign every connected socket out, then push every watched query whose result changed. */
  signOut(): void {
    void this.enqueue(async () => {
      for (const session of this.sessions.values()) { session.subject = null }
      await this.pushChanges()
    })
  }

  /** Close every client made here. */
  async close(): Promise<void> {
    await Promise.all(this.clients.splice(0).map((client) => client.close()))
  }

  private backendAs(subject: string | null): FakeBackend {
    return subject === null ? this.backend : this.backend.withIdentity({ subject })
  }

  // Returns a WebSocket class whose sockets connect to this deployment, signed in as `subject`.
  private socketsFor(subject: string | null): typeof WebSocket {
    const line: SocketLine = {
      opened:  (socket) => { this.sessions.set(socket, { socket, subject, version: { querySet: 0, ts: 0, identity: 0 }, watched: new Map() }) },
      heard:   (socket, message) => { void this.enqueue(() => this.heard(socket, message)) },
      hungUp:  (socket) => { this.sessions.delete(socket) },
    }
    return class extends FakeSocket {
      constructor() { super(line) }
    } as unknown as typeof WebSocket
  }

  // Runs jobs one at a time, in arrival order. A failing job means a bug in the test, so its promise
  // rejects for vitest to report, and the queue goes on to the next job.
  private async enqueue<T>(job: () => Promise<T>): Promise<T> {
    const before = this.work
    const done = (async () => {
      await before
      return await job()
    })()
    this.work = (async () => {
      try {
        await done
      } catch {
        // A failed job does not stop the queue.
      }
    })()
    return await done
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
    // Connect needs no reply. Authenticate, Action and Event are not supported.
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

  // Send every session the latest timestamp, with each watched query whose result changed. After a
  // mutation, the session that made it needs that timestamp to resolve its call.
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

/** Format a failed call as the protocol reports it: the error message, plus the `data` of a ConvexError. */
function failureOf(err: unknown): { result: string, errorData?: JSONValue } {
  const result = err instanceof Error ? err.message : String(err)
  return err instanceof ConvexError ? { result, errorData: convexToJson(err.data as Value) } : { result }
}

/** Encode a timestamp as the protocol does: eight bytes, little-endian, in base64. */
function encodeTs(ts: number): string {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(ts), true)
  return Base64.fromByteArray(bytes)
}

/** The callbacks a fake socket uses to reach its deployment. */
type SocketLine = {
  opened(socket: FakeSocket): void
  heard(socket: FakeSocket, message: ClientMessage): void
  hungUp(socket: FakeSocket): void
}

/** Just enough of a WebSocket for a Convex client. It opens immediately and delivers each reply on a timer. */
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
