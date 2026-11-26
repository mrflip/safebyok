/** The parts of a vaultDB answer that cross a wire from a server's vaultDB to a client's: their checks, and a refusal's conversion to and from wire form.
 * Each check refuses `storage_issue`. To the client, the server is its storage, and a part that fails its check means the server is out of step or broken.
 */

import { isNull, omitBy } from 'es-toolkit'
import type * as Z from 'zod'
import { CX, EX, Errors, Phrases as BigPhrases, SX, Validator } from 'safebyok-big/internals'
import { Labelpath } from './primitives'
import { type ThingRecord, type VoidSentinel, ThingChecks } from './shapes-thing'
import { SeenChecks } from './shapes-vault-event'

// == [Crossed parts]: CrossedChecks, CrossedErr, CrossedAct, CrossedAnswered, crossedErrOf, refusedOverWire
// Ported from safebyok-big's shapes-bank-answers.ts, with the meta's `act` and `labelpaths` added.

/** The checks of the parts of a vaultDB answer that cross a wire, each refusing `storage_issue`:
 * - `err`          -- a refusal, as {@link crossedErrOf} lets it cross: its kind, its message and an allowlisted meta, never its cause
 * - `answered`     -- what an answer says beside its refusal: its act, and the Thing it names
 * - `tracked`      -- the answer's `tracked`, each root's entry left raw, for the classifier
 * - `roots`        -- a birth's or a world's three roots, each left raw
 * - `listing`      -- a listing's `val` and the lists beside it, each Thing left raw
 * - `damagedThing` -- a child a listing found damaged
 */
export const CrossedChecks = Validator.Checkers('storage_issue', ({ obj, arr, str, unk, lit, oneof, custom }) => {
  const act = oneof([...EX.badActVals, 'policied'])
  const err = obj({
    refusalkind: oneof(Errors.refusalkindVals),
    message:     str,
    /** The refusal's meta as a server lets it cross: these fields alone, never its cause, ask or rows. */
    meta:        obj({
      oplabel:    str.nullable().default(null),
      act:        act.nullable().default(null),
      capacity:   SX.capacity.nullable().default(null),
      fieldnames: arr(str).nullable().default(null),
      labelpaths: arr(str).nullable().default(null),
    }).strict().nullable().default(null),
  }).strict()
  // A damaged child's labelpath is the one it is stored under: the classifier checks it is one under the listing's parent.
  const damagedThing = ThingChecks.bankScope.extend({ labelpath: str, am: lit('d') }).strict()
  return {
    err,
    // Checked for its form alone: a client's check of the Thing at its scope has already read it whole.
    answered: obj({ act: act.optional(), dbhas: ThingChecks.scopedCited.nullable().optional() }).strict(),
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

/** A refusal's act as it crosses a wire: a vaultDB's act, or `policied` for a write a storage policy refused. */
export type CrossedAct = NonNullable<NonNullable<CrossedErr['meta']>['act']>

/** What an answer that crossed a wire says beside its refusal: its act, and the Thing stored that it names, or the shell, checked at the ask's scope. */
export type CrossedAnswered = Readonly<{ act?: CrossedAct, dbhas?: ThingRecord | VoidSentinel | null }>

/** The check of a refusal handed to {@link crossedErrOf}, which a server sends: a bad one is a bug on its side of the wire, not trouble in storage. */
const vaultErrorCheck = Validator.Checker(({ custom }) => custom<Errors.VaultError>(Errors.isVaultError, BigPhrases.VaultErrorExpected), 'bad_record')

/** `err` as it may cross a wire: its kind, its message and the allowlisted fields of its meta, null for each it lacks. Never its cause, ask or rows. */
export function crossedErrOf(err: Errors.VaultError): CrossedErr {
  const { refusalkind, message, meta = {} } = vaultErrorCheck.parse(err)
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

// Here, beside the function it undoes, not among the throwers: those are imported by the modules these checks are built from.
/** The refusal `crossed` stands for, as it crossed a wire: its meta what crossed, with the act `answered` gives laid over it, and the Thing it names handed to the answer. */
export function refusedOverWire(crossed: CrossedErr, answered: CrossedAnswered = {}): Errors.VaultError {
  const { refusalkind, message, meta } = CrossedChecks.err.parse(crossed)
  // The check reads the Thing for its form alone, and its parse keeps only the fields it reads: the answer gets the Thing whole.
  CrossedChecks.answered.parse(answered)
  const { act = meta?.act ?? null, dbhas = null } = answered
  const crossedMeta = omitBy({ ...meta, act }, isNull) as Errors.RefusalMeta
  return new Errors.VaultError(refusalkind, message, { meta: crossedMeta, rows: { dbhas } })
}
// --
