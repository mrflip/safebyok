// The storage of the lean core: the vaultDB, which stores every kind as a Thing, and its memory store.
export { AdapterVaultDB } from './storage/adapter-vault-db'
export { MemoryVaultDB } from './storage/memory-vault-db'
export {
  type ExpectedMeta, type GateExpected, type GateThing, type GetThingAsk, type LoggableAsk, type Thing, type ThingMeta, type ThingScope,
  type ThingWatchScope, type Thingkind, type WriteThingAsk,
  GateThingFormat, ShellLifepath, ShellLifeseq, ShellMeta, isGoneLifeseq, lifeseqOf, seqOfLifeseq, thingkindVals,
} from './storage/shapes-thing'
export { isWriteAct } from './storage/thing-classifier'
export type { Actual, Answer, BadAnswer, GetThingAnswer, GoodAnswer, ThingNotice, VaultDB, WriteThingAnswer } from './storage/vault-db'
