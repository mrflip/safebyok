/** What a server's vaultDB answer carries across a wire to a client's vaultDB, for an adapter whose server runs a whole vaultDB: the checks of a refusal, of `tracked`, a birth's or world's roots and a listing, as they cross.
 * Each refuses `storage_issue`: to the client, the server is its storage, and one that sends a part that fails its check is out of step or broken.
 */

import type * as Z from 'zod'
import { CX, EX, Errors, SX, Validator } from 'safebyok-big/internals'
import { Labelpath } from './primitives'
import { ThingChecks } from './shapes-thing'
import { SeenChecks } from './shapes-vault-event'

// == [Crossed parts]: CrossedChecks, CrossedErr, crossedErrOf
// Ported from safebyok-big's shapes-bank-answers.ts, with the meta's `act` and `labelpaths` added.

/** The checks of the parts of a vaultDB answer that cross a wire, each refusing `storage_issue`:
 * - `err`          -- a refusal, as {@link crossedErrOf} lets it cross: its kind, its message and an allowlisted meta, never its cause
 * - `tracked`      -- the answer's `tracked`, each root's entry left raw, for the classifier
 * - `roots`        -- a birth's or a world's three roots, each left raw
 * - `listing`      -- a listing's `val` and the lists beside it, each Thing left raw
 * - `damagedThing` -- a child a listing found damaged
 */
export const CrossedChecks = Validator.Checkers('storage_issue', ({ obj, arr, str, unk, lit, oneof, custom }) => {
  const err = obj({
    refusalkind: oneof(Errors.refusalkindVals),
    message:     str,
    /** The refusal's meta as a server lets it cross: these fields alone, never its cause, ask or rows. */
    meta:        obj({
      oplabel:    str.nullable().default(null),
      act:        oneof([...EX.badActVals, 'policied']).nullable().default(null),
      capacity:   SX.capacity.nullable().default(null),
      fieldnames: arr(str).nullable().default(null),
      labelpaths: arr(str).nullable().default(null),
    }).strict().nullable().default(null),
  }).strict()
  // A damaged child's labelpath is the one it is stored under: the classifier checks it is one under the listing's parent.
  const damagedThing = ThingChecks.bankScope.extend({ labelpath: str, am: lit('d') }).strict()
  return {
    err,
    tracked:  obj({ bank: unk, [Labelpath.MainGate]: unk, [Labelpath.RootBox]: unk }).strict(),
    roots:    obj({ bank: unk, gate: unk, root: unk }).strict(),
    listing:  obj({
      val:          obj({ modelkind: lit('kids'), parentpath: str, parentlife: str, items: custom<object>(CX.isPlainBag), gones: custom<object>(CX.isPlainBag), read_tc: SeenChecks.readTc }).strict(),
      parentage:    arr(unk).length(1),
      deltas:       arr(unk),
      damaged_rows: arr(damagedThing),
    }),
    damagedThing,
  }
})

/** A refusal as it crosses a wire: its kind, its message and the meta a server lets cross, null for each field it left out. */
export type CrossedErr = Z.output<typeof CrossedChecks.err>

/** `err` as it may cross a wire: its kind, its message and the allowlisted fields of its meta, null for each it lacks. Never its cause, ask or rows. */
export function crossedErrOf({ refusalkind, message, meta = {} }: Errors.VaultError): CrossedErr {
  return {
    refusalkind,
    message,
    meta: {
      oplabel:    meta.oplabel ?? null,
      act:        meta.act ?? null,
      // JSON cannot carry Infinity: the check keeps an infinite limit as the largest safe integer.
      capacity:   (meta.capacity === undefined) ? null : SX.capacity.parse(meta.capacity),
      fieldnames: meta.fieldnames ? [...meta.fieldnames] : null,
      labelpaths: meta.labelpaths ? [...meta.labelpaths] : null,
    },
  }
}
// --
