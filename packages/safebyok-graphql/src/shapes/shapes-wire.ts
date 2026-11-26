/** What crosses the wire between `GraphQLVaultDB` and `vaultResolvers`: a verb's answer and a watch's notice, and the checks the client reads them through.
 * Each check refuses `storage_issue`: to the client, the server is its storage, and an answer that fails its check is out of step or broken.
 */

import * as DB from 'safebyok/storage'

// == [Wire forms]: CrossedErrExtension, WireAnswer, WireNotice

/** The key of a GraphQL error's `extensions` under which a refusal crosses, as `crossedErrOf` gives it, where the server could not serve the request. */
export const CrossedErrExtension = 'safebyokErr'

/** A vaultDB verb's answer as it crosses: the answer less its ask, its refusal reduced to what may cross, and null for each field the schema has and it lacks. */
export type WireAnswer = Readonly<{
  ok:      boolean
  act:     DB.GoodAct | DB.BadAct
  banktok: DB.Lifetok
  tracked: DB.Tracked | 'unread'
  read_tc: DB.ReadTc
  val:     unknown
  dbhas:   unknown
  err:     DB.CrossedErr | null
}> & Partial<DB.ListedBeside>

/** One notice of a watch as it crosses: a changed Thing, its bank's banktok and when it was read; or, with those null, the trouble the watch met.
 * `isEnded` is true on the last notice of a watch that ended itself, which carries why.
 */
export type WireNotice = Readonly<{
  record:  DB.VaultItemEvent['val'] | null
  banktok: DB.Lifetok | null
  read_tc: DB.ReadTc | null
  err:     DB.CrossedErr | null
  isEnded: boolean
}>
// --

// == [Checks]: WireChecks

// The Things an answer carries, its banktok, its tracked and its read_tc are left raw here: `GraphQLVaultDB` hands them on
// in a manifest, and `AdapterVaultDB` checks them there as it checks any datastore's. A listing's kids are not sent: the
// client makes them again from the parent and the children.
/** The checks of what crosses, each refusing `storage_issue`, by the verb whose answer it reads:
 * - `gotAnswer`, `wroteAnswer`, `listAnswer`, `rootsAnswer`, `worldAnswer`, `statsAnswer` -- a good answer of the verb's acts, or any refused one
 * - `notice` -- a watch's notice: a Thing with its banktok and read_tc, or a refusal
 * - `shell` -- the shell an answer carries where nothing is stored, of any kind
 */
export const WireChecks = DB.Checkers('storage_issue', ({ obj, arr, lit, str, oneof, unk, discrim, union, bool, tuple }) => {
  const refused = obj({ ok: lit(false), act: oneof([...DB.badActVals, 'policied']), banktok: unk, tracked: unk, read_tc: unk, dbhas: unk, err: DB.CrossedChecks.err })
  const goodOf = <const ActsT extends readonly [string, ...string[]]>(acts: ActsT) => obj({ ok: lit(true), act: oneof(acts), banktok: unk, tracked: unk, read_tc: unk, val: unk, dbhas: unk, err: lit(null) })
  const incompatibleThing = obj({ userid: str, banklabel: str, labelpath: str, am: lit('d') }).strict()
  const listed = { parentage: tuple([unk]), deltas: arr(unk), incompatible_rows: arr(incompatibleThing) }
  return {
    gotAnswer:   discrim('ok', [goodOf(DB.gotActVals), refused]),
    wroteAnswer: discrim('ok', [goodOf([...DB.putActVals, ...DB.delActVals]), refused]),
    listAnswer:  discrim('ok', [goodOf(['gotlive']).omit({ val: true }).extend(listed), refused]),
    rootsAnswer: discrim('ok', [goodOf(['born', 'passed']), refused]),
    worldAnswer: discrim('ok', [goodOf(['got']), refused]),
    statsAnswer: discrim('ok', [goodOf(['got']), refused]),
    notice:      union([
      obj({ record: unk, banktok: unk, read_tc: unk, err: lit(null), isEnded: lit(false) }),
      obj({ record: lit(null), banktok: lit(null), read_tc: lit(null), err: DB.CrossedChecks.err, isEnded: bool }),
    ]),
    shell:       union([DB.BankChecks.shell, DB.GateChecks.shell, DB.BoxChecks.shell]),
  }
})
// --
