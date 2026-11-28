/** The tags a datastore makes of each verb, its `banktok` and its `tracked`, each from raw rows: a datastore's contract with `AdapterVaultDB` (`notes/vault-adapter-contract.md`).
 * A datastore that runs TypeScript in its step makes its manifest's tags with these, over the rows it read; one that cannot
 * (Postgres) makes the same comparisons in its own language. Each reads raw fields, and never throws on a row that is no object.
 */

import { CX, type EX, SX } from 'safebyok-big/internals'
import type { AnyAsk, BirthPuts, Track, WriteAsk } from '../shapes/shapes-asks'
import type { AnteWayins, BirthTags, GetTags, PolicyVerdict, PolicyVerdicts, Presence, RevseqCmp, RevtokCmp, RootRows, RootTags, SameCmp, WriteTags } from '../shapes/shapes-manifest'
import { GatePolicies } from './policies'

// == [Fields]: fieldOf, banktokOf
// A row in a datastore is our code's, or a test's plant: read it field by field, and judge none of it here.

/** The field `fieldname` of the raw `row`: undefined where the row has none, or is no object. */
export function fieldOf(row: unknown, fieldname: string): unknown { return CX.isPlainBag(row) ? row[fieldname] : undefined }

// Null, never undefined, for a gate row without a banktok: a transport that drops undefined (Convex's, JSON) would drop the key with it.
/** The banktok of the bank's raw gate row `gate`: the void banktok where there is no gate row, null where the row has no banktok. */
export function banktokOf(gate: unknown): unknown { return (gate === null) ? SX.VoidLifeTok : (fieldOf(gate, 'banktok') ?? null) }
// --

// == [Tags]: presenceOf, getTagsOf, writeTagsOf, rootTagsOf, writtenTagsOf, birthTagsOf, writtenBirthTagsOf, revtokCmpOf, revseqCmpOf, bornAtCmpOf, banktokCmpOf, policiesOf, policyVerdictOf, anteWayinsOf

/** The liveness of the raw `row`: `'void'` for null, `'live'` where its `am` is `'a'`, else `'gone'`. */
export function presenceOf(row: unknown): Presence {
  if (row === null) { return 'void' }
  return (fieldOf(row, 'am') === 'a') ? 'live' : 'gone'
}

/** The tags of a get whose actual row is the raw `actual`, null for none. */
export function getTagsOf(actual: unknown): GetTags { return { presence: presenceOf(actual) } }

/** The tags of a write `ask` judged against the raw `ante` row, null for none, beside whether the datastore wrote. */
export function writeTagsOf(ask: WriteAsk, ante: unknown, isWritten: boolean): WriteTags { return { ...rootTagsOf(ask, ante), written: isWritten } }

/** The comparisons of a write `ask` against the raw `ante` row, null for none: its tags, but for whether it was written. A birth's root's tags are these. */
function rootTagsOf(ask: WriteAsk, ante: unknown): RootTags {
  return {
    presence:    presenceOf(ante),
    revtok_cmp:  revtokCmpOf(ask, ante),
    revseq_cmp:  revseqCmpOf(ask, ante),
    lifepath_eq: (ante === null) || (fieldOf(ante, 'lifepath') === ask.cited.lifepath),
    born_at_cmp: bornAtCmpOf(ask, ante),
    banktok_cmp: banktokCmpOf(ask, ante),
    policies:    policiesOf(ask, ante),
  }
}

// The write predicate pins the ante row's revtok, revseq, lifepath and liveness to the cited ones, or citing the shell finds no
// row; holds its born_at and banktok to the record's; and meets each storage policy. So the ask alone makes the tags.
/** The tags of a written write, made of its `ask` alone: those {@link writeTagsOf} makes of any ante row the write predicate lets through. */
export function writtenTagsOf(ask: WriteAsk): WriteTags {
  const isLive = (ask.cited.am === 'a')
  const fixed  = {
    lifepath_eq: true,
    born_at_cmp: (isLive && (ask.record.am === 'a')) ? 'same' : 'moot',
    banktok_cmp: (isLive && (ask.modelkind === 'gate')) ? 'same' : 'moot',
    policies:    Object.fromEntries((ask.options?.policies ?? []).map((policy) => [policy, { ok: true }])),
    written:     true,
  } as const
  if (ask.cited.revseq === SX.VoidRevisionSeq) { return { presence: 'void', revtok_cmp: 'birth', revseq_cmp: 'birth', ...fixed } }
  return { presence: isLive ? 'live' : 'gone', revtok_cmp: 'eq', revseq_cmp: 'eq', ...fixed }
}

/** The tags of a birth by its two `puts`, each root's judged against its raw `ante` root, null for none, as a write's are, beside whether the datastore wrote both. */
export function birthTagsOf([gatePut, rootPut]: BirthPuts, ante: RootRows, isWritten: boolean): BirthTags {
  return { gate: rootTagsOf(gatePut, ante.gate), root: rootTagsOf(rootPut, ante.root), written: isWritten }
}

// A birth writes both puts only where the write predicate holds of each, so each root's tags are its written put's.
/** The tags of a birth that wrote, made of its two `puts` alone: those {@link birthTagsOf} makes of any ante roots the birth predicate lets through. */
export function writtenBirthTagsOf([gatePut, rootPut]: BirthPuts): BirthTags {
  const { written: _gateWritten, ...gate } = writtenTagsOf(gatePut)
  const { written: _rootWritten, ...root } = writtenTagsOf(rootPut)
  return { gate, root, written: true }
}

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

/** Whether a write of a gate leaves a live ante gate's banktok the same, `'moot'` for any other write. A write over a tombstone or none is a birth, and may carry any banktok. */
function banktokCmpOf(ask: WriteAsk, ante: unknown): SameCmp {
  if ((ask.modelkind !== 'gate') || (presenceOf(ante) !== 'live')) { return 'moot' }
  return (fieldOf(ante, 'banktok') === ask.record.banktok) ? 'same' : 'changed'
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
  const refusaltag = GatePolicies[policy](ask, anteWayinsOf(ante))
  return (refusaltag === null) ? { ok: true } : { ok: false, refusaltag }
}

// A gate whose wayins are no object is judged as if it had no wayins: each policy then refuses.
/** The wayins of the raw `ante` gate, each field unchecked. */
function anteWayinsOf(ante: unknown): AnteWayins {
  const wayins = fieldOf(ante, 'wayins')
  return CX.isPlainBag(wayins) ? wayins : {}
}
// --

// == [Tracked]: trackedOf, trackedRowOf
// A datastore compares what an ask tracks with the gate and root box it read, in the step that read them.

/** A manifest's `tracked`: for each root `ask` tracks, `'same'` where its raw row has the revseq and lifepath tracked, else the raw row. */
export function trackedOf({ track }: AnyAsk, rows: RootRows): RootRows {
  return { gate: trackedRowOf(track.gate, rows.gate), root: trackedRowOf(track.root, rows.root) }
}

/** `'same'` where `row` has the revseq and lifepath of `pair`, else `row`. */
function trackedRowOf(pair: Track['gate'], row: unknown): unknown {
  return ((fieldOf(row, 'revseq') === pair.revseq) && (fieldOf(row, 'lifepath') === pair.lifepath)) ? 'same' : row
}
// --
