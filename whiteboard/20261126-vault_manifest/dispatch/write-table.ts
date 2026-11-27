// Throwaway sketch: the put and del tables of notes/answer-contract.md as a dispatch table, first match wins.
// Imports from the worktree at f82c00e20.
import type { Errors } from 'safebyok-big/internals'
import { EX } from 'safebyok-big/internals'
import type { WriteAsk } from './tree/packages/safebyok/src/shapes/shapes-asks'
import type { WriteTags } from './tree/packages/safebyok/src/shapes/shapes-manifest'
import type { ThingRecord } from './tree/packages/safebyok/src/shapes/shapes-thing'
import * as Throwers from './tree/packages/safebyok/src/refusals/throwers'

// == The key

type Op       = 'put' | 'del'
type Presence = WriteTags['presence']
type Tok      = WriteTags['revtok_cmp']
type Seq      = WriteTags['revseq_cmp']
type Life     = 'same' | 'diff'                                  // the cited lifepath and liveness against the ante row's
type Flag     = 'add' | 'fail' | 'repl' | 'get'                  // the flag that applies: ifPresent over a live row, else ifAbsent
type Fixed    = 'kept' | 'born_at' | 'policy' | 'lifetok'        // the first fixed field or storage policy the write breaks

export type WriteKey = readonly [op: Op, presence: Presence, tok: Tok, seq: Seq, life: Life, flag: Flag, fixed: Fixed]

/** A cell: one value, any of several, or `'*'` for any. */
type Cell<T extends string> = T | readonly T[] | '*'

type Pattern = readonly [Cell<Op>, Cell<Presence>, Cell<Tok>, Cell<Seq>, Cell<Life>, Cell<Flag>, Cell<Fixed>]

/** How a refused write's error is made. */
type Refuse = (ask: WriteAsk, actual: ThingRecord | null, why: string | null, meta: Errors.RefusalMeta) => Errors.VaultError

export type WriteRow = readonly [abbr: string, pattern: Pattern, act: EX.PutAct | EX.DelAct | EX.RefusedAct | 'policied', refuse: Refuse | null]

const actRefused: Refuse = (_ask, _actual, _why, meta) => Throwers.actRefused('vault', meta.act as string, meta)
const bornAt:     Refuse = (_ask, actual, _why, meta) => Throwers.bornAtNotStored(actual, meta)
const policy:     Refuse = (_ask, actual, why, meta) => Throwers.gateIssue(actual, why as string, meta)
const lifetok:    Refuse = (_ask, actual, _why, meta) => Throwers.lifetokNotStored(actual, meta)

const NotEq   = ['birth', 'stale'] as const
const Absent  = ['void', 'gone'] as const

// == The table: first match wins. Columns: op, presence, revtok_cmp, revseq_cmp, life, flag, fixed.

export const WriteTable: readonly WriteRow[] = [
  // Refused by the revisions alone, whatever the op, the flags or the fixed fields.
  ['PG1/PL1/DG1/DL1', ['*',   '*',    '=next', '*',     '*',    '*',    '*'      ], 'retcon',   actRefused],
  ['PV3/PG7/PG8/…',   ['*',   '*',    '*',     'ahead', '*',    '*',    '*'      ], 'ahead',    actRefused],
  ['PG5/PL7/DG5/DL5', ['*',   '*',    'eq',    NotEq,   '*',    '*',    '*'      ], 'clash',    actRefused],
  ['clash (life)',    ['*',   '*',    'eq',    'eq',    'diff', '*',    '*'      ], 'clash',    actRefused],
  ['PG6/PL8/DG6/DL6', ['*',   '*',    'neq',   'eq',    '*',    '*',    '*'      ], 'forked',   actRefused],
  ['PL3/PL6',         ['put', 'live', 'neq',   '*',     '*',    'get',  '*'      ], 'passed',   null],
  ['DG3/DG4',         ['del', 'gone', 'neq',   '*',     '*',    '*',    '*'      ], 'gone',     actRefused],
  ['PG3/PG4/PL4/PL5/DL3/DL4', ['*', '*', 'neq', '*',    '*',    '*',    '*'      ], 'stale',    actRefused],

  // A write the revisions and flags let through, refused for a fixed field or a storage policy.
  ['policied: born_at', ['put', Absent, '*',   '*',     '*',    'add',  'born_at'], 'policied', bornAt],
  ['policied: policy',  ['put', Absent, '*',   '*',     '*',    'add',  'policy' ], 'policied', policy],
  ['policied: lifetok', ['put', Absent, '*',   '*',     '*',    'add',  'lifetok'], 'policied', lifetok],
  ['policied: born_at', ['*',   'live', '*',   '*',     '*',    'repl', 'born_at'], 'policied', bornAt],
  ['policied: policy',  ['*',   'live', '*',   '*',     '*',    'repl', 'policy' ], 'policied', policy],
  ['policied: lifetok', ['*',   'live', '*',   '*',     '*',    'repl', 'lifetok'], 'policied', lifetok],

  // put: the flag that applies decides.
  ['PV1',  ['put', 'void', '*',     '*',     '*',    'add',  '*'      ], 'born',     null],
  ['PV2',  ['put', 'void', '*',     '*',     '*',    '*',    '*'      ], 'void',     actRefused],
  ['PG9',  ['put', 'gone', '*',     '*',     '*',    'add',  '*'      ], 'reborn',   null],
  ['PG10', ['put', 'gone', '*',     '*',     '*',    '*',    '*'      ], 'gone',     actRefused],
  ['PL11', ['put', 'live', '*',     '*',     '*',    'repl', '*'      ], 'replaced', null],
  ['PL12', ['put', 'live', '*',     '*',     '*',    'get',  '*'      ], 'passed',   null],
  ['PL13', ['put', 'live', '*',     '*',     '*',    'fail', '*'      ], 'camped',   actRefused],

  // del: no flags.
  ['DV1',  ['del', 'void', '*',     '*',     '*',    '*',    '*'      ], 'void',     actRefused],
  ['DG9',  ['del', 'gone', '*',     '*',     '*',    '*',    '*'      ], 'dubdel',   actRefused],
  ['DL9',  ['del', 'live', '*',     '*',     '*',    '*',    '*'      ], 'deleted',  null],
]

// == The lookup

function isCellMatch<T extends string>(cell: Cell<T>, val: T): boolean {
  return (cell === '*') || (cell === val) || (Array.isArray(cell) && cell.includes(val))
}

/** The first row of {@link WriteTable} whose every cell matches `key`. */
export function writeRowOf(key: WriteKey): WriteRow {
  const row = WriteTable.find(([, pattern]) => pattern.every((cell, ii) => isCellMatch(cell as Cell<string>, key[ii] as string)))
  if (row === undefined) { throw new Error(`no row for ${key.join(' ')}`) } // the table is total: unreachable
  return row
}

/** Why the first storage policy `ask` names refuses it, or null. (Kept as is from manifest-acts.ts.) */
export function policyFailureOf({ options }: WriteAsk, { policies }: WriteTags): string | null {
  for (const policy of options?.policies ?? []) {
    const verdict = policies[policy]
    if (verdict?.ok === false) { return verdict.message }
  }
  return null
}

/** The first fixed field or storage policy the write breaks, in policiedRefusalOf's order. */
function fixedOf(ask: WriteAsk, tags: WriteTags): Fixed {
  if (tags.born_at_cmp === 'changed')        { return 'born_at' }
  if (policyFailureOf(ask, tags) !== null)   { return 'policy' }
  return (tags.lifetok_cmp === 'changed') ? 'lifetok' : 'kept'
}

/** The key a write's ask and tags look up. */
export function writeKeyOf(ask: WriteAsk, tags: WriteTags): WriteKey {
  const isLifeSame = tags.lifepath_eq && ((tags.presence === 'live') === (ask.cited.am === 'a'))
  return [
    ask.op as Op, tags.presence, tags.revtok_cmp, tags.revseq_cmp,
    isLifeSame ? 'same' : 'diff',
    ((tags.presence === 'live') ? ask.ifPresent : ask.ifAbsent) as Flag,
    fixedOf(ask, tags),
  ]
}

export const isGoodAct  = (act: string): boolean => (EX.goodActVals as readonly string[]).includes(act)
export const isWriteAct = (act: string): boolean => (EX.writeActVals as readonly string[]).includes(act)
