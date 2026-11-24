// The messages of the refusals this package makes itself. The rest are `safebyok-big`'s, through its Throwers.

// == [Models]: VaultDBExpected, SortedVaultDBExpected, SealerExpected, TombstoneSecretsGiven, BoxOfOtherRoot, VaultBoxIsRoot, BankSwept, BankNotBroughtUp, NobodySignedIn, GateSwept, UnlockDismissed, HostedVaultExpected, BoxSoonestBare

/** A vaultDB that lacks one of its verbs or builders. */
export const VaultDBExpected = 'Expected a VaultDB: an object with a function for each of its verbs, its builders and watch.'

/** What a minder's hello is handed that lacks one of a SortedVaultDB's members. */
export const SortedVaultDBExpected = 'Expected a SortedVaultDB: an object with a function for each of its verbs, listen, receive, thingAt and sweep.'

/** A sealer that lacks one of its methods, its tags or its purposes. */
export const SealerExpected = 'Expected a sealer: its tags, its purposes, and a function for each of its methods.'

/** A tombstone's seal given secret props. */
export const TombstoneSecretsGiven = "A tombstone seals no secrets: give `{ am: 'x' }` with no secret props."

/** A box whose lifepath is not under the bank's root box. */
export const BoxOfOtherRoot = "A box's lifepath starts with the lifeseq of its bank's root box: this one is of another life of the root."

/** A vault's box entry point given the root box's labelpath. */
export const VaultBoxIsRoot = "A vault's boxes are under its bank's root box: give a labelpath such as 'box/openai', never 'box' itself."

/** A call on a bank after its sweep. */
export const BankSwept = 'This bank was swept, so it answers nothing more: make it again with Bank.make.'

/** A birth on a device whose `signIn` has not answered. */
export const BankNotBroughtUp = "This device's bank is not brought up yet: call `signIn`, and birth the bank once the stage shows `'unborn'`."

/** A call that needs a user, on a device nobody is signed in to. */
export const NobodySignedIn = "Nobody is signed in on this device: call `signIn` with the user's id first."

/** A call on a gate after its sweep. */
export const GateSwept = "This gate was swept, so it answers nothing more: make its bank again with Bank.make."

/** A call that waited for an `unlock` gating, when the wait was dismissed. */
export const UnlockDismissed = 'The unlock was dismissed, so the bank stayed locked and the call waiting on it was not made: try again when you want it.'

/** A gating attempted a second time. */
export const GatingSpent = 'This gating was attempted already, and a gating is attempted once: make another for the next try.'

/** Something a bank is asked to host that has no sweep. */
export const HostedVaultExpected = 'Expected a vault: an object with a sweep function.'

/** A box the device has heard a newer revision of, with no whole record of its newest life to unseal. */
export const BoxSoonestBare = 'This device has heard of a newer revision of the box but has not fetched it yet.'
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

/** A lifetok not of a UUID's shape. */
export const LifetokShape = "A lifetok is a UUID: hex digits in groups of 8, 4, 4, 4 and 12, joined by '-'."

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

/** A read_tc that is not a UUID version 7. */
export const ReadTcShape = "A read_tc is a UUID version 7, in lowercase hex."

/** A box tombstone whose sidecar is not empty. */
export const TombstoneSidecarNotEmpty = "A box tombstone's sidecar is always `{}`."

/** A void event whose val is not the void sentinel. */
export const VoidSentinelExpected = "A void event's val is the void sentinel: a tombstone at revseq -1, with the void revtok and lifeseq."

/** An event whose modelkind is not its labelpath's. */
export const EventModelkind = "An event's modelkind is the kind its labelpath begins with."

/** An event whose val is at another scope than the event. */
export const EventOfOtherThing = "An event's val is at the event's own scope: its userid, banklabel and labelpath."

/** An event whose liveness is not its val's. */
export const EventLiveness = "An event's liveness is its val's: soon for a sparse live record, full for a whole one, gone for a tombstone, void for the void sentinel."

/** An event that is not void, whose val is not a Thing's fields, or is the void sentinel. */
export const ThingFieldsExpected = "An event that is not void has a Thing's fields as its val, sparse or whole, never the void sentinel."

/** A citation that is half the shell. */
export const CitedHalfShell = "What a write cites is the shell, at revseq -1, a lifepath ending in '-000000001' and the void revtok, in all three or in none."

/** A sealable box that matches the shell in some of its revseq, lifeseq and revtok, but not all three. */
export const SealableHalfShell = "A box a revision is made from is the shell, at revseq -1, a lifeseq of '-000000001' and the void revtok, in all three or in none."

/** A live box's revision made with no sidecar, given or carried over. */
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
export const LifepathNotKept = "A write's record leaves the leading lifeseqs of the lifepath it cites unchanged: only the last, its own, may change."

/** A write whose lifeseq does not follow. */
export const LifeseqNotNext = "A write's record has the cited lifeseq when am stays, and the next one when am flips."

/** A birth whose born_at is not its written_at. */
export const BornAtNotNow = "A write over a tombstone or none is a birth: its born_at is its written_at."

/** A write over a live Thing that changes its born_at. */
export const BornAtNotStored = "A write over a live Thing leaves the stored Thing's born_at unchanged."

/** A write of the bank over a live bank that changes its lifetok. */
export const LifetokNotStored = "A write of the bank over a live bank keeps the stored bank's lifetok."

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

/** A bank stored without one of its roots, or with one damaged. */
export const BankRootsMissing = "A bank is stored without its main gate or its root box, or with its bank or main gate damaged: the store needs mending by hand."

/** The last resort of a vaultDB's error handler. */
export const AnswerNotMade = "The vaultDB could not make an answer for a failure: this is a bug in safebyok."
// --

// == [Minding]: MinderFriendExpected, NotMinded, WorldNotHeard, MinderNotStarted, StaleRead, StaleTimeShape, FeedVersionOther, DeliveredOfOtherScope, ChildrenStoredDamaged

/** A minder made without a friend: a device or a bank. */
export const MinderFriendExpected = 'A minder is made with its friend: the device or bank whose Things it minds.'

/** A write through a minder of a Thing it does not mind. */
export const NotMinded = "A minder writes only the Things it minds: a VaultMinder the boxes under the root box, a BankMinder the bank, its main gate and its root box."

/** A Bank made of a bank whose world its device's BankMinder does not hold. */
export const WorldNotHeard = "A Bank is made of the bank whose world its device's BankMinder holds: bring the device up, or birth the bank, first."

/** A minder read or written through before `hello`, or after `goodbye`. */
export const MinderNotStarted = 'This minder is not minding: call hello before reading from it or writing through it.'

/** A get that storage answered older than the record the minder had cached when it began. */
export const StaleRead = 'Storage answered with a revision older than one this device already had. The newer record stays cached, and a later get asks again.'

/** A staleTime that is not Infinity or a whole number of milliseconds up to MaxTimerMillis. */
export const StaleTimeShape = 'A staleTime is Infinity, or a whole number of milliseconds from 0 to 2116800000 (24.5 days): a longer timer fires at once, so give Infinity instead.'

/** A minder's `listen` given a feed version other than `MinderEventFormat`. */
export const FeedVersionOther = "A minder's listen is given the version of the feed its listener reads, MinderEventFormat, and this listener was written for another: its events are not shaped as it expects."

/** A record the vaultDB delivered to a minder of another bank, or of another Thing than the minder asked for. */
export const DeliveredOfOtherScope = "The vaultDB delivered a minder a record of another bank than the minder's, or of another Thing than it asked for: this is a bug in the vaultDB."

/** Children a list found stored damaged, and left out of its answer. */
export const ChildrenStoredDamaged = "Some of the Things this list found are stored damaged, so it left them out: the refusal's meta.labelpaths names each one. They were left as they are in storage."
// --
