// The storage of the lean core: the vaultDB, which keeps every kind as a Thing, and its memory store.
export { AdapterVaultDB } from './storage/adapter-vault-db'
export { MemoryVaultDB } from './storage/memory-vault-db'
export {
  type BankRoots, type BankThing, type BankWriteAsk, type BirthBankAsk, type BirthPuts, type BoxSparse, type BoxThing, type BoxWriteAsk, type CitedOf, type DelAskArgs,
  type GateThing, type GateWriteAsk, type GetAskArgs, type GetThingAsk, type ListAskArgs, type ListThingsAsk, type LoggableAsk, type PutAskArgs, type Sealed,
  type Sparse, type Thing, type ThingCited, type ThingRecord, type ThingScope, type ThingWatchScope, type Thingkind, type WriteAskOf, type WriteThingAsk,
  BankThingFormat, BoxThingFormat, GateThingFormat, ShellCited, ShellLifepath, ShellLifeseq,
  boxSparse, childShellCited, delAskOf, getAskOf, isGoneLifeseq, isLabelpathOfKind, lifeseqOf, lifeseqOfLifepath, listAskOf, modelkindOf, putAskOf, sealed,
  seqOfLifeseq, sparseOf, thingkindVals,
} from './storage/shapes-thing'
export { type BankRootsFetched, type ThingsFetched, isWriteAct, writtenRootsOf, writtenThingOf } from './storage/thing-classifier'
export {
  type Actual, type Answer, type BadAnswer, type BirthBankActual, type BirthBankAnswer, type DamagedThing, type GetThingAnswer, type GoodAnswer,
  type ListThingsActual, type ListThingsAnswer, type ListedBeside, type ThingNotice, type VaultDB, type WriteThingAnswer, isVaultDB,
} from './storage/vault-db'
