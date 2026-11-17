# Thread 15: refresh_rulings (2026-10-24)

Branch `20261024-refresh_rulings`, PR [#268](https://github.com/mrflip/safebyok/pull/268), stacked on [#252](https://github.com/mrflip/safebyok/pull/252), in the line main → #265 → #252 → #268 → #250.
Justify: green (core 3142, indexeddb 164, postgres 318, fastkey 49, react 300, convex 316, graphql 323, demo 227, e2e 107); `pnpm size:budget` within every budget.

* **Built**: the Coach's rulings on the core-line review's U3 and U6, both in the vault's refresh
  (`packages/safebyok/src/vault.ts`, *Reading storage* and *Vocabulary*).
  * **U3** (the Coach: "yay"). `standsBeside` now asks only that the stored lease be of the same
    `vault_tok` and `gate_epoch` as the lease in hand; no deadline is compared, and the "older
    lease" clause is gone (the `#leasesHeld` count from thread 9 already covers a read begun
    before the lease in hand). A refresh drops the lease when the store holds none (a lock in
    another tab), or one under another gate, or the vault props read show other ways in.
    **What a user sees:** no flash of `locked` when another tab unlocks or renews; this tab
    keeps its own lease to its own deadline, and its next call then takes up the other tab's
    without asking. **The case left:** a `lock()` and an unlock in another tab that both land
    before this tab's next read leave it unlocked (toldjaso 16).
  * **U6** (the Coach: "no objection" to a reordering). It is one: `#judgeRead` tests
    `vault_behind` before the older-read ignore, two lines swapped, no new branch, flag or
    mechanism. The decision stays the host's, as it was (`bank.clearCachedVault`).
  * Tests: three new in `tests/vault/vault-demand.test.ts` (*the refresh's judgment*): keeps its
    lease through another tab's renewal, then takes the renewed one up unasked; keeps it through
    a lock and unlock elsewhere; drops it for a stored lease under another gate. Six rewritten,
    none retired (nothing in `tests-retired.md`): hello "refuses vault_behind in the Vault
    object that saw the newer copy too"; storage "refuses an older copy at unlock as
    vault_behind", "...met by a background refresh as vault_behind", "restored under a del(),
    refuses that del() as vault_behind" (it now locks); wayins "changes nothing when storage
    holds vault props older than the ones in hand, and is refused" (`vault_behind` or, for
    `delWayin`, `absent_wayin` from the picture before any read); react
    `bank-provider-refusals` "keeps a vault holding the newer copy in hand when a later read
    meets an older one".
  * Docs: the `Vault` class block, `hello`'s block, the core README (*Lease* paragraph on tabs,
    *A vault behind this device*). Changeset `.changeset/20261024-refresh_rulings.md`
    (`safebyok` patch). `notes/security.md` amended in place through a sonnet subagent (three
    amendment lines, per the file's header, which says entries are amended in place).
    `primitives-toldjaso.md`: 14 amended, 16 added.
* **Decisions taken**: "the gate moved" read as the stored lease under another `vault_tok` or
  `gate_epoch` (the vault props' gate is already `fitsLease`'s). A stored record of the wrong
  shape still drops the lease, as before. `patch`: no exported name or stored shape changes.
* **Discoveries**: the record-first ordering (thread 7) is what makes U6 a pure reorder; the
  late read of this tab's own write (`vault-demand`, "ignores a late read of this tab's own
  write") still passes untouched.

## For the Coach: U6, your questions answered

*Does seeing 5 when you're on 6 mean a server backup or an attack?* The data cannot say; nor
could it before. Either way the device refuses `vault_behind` and locks, and the message tells
the customer the one decision: if storage was restored on purpose, `bank.clearCachedVault`
accepts it on this device; otherwise their support looks at storage. That is unchanged and
adds no policy.

*Only some machines will have noticed: what about the others?* A device whose record saw 6
refuses, in every tab and at every birth, now including the tab that held 6 (before, that one
tab alone carried on with the restored boxes). A device that never saw 6 takes 5 as it stands
and cannot tell; that was already so (toldjaso 1, README *A vault behind this device*).

*A network blip, and if we see it catch up everything's fine?* A read served before this
device's own write is still ignored, not refused: the device record is read before the fetch,
so this device's own raise is never held against it. The one new false alarm is a lagging read
replica serving below what this device has seen: the tab locks and shows `vault_behind`, and
the next `hello()` once the replica catches up reads it afresh; the user unlocks again. No
retry or wait is built for it (ground rule 10).

*What each ordering shows a user:* before, the tab that saw 6 stayed unlocked, listing the
restored boxes, its gate writes refusing `stale_write`, while every other tab locked with
`vault_behind`. Now every tab on that device locks with `vault_behind`.

## For thread 14: Contract lines this makes untrue or short

* *vault.hello*, Does 2: "drops the lease ... when this device's store no longer holds it
  (another tab locked) or the ways in changed": add "or holds one under other ways in; another
  tab's unlock or renewal leaves it standing until it ends".
* *vault.hello*, the line "A read served before this device's own write and answered after it
  is ignored": add "unless it is below the device record, which refuses `vault_behind` even in
  the Vault object that holds the newer copy".
* *Tradeoffs and limitations*, "A coherent picture": "a read older than the picture in hand is
  ignored" is now true only above the device record.

## Open questions (also in the PR)

* **Lagging replica false alarm (U6):** Rec: accept; a copy below what the device has seen is
  indistinguishable from a rollback, and a retry is ruled out (ground rule 10).
* **Lock-then-unlock elsewhere (U3):** Rec: accept (toldjaso 16).
