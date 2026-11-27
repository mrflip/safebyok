// Throwaway sketch, decomposition B: the revision grid of answer-contract.md *Revisions*, then the act by op × presence × flag,
// then the policied check. Every table is exact-keyed: no wildcards, no row order.
import type { Errors } from 'safebyok-big/internals'
import { EX } from 'safebyok-big/internals'
import type { GetAsk, WriteAsk } from './tree/packages/safebyok/src/shapes/shapes-asks'
import type { GetTags, WriteTags } from './tree/packages/safebyok/src/shapes/shapes-manifest'
import type { ThingRecord } from './tree/packages/safebyok/src/shapes/shapes-thing'
import * as Throwers from './tree/packages/safebyok/src/refusals/throwers'

// == The revision grid: revtok_cmp × revseq_cmp. `match` lets the flags decide; `stale` lets a few flags pass it.

type Verdict = 'match' | 'stale' | 'retcon' | 'clash' | 'forked' | 'ahead'

export const RevisionGrid = {
  //        birth     eq        stale     ahead
  'birth': { birth: 'match',  eq: 'match',  stale: 'match',  ahead: 'ahead' },
  '=next': { birth: 'retcon', eq: 'retcon', stale: 'retcon', ahead: 'retcon' },
  'eq':    { birth: 'clash',  eq: 'match',  stale: 'clash',  ahead: 'ahead' },
  'neq':   { birth: 'stale',  eq: 'forked', stale: 'stale',  ahead: 'ahead' },
} as const satisfies Record<WriteTags['revtok_cmp'], Record<WriteTags['revseq_cmp'], Verdict>>

// == The act where the revisions match, and where they are stale, by op, presence and the flag that applies.

type Act = EX.PutAct | EX.DelAct | EX.RefusedAct

export const MatchActs = {
  put: { void: { add: 'born',   fail: 'void' },  gone: { add: 'reborn', fail: 'gone' }, live: { repl: 'replaced', get: 'passed', fail: 'camped' } },
  del: { void: { fail: 'void' },                 gone: { fail: 'dubdel' },              live: { repl: 'deleted' } },
} as const

export const StaleActs = {
  put: { void: { add: 'stale',  fail: 'stale' }, gone: { add: 'stale',  fail: 'stale' }, live: { repl: 'stale', get: 'passed', fail: 'stale' } },
  del: { void: { fail: 'stale' },                gone: { fail: 'gone' },                 live: { repl: 'stale' } },
} as const

// == The policied check: a write refused for a fixed field or a storage policy, the first that applies.

type Refuse = (actual: ThingRecord | null, why: string, meta: Errors.RefusalMeta) => Errors.VaultError

export const PoliciedRefusals: Readonly<Record<'born_at' | 'policy' | 'lifetok', Refuse>> = {
  born_at: (actual, _why, meta) => Throwers.bornAtNotStored(actual, meta),
  policy:  (actual, why, meta)  => Throwers.gateIssue(actual, why, meta),
  lifetok: (actual, _why, meta) => Throwers.lifetokNotStored(actual, meta),
}

// == The get: presence × ifAbsent.

export const GetActs = {
  void: { nil: 'gotvoid', fail: 'void' },
  gone: { nil: 'gotgone', fail: 'gone' },
  live: { nil: 'gotlive', fail: 'gotlive' },
} as const satisfies Record<GetTags['presence'], Record<EX.IfAbsent, string>>

export function getActOf({ ifAbsent }: Pick<GetAsk, 'ifAbsent'>, { presence }: GetTags): string { return GetActs[presence][ifAbsent] }

// == The lookup

/** The act the put or del tables find, before the policied check. */
export function tableActOf(ask: WriteAsk, tags: WriteTags): Act {
  const isLifeSame = tags.lifepath_eq && ((tags.presence === 'live') === (ask.cited.am === 'a'))
  const graded     = RevisionGrid[tags.revtok_cmp][tags.revseq_cmp]
  const verdict    = ((graded === 'match') && (tags.revtok_cmp === 'eq') && (! isLifeSame)) ? 'clash' : graded
  const flag       = (tags.presence === 'live') ? ask.ifPresent : ask.ifAbsent
  if (verdict === 'match') { return (MatchActs[ask.op][tags.presence] as Record<string, Act>)[flag] }
  if (verdict === 'stale') { return (StaleActs[ask.op][tags.presence] as Record<string, Act>)[flag] }
  return verdict
}

/** Why the first storage policy `ask` names refuses it, or null. (As in manifest-acts.ts.) */
export function policyFailureOf({ options }: WriteAsk, { policies }: WriteTags): string | null {
  for (const policy of options?.policies ?? []) {
    const verdict = policies[policy]
    if (verdict?.ok === false) { return verdict.message }
  }
  return null
}

/** The first fixed field or storage policy the write breaks, or null. */
export function brokenOf(ask: WriteAsk, tags: WriteTags): keyof typeof PoliciedRefusals | null {
  if (tags.born_at_cmp === 'changed')      { return 'born_at' }
  if (policyFailureOf(ask, tags) !== null) { return 'policy' }
  return (tags.lifetok_cmp === 'changed') ? 'lifetok' : null
}

/** The act scribed onto a write's manifest. */
export function writeActOf(ask: WriteAsk, tags: WriteTags): Act | 'policied' {
  const act = tableActOf(ask, tags)
  return ((EX.writeActVals as readonly string[]).includes(act) && (brokenOf(ask, tags) !== null)) ? 'policied' : act
}
