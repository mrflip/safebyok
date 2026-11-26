/** The tags a datastore makes of each verb, its `banktok` and its `tracked`, each from raw rows: a datastore's contract with `AdapterVaultDB` (`notes/vault-adapter-contract.md`).
 * A datastore that runs TypeScript in its step makes its manifest's tags with these, over the rows it read; one that cannot
 * (Postgres) makes the same comparisons in its own language. Each reads raw fields, and never throws on a row that is no object.
 */

import { CX, type EX, SX } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import type { AnyAsk, BirthPuts, Track, WriteAsk } from '../shapes/shapes-asks'
import type { AnteWayins, BirthTags, GetTags, PolicyVerdict, PolicyVerdicts, Presence, RevseqCmp, RevtokCmp, RootRows, RootTags, SameCmp, TrackedRows, WriteTags } from '../shapes/shapes-manifest'
import { GatePolicies } from './policies'

// == [Fields]: fieldOf, banktokOf
// A row in a datastore is our code's, or a test's plant: read it field by field, and judge none of it here.

/** The field `fieldname` of the raw `row`: undefined where the row has none, or is no object. */
export function fieldOf(row: unknown, fieldname: string): unknown { return CX.isPlainBag(row) ? row[fieldname] : undefined }

// Null, never undefined, for a bank row without a lifetok: a transport that drops undefined (Convex's, JSON) would drop the key with it.
/** The lifetok of the raw bank row `bank`: the void lifetok where there is no bank row, null where the row has no lifetok. */
export function banktokOf(bank: unknown): unknown { return (bank === null) ? SX.VoidLifeTok : (fieldOf(bank, 'lifetok') ?? null) }
// --

// == [Tags]: presenceOf, getTagsOf, writeTagsOf, writtenTagsOf, birthTagsOf, rootTagsOf, revtokCmpOf, revseqCmpOf, bornAtCmpOf, lifetokCmpOf, policiesOf, policyVerdictOf, anteWayinsOf

/** The liveness of the raw `row`: `'void'` for null, `'live'` where its `am` is `'a'`, else `'gone'`. */
export function presenceOf(row: unknown): Presence {
  if (row === null) { return 'void' }
  return (fieldOf(row, 'am') === 'a') ? 'live' : 'gone'
}

/** The tags of a get whose actual row is the raw `actual`, null for none. */
export function getTagsOf(actual: unknown): GetTags { return { presence: presenceOf(actual) } }

/** The tags of a write `ask` judged against the raw `ante` row, null for none, beside whether the datastore wrote. */
export function writeTagsOf(ask: WriteAsk, ante: unknown, written: boolean): WriteTags {
  return {
    presence:    presenceOf(ante),
    revtok_cmp:  revtokCmpOf(ask, ante),
    revseq_cmp:  revseqCmpOf(ask, ante),
    lifepath_eq: (ante === null) || (fieldOf(ante, 'lifepath') === ask.cited.lifepath),
    born_at_cmp: bornAtCmpOf(ask, ante),
    lifetok_cmp: lifetokCmpOf(ask, ante),
    policies:    policiesOf(ask, ante),
    written,
  }
}

// The write predicate pins the ante row's revtok, revseq, lifepath and liveness to the cited ones, or citing the shell finds no
// row; holds its born_at and lifetok to the record's; and meets each storage policy. So the ask alone makes the tags.
/** The tags of a write `ask` that the datastore wrote: those {@link writeTagsOf} makes of the ante row its write predicate let through. */
export function writtenTagsOf(ask: WriteAsk): WriteTags {
  const isLive = (ask.cited.am === 'a')
  const fixed  = {
    lifepath_eq: true,
    born_at_cmp: (isLive && (ask.record.am === 'a')) ? 'same' : 'moot',
    lifetok_cmp: (isLive && (ask.modelkind === 'bank')) ? 'same' : 'moot',
    policies:    Object.fromEntries((ask.options?.policies ?? []).map((policy) => [policy, { ok: true }])),
    written:     true,
  } as const
  if (ask.cited.revseq === SX.VoidRevisionSeq) { return { presence: 'void', revtok_cmp: 'birth', revseq_cmp: 'birth', ...fixed } }
  return { presence: isLive ? 'live' : 'gone', revtok_cmp: 'eq', revseq_cmp: 'eq', ...fixed }
}

/** The tags of a birth by its three `puts`, each root's judged against its raw `ante` root, null for none, beside whether the datastore wrote. */
export function birthTagsOf([bankPut, gatePut, rootPut]: BirthPuts, ante: RootRows, written: boolean): BirthTags {
  return { bank: rootTagsOf(bankPut, ante.bank), gate: rootTagsOf(gatePut, ante.gate), root: rootTagsOf(rootPut, ante.root), written }
}

// A birth's put cites the shell, so of the write tags its put table reads, only these two vary.
/** The tags of one root's `put` over its raw `ante` root, null for none. */
function rootTagsOf(put: WriteAsk, ante: unknown): RootTags { return { presence: presenceOf(ante), revtok_cmp: revtokCmpOf(put, ante) } }

/** The ante row's revtok against the ask's: see {@link RevtokCmp}. */
function revtokCmpOf({ cited, record }: WriteAsk, ante: unknown): RevtokCmp {
  if (ante === null)                             { return (cited.revtok === SX.VoidRevisionTok) ? 'birth' : 'neq' }
  if (fieldOf(ante, 'revtok') === record.revtok) { return '=next' }
  return (fieldOf(ante, 'revtok') === cited.revtok) ? 'eq' : 'neq'
}

// No cited revision is behind a row that has no revseq, or one that is no number.
/** The ask's cited revseq against the ante row's: see {@link RevseqCmp}. */
function revseqCmpOf({ cited }: WriteAsk, ante: unknown): RevseqCmp {
  if (cited.revseq === SX.VoidRevisionSeq) { return 'birth' }
  const anteRevseq = fieldOf(ante, 'revseq')
  if (cited.revseq === anteRevseq)         { return 'eq' }
  return ((typeof anteRevseq === 'number') && (cited.revseq < anteRevseq)) ? 'stale' : 'ahead'
}

/** Whether a live record leaves a live ante row's born_at the same, `'moot'` for any other write. */
function bornAtCmpOf({ record }: WriteAsk, ante: unknown): SameCmp {
  if ((record.am !== 'a') || (presenceOf(ante) !== 'live')) { return 'moot' }
  return (fieldOf(ante, 'born_at') === record.born_at) ? 'same' : 'changed'
}

/** Whether a write of the bank leaves a live ante bank's lifetok the same, `'moot'` for any other write. A write over a tombstone or none is a birth, and may carry any lifetok. */
function lifetokCmpOf(ask: WriteAsk, ante: unknown): SameCmp {
  if ((ask.modelkind !== 'bank') || (presenceOf(ante) !== 'live')) { return 'moot' }
  return (fieldOf(ante, 'lifetok') === ask.record.lifetok) ? 'same' : 'changed'
}

/** A verdict for each storage policy `ask` names, over the raw `ante` row. */
export function policiesOf(ask: WriteAsk, ante: unknown): PolicyVerdicts {
  const verdicts: Partial<Record<EX.StoragePolicy, PolicyVerdict>> = {}
  const named = ask.options?.policies ?? []
  for (const policy of named) { verdicts[policy] = policyVerdictOf(policy, ask, ante) }
  return verdicts
}

// Only a gate's ask names a storage policy (`AskChecks.writeAsk`): the modelkind narrows the ask's type.
/** The verdict of `policy` on `ask` over the raw `ante` row: met wherever that is no live gate, since a policy judges only a live gate's replacement. */
function policyVerdictOf(policy: EX.StoragePolicy, ask: WriteAsk, ante: unknown): PolicyVerdict {
  if ((ask.modelkind !== 'gate') || (presenceOf(ante) !== 'live')) { return { ok: true } }
  const message = GatePolicies[policy](ask, anteWayinsOf(ante))
  return (message === null) ? { ok: true } : { ok: false, message }
}

// A gate whose wayins are no object is judged as if it had no wayins: each policy then refuses.
/** The wayins of the raw `ante` gate, each field unchecked. */
function anteWayinsOf(ante: unknown): AnteWayins {
  const wayins = fieldOf(ante, 'wayins')
  return CX.isPlainBag(wayins) ? wayins : {}
}
// --

// == [Tracked]: trackedOf, trackedRowOf
// A datastore compares what an ask tracks with the bank, main gate and root box it read, in the step that read them.

/** A manifest's `tracked`: for each root `ask` tracks, `'same'` where its raw row has the revseq and lifepath tracked, else the raw row. */
export function trackedOf({ track }: AnyAsk, rows: TrackedRows): TrackedRows {
  return {
    bank:                 trackedRowOf(track.bank, rows.bank),
    [Labelpath.MainGate]: trackedRowOf(track[Labelpath.MainGate], rows[Labelpath.MainGate]),
    [Labelpath.RootBox]:  trackedRowOf(track[Labelpath.RootBox], rows[Labelpath.RootBox]),
  }
}

/** `'same'` where `row` has the revseq and lifepath of `pair`, else `row`. */
function trackedRowOf(pair: Track['bank'], row: unknown): unknown {
  return ((fieldOf(row, 'revseq') === pair.revseq) && (fieldOf(row, 'lifepath') === pair.lifepath)) ? 'same' : row
}
// --
