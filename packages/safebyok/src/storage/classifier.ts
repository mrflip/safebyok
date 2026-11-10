/** The classifier of the answer contract: the one act a get, put or del amounts to over the rows stored. Its tables are `notes/answer-contract.md`. */

import * as EX from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import type { Boxscope } from '../shapes/shapes-core'
import type { BoxAct, FoundAct, VaultAct, WriteAct } from '../shapes/shapes-enums'
import type { BoxRequest, BoxRow, Revision, VaultRequest, VaultRow } from '../shapes/shapes-storage'

/** What a comparison reads of a row, stored or expected: its revision, whether it is live, and its life tok. */
type Peek = Readonly<Revision & { am: EX.Am, lifeTok: string }>

/** How the row a write expects stands against the row stored; `proposed` is a stored row already at the revision the write would store. */
type Fit = 'match' | 'stale' | 'clash' | 'forked' | 'ahead' | 'proposed'

/** What a put or del brings to the comparison. */
type Write = Readonly<{ expected: Peek, proposed: Revision }>

const BoxActs = {
  void:   'box_void',   gone:   'box_gone',   camped: 'box_camped', dubdel: 'box_dubdel', stale: 'box_stale', reput: 'box_reput',
  redel:  'box_redel',  retcon: 'box_retcon', clash:  'box_clash',  forked: 'box_forked', ahead: 'box_ahead',
} as const

const VaultActs = {
  void:   'vault_void',  gone:   'vault_gone',   camped: 'vault_camped', dubdel: 'vault_dubdel', stale: 'vault_stale', reput: 'vault_reput',
  redel:  'vault_redel', retcon: 'vault_retcon', clash:  'vault_clash',  forked: 'vault_forked', ahead: 'vault_ahead',
} as const

/** A level's refused acts, by what each refuses over. */
type RefusedActs<RefusedT extends string> = Readonly<Record<keyof typeof BoxActs, RefusedT>>
type ActOver<RefusedT extends string> = WriteAct | FoundAct | RefusedT

const boxPeekOf   = ({ revision_tok, revision_seq, am, box_tok }:   Revision & { am: EX.Am, box_tok: string }):   Peek => ({ revision_tok, revision_seq, am, lifeTok: box_tok })
const vaultPeekOf = ({ revision_tok, revision_seq, am, vault_tok }: Revision & { am: EX.Am, vault_tok: string }): Peek => ({ revision_tok, revision_seq, am, lifeTok: vault_tok })

/** True when the row `box` is filed at the scope `asked` names. */
const isBoxFiledAt = (box: Boxscope, asked: Boxscope): boolean => (
  (box.applabel === asked.applabel) && (box.user_id === asked.user_id) && (box.vaultlabel === asked.vaultlabel) && (box.boxlabel === asked.boxlabel)
)

/** How the row `expected` stands against `found`, the row stored or null for none. */
const fitOf = ({ expected, proposed }: Write, found: Peek | null): Fit => {
  if (found === null)                               { return (expected.revision_seq === SX.VoidRevisionSeq) ? 'match' : 'ahead' }
  if (found.revision_tok === proposed.revision_tok) { return 'proposed' }
  if (expected.revision_seq > found.revision_seq)   { return 'ahead' }
  if (found.revision_tok !== expected.revision_tok) { return (expected.revision_seq === found.revision_seq) ? 'forked' : 'stale' }
  // A revision_tok names one version of a row: the row cited by it is that version in its seq, its life and its liveness, or the two clash.
  const isRowExpected = (expected.revision_seq === found.revision_seq) && (expected.lifeTok === found.lifeTok) && (expected.am === found.am)
  return isRowExpected ? 'match' : 'clash'
}

/** The act of a get over `found`. */
const getActOver = <RefusedT extends string>(ifAbsent: EX.IfAbsent, found: Peek | null, acts: RefusedActs<RefusedT>): ActOver<RefusedT> => {
  if (found === null)   { return (ifAbsent === 'nil') ? 'void' : acts.void }
  if (found.am !== 'a') { return (ifAbsent === 'nil') ? 'gone' : acts.gone }
  return 'got'
}

/** The act of a put over `found`. */
const putActOver = <RefusedT extends string>(put: Write & { ifAbsent: EX.PutIfAbsent, ifPresent: EX.IfPresent }, found: Peek | null, acts: RefusedActs<RefusedT>): ActOver<RefusedT> => {
  const fit    = fitOf(put, found)
  const isLive = (found?.am === 'a')
  if (fit === 'proposed') { return (isLive && (found.revision_seq === put.proposed.revision_seq)) ? acts.reput : acts.retcon }
  if (fit === 'stale')    { return (isLive && (put.ifPresent === 'get')) ? 'passed' : acts.stale }
  if (fit !== 'match')    { return acts[fit] }
  if (found === null)     { return (put.ifAbsent === 'add') ? 'born'   : acts.void }
  if (! isLive)           { return (put.ifAbsent === 'add') ? 'reborn' : acts.gone }
  return ({ repl: 'replaced', get: 'passed', fail: acts.camped } as const)[put.ifPresent]
}

/** The act of a del over `found`. */
const delActOver = <RefusedT extends string>(del: Write, found: Peek | null, acts: RefusedActs<RefusedT>): ActOver<RefusedT> => {
  const fit    = fitOf(del, found)
  const isGone = (found !== null) && (found.am !== 'a')
  if (fit === 'proposed') { return (isGone && (found.revision_seq === del.proposed.revision_seq)) ? acts.redel : acts.retcon }
  if (fit === 'stale')    { return isGone ? acts.gone : acts.stale }
  if (fit !== 'match')    { return acts[fit] }
  if (found === null)     { return acts.void }
  return isGone ? acts.dubdel : 'deleted'
}

// A box row of another life of its vault is a leftover: it counts as no row.
/** What the comparison reads of the box row `box` stored for `asked`: null for none or for one of another vault life, `damaged` for one filed elsewhere. */
const foundBoxOf = (box: BoxRow | null, asked: Boxscope & { vault_tok: string }): Peek | null | 'damaged' => {
  if (box === null)                      { return null }
  if (! isBoxFiledAt(box, asked))        { return 'damaged' }
  if (box.vault_tok !== asked.vault_tok) { return null }
  return boxPeekOf(box)
}

const foundVaultOf = (vault: VaultRow | null): Peek | null => ((vault === null) ? null : vaultPeekOf(vault))

/** True when `act` says the request's record is to be stored. */
export const isWriteAct = (act: BoxAct | VaultAct): act is WriteAct => (EX.writeActVals as readonly string[]).includes(act)

/** The act a box's get, put or del amounts to over `vaultRaw` and `boxRaw`, the rows stored at its scope, each null for none.
 * Nothing is stored here: where {@link isWriteAct} holds of the act, the caller stores the request's record, in the atomic unit it fetched the rows in.
 */
export const boxActOf = (request: BoxRequest, vaultRaw: unknown, boxRaw: unknown): BoxAct => {
  const ask   = SX.boxRequest.parse(request)
  const asked = (ask.op === 'get') ? ask : ask.record
  const vault = SX.foundVaultRow.safeParse(vaultRaw)
  if (! vault.success)                          { return 'vault_damaged' }
  if (vault.data === null)                      { return 'vault_void' }
  if (vault.data.vault_tok !== asked.vault_tok) { return 'vault_mismatch' }
  if (vault.data.am !== 'a')                    { return 'vault_gone' }
  const box = SX.foundBoxRow.safeParse(boxRaw)
  if (! box.success)                            { return 'box_damaged' }
  const found = foundBoxOf(box.data, asked)
  if (found === 'damaged')                      { return 'box_damaged' }
  if (ask.op === 'get')                         { return getActOver(ask.ifAbsent, found, BoxActs) }
  const write = { expected: boxPeekOf(ask.expected), proposed: ask.record }
  return (ask.op === 'put') ? putActOver({ ...write, ifAbsent: ask.ifAbsent, ifPresent: ask.ifPresent }, found, BoxActs) : delActOver(write, found, BoxActs)
}

/** The act a vault's get, put or del amounts to over `vaultRaw`, the row stored at its scope or null for none.
 * Nothing is stored here: where {@link isWriteAct} holds of the act, the caller stores the request's record, in the atomic unit it fetched the row in.
 */
export const vaultActOf = (request: VaultRequest, vaultRaw: unknown): VaultAct => {
  const ask   = SX.vaultRequest.parse(request)
  const vault = SX.foundVaultRow.safeParse(vaultRaw)
  if (! vault.success)  { return 'vault_damaged' }
  const found = foundVaultOf(vault.data)
  if (ask.op === 'get') { return getActOver(ask.ifAbsent, found, VaultActs) }
  const write = { expected: vaultPeekOf(ask.expected), proposed: ask.record }
  return (ask.op === 'put') ? putActOver({ ...write, ifAbsent: ask.ifAbsent, ifPresent: ask.ifPresent }, found, VaultActs) : delActOver(write, found, VaultActs)
}
