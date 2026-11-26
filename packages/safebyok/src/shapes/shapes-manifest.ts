/** The manifest a datastore hands back from one atomic step of a get or a write, its tags, and the checks `AdapterVaultDB` reads them through. */

import type * as Z from 'zod'
import { CX, type EX, Validator } from 'safebyok-big/internals'
import type { Lifetok } from './primitives'
import type { ThingRecord } from './shapes-thing'
import type { TombstoneOf } from './shapes-sealers'
import type { Tracked } from './shapes-asks'
import { type ReadTc, SeenChecks } from './shapes-vault-event'

// == [Tags]: ManifestChecks, PolicyVerdict, PolicyVerdicts, GetTags, WriteTags, Presence, RevtokCmp, RevseqCmp, SameCmp
// Each tag spells the field it compares. A datastore makes them of the row it judged a write against, the ante row.

/** The checks of what a datastore hands back: its tags, its `tracked` and its `read_tc`. Each refuses `storage_issue`. */
export const ManifestChecks = Validator.Checkers('storage_issue', ({ obj, lit, str, bool, oneof, discrim, custom }) => {
  const presence       = oneof(['void', 'gone', 'live'])
  const sameCmp        = oneof(['same', 'changed', 'moot'])
  const policyVerdict  = discrim('ok', [obj({ ok: lit(true) }).strict(), obj({ ok: lit(false), message: str }).strict()])
  const policyVerdicts = obj({ replace_passphrase: policyVerdict.optional(), add_passkey: policyVerdict.optional(), revoke_passkey: policyVerdict.optional() }).strict()
  return {
    policyVerdict,
    policyVerdicts,
    getTags: obj({
      /** The actual row's liveness: none (`void`), a tombstone (`gone`), or live. */
      presence,
    }).strict(),
    writeTags: obj({
      /** The ante row's liveness: none (`void`), a tombstone (`gone`), or live. */
      presence,
      /** The ante row's revtok against the ask's: see {@link RevtokCmp}. */
      revtok_cmp:  oneof(['birth', '=next', 'eq', 'neq']),
      /** The ask's cited revseq against the ante row's: see {@link RevseqCmp}. */
      revseq_cmp:  oneof(['birth', 'eq', 'stale', 'ahead']),
      /** True when the ante row's lifepath is the cited one, or where there is no ante row. */
      lifepath_eq: bool,
      /** A live record over a live ante row: whether it leaves the born_at the same. `'moot'` for any other write. */
      born_at_cmp: sameCmp,
      /** A write of the bank over a live bank: whether it leaves the lifetok the same. `'moot'` for any other write. */
      lifetok_cmp: sameCmp,
      /** One verdict for each storage policy the ask names, and no other: met wherever the ante row is no live gate. */
      policies:    policyVerdicts,
      /** True when the datastore's own predicate wrote the proposed record. */
      written:     bool,
    }).strict(),
    tracked: custom<Readonly<Record<string, unknown>>>(CX.isPlainBag),
    read_tc: SeenChecks.readTc,
  }
})

/** A storage policy's verdict on one write: met, or the message saying why not. */
export type PolicyVerdict = Readonly<Z.infer<typeof ManifestChecks.policyVerdict>>

/** A verdict for each storage policy a write names. */
export type PolicyVerdicts = Readonly<Z.infer<typeof ManifestChecks.policyVerdicts>>
true satisfies Z.core.util.AssertEqual<keyof PolicyVerdicts, EX.StoragePolicy>

/** The tag the get table reads: the actual row's `presence`. */
export type GetTags = Readonly<Z.infer<typeof ManifestChecks.getTags>>

/** The comparisons the put and del tables read, as the datastore made them of the ante row against the ask, and whether it wrote. */
export type WriteTags = Readonly<Z.infer<typeof ManifestChecks.writeTags>>

/** A row's liveness: none (`void`), a tombstone (`gone`), or live. */
export type Presence = WriteTags['presence']

/** The ante row's revtok against the ask's.
 * - `'birth'` -- cited the shell, and there is no ante row
 * - `'=next'` -- the ante row has the revtok this ask would write
 * - `'eq'`    -- cited exactly the ante row's revtok
 * - `'neq'`   -- anything else
 */
export type RevtokCmp = WriteTags['revtok_cmp']

/** The ask's cited revseq against the ante row's.
 * - `'birth'` -- cited the shell
 * - `'eq'`    -- cited exactly the ante row's revseq
 * - `'stale'` -- cited an older revision: a write has intervened
 * - `'ahead'` -- cited a newer revision, or a revision where there is no ante row: an impossible situation
 */
export type RevseqCmp = WriteTags['revseq_cmp']

/** Whether a write leaves a field the same, changes it, or is a write the field's rule does not judge (`'moot'`). */
export type SameCmp = WriteTags['born_at_cmp']
// --

// == [Manifests]: GetManifest, WriteManifest, CheckedManifestRows, CheckedGetManifest, CheckedWriteManifest, ScribedGetManifest, ScribedWriteManifest
// A datastore hands back a manifest; `AdapterVaultDB` then writes onto it, step by step, until it reads as the answer.

/** What a datastore observed in one atomic step of a get, each row exactly as it stands at the step's last read.
 * - `tags`     -- the get's {@link GetTags}
 * - `actual`   -- the row at the ask's scope, null for none
 * - `ancestor` -- where `actual` is null, the nearest row above the scope, live or a tombstone, null for none: it gives the shell's lifepath. Read nowhere else.
 * - `banktok`  -- the bank row's lifetok, the void lifetok for none
 * - `tracked`  -- for each of the bank, main gate and root box, `'same'` where it stands at the revseq and lifepath the ask tracks, else the row, null for none
 * - `read_tc`  -- when the step read: `readTcNow()` in the step, or the datastore's own UUID version 7
 *
 * The vaultDB writes onto the manifest it is handed, so hand it a new one each step.
 */
export type GetManifest = { tags: GetTags, actual: unknown, ancestor: unknown, banktok: unknown, tracked: unknown, read_tc: unknown }

/** What a datastore observed in one atomic step of a write, each row exactly as it stands at the step's last read: as for a {@link GetManifest}, with {@link WriteTags}.
 * `actual` is the row written where the datastore wrote, else the ante row. Its `banktok` and `tracked` are read after any write.
 */
export type WriteManifest = { tags: WriteTags, actual: unknown, ancestor: unknown, banktok: unknown, tracked: unknown, read_tc: unknown }

/** A manifest's rows, each checked once. */
export type CheckedManifestRows = { actual: ThingRecord | null, ancestor: ThingRecord | null, banktok: Lifetok, tracked: Tracked, read_tc: ReadTc }

/** A get's manifest, its tags and each row checked. */
export type CheckedGetManifest = CheckedManifestRows & { tags: GetTags }

/** A write's manifest, its tags and each row checked. */
export type CheckedWriteManifest = CheckedManifestRows & { tags: WriteTags }

/** A get's checked manifest with the act the get table finds from its tags, and whether it answers good. */
export type ScribedGetManifest = CheckedGetManifest & (
  | { ok: true,  act: 'gotlive', actual: ThingRecord }
  | { ok: true,  act: 'gotgone', actual: TombstoneOf<ThingRecord> }
  | { ok: true,  act: 'gotvoid', actual: null }
  | { ok: false, act: 'gone',    actual: TombstoneOf<ThingRecord> }
  | { ok: false, act: 'void',    actual: null }
)

/** A write's checked manifest with the act the put or del table finds from its tags, or `policied` where a fixed field or a storage policy forbids the write, and whether it answers good. */
export type ScribedWriteManifest = CheckedWriteManifest & (
  | { ok: true,  act: EX.PutAct | EX.DelAct,     actual: ThingRecord }
  | { ok: false, act: EX.RefusedAct | 'policied', actual: ThingRecord | null }
)
// --
