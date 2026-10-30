import { MaxTimerMillis } from '../consts'
import type { VaultError } from '../errors'
import { type Outcome, valOf } from '../outcome'
import type { Clock } from '../shapes/bank-opts'

export type TriggerOpts<SnapT, ValT> = {
  clock:                  Clock
  maxMillis:  number
  // The next launch is scheduled at this fraction of maxMillis after a success, so it has completed by the horizon. Default 0.8.
  eagerFrac?:             number | undefined
  doSnapshot:             () => SnapT
  doTryLaunch:            () => Promise<Outcome<ValT>>
  // The launch notes its own success, by noteSuccessNow, and an ok outcome notes no success more, though the next launch is scheduled after it all the same. Default false: an ok outcome is a success.
  notesOwnSuccess?:       boolean | undefined
  // Told the refusal of a launch the timer made, which no caller awaits.
  onTimerRefusal?:        ((err: VaultError) => void) | undefined
}

export type TriggerTiming = Readonly<{
  launchAt:         number
  lastLaunchedAt:   number | null
  lastCompletedAt:  number | null
  lastSucceededAt:  number | null
}>

export class Trigger<SnapT, ValT> {
  readonly maxMillis: number
  readonly eagerFrac: number

  readonly #clock:           Clock
  readonly #doSnapshot:      () => SnapT
  readonly #doTryLaunch:     () => Promise<Outcome<ValT>>
  readonly #notesOwnSuccess: boolean
  readonly #onTimerRefusal:  ((err: VaultError) => void) | null

  #launchAt:        number
  #lastLaunchedAt:  number | null = null
  #lastCompletedAt: number | null = null
  #lastSucceededAt: number | null = null

  // The launch under way, which every tryLaunch made meanwhile joins (oneAtATime, but with a value).
  #running: Promise<Outcome<ValT>> | null = null
  #timer:   ReturnType<typeof setTimeout> | null = null

  constructor(opts: TriggerOpts<SnapT, ValT>) {
    this.#clock = opts.clock
    this.maxMillis = opts.maxMillis
    this.eagerFrac = opts.eagerFrac ?? 0.8
    this.#doSnapshot = opts.doSnapshot
    this.#doTryLaunch = opts.doTryLaunch
    this.#notesOwnSuccess = opts.notesOwnSuccess ?? false
    this.#onTimerRefusal = opts.onTimerRefusal ?? null
    this.#launchAt = this.#clock.now()   // never launched: due now
    Object.freeze(this)
  }

  get timing(): TriggerTiming {
    return Object.freeze({ launchAt: this.#launchAt, lastLaunchedAt: this.#lastLaunchedAt, lastCompletedAt: this.#lastCompletedAt, lastSucceededAt: this.#lastSucceededAt })
  }

  get isTimely(): boolean { return this.#clock.now() < this.#launchAt }

  /** Whether the last success lies within `maxMillis` of now. `Infinity` is always timely, for a trigger that has never succeeded too: it means go ahead. */
  isTimelyWithin(maxMillis: number): boolean {
    if (maxMillis === Infinity) { return true }
    if (this.#lastSucceededAt === null) { return false }
    return this.#clock.now() - this.#lastSucceededAt < maxMillis
  }

  // A success that came some other way than a launch: the answer to an own put, say.
  noteSuccessNow(): void {
    this.#lastSucceededAt = this.#clock.now()
    this.scheduleLaunchAt(this.#lastSucceededAt + (this.maxMillis * this.eagerFrac))
  }

  // Timely by the given horizon, else by the scheduled launch; launch when not. A launch under way is joined.
  async ensureTimelyWithin(maxMillis?: number): Promise<void> {
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
    this.#running ??= this.#launchAlone()
    return this.#running
  }

  scheduleLaunchAt(launchAt: number): void {
    this.#launchAt = launchAt
    this.#armTimer()
  }

  scheduleLaunchNow(): void {
    this.scheduleLaunchAt(this.#clock.now())
  }

  dispose(): void {
    this.#disarmTimer()
  }

  async #launchAlone(): Promise<Outcome<ValT>> {
    try {
      this.#lastLaunchedAt = this.#clock.now()
      const outcome = await this.#doTryLaunch()
      this.#lastCompletedAt = this.#clock.now()
      if (outcome.ok) {
        if (! this.#notesOwnSuccess) { this.#lastSucceededAt = this.#lastCompletedAt }
        this.scheduleLaunchAt(this.#lastCompletedAt + (this.maxMillis * this.eagerFrac))
      }
      return outcome
    } finally {
      this.#running = null
    }
  }

  /** Arm a timer for the launch scheduled, unless it lies past {@link MaxTimerMillis}, which a platform's timer cannot hold: then none is set, and the launch waits for a call that finds it due. */
  #armTimer(): void {
    this.#disarmTimer()
    const delayMillis = Math.max(0, this.#launchAt - this.#clock.now())
    if (delayMillis > MaxTimerMillis) { return }
    this.#timer = setTimeout(() => { void this.#launchFromTimer() }, delayMillis)
  }

  /** `tryLaunch`, telling a refusal to `onTimerRefusal`. */
  async #launchFromTimer(): Promise<void> {
    const { ok, err } = await this.tryLaunch()
    if (! ok) { this.#onTimerRefusal?.(err) }
  }

  #disarmTimer(): void {
    if (this.#timer !== null) { clearTimeout(this.#timer) }
    this.#timer = null
  }
}
