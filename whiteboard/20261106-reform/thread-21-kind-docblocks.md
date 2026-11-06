# Thread 21: kind docblocks (2026-11-06)

Branch `20261106-kind_docblocks`, PR #TBD, cut from main. Justify: see the PR (green at ready).

* **Built**: the doc-block half of thread 20's strip. Ten files in `packages/safebyok/src/`
  (`helpers/{validator,passphrase-strength,logger,crypto}.ts`, `shapes/{primitives,shapes-core,
  shapes-gateish,shapes-storage}.ts`, `storage/vault-db-new.ts`, `models/gating.ts`) lost the kind
  names the inventory marks *strip*: `bad_option`, `bad_record`, `bad_scope`, `unexpected_error`,
  `gate_issue`. Plus `locked_while_asking` (`models/gating.ts` `declineAtLock`) and `already_asking`
  (`VOCABULARY.md`, the gating row), the Coach's "strip all three" (`vault_gone` has no doc-block
  site left outside `refusals/`). An empty changeset. Words only: no code, no test, no thrower.
* **Decisions taken**
  * Where the kind was the sentence's only object, the sentence says "refuses" (as thread 20's
    handoff proposed); where it named a family of refusals, the list became its members ("refuses a
    passphrase that is no string, an answer that is no verdict, and a throw").
  * `@example` comments lost the kind too (`// throws`), as the inventory marks them strip.
  * Left as the inventory marks them: every *keep* and *definitional* site (`validator.ts`'s
    `Checkers`/`Checker`/`objCheck` doc blocks and examples that pass a kind, `refusals/`,
    `phrases.ts`, `outcome.ts`), `models/vault.ts`'s `absent_box` (fenced), `bank.ts:134`'s
    "disabled" (an adjective), and `notes/guarantees.md`'s five sites (a Cleanup item).
* **Discoveries**: `refusals/errors.ts` (the kind list, with a comment per kind) and
  `refusals/throwers.ts` still name `vault_gone`, `already_asking` and `locked_while_asking`;
  they are the definitions, untouched.

## Report: throws of the bad-news kinds beyond a try-catch-throw

`damaged_box`, `damaged_lease`, `damaged_row` and `newer_format` are thrown (or told) at these
sites. Most are a failed check or a narrow catch, rethrown. Four do more:

1. `storage/vault-db-new.ts:390` `unreadableRowOf` (thrown from `vaultRowOf` :396, `boxRowOf`
   :403): a branch on the kind. It runs a second parse of the same raw row (`SX.isNewerFormat`
   -> `fmtPeek.safeParse`, shapes-storage.ts:257) to choose `newer_format` over `damaged_row`.
   `shapes-storage.ts:262` `damagekindOf` makes the same choice for the `damaged_rows` lists
   (`format_mismatch` or `damaged_row`, no refusal thrown there).
2. `models/lease.ts:180` `Lease.#vaultKey`: `outcomeOf(unwrap, damagedLease)` is not thrown at
   once; on failure it first calls `friend.lock()` and `this.evict()` (a lock and an eviction,
   side effects), and then `valOf(opened)` throws `damaged_lease`.
3. `models/lease.ts:65-67` `Lease.buildFromCache`: a fallback. A cached lease row failing
   `leaseRecord` is not thrown: `damagedLease()` goes to `friend.tellBadNews` and the call
   answers `null` (no lease), the row left in place.
4. `models/vault-listing.ts:84` (`VaultListing`'s listing step): `damaged_row` is not thrown but
   told, one `vaultStoredDamaged` per entry of `damaged_rows`, to `world.tellBadNews`;
   `models/box-listing.ts:56-58` (same listing for boxes) lists the damaged rows and vacates
   the held box of each, with no refusal kind made.

Plain, a failed check or a catch-and-throw: `models/box.ts:139` (`undecodedWhisper`, a failed
`CX.whisper.safeParse`), `models/lease.ts:167` (`unopenedWhisper`, a catch of the two WebCrypto
calls), `models/proving.ts:139` (`unknownKeyDeriver`, a label mismatch), and the validators made
`refusingAs('damaged_row')` (`shapes/shapes-vaultish.ts:306` `vaultRow`, throwing as any
`Checkers` parse does).

## For the Coach

Nothing needs a ruling. The report above is the "more than a try-catch-throw" list: items 1 and 2
branch or act before throwing; items 3 and 4 are not throws at all but tellings of bad news.
