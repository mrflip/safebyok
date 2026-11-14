// The messages of the refusals this package makes itself. The rest are `safebyok-big`'s, through its Throwers.

/** A put met where storing is not built: the layer above stores the bank. */
export const PutNotBuilt = 'This layer stores nothing: the layer above puts the bank.'

// == [Things]: the sentences of a Thing's checks, and of a vaultDB's asks

/** A labelpath that is not a modelkind and then labels. */
export const LabelpathShape = "A labelpath is a Thing's modelkind (bank, gate or box), then one or more labels, each after a '/'."

/** A lifeseq that is not 10 base-32 digits. */
export const LifeseqShape = "A lifeseq is 10 base-32 digits, 0-9 and a-v."

/** A lifepath that is not lifeseqs, each after a '/'. */
export const LifepathShape = "A lifepath is one or more lifeseqs, each after a '/'."

/** A Thing whose label is not its labelpath's last. */
export const LabelNotLast = "A Thing's label is the last label of its labelpath."

/** A Thing written or cited below depth 1. */
export const LifepathNotOwn = "A lifepath is one lifeseq after a '/', the Thing's own: Things are written at depth 1 for now."

/** A Thing whose am and lifeseq disagree. */
export const LifeseqParity = "A Thing's lifeseq is odd exactly when it is a tombstone (am: 'x')."

/** A citation that is half the shell. */
export const CitedHalfShell = "What a write cites is the shell, at revseq -1, lifeseq '-1' and the void revtok, in all three or in none."

/** A write whose revseq does not follow. */
export const RevseqNotNext = "A write's record must have the revseq one past the cited one's."

/** A write whose revtok is not new. */
export const RevtokNotNew = "A write's record must have a new revtok: neither the cited one's, nor the void one."

/** A write whose record is at another scope. */
export const RecordOfOtherScope = "A write's record is at the scope its ask names: its userid, banklabel and labelpath."

/** A write of a tombstone over a tombstone. */
export const TombstoneOverTombstone = "A tombstone is never written over a tombstone."

/** A write whose lifeseq does not follow. */
export const LifeseqNotNext = "A write's record keeps the cited lifeseq when am stays, and has the next one when am flips."

/** A write over a tombstone that is not born as it is written. */
export const BornAtNotNow = "A write over a tombstone or none is a birth: its born_at is its written_at."

/** A write over a live Thing that moves its born_at. */
export const BornAtNotStored = "A write over a live Thing keeps the stored Thing's born_at."

/** A tombstone of the main gate. */
export const MainGateDeleted = "The main gate is never deleted: its record is always live (am: 'a')."

/** A policy that needs testimony the citation lacks. */
export const TestimonyMissing = "The replace_passphrase policy reads the cited gate's wayins: cite them."

/** A write of a kind this vaultDB does not store yet. */
export const ThingkindNotStored = "This vaultDB stores the main gate only, for now: a bank or a box is not yet a Thing it takes."

/** The last resort of a vaultDB's error handler. */
export const AnswerNotMade = "The vaultDB could not make an answer for a failure: this is a bug in safebyok."
// --
