import type { Clock } from '../shapes/bank-opts'
import { type Outcome, valOf } from '../outcome'

export type TriggerOpts<SnapT, ValT> = {
  clock:                  Clock
  maxMillisSinceSuccess:  number
  doSnapshot:             () => SnapT
  doTryLaunch:            () => Promise<Outcome<ValT>>
}

export type TriggerTiming = Readonly<{
  launchAt:         number
  lastLaunchedAt:   number | null
  lastCompletedAt:  number | null
  lastSucceededAt:  number | null
}>

export class Trigger<SnapT, ValT> {
  readonly maxMillisSinceSuccess: number

  readonly #clock:        Clock
  readonly #doSnapshot:   () => SnapT
  readonly #doTryLaunch:  () => Promise<Outcome<ValT>>

  #launchAt:        number
  #lastLaunchedAt:  number | null = null
  #lastCompletedAt: number | null = null
  #lastSucceededAt: number | null = null

  // The launch under way, which every tryLaunch made meanwhile joins (oneAtATime, but with a value).
  #running: Promise<Outcome<ValT>> | null = null
  #timer:   ReturnType<typeof setTimeout> | null = null

  constructor(opts: TriggerOpts<SnapT, ValT>) {
    this.#clock = opts.clock
    this.maxMillisSinceSuccess = opts.maxMillisSinceSuccess
    this.#doSnapshot = opts.doSnapshot
    this.#doTryLaunch = opts.doTryLaunch
    this.#launchAt = this.#clock.now()   // never launched: due now
    Object.freeze(this)
  }

  get timing(): TriggerTiming {
    return Object.freeze({ launchAt: this.#launchAt, lastLaunchedAt: this.#lastLaunchedAt, lastCompletedAt: this.#lastCompletedAt, lastSucceededAt: this.#lastSucceededAt })
  }

  get isTimely(): boolean { return this.#clock.now() < this.#launchAt }

  isTimelyWithin(maxMillisSinceSuccess: number): boolean {
    if (this.#lastSucceededAt === null) { return false }
    return this.#clock.now() - this.#lastSucceededAt < maxMillisSinceSuccess
  }

  // A success that came some other way than a launch: an own write's answer, say.
  noteSuccessNow(): void {
    this.#lastSucceededAt = this.#clock.now()
    this.scheduleLaunchAt(this.#lastSucceededAt + this.maxMillisSinceSuccess)
  }

  // Timely by the given horizon, else by the scheduled launch; launch when not. A launch under way is joined.
  async ensureTimelyWithin(maxMillisSinceSuccess?: number): Promise<void> {
    const timely = maxMillisSinceSuccess === undefined ? this.isTimely : this.isTimelyWithin(maxMillisSinceSuccess)
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
        this.#lastSucceededAt = this.#lastCompletedAt
        this.scheduleLaunchAt(this.#lastSucceededAt + this.maxMillisSinceSuccess)
      }
      return outcome
    } finally {
      this.#running = null
    }
  }

  #armTimer(): void {
    this.#disarmTimer()
    const delayMillis = Math.max(0, this.#launchAt - this.#clock.now())
    this.#timer = setTimeout(() => { void this.tryLaunch() }, delayMillis)
  }

  #disarmTimer(): void {
    if (this.#timer !== null) { clearTimeout(this.#timer) }
    this.#timer = null
  }
}
