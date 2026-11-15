// The storage of the lean core: the vaultDB, which stores every kind as a Thing, and its memory store.
export { AdapterVaultDB } from './storage/adapter-vault-db'
export { MemoryVaultDB } from './storage/memory-vault-db'
export {
  type BankRoots, type BankThing, type BirthBankAsk, type BoxThing, type CitedOf, type DelAskArgs, type GateThing, type GetAskArgs,
  type GetThingAsk, type ListAskArgs, type ListThingsAsk, type LoggableAsk, type PutAskArgs, type Sparse, type Thing, type ThingCited,
  type ThingRecord, type ThingScope, type ThingWatchScope, type Thingkind, type ThingkindOf, type WriteThingAsk,
  BankThingFormat, BoxThingFormat, GateThingFormat, ShellCited, ShellLifepath, ShellLifeseq,
  delAskOf, getAskOf, isGoneLifeseq, isKindLabelpath, lifeseqOf, lifeseqOfLifepath, listAskOf, modelkindOf, putAskOf, sealed, seqOfLifeseq,
  shellCitedUnder, sparseOf, thingkindVals,
} from './storage/shapes-thing'
export { type BankRootsFetched, type ThingsFetched, isWriteAct } from './storage/thing-classifier'
export type {
  Actual, Answer, BadAnswer, BirthBankActual, BirthBankAnswer, DamagedThing, GetThingAnswer, GoodAnswer, ListThingsActual, ListThingsAnswer,
  ListedBeside, ThingNotice, VaultDB, WriteThingAnswer,
} from './storage/vault-db'
