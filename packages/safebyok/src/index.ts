// safebyok, the front door: everything `safebyok/core` and `safebyok/storage` export, the VaultTSQ and Vault the layers above the
// core build on, the strength checkers, the bulletproof wrappers of a host's functions, and what a host or an adapter reaches
// for that safebyok-big defines, re-exported so that each stays one binding across both packages. The browser's deriver and checker are on `safebyok/browser`.
// The proving classes are on no entry as values: see core.ts.
// The two entries share many names, each the same binding (tests/index.test.ts checks every value), which import-x/export
// reports as a duplicate all the same; TypeScript refuses a name the two export as different bindings.
/* eslint-disable import-x/export */
export * from './core'
export * from './storage'
/* eslint-enable import-x/export */
export { VaultMinder } from './minding/vault-minder'
export {
  type CarWorld, type DelOnceArgs, type PutOnceArgs, type ReceivingThing, type ThingCarOpts, type ThingMaker, type VaultMinderListener, type VaultMinderOpts, ThingCarChecks, VaultMinderChecks, isVaultMinder,
} from './shapes/shapes-vault-minder'
export { ThingCar } from './minding/thing-car'
export { VaultTSQ } from './minding/vault-tsq'
export {
  type GetOnceOpts, type ItemQueryOptions, type TsqStaleTime, type VaultMutationOptions, type VaultTSQOpts, MaxTimerHours, MaxTimerMillis, VaultTSQChecks, isQueryClient, isVaultTSQ,
} from './shapes/shapes-vault-tsq'
export type { ScopeAt } from './shapes/shapes-thing'
export { Vault } from './models/vault'
export { VaultChecks } from './shapes/shapes-vault'
export { type ProbeArgs, type ProbeReport, type ProbeStep, type ProbeStepkind, ProbeChecks, ProbeLabelpath, probeStepkindVals } from './shapes/shapes-vault-probe'
export { DefaultStrengthChecker, guardStrengthChecker } from './helpers/passphrase-strength'
export { maskUuid } from './helpers/mask-uuid'
export { type BulletproofFailOpts, type BulletproofOpts, type BulletproofTellOpts, bulletproofAsyncHandlerOf } from './helpers/bulletproof'

// From safebyok-big, beside what core.ts and storage.ts re-export: the kinds, sizes and patterns a host checks its own input
// against, and the small helpers of `safebyok-big/utils`.
export { correctablekindVals } from 'safebyok-big'
export { ForeverMillis, MaxLabelChars, MaxUserIdChars, MinuteMillis, PasskeySaltSize, PassphraseSaltSize, Patterns } from 'safebyok-big'
export type { UserID } from 'safebyok-big'
export { MaskSchedule, WhisperFieldAttributes, fromB64, mask, mash, toB64, type MaskOpts, type MaskRow } from 'safebyok-big/utils'
