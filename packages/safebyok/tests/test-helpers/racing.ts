import { isVaultError } from '../../src/errors'
import type { Outcome } from '../../src/outcome'
import { makeLatch, type AsyncVerbOf, microtasks, ticks } from './timing'


// ------------------------------------------------------------------------- racing devices

/**
 * Where every round trip one backend's devices make passes, so that a race can stop a device just
 * before one of them and run another device's write while it waits. A device's adapter awaits
 * `pass()` before each call it makes to its backend -- each statement, each request, each
 * transaction, each watch it starts -- and goes straight on unless the race is holding that one. Wire it around a
 * client's methods with {@link throughTurnstile}, or await `pass()` wherever a round trip begins.
 */
export type Turnstile = {
  /** Resolves once this round trip may go: at once, unless the race is holding it. */
  pass: () => Promise<void>
}

/** A turnstile, and the race's hold on it: stop the nth pass from now, or stop none. */
export const makeTurnstile = () => {
  let armed: { untilHeld: number, gate: ReturnType<typeof makeLatch> } | null = null
  const pass = async () => {
    if (armed === null) { return }
    armed.untilHeld -= 1
    if (armed.untilHeld > 0) { return }
    const { gate } = armed
    armed = null
    await gate.pass()
  }
  const holdAt = (nth: number) => {
    const gate = makeLatch()
    armed = { untilHeld: nth, gate }
    return gate
  }
  const holdNone = () => { armed = null }
  const turnstile: Turnstile = { pass }
  return { turnstile, holdAt, holdNone }
}

/** A turnstile no race holds, for a test that makes devices without racing them. */
export const openTurnstile: Turnstile = { pass: () => Promise.resolve() }

/**
 * `target`, each of its `verbs` first awaiting `turnstile.pass()`, and the rest of it as it was: a
 * device's backend client, for {@link DescribeVaultDBOpts.makeDevices}, each of whose round trips
 * then passes the race's turnstile. Every method keeps `target` as its `this`.
 *
 * @param turnstile - The race's turnstile, as `makeDevices` is handed it.
 * @param target - The client a device's adapter makes its round trips through.
 * @param verbs - Its methods that are round trips, each returning a promise.
 * @returns A stand-in for `target`, to hand the device's adapter in its place.
 *
 * @example postgresVaultDB({ client: TH.throughTurnstile(turnstile, pool, ['query']), userId })
 * @example convexVaultDB({ client: TH.throughTurnstile(turnstile, client, ['query', 'mutation']), api })
 */
export const throughTurnstile = <Target extends object>(turnstile: Turnstile, target: Target, verbs: readonly (AsyncVerbOf<Target> & string)[]): Target => (
  new Proxy(target, {
    get: (held, prop) => {
      const val: unknown = Reflect.get(held, prop, held)
      if (typeof val !== 'function') { return val }
      const method = val as (...args: unknown[]) => unknown
      if (! (verbs as readonly PropertyKey[]).includes(prop)) { return method.bind(held) }
      return async (...args: unknown[]) => {
        await turnstile.pass()
        return method.apply(held, args)
      }
    },
  })
)

/** How one move in a race settled: `landed`, with what it resolved to, or the kind it was refused with, with what it threw. */
export type RaceOutcome = { kind: string, val: unknown }

/**
 * A fresh, empty backend, as a way to make devices over it: handed the race's `turnstile`, it gives
 * a factory of devices, each sharing nothing but the backend, each round trip of each passing the
 * turnstile. The factory takes `DeviceOptsT` -- the limit to hold a device to, for a VaultDB's --
 * or nothing, as `() => device` does.
 */
export type MakeDevices<DeviceT, DeviceOptsT = void> = (turnstile: Turnstile) => ((deviceOpts: DeviceOptsT) => DeviceT) | Promise<(deviceOpts: DeviceOptsT) => DeviceT>

/** A race between devices over one backend, for {@link raceEveryWay}. */
export type Race<DeviceT> = {
  /** Fresh devices over one fresh, empty backend: see {@link MakeDevices}. */
  makeDevices: MakeDevices<DeviceT>
  /** What stands before the race, made through the first device. */
  setup?: ((first: DeviceT) => Promise<unknown>) | undefined
  /** Each device's move, a device to each: the first move on the first device, and so on. Two or more. */
  moves: readonly ((device: DeviceT) => Promise<unknown>)[]
  /** What must hold after every schedule, given the moves' outcomes in order and the devices; throws when it does not. */
  verdict: (outcomes: RaceOutcome[], devices: DeviceT[]) => unknown
}

/**
 * Runs `race` under every schedule a test can make of it, each over fresh devices on a fresh
 * backend, and checks its verdict after each. Two moves are made together; then one is started a
 * few turns of the event loop after the other, each way round; then, for each round trip a move
 * makes through the turnstile, that move is held just before it while the other runs to its end,
 * each way round. More than two are made together, then each is held before its nth round trip
 * in turn and all are let go at once, for every n. A device that cannot finish its move while
 * another waits at the turnstile fails the race: the two share a lock, a queue or a connection
 * that real devices would not, or the adapter holds a lock from one round trip to the next.
 *
 * The schedules interleave the moves at every await between round trips that the event loop
 * reaches, and at every round trip through the turnstile; they cannot split a round trip itself,
 * which is the backend's to make atomic.
 *
 * @param race - The devices, what stands before, each device's move, and the verdict.
 * @returns The title of each schedule run, in order; it rejects, naming the schedule, on the
 *   first verdict that fails, device that waits too long, or move that does not finish.
 *
 * @example
 *   await TH.raceEveryWay({
 *     makeDevices: (turnstile) => () => postgresVaultDB({ client: TH.throughTurnstile(turnstile, db, ['query']), userId: 'u1' }),
 *     setup:       (first) => first.ensureVaultProps(TH.vaultPropsOf('u1')),
 *     moves:       [(one) => one.delVault(TH.scopeOf('u1'), TH.thisVault), (two) => two.putBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))],
 *     verdict:     async (outcomes, [one]) => { expect(await one.getVault(TH.scopeOf('u1'))).to.have.lengthOf(0) },
 *   })
 */
export const raceEveryWay = async <DeviceT>(race: Race<DeviceT>): Promise<string[]> => {
  if (race.moves.length < 2) { throw new TypeError('raceEveryWay needs two moves or more to race.') }
  const titles: string[] = []
  const runUnder = async (title: string, schedule: Schedule) => {
    titles.push(title)
    return await runRaceOnce(race, title, schedule)
  }
  await runUnder('made together', together)
  if (race.moves.length === 2) {
    for (const [firstIdx, [first, second]] of [[0, ['one', 'two']], [1, ['two', 'one']]] as const) {
      for (const count of MicrotaskOffsets) { await runUnder(`${second} started ${String(count)} microtasks after ${first}`, staggered(firstIdx, () => microtasks(count))) }
      for (const count of TickOffsets) { await runUnder(`${second} started ${String(count)} ticks after ${first}`, staggered(firstIdx, () => ticks(count))) }
      await sweepHolds((nth) => runUnder(`${first} held before its round trip ${String(nth)} while ${second} moved`, holding(firstIdx, nth)))
    }
  } else {
    await sweepHolds((nth) => runUnder(`each held before its round trip ${String(nth)} in turn, then all let go`, crowding(nth)))
  }
  return titles
}

/**
 * Runs a hold before round trip 1, 2, and on, until a run holds nothing -- its moves made no more
 * round trips -- and refuses a move that makes more than {@link MostRoundTrips}, rather than leave
 * the gaps past them unheld.
 */
const sweepHolds = async (runHeldAt: (nth: number) => Promise<boolean>) => {
  for (let nth = 1; nth <= MostRoundTrips + 1; nth += 1) {
    if (! await runHeldAt(nth)) { return }
  }
  throw new Error(`A move made more than ${String(MostRoundTrips)} round trips through the turnstile, so the race could not hold it before each. The VaultDB contract's baseline asks a small, fixed number of round trips of each verb: see whether the adapter, or something polling through its client, makes more.`)
}

/** Microtasks to start the second move after the first: for an adapter in this process, whose awaits are microtasks. */
const MicrotaskOffsets = [1, 2, 3] as const

/** Turns of the macrotask queue to start the second move after the first: for a backend that answers on a later turn. */
const TickOffsets = [1, 2] as const

/** The most round trips a race holds a move before; a move making more fails the race. */
const MostRoundTrips = 12

/** How long a device's move may take while another device waits at the turnstile before the race calls it a shared lock. */
const WaitedTooLongMillis = 2000

/** How long a whole schedule's moves, or one waited on for its own sake, may take before the race calls the adapter hung: room for a slow real backend, which a single held move is not given. */
const ScheduleHungMillis = 10_000

/** The moves of a race, each started on its device. */
type Start = () => Promise<RaceOutcome>

/** One schedule: makes the moves in its own order, and says whether it held a move at the turnstile. */
type Schedule = (starts: readonly Start[], keeper: ReturnType<typeof makeTurnstile>) => Promise<{ outcomes: RaceOutcome[], held: boolean }>

/** Runs `race` once, under `schedule`, over fresh devices; says whether a move was held. Rejects, naming the schedule, if it fails. */
const runRaceOnce = async <DeviceT>(race: Race<DeviceT>, title: string, schedule: Schedule): Promise<boolean> => {
  const keeper = makeTurnstile()
  try {
    const deviceFor = await race.makeDevices(keeper.turnstile)
    const entrants = race.moves.map((move) => {
      const device = deviceFor()
      return { device, start: () => raceOutcomeOf(move(device)) }
    })
    const devices = entrants.map((entrant) => entrant.device)
    if (race.setup && devices[0] !== undefined) { await race.setup(devices[0]) }
    const { outcomes, held } = await schedule(entrants.map((entrant) => entrant.start), keeper)
    await race.verdict(outcomes, devices)
    return held
  } catch (err) {
    throw new Error(`Under the schedule "${title}": ${err instanceof Error ? err.message : String(err)}`, { cause: err })
  }
}

/**
 * How a move settled, never rejecting: `landed` and its value, or its refusal's kind (`unknown` for
 * none) and the refusal. A move that resolves an Outcome -- a VaultDB verb's -- settles as that
 * Outcome says: its `val` landed, or its `err` refused.
 */
export const raceOutcomeOf = async (move: Promise<unknown>): Promise<RaceOutcome> => {
  try {
    const settled = await move
    if (! isOutcome(settled)) { return { kind: 'landed', val: settled } }
    return settled.ok ? { kind: 'landed', val: settled.val } : refusedAs(settled.err)
  } catch (err) {
    return refusedAs(err)
  }
}

/** A refusal as a race records it: its refusalkind (`unknown` for none), and the refusal itself. */
const refusedAs = (err: unknown): RaceOutcome => {
  const { refusalkind } = (err ?? {}) as { refusalkind?: unknown }
  return { kind: typeof refusalkind === 'string' ? refusalkind : 'unknown', val: err }
}

/** True for what a VaultDB verb resolves: a good Outcome with its `val`, or a bad one with a VaultError. */
const isOutcome = (settled: unknown): settled is Outcome<unknown> => {
  if (typeof settled !== 'object' || settled === null || ! ('ok' in settled)) { return false }
  return settled.ok === true ? 'val' in settled : settled.ok === false && 'err' in settled && isVaultError(settled.err)
}

/** The two moves of a pair race, `firstIdx`'s first: the first device's and the second's, swapped for 1. */
const pairOf = (starts: readonly Start[], firstIdx: 0 | 1): [Start, Start] => {
  const [one, two] = starts
  if (one === undefined || two === undefined) { throw new TypeError('A pair race has two moves.') }
  return firstIdx === 0 ? [one, two] : [two, one]
}

/** Outcomes back in the moves' own order, from the order a schedule made them in. */
const inMoveOrder = (firstIdx: 0 | 1, first: RaceOutcome, second: RaceOutcome): RaceOutcome[] => (firstIdx === 0 ? [first, second] : [second, first])

const together: Schedule = async (starts) => ({ outcomes: await finishing(Promise.all(starts.map((start) => start())), 'the moves'), held: false })

/** The move of `firstIdx` started, then the other once `wait` resolves. */
const staggered = (firstIdx: 0 | 1, wait: () => Promise<void>): Schedule => async (starts) => {
  const [first, second] = pairOf(starts, firstIdx)
  const firstMove = first()
  await wait()
  const secondMove = second()
  const [firstOutcome, secondOutcome] = await finishing(Promise.all([firstMove, secondMove]), 'the moves')
  return { outcomes: inMoveOrder(firstIdx, firstOutcome, secondOutcome), held: false }
}

/**
 * The move of `firstIdx` held before its nth round trip while the other moves to its end, then let
 * go. A move that ends before its nth round trip is let finish, and the other then moves: the
 * moves one after another, the last schedule of the sweep.
 */
const holding = (firstIdx: 0 | 1, nth: number): Schedule => async (starts, keeper) => {
  const [first, second] = pairOf(starts, firstIdx)
  const gate = keeper.holdAt(nth)
  const firstMove = first()
  const arrived = await finishing(reachedBeforeEnd(gate, firstMove), `the first move, before its round trip ${String(nth)}`)
  if (! arrived) {
    keeper.holdNone()
    const firstOutcome = await finishing(firstMove, 'the first move')
    return { outcomes: inMoveOrder(firstIdx, firstOutcome, await finishing(second(), 'the second move')), held: false }
  }
  const secondMove = await inTime(second())
  gate.release()
  if (! secondMove.inTime) { throw waitedTooLong() }
  return { outcomes: inMoveOrder(firstIdx, await finishing(firstMove, 'the first move, let go'), secondMove.val), held: true }
}

/** Each move held before its nth round trip in turn, so all are midway at once, then all let go together. */
const crowding = (nth: number): Schedule => async (starts, keeper) => {
  const gates: ReturnType<typeof makeLatch>[] = []
  const moves: Promise<RaceOutcome>[] = []
  for (const start of starts) {
    const gate = keeper.holdAt(nth)
    const move = start()
    moves.push(move)
    const arrival = await inTime(reachedBeforeEnd(gate, move))
    if (! arrival.inTime) {
      for (const each of [...gates, gate]) { each.release() }
      throw waitedTooLong()
    }
    if (arrival.val) { gates.push(gate) } else { keeper.holdNone() }
  }
  for (const gate of gates) { gate.release() }
  return { outcomes: await finishing(Promise.all(moves), 'the moves, let go'), held: gates.length > 0 }
}

/** True once a move waits at `gate`, or false once `move` ends without coming to it. */
const reachedBeforeEnd = (gate: ReturnType<typeof makeLatch>, move: Promise<unknown>): Promise<boolean> => Promise.race([trueOnce(gate.reached), falseOnce(move)])

const trueOnce = async (promise: Promise<unknown>) => {
  await promise
  return true
}

const falseOnce = async (promise: Promise<unknown>) => {
  await promise
  return false
}

/** What `promise` resolves to, if it does within `limitMillis`: {@link WaitedTooLongMillis} unless given. */
const inTime = async <ValT>(promise: Promise<ValT>, limitMillis = WaitedTooLongMillis): Promise<{ inTime: true, val: ValT } | { inTime: false }> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<{ inTime: false }>((resolve) => { timer = setTimeout(() => { resolve({ inTime: false }) }, limitMillis) })
  const timely = async () => ({ inTime: true as const, val: await promise })
  const settled = await Promise.race([timely(), late])
  clearTimeout(timer)
  return settled
}

/** What `promise` resolves to; rejects, saying `what` did not finish, when it takes longer than {@link ScheduleHungMillis}: so a hung adapter fails the schedule, which names it, not the test's own timeout. */
const finishing = async <ValT>(promise: Promise<ValT>, what: string): Promise<ValT> => {
  const settled = await inTime(promise, ScheduleHungMillis)
  if (! settled.inTime) { throw new Error(`${what} did not finish within ${String(ScheduleHungMillis)} ms: the adapter hung, or waits on something that never comes.`) }
  return settled.val
}

const waitedTooLong = () => new Error(
  `a device's move did not finish within ${String(WaitedTooLongMillis)} ms while another device waited at the turnstile, before a round trip to the backend. The devices share something that makes one wait for the other -- a lock, a queue, a connection -- that two real devices would not, or the adapter holds a lock from one round trip to the next, which the VaultDB contract's baseline rules out.`,
)
