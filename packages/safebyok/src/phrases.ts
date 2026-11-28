// The messages of the refusals this package makes itself. The rest are `safebyok-big`'s, through its Throwers.

import { Phrases as BigPhrases } from 'safebyok-big/internals'

// == [Models]: VaultDBExpected, DeviceDBExpected, VaultMinderExpected, SealerExpected, TombstoneSecretsGiven, BoxOfOtherRoot, VaultBoxIsRoot, SigninUnanswered, RootOfOtherKind, NeedUser, ThingNotLive, UnlockDismissed, GatingSpent, HostedVaultExpected, RootShelfExpected, ThingSoonestBare, BankExpected, ThingExpected, BegunOfOtherKind, WayinExpected, WayinKeyExpected, WayinOfOtherHeader

/** A vaultDB that lacks one of its verbs or watch. */
export const VaultDBExpected = 'Expected a VaultDB: an object with a function for each of its verbs and watch.'

/** A deviceDB that lacks one of its verbs. */
export const DeviceDBExpected = 'Expected a DeviceDB: an object with a function for each of peekLease, stowLease, listen and ensureDevicetok.'

/** A VaultMinder, given to make a vault TSQ, that lacks one of its members. */
export const VaultMinderExpected = 'Expected a VaultMinder: an object with a function for each of its verbs, listen, receive, thingAt, connect and disconnect.'

/** A sealer that lacks one of its methods, its tags or its purposes. */
export const SealerExpected = 'Expected a sealer: its tags, its purposes, and a function for each of its methods.'

/** A tombstone's seal given secret props. */
export const TombstoneSecretsGiven = "A tombstone seals no secrets: give `{ am: 'x' }` with no secret props."

/** A box whose lifepath is not under the bank's root box. */
export const BoxOfOtherRoot = "A box's lifepath starts with the lifeseq of its bank's root box: this one is of another life of the root."

/** A vault's box entry point given the root box's labelpath. */
export const VaultBoxIsRoot = "A vault's boxes are under its bank's root box: give a labelpath such as 'box/openai', never 'box' itself."

/** A birth on a device whose `signin` has not answered. */
export const SigninUnanswered = "This device's sign-in has not answered yet: call `signin`, and birth the bank once the stage shows `'unborn'`."

/** A bank's VaultMinder has, at its gate or its root box, a Thing of the other kind. */
export const RootOfOtherKind = "A bank's gate is a Gate and its root box a Box: its VaultMinder has a Thing of another kind there."

/** A call that needs a user, on a device nobody is signed in to. */
export const NeedUser = "Nobody is signed in on this device: call `signin` with the user's id first."

/** A call that needs a live bank or gate, on one not born yet or deleted. */
export const ThingNotLive = "This bank or gate is not stored live: it is not born yet, or was deleted. Wait for the stage to show 'locked' or 'unlocked'."

/** A call that waited for an `unlock` gating, when the wait was dismissed. */
export const UnlockDismissed = 'The unlock was dismissed, so the bank stayed locked and the call waiting on it was not made: try again when you want it.'

/** A gating attempted a second time. */
export const GatingSpent = 'This gating was attempted already, and a gating is attempted once: make another for the next try.'

/** Something a bank is asked to host that lacks connect or disconnect. */
export const HostedVaultExpected = 'Expected a vault: an object with connect and disconnect functions.'

/** A root shelf handed to `Device.make` that lacks the three methods of Web Storage it is called through. */
export const RootShelfExpected = 'Expected a root shelf, such as localStorage: an object with getItem, setItem and removeItem functions.'

/** A box the device has heard a newer revision of, with no whole record of its newest life to unseal. */
export const ThingSoonestBare = 'This device has heard of a newer revision of this record but has not fetched it yet.'

/** A Thing or a car given something that is not a device's bank. */
export const BankExpected = "Expected a device's bank: an object with a function for each of its verbs."

/** A car made from something that is neither a Thing, the shell, nor an item event. */
export const ThingExpected = 'Expected a Thing, the shell at its labelpath, or an item event of its record.'

/** A Thing made from the shell or an item event of another modelkind. */
export const BegunOfOtherKind = "A Thing is made from the shell or an item event of its own modelkind."

/** A proving given, as the wayin it proves, something that is not a Wayin. */
export const WayinExpected = 'Expected a Wayin, or null for a new wayin.'

/** A proving given, as its wayinKey, something that is not one. */
export const WayinKeyExpected = 'Expected a wayinKey: a non-extractable 256-bit AES-GCM CryptoKey for wrapKey and unwrapKey.'

/** A proving given a stored wayin whose header is not the proving's own. */
export const WayinOfOtherHeader = "A proving's stored wayin has the proving's header."
// --

// == [Things]: the sentences of a Thing's checks, of a shell's, and of a vaultDB's asks

/** A labelpath that is neither a gate's nor a box's. */
export const LabelpathShape = "A labelpath is a gate's, its bank's banklabel alone, or a box's: 'box', or 'box' then one label after a '/'."

/** A gate stored at a labelpath other than its bank's banklabel. */
export const GateNotAtBanklabel = "A bank's gate is stored at the bank's banklabel: its labelpath is the banklabel alone."

/** A Thing, an ask or a shell whose labelpath breaks the labelpath rule of its modelkind. */
export const LabelpathOfOtherKind = "A Thing's labelpath follows its modelkind's rule: a gate's is its bank's banklabel, and a box's is 'box', or 'box' then one label after a '/'."

/** A lifeseq that is not 10 base-32 digits. */
export const LifeseqShape = "A lifeseq is 10 base-32 digits, 0-9 and a-v."

/** A revtok not of a UUID's shape. */
export const RevtokShape = "A revtok is a UUID: hex digits in groups of 8, 4, 4, 4 and 12, joined by '-'."

/** A banktok not of a UUID's shape. */
export const BanktokShape = "A banktok is a UUID: hex digits in groups of 8, 4, 4, 4 and 12, joined by '-'."

/** An ask other than a get whose banktok is the void banktok. */
export const BanktokVoid = "Only a get may carry the void banktok: a list, a write or a birth carries its bank's banktok."

/** A lifepath that is not lifeseqs, each after a '/'. */
export const LifepathShape = "A lifepath is one or more lifeseqs, joined by '/'."

/** A Thing whose label is not its labelpath's last. */
export const LabelNotLast = "A Thing's label is the last segment of its labelpath: a gate's is its banklabel, and the root box's is `box`."

/** A Thing whose lifeseq is not its lifepath's last. */
export const LifeseqNotOwn = "A Thing's lifeseq is the last of its lifepath."

/** A Thing whose lifepath and labelpath have different depths. */
export const LifepathDepth = "A Thing's lifepath has one lifeseq for each segment of its labelpath."

/** A Thing whose am and lifeseq disagree. */
export const LifeseqParity = "A Thing's lifeseq is odd exactly when it is a tombstone (am: 'x')."

/** A lease record whose lifepath is not `0000000000/` and its own lifeseq. */
export const LeaseLifepathOwn = "A lease record's lifepath is `0000000000/` and its own lifeseq: no life is above a lease's own."

/** A lease record whose labelpath is not `lease/` and one label. */
export const LeaseLabelpathShape = "A lease's labelpath is `lease/` and its label, such as `lease/main`."

/** A tombstone of a lease asked of a lease that is not live. */
export const LeaseTombstoneOfLiveOnly = "Only a live lease has a tombstone: a tombstone or the shell has none."

/** A live lease record whose labelpath is not the one its gate's labelpath gives it. */
export const LeaseLabelpathOfOtherGate = "A live lease's labelpath is `lease/` and the label of the gate in its gate_labelpath."

/** A read_tc that is not a UUID version 7. */
export const ReadTcShape = "A read_tc is a UUID version 7, in lowercase hex."

/** A box tombstone whose sidecar is not empty. */
export const TombstoneSidecarNotEmpty = "A box tombstone's sidecar is always `{}`."

/** A void event whose val is not the void sentinel. */
export const VoidSentinelExpected = "A void event's val is the void sentinel: a tombstone at revseq -1, with the void revtok and lifeseq."

/** An event whose modelkind is not its record's. */
export const EventModelkind = "An event's modelkind is its record's."

/** An event whose val is at another scope than the event. */
export const EventOfOtherThing = "An event's val is at the event's own scope: its userid, banklabel and labelpath."

/** An event whose liveness is not its val's. */
export const EventLiveness = "An event's liveness is its val's: soon for a live box's sparse form, full for a whole live record, gone for a tombstone, void for the void sentinel."
/** A record seen in no form a Thing receives. */
export const SeenFormUnknown = "A record seen is whole, the void sentinel, or a live box's sparse form: a tombstone and a gate are never sparse."

/** An event that is not void, whose val is not a Thing's fields, or is the void sentinel. */
export const ThingFieldsExpected = "An event that is not void has a Thing's fields as its val, whole or a live box's sparse form, never the void sentinel."

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
export const LeadingLifeseqsMoved = "A write's record leaves the leading lifeseqs of the lifepath it cites unchanged: only the last, its own, may change."

/** A write whose lifeseq does not follow. */
export const LifeseqNotNext = "A write's record has the cited lifeseq when am stays, and the next one when am flips."

/** A birth whose born_at is not its written_at. */
export const BornAtNotNow = "A write over a tombstone or none is a birth: its born_at is its written_at."

/** A write over a live Thing that changes its born_at. */
export const BornAtMoved = "A write over a live Thing leaves its born_at unchanged."

/** A write of a gate over a live gate that changes its banktok. */
export const BanktokMoved = "A write of a gate over a live gate leaves its banktok unchanged."

/** A policy that needs testimony the citation lacks. */
export const TestimonyMissing = "The replace_passphrase policy reads the cited gate's wayins: cite them."

/** A write whose op does not match its record. */
export const OpNotOfRecord = "A put writes a live record (am: 'a'), and a del a tombstone (am: 'x')."

/** A del that changes its fixed flags. */
export const DelFlagsFixed = "A del's flags are fixed, ifAbsent 'fail' and ifPresent 'repl', and it names no storage policy."

/** A write naming a storage policy its kind lacks. */
export const PolicyNotOwn = "Only a gate's writes name storage policies: a box has none."

/** A bank's roots stored broken: a live gate without a live root box, a live root box without a live gate, or an incompatible gate. */
export const BankRootsMissing = "A bank's roots are stored broken: a live gate without a live root box, a live root box without a live gate, or an incompatible gate. The datastore needs mending by hand."

/** A list whose parent is a tombstone or nothing. */
export const ListParentNotLive = "The Thing listed is not stored live: it was never stored, or was deleted, and has no children."
/** The last resort of a vaultDB's error handler. */
export const AnswerNotMade = "The vaultDB could not make an answer for a failure: this is a bug in safebyok."
// --

// == [Minding]: QueryClientExpected, VaultTSQExpected, ListOfBoxes, NotMinded, RootBoxNotHeard, StaleTimeShape, ChildrenIncompatible

/** A VaultTSQ made without a TanStack Query client. */
export const QueryClientExpected = 'Expected a TanStack Query QueryClient: an object with setQueryDefaults, getQueryData, setQueryData, query, invalidateQueries and resetQueries.'

/** A VaultTSQ, given to make a vault, that lacks one of its members. */
export const VaultTSQExpected = 'Expected a VaultTSQ: an object with a function for each of its verbs, itemQueryOptions, getOnce, listOnce, connect and disconnect.'

/** A listing asked of a VaultTSQ for a Thing other than a box. */
export const ListOfBoxes = "A VaultTSQ lists only a box's children: the root box's, or a box's under it."

/** A box's item asked of a vault TSQ for a Thing other than a box under the root box. */
export const NotMinded = "A vault TSQ keeps an item only for a box under the root box: not for the bank's gate or its root box."

/** `bank.rootBox` read while no live root box is known. */
export const RootBoxNotHeard = "This bank's root box is not known live on this device: bring the device up, or birth the bank, first."

/** A staleTime that is not Infinity or a whole number of milliseconds up to MaxTimerMillis. */
export const StaleTimeShape = 'A staleTime is Infinity, or a whole number of milliseconds from 0 to 2116800000 (24.5 days): a longer timer fires at once, so give Infinity instead.'

/** Children a list found incompatible, and left out of its answer. */
export const ChildrenIncompatible = "Some of the Things this list found are incompatible, so it left them out: the refusal's meta.labelpaths names each one. They were left as they are in storage."
// --

// == [Telling the host]: LeaseAnnounced, StageCrossed, WatchEnded

/** The default `onLifecycle`'s line for a change of a device's lease, by the announcement's `kind`. */
export function LeaseAnnounced(kind: string): string { return `The device's lease changed: ${kind}.` }

/** The default `onLifecycle`'s line for the bank's stage changing. */
export function StageCrossed(from: string, to: string): string { return `The bank's stage went from '${from}' to '${to}'.` }

/** The default `onLifecycle`'s line for the device's watch of its bank ending before anything stopped it. */
export const WatchEnded = "The device's watch of its bank ended; it starts again at the janitor's next tick."
// --

// == [Probing]: probeStepRefused, ProbePutNotGot

/** A step of `Vault.probe` refused, its own refusal as the cause. */
export function probeStepRefused(stepkind: string): string {
  return `The probe of storage and keys was refused at its ${stepkind} step: the refusal's meta.stepkind names the step, and its cause says why.`
}

/** Storage answered the probe's get without the revision its put wrote. */
export const ProbePutNotGot = "Storage answered the probe's get without the revision its put had just written: storage lost the write, or answered from a replica or cache that lags behind it."
// --

// == [Storage]: DatastoreQuotaTooSmall, storageCallRefused, WrittenOfOtherAct, ProposedNotWritten, TagsOfOtherRow, TagsOfOtherAsk, BanktokMissing, AnswerOfOtherManifest

/** An IndexedDB database opened where the browser offers the page `quota` bytes, fewer than the `least` a vault needs. */
export function DatastoreQuotaTooSmall(quota: number, least: number): string {
  return `This browser offers the page ${String(quota)} bytes of storage, and a vault needs at least ${String(least)}.`
}

/** The vault's storage refused the call `oplabel`, and would refuse it again. */
export function storageCallRefused(oplabel: string): string {
  return `The vault's storage refused ${oplabel}: trying again is unlikely to help. Its logs have the request, and this refusal's cause has what it answered.`
}

/** The datastore's write disagrees with the act its tags find. */
export const WrittenOfOtherAct = "The vault's storage wrote where its own comparisons find no write, or wrote nothing where they find one: the storage adapter needs mending."

/** The row the datastore wrote is not the record proposed. */
export const ProposedNotWritten = "The vault's storage reported writing a row without the revision, life or liveness of the record it was asked to write: the storage adapter needs mending."

/** The datastore's tags are not those of its row. */
export const TagsOfOtherRow = "The vault's storage reported comparisons that are not those of the row it handed back: the storage adapter needs mending."

/** The datastore's tags disagree with the ask. */
export const TagsOfOtherAsk = "The vault's storage reported comparisons that disagree with the write asked of it: the storage adapter needs mending."

/** The datastore's manifest has no banktok. */
export const BanktokMissing = "The vault's storage handed back no banktok, the token of the life of the bank it read: the storage adapter needs mending."

/** The vaultDB's answer is not its manifest's. */
export const AnswerOfOtherManifest = "The vaultDB made an answer that is not a copy of what its storage handed back: a bug in safebyok."
// --

// == [Storage policies]: PolicyPhrases, PhraseForRefusaltag

/** The message of each refusal a storage policy makes, by the tag a datastore's verdict names it with. */
export const PolicyPhrases = {
  ProvedWayinMoved:  BigPhrases.ProvedWayinMoved,
  OtherWayinMoved:   BigPhrases.OtherWayinMoved,
  PasskeyStored:     BigPhrases.PasskeyStored,
  PasskeyNotAdded:   BigPhrases.PasskeyNotAdded,
  NoPasskeyStored:   BigPhrases.NoPasskeyStored,
  PasskeyNotRevoked: BigPhrases.PasskeyNotRevoked,
} as const

/** The message a `policied` write is refused with, by the name of its phrase: a changed born_at's, a changed banktok's, or a storage policy's in {@link PolicyPhrases}. */
export const PhraseForRefusaltag = {
  BornAtMoved,
  BanktokMoved,
  ProvedWayinMoved:  BigPhrases.gateIssue(PolicyPhrases.ProvedWayinMoved),
  OtherWayinMoved:   BigPhrases.gateIssue(PolicyPhrases.OtherWayinMoved),
  PasskeyStored:     BigPhrases.gateIssue(PolicyPhrases.PasskeyStored),
  PasskeyNotAdded:   BigPhrases.gateIssue(PolicyPhrases.PasskeyNotAdded),
  NoPasskeyStored:   BigPhrases.gateIssue(PolicyPhrases.NoPasskeyStored),
  PasskeyNotRevoked: BigPhrases.gateIssue(PolicyPhrases.PasskeyNotRevoked),
} as const
// --
