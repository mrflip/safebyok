import { objCheck } from '../checks/validator'
import { MaxTimerMillis } from '../consts'
import type { VaultError } from '../errors'
import { type Outcome, valOf } from '../outcome'
import * as Phrases from '../phrases'
import type { Clock } from '../shapes/bank-opts'

// == [Checks]: taskOutcome

/** How a task fared, as `taskCompleted` takes it: a success unless `ok` says not, with an `err` where there is one. Anything else an {@link Outcome} carries is dropped. */
const taskOutcome = objCheck(({ bool, custom }) => ({
  ok:  bool.default(true),
  err: custom<Error>((val) => val instanceof Error, Phrases.ErrorExpected).optional(),
}), { refuseAs: 'bad_option', extras: 'strip' })
// --

/** An instant, in integer UTC epoch milliseconds. */
export type Timestamp = number

/** How often something repeats, in milliseconds. */
export type IntervalMillis = number

/** How long something lasts, once, in milliseconds. */
export type DurationMillis = number

export type TriggerOpts<SnapT, ValT> = {
  clock:                  Clock
  intervalMillis:         IntervalMillis
  // The next launch is scheduled at this fraction of intervalMillis after a success or a launch that completes ok, so it has completed by the horizon. Default 0.8.
  eagerFrac?:             number | undefined
  doSnapshot:             () => SnapT
  doTryLaunch:            () => Promise<Outcome<ValT>>
  // Told the refusal of a launch the timer made, which no caller awaits.
  onTimerRefusal?:        ((err: VaultError) => void) | undefined
}

export type TriggerTiming = Readonly<{
  dueAt:            Timestamp
  lastLaunchedAt:   Timestamp | null
  lastCompletedAt:  Timestamp | null
  lastSucceededAt:  Timestamp | null
}>

/** Keeps a task timely: launches `doTryLaunch` when the last success is `intervalMillis` old, and on a timer ahead of that.
 * The task says what counts as a success, by {@link taskCompleted}: a launch that completes ok
 * reports none by itself, as a fetch may answer ok with nothing newer, and a success may arrive
 * outside any launch. A launch the task refuses is noted as a failure, and schedules no next one.
 * The timer fires `eagerFrac` of the way through the interval, so a launch has finished by the time the
 * interval is up. {@link isTimely} holds for the whole interval, not just up to the timer.
 * Launches run one at a time: a call made during one joins it and settles as it settles.
 * A client asks `isTimely`, `isTimelyWithin` and `ensureTimelyWithin`, and does no time math of its own.
 */
export class Trigger<SnapT, ValT> {
  readonly intervalMillis: IntervalMillis
  readonly eagerFrac:      number

  readonly #clock:           Clock
  readonly #doSnapshot:      () => SnapT
  readonly #doTryLaunch:     () => Promise<Outcome<ValT>>
  readonly #onTimerRefusal:  ((err: VaultError) => void) | null

  #dueAt:           Timestamp
  #lastLaunchedAt:  Timestamp | null = null
  #lastCompletedAt: Timestamp | null = null
  #lastSucceededAt: Timestamp | null = null
  #lastErr:         Error | null = null
  // Once disarmed, no timer is armed again, whatever completes after.
  #disarmed = false

  // The launch under way, which every tryLaunch made meanwhile joins (oneAtATime, but with a value).
  #currentTask: Promise<Outcome<ValT>> | null = null
  #timer:   ReturnType<typeof setTimeout> | null = null

  constructor(opts: TriggerOpts<SnapT, ValT>) {
    this.#clock = opts.clock
    this.intervalMillis = opts.intervalMillis
    this.eagerFrac = opts.eagerFrac ?? 0.8
    this.#doSnapshot = opts.doSnapshot
    this.#doTryLaunch = opts.doTryLaunch
    this.#onTimerRefusal = opts.onTimerRefusal ?? null
    this.#dueAt = this.#clock.now()   // never launched: due now
    Object.freeze(this)
  }

  get timing(): TriggerTiming {
    return Object.freeze({ dueAt: this.#dueAt, lastLaunchedAt: this.#lastLaunchedAt, lastCompletedAt: this.#lastCompletedAt, lastSucceededAt: this.#lastSucceededAt })
  }

  /** The error of the latest failure noted, null before one and after a success has followed it. */
  get lastErr(): Error | null { return this.#lastErr }

  /** Whether the last success lies within `intervalMillis` of now. Never timely before the first success, whatever the interval. */
  get isTimely(): boolean {
    return (this.#lastSucceededAt !== null) && this.isTimelyWithin(this.intervalMillis)
  }

  /** Whether the last success lies within `maxMillis` of now. `Infinity` is always timely, for a trigger that has never succeeded too: it means go ahead. */
  isTimelyWithin(maxMillis: DurationMillis): boolean {
    if (maxMillis === Infinity) { return true }
    if (this.#lastSucceededAt === null) { return false }
    return this.#clock.now() - this.#lastSucceededAt < maxMillis
  }

  /** Note how the task fared, as it happens, in a launch or not: the answer to an own put, say. The default is a success.
   * A success dates `lastSucceededAt` now, clears {@link lastErr} and schedules the next launch. A failure keeps its `err`, if any, as `lastErr`, and changes nothing else.
   */
  taskCompleted(outcome: { ok?: boolean, err?: Error } = {}): void {
    const { ok, err } = taskOutcome.parse(outcome)
    if (! ok) {
      if (err !== undefined) { this.#lastErr = err }
      return
    }
    this.#lastErr = null
    this.#lastSucceededAt = this.#clock.now()
    this.scheduleLaunchAt(this.#lastSucceededAt + (this.intervalMillis * this.eagerFrac))
  }

  /** Launch if the last success is `maxMillis` old or older; otherwise do nothing. Given no `maxMillis`, launch unless {@link isTimely}: a trigger that never succeeded is due whatever its interval. */
  async ensureTimelyWithin(maxMillis?: DurationMillis): Promise<void> {
    const timely = maxMillis === undefined ? this.isTimely : this.isTimelyWithin(maxMillis)
    if (! timely) { await this.launch() }
  }

  get snapshot(): SnapT { return this.#doSnapshot() }

  async ensure(): Promise<SnapT> {
    if (! this.isTimely) { await this.launch() }
    return this.snapshot
  }

  async launch(): Promise<ValT> {
    return valOf(await this.tryLaunch())
  }

  async tryLaunch(): Promise<Outcome<ValT>> {
    this.#currentTask ??= this.#launchAlone()
    return this.#currentTask
  }

  /** Arm the timer to launch at `dueAt`, replacing the one set. */
  scheduleLaunchAt(dueAt: Timestamp): void {
    this.#dueAt = dueAt
    this.#armTimer()
  }

  /** Disarm the timer for good: no launch is made on schedule afterwards, whatever completes. A launch under way is not cancelled. */
  disarm(): void {
    this.#disarmed = true
    this.#disarmTimer()
  }

  async #launchAlone(): Promise<Outcome<ValT>> {
    try {
      this.#lastLaunchedAt = this.#clock.now()
      const outcome = await this.#doTryLaunch()
      this.#lastCompletedAt = this.#clock.now()
      if (outcome.ok) {
        this.scheduleLaunchAt(this.#lastCompletedAt + (this.intervalMillis * this.eagerFrac))
      } else {
        this.taskCompleted(outcome)
      }
      return outcome
    } finally {
      this.#currentTask = null
    }
  }

  /** Arm a timer for the launch scheduled, unless the delay is more than a JavaScript timer can honor ({@link MaxTimerMillis}): then none is set, and the launch waits for a call that finds the trigger untimely. */
  #armTimer(): void {
    this.#disarmTimer()
    if (this.#disarmed) { return }
    const delayMillis: DurationMillis = Math.max(0, this.#dueAt - this.#clock.now())
    if (delayMillis > MaxTimerMillis) { return }
    this.#timer = setTimeout(() => { void this.#launchFromTimer() }, delayMillis)
  }

  /** `tryLaunch`, telling a refusal to `onTimerRefusal`. */
  async #launchFromTimer(): Promise<void> {
    const { ok, err } = await this.tryLaunch()
    if (! ok) { this.#onTimerRefusal?.(err) }
  }

  /** Disarm the timer, if any. */
  #disarmTimer(): void {
    if (this.#timer !== null) { clearTimeout(this.#timer) }
    this.#timer = null
  }
}
