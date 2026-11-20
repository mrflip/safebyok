// The messages of the refusals this package makes itself. The rest are `safebyok-big`'s, through its Throwers.

// == [Models]: VaultDBExpected, SealerExpected, NovelOrProvingExpected, WayinExpected, TombstoneSecretsGiven, BoxOfOtherRoot, GotOtherThanBox, BankSwept

/** A vaultDB that lacks one of its verbs or builders. */
export const VaultDBExpected = 'Expected a VaultDB: an object with a function for each of its verbs, its builders and watch.'

/** Something other than NOVEL or a Proving, given as a wayin's source. */
export const NovelOrProvingExpected = 'Expected NOVEL or a proving'

/** Something other than a Wayin, where one is expected. */
export const WayinExpected = 'Expected a Wayin'

/** A sealer that lacks one of its methods, its tags or its purposes. */
export const SealerExpected = 'Expected a sealer: its tags, its purposes, and a function for each of its methods.'

/** A tombstone's seal given secret props. */
export const TombstoneSecretsGiven = "A tombstone seals no secrets: give `{ am: 'x' }` with no secret props."

/** A box whose lifepath is not under the bank's root box. */
export const BoxOfOtherRoot = "A box's lifepath starts with the lifeseq of its bank's root box: this one is of another life of the root."

/** A box get answered with a Thing of another kind: the vaultDB is broken. */
export const GotOtherThanBox = 'A box get was answered with a Thing that is not a box: the vaultDB is broken.'

/** A call on a bank after its sweep. */
export const BankSwept = 'This bank was swept, so it answers nothing more: make it again with Bank.make.'
// --

// == [Things]: the sentences of a Thing's checks, of a shell's, and of a vaultDB's asks

/** A labelpath that is not a modelkind and then labels. */
export const LabelpathShape = "A labelpath is a Thing's modelkind (bank, gate or box), then labels, each after a '/': none under bank, at most one under gate or box."

/** A record whose labelpath is another kind's. */
export const LabelpathOfOtherKind = "A Thing's labelpath starts with its own modelkind."

/** A lifeseq that is not 10 base-32 digits. */
export const LifeseqShape = "A lifeseq is 10 base-32 digits, 0-9 and a-v."

/** A revtok not of a UUID's shape. */
export const RevtokShape = "A revtok is a UUID: hex digits in groups of 8, 4, 4, 4 and 12, joined by '-'."

/** A lifepath that is not lifeseqs, each after a '/'. */
export const LifepathShape = "A lifepath is one or more lifeseqs, joined by '/'."

/** A Thing whose label is not its labelpath's last. */
export const LabelNotLast = "A Thing's label is the last segment of its labelpath: a root's is its modelkind."

/** A Thing whose lifeseq is not its lifepath's last. */
export const LifeseqNotOwn = "A Thing's lifeseq is the last of its lifepath."

/** A Thing whose lifepath and labelpath have different depths. */
export const LifepathDepth = "A Thing's lifepath has one lifeseq for each segment of its labelpath."

/** A Thing whose am and lifeseq disagree. */
export const LifeseqParity = "A Thing's lifeseq is odd exactly when it is a tombstone (am: 'x')."

/** A box tombstone whose sidecar is not empty. */
export const TombstoneSidecarNotEmpty = "A box tombstone's sidecar is always `{}`."

/** A citation that is half the shell. */
export const CitedHalfShell = "What a write cites is the shell, at revseq -1, a lifepath ending in '-000000001' and the void revtok, in all three or in none."

/** A sealable box that matches the shell in some of its revseq, lifeseq and revtok, but not all three. */
export const SealableHalfShell = "A box a revision is made from is the shell, at revseq -1, a lifeseq of '-000000001' and the void revtok, in all three or in none."

/** A live box's revision made with no sidecar, given or kept. */
export const SidecarMissing = "A live box has a sidecar: give one, or make the revision from a box that has one."

/** A tombstone made of a tombstone or the shell. */
export const TombstoneOfLiveOnly = "Only a live box has a tombstone: a tombstone or the shell has none."

/** A write whose revseq does not follow. */
export const RevseqNotNext = "A write's record must have the revseq one past the cited one's."

/** A write whose revtok is not new. */
export const RevtokNotNew = "A write's record must have a new revtok: neither the cited one's, nor the void one."

/** A write whose record is at another scope. */
export const RecordOfOtherScope = "A write's record is at the scope its ask names: its userid, banklabel and labelpath."

/** A write of a tombstone over a tombstone. */
export const TombstoneOverTombstone = "A tombstone is never written over a tombstone."

/** A write that changes the leading lifeseqs of the cited lifepath. */
export const LifepathNotKept = "A write's record keeps the leading lifeseqs of the lifepath it cites: only the last, its own, may change."

/** A write whose lifeseq does not follow. */
export const LifeseqNotNext = "A write's record keeps the cited lifeseq when am stays, and has the next one when am flips."

/** A birth whose born_at is not its written_at. */
export const BornAtNotNow = "A write over a tombstone or none is a birth: its born_at is its written_at."

/** A write over a live Thing that changes its born_at. */
export const BornAtNotStored = "A write over a live Thing keeps the stored Thing's born_at."

/** A deleted main gate. */
export const MainGateDeleted = "The main gate is never deleted: its record is always live (am: 'a')."

/** A policy that needs testimony the citation lacks. */
export const TestimonyMissing = "The replace_passphrase policy reads the cited gate's wayins: cite them."

/** An ask whose modelkind is not its labelpath's. */
export const ModelkindNotOwn = "An ask's modelkind is the first segment of its labelpath."

/** A write whose op does not match its record. */
export const OpNotOfRecord = "A put writes a live record (am: 'a'), and a del a tombstone (am: 'x')."

/** A del that changes its fixed flags. */
export const DelFlagsFixed = "A del's flags are fixed, ifAbsent 'fail' and ifPresent 'repl', and it names no storage policy."

/** A write naming a storage policy its kind lacks. */
export const PolicyNotOwn = "Only a gate's writes name storage policies: a bank and a box have none."

/** A live bank stored without one of its roots. */
export const BankRootsMissing = "A live bank is stored without its main gate or its root box: the store needs mending by hand."

/** The last resort of a vaultDB's error handler. */
export const AnswerNotMade = "The vaultDB could not make an answer for a failure: this is a bug in safebyok."
// --

// == [Minding]: BankExpected, MinderNotStarted, StaleRead, GcTimeShape, StaleTimeShape, FeedVersionOther, NotACar, CarRecordShape, CarFullestShape, CarFullSplit, CarNewestNotSparse, CarBhndOfOtherRevision, CarNewestNotGone, CarVoidNotShell, CarAgerankNotOwn, CarsOfOtherThings, DeliveredOfOtherScope, ChildrenStoredDamaged

/** A minder made without a bank. */
export const BankExpected = 'A ThingMinder is made with the Bank it minds Things of.'


/** A minder read or written through before `hello`, or after `goodbye`. */
export const MinderNotStarted = 'This ThingMinder is not minding: call hello before reading from it or writing through it.'

/** A get that storage answered older than the record the minder held when it began. */
export const StaleRead = 'Storage answered with a revision older than one this device already held. The newer record stays cached, and a later get asks again.'

/** A gcTime that is not Infinity or a whole number of milliseconds up to MaxTimerMillis. */
export const GcTimeShape = 'A gcTime is Infinity, or a whole number of milliseconds from 0 to 2116800000 (24.5 days): a longer timer fires at once, so give Infinity instead.'

/** A staleTime that is not Infinity or a whole number of milliseconds up to MaxTimerMillis. */
export const StaleTimeShape = 'A staleTime is Infinity, or a whole number of milliseconds from 0 to 2116800000 (24.5 days): a longer timer fires at once, so give Infinity instead.'

/** A listener given to a minder's `listen` with a feed version other than this one's. */
export const FeedVersionOther = "A ThingMinder's listen is given the version of the feed its listener reads, ThingFormat, and this listener was written for another: its events are not shaped as it expects."

/** A value in a minder's query that is not a car. */
export const NotACar = "A ThingMinder's structural sharing was given a value that is not a ThingCar: only cars belong in its cache."

/** A car whose newest is not a Thing's scope and revision. */
export const CarRecordShape = "A ThingCar's newest record lacks a Thing's scope or revision: this is a bug in safebyok."

/** A car whose fullest is not a whole record. */
export const CarFullestShape = "A ThingCar's fullest record is not whole: this is a bug in safebyok."

/** A full car with two records, or a tombstone. */
export const CarFullSplit = "A full ThingCar has one live record in both its newest and fullest, and this one does not: this is a bug in safebyok."

/** A bhnd or bare car whose newest is whole, or a tombstone. */
export const CarNewestNotSparse = "A bhnd or bare ThingCar's newest record is live and sparse, and this one's is not: this is a bug in safebyok."

/** A bhnd car whose fullest is not an earlier revision of its newest's life. */
export const CarBhndOfOtherRevision = "A bhnd ThingCar's fullest record is an earlier revision of its newest's Thing and life, and this one's is not: this is a bug in safebyok."

/** A gone car whose newest is not gone: a live record, or the void sentinel. */
export const CarNewestNotGone = "A gone ThingCar's newest record is the tombstone of a deleted Thing, and this one's is a live record or the void sentinel: this is a bug in safebyok."

/** A void car whose newest is not the void sentinel. */
export const CarVoidNotShell = "A void ThingCar's newest record is the void sentinel, and this one's is not: this is a bug in safebyok."

/** A car whose agerank is not the one its records and liveness make. */
export const CarAgerankNotOwn = "A ThingCar's agerank is made of its records and liveness, and this one's is not: this is a bug in safebyok."

/** Two cars of different Things given to a minder's structural sharing. */
export const CarsOfOtherThings = "A ThingMinder's structural sharing was given the cars of two different Things: this is a bug in safebyok."

/** A record the vaultDB delivered to a minder of another bank, or of another Thing than the minder asked for. */
export const DeliveredOfOtherScope = "The vaultDB delivered a ThingMinder a record of another bank than the minder's, or of another Thing than it asked for: this is a bug in the vaultDB."

/** Children a list found stored damaged, and left out of its answer. */
export const ChildrenStoredDamaged = "Some of the Things this list found are stored damaged, so it left them out: the refusal's meta.labelpaths names each one. They were left as they are in storage."
// --
