// The one clock the package reads. A host has no say in it: the time is the device's. The two
// `_cheat_` exports are a test's backdoor, reached from `safebyok-big/testing` and never from the main
// entry; vitest's fake timers move `Date.now()` too, and need neither.

import type { EpochMillis } from './aliases'

// == [The clock]: nowMillis, _cheat_clock, _cheat_clockReset

const deviceMillis = (): EpochMillis => Date.now()

const clock: { millis: () => EpochMillis } = { millis: deviceMillis }

/** The time now, in epoch milliseconds, by the device's clock. */
export function nowMillis(): EpochMillis { return clock.millis() }

/** For tests only: {@link nowMillis} answers what `fn` answers until {@link _cheat_clockReset}. */
export const _cheat_clock = (fn: () => EpochMillis): void => { clock.millis = fn }

/** For tests only: {@link nowMillis} reads the device's clock again. */
export const _cheat_clockReset = (): void => { clock.millis = deviceMillis }
// --
