// The one clock the package reads. A host has no say in it: the time is the device's. The two
// `_cheat_` exports are a test's backdoor, reached from `safebyok/testing` and never from the main
// entry; vitest's fake timers move `Date.now()` too, and need neither.

// == [The clock]: nowMillis, _cheat_clock, _cheat_clockReset

const deviceMillis = (): number => Date.now()

const reading: { millis: () => number } = { millis: deviceMillis }

/** The time now, in epoch milliseconds, by the device's clock. */
export const nowMillis = (): number => reading.millis()

/** For tests only: {@link nowMillis} answers what `fn` answers until {@link _cheat_clockReset}. */
export const _cheat_clock = (fn: () => number): void => { reading.millis = fn }

/** For tests only: {@link nowMillis} reads the device's clock again. */
export const _cheat_clockReset = (): void => { reading.millis = deviceMillis }
// --
