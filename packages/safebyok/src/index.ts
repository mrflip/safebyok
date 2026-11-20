// safebyok, the front door: everything `safebyok/core` and `safebyok/storage` export, the ThingMinder the layers above the
// core build on, the strength checkers, and what a host or an adapter reaches for that safebyok-big defines, re-exported
// so that each stays one binding across both packages. The browser's deriver and checker are on `safebyok/browser`.
// The proving classes are on no entry as values: see core.ts.
// The two entries share many names, each the same binding (tests/index.test.ts checks every value), which import-x/export
// reports as a duplicate all the same; TypeScript refuses a name the two export as different bindings.
/* eslint-disable import-x/export */
export * from './core'
export * from './storage'
/* eslint-enable import-x/export */
export {
  type BankCar, type BoxCar, type CarAt, type CarFreshness, type DeliverableThing, type GateCar, type GotAnswer, type MinderOpts, type ScopeAt, type TSQAnswer, type TSQGotAnswer, type ThingAt, type ThingCar, carLivenessVals,
  type ListingEvent, type MinderEvent, type MinderEventOf, type ThingEvent,
  DefaultQueryCacheOpts, FixedQueryCacheOpts, MaxTimerHours, MaxTimerMillis, MinderChecks, type MinderFriend, type MinderGetOpts, type MinderInvalidateOpts, type MinderTryAtOpts, type TsqStaleTime,
} from './shapes/shapes-minder'
export { ThingMinder } from './minding/thing-minder'
export { carOf, dbHasNewer } from './minding/thing-car'
export { DefaultStrengthChecker, guardStrengthChecker } from './helpers/passphrase-strength'

// From safebyok-big, beside what core.ts and storage.ts re-export: the kinds, sizes and patterns a host checks its own input
// against, and the small helpers of `safebyok-big/utils`.
export { correctablekindVals } from 'safebyok-big'
export { ForeverMillis, MaxLabelChars, MaxUserIdChars, MinuteMillis, PasskeySaltSize, PassphraseSaltSize, Patterns } from 'safebyok-big'
export type { UserID } from 'safebyok-big'
export { WhisperFieldAttributes, fromB64, mask, mash, toB64, type MaskOpts } from 'safebyok-big/utils'
