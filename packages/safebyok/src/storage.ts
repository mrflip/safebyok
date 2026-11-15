// The storage of the lean core: the vaultDB, where every kind is stored as a Thing, and its memory store.
export { AdapterVaultDB } from './storage/adapter-vault-db'
export { MemoryVaultDB } from './storage/memory-vault-db'
export {
  type BankRoots, type BankThing, type BankWriteAsk, type BirthBankAsk, type BirthPuts, type BoxThing, type BoxWriteAsk, type CitedOf, type DelAskArgs,
  type GateThing, type GateWriteAsk, type GetAskArgs, type GetThingAsk, type ListAskArgs, type ListThingsAsk, type LoggableAsk, type PutAskArgs,
  type Sparse, type Thing, type ThingCited, type ThingRecord, type ThingScope, type ThingWatchScope, type Thingkind, type WriteAskOf, type WriteThingAsk,
  BankThingFormat, BoxThingFormat, GateThingFormat, ShellCited, ShellLifepath, ShellLifeseq,
  childShellCited, delAskOf, getAskOf, isGoneLifeseq, isLabelpathOfKind, lifeseqOf, lifeseqOfLifepath, listAskOf, modelkindOf, putAskOf, sealed,
  seqOfLifeseq, sparseOf, thingkindVals,
} from './storage/shapes-thing'
export { type BankRootsFetched, type ThingsFetched, isWriteAct, writtenRootsOf, writtenThingOf } from './storage/thing-classifier'
export type {
  Actual, Answer, BadAnswer, BirthBankActual, BirthBankAnswer, DamagedThing, GetThingAnswer, GoodAnswer, ListThingsActual, ListThingsAnswer,
  ListedBeside, ThingNotice, VaultDB, WriteThingAnswer,
} from './storage/vault-db'
