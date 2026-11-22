# refusalTextOf: what its default shows a user (a handoff for a session of its own)

Nothing here is decided, and nothing was changed. The Coach, 2026-11-22: "would you write this in a file for a separate
session? Make no changes on it now."

## What was found

`refusalTextOf(err)` is the kit's wording of a refusal for an end user (`packages/safebyok-react-lean/src/kit/phrases-kit.ts`).
[#823](https://github.com/mrflip/safebyok/pull/823) exports it from `safebyok-react-lean/kit`, and its `@example` words
a box write's error: `refusalTextOf(put.error)`.

It has a phrase of its own for three conditions: `wrong_passphrase`, `weak_passphrase`, `wrong_passkey`. For anything
that is no refusal it answers `KitPhrases.troubled`. For **every other `condition` refusal its default arm answers
`err.message`**, which was written for a developer. Found by #823's reviewer, reading the throwers; the list is as
that review gave it, and nobody has checked it a second time.

What that arm puts in front of a user:

* **Bare kind names.** A box or vault write refused by storage is thrown by `actRefused`
  (`packages/safebyok-big/src/refusals/throwers.ts`), whose message is the kind itself: the user reads the literal
  `stale_write`, `camped`, `absent_box`, `absent_vault`, `record_conflict`, `vault_reborn` or `vault_full`.
* **Text that names a call.**
  * `bank_locked`: "The bank is locked, so nothing was read or written: unlock it (bank.ensureUnlocked) and call again."
    The twin's own refusal test produces this one.
  * `bank_locked`, from a lease: "This lease is out of force, as the bank locked or the lease would not open…"
  * `vault_gone`: "…Ask the bank for the vault again (bank.ensureVault)…"
* **Instructions meant for the host.**
  * `attempt_in_flight`: "…disable the submit button until it answers."
  * `already_asking`: "…the host owns the one dialog…"
  * `gating_concluded` (`GatingSpent`): "…make another for the next try."
  * `vault_full` (`StorageFull`): "…The storage adapter's own error is this error's cause."
* **Internals.**
  * `stale_read`: `StaleRead` and `BoxSoonestBare`.
  * `record_conflict`: `BoxOfOtherRoot`, and `OneRevisionTwo*` / `NothingStoredWhereLive` ("…Report this as a bug.").
  * `box_too_large`: "That box weighs N bytes…".
  * `storage_unavailable`: `storageFailed` puts the `oplabel` in its text, and an adapter's own `message` can be anything.
  * `storage_blocked`: an adapter's own `message` can be anything.
* **Fit for a user as they are:** `absent_wayin`, `gate_made_elsewhere`, `same_passphrase`, `dismissed`
  (`GatingDismissed`, `UnlockDismissed`).

**Not traced:** `passkey_unavailable`, and the `record_conflict` messages `Validator.checkedConsistent` builds.

## Questions for that session

1. What should the default arm answer? Proposed by the reviewer and by the workshop's session, not ruled: `KitPhrases.troubled`.
2. Which conditions can a user act on, and so deserve a phrase of their own? Proposed: `bank_locked`, `stale_write`,
   `vault_full`, `box_too_large`, `storage_unavailable`.
3. Is the developer's message still reachable where the user's text replaces it? It is `err.message`, unchanged, for a
   host that logs it.
4. Does this belong with error routing, the core question the Coach deferred to a session of its own
   (`react_targets-burndown.md`, *Waits on error routing*)?
5. `phrases-kit.test.ts` checks neither the three condition phrases nor the default arm.

## Where things stand

`refusalTextOf` is exported on #823's branch (`20261122-multiples`, tip `4acc0477b`), with its doc block saying what
the default arm does. Until this is ruled, a host that shows `refusalTextOf(put.error)` shows the text above.
