# Thread 3: remembered_deadline (2026-10-15)

Branch `20261015-remembered_deadline`, PR [#58](https://github.com/mrflip/safebyok/pull/58), stacked on
[#57](https://github.com/mrflip/safebyok/pull/57) (`20261015-epoch_bounds`, `b943b34`), which
stands on main after [#53](https://github.com/mrflip/safebyok/pull/53) merged. Justify: green (root 105, safebyok 372, safebyok-convex 219, safebyok-react 15, demo 28).

* **Built**:
  * `rememberedUnlock` (`packages/safebyok/src/vault.ts`) gains one more "does it fit" condition:
    a remembered deadline past `deadlineAfter(now, reentryMs)` -- this open's
    `forcePassphraseReentryHours` from now -- was remembered under a longer setting, so the
    record is erased and the vault opens locked, as one that fails to fit or to open always was.
    The condition is `expires_at <= deadlineAfter(now, reentryMs)`, with `now` read once: a
    record past `FarFuture` never reaches it, since #57's `EpochMillis` bounds refuse it first.
    Nothing on the open path writes a record.
  * `LockboxNote` exported from the core's `index.ts`; `store()`'s doc names it; a test proves
    the schema and `store()` agree at 256/257 characters.
  * Docs: `OpenVaultOpts.forcePassphraseReentryHours`, the core README's *Locking*, and
    `notes/security.md` (#53's "lowering does not shorten" clause amended; a new entry).
  * Changeset `20261015-remembered_deadline.md` (patch, as #53's export of `FarFuture` was).
* **Decisions taken**:
  * Erase, not write back (the orchestrator's directive after review, recorded as a sprint
    decision). The first build capped the deadline and wrote the shortened record back; the
    reviewer found that a blind write of the record read at the start of the open resurrects a
    remembered unlock another tab's `lock()` erased in between (against thread 4's "the lock
    wins"). A safe write-back needs an atomic "shorten if still present" on `DeviceDB`, an
    interface hosts implement. An erase cannot resurrect, cannot slide, and racing a fresh unlock
    in another tab only makes that device ask again. With an unchanged setting the deadline set
    at unlock is always within now + setting, so the erase fires only when the host lowered the
    setting (or the clock went backward): one passphrase prompt per remembered device.
  * The check runs before the key unwrap, beside the other fit checks: a record that does not
    fit is never opened.
  * A deadline exactly at the new window's end fits (`<=`), one millisecond past does not.
  * A failed erase still rejects `openVault`, as it already did for every non-fitting record;
    making all of them fail closed is out of this thread.
* **Discoveries**:
  * Restacked onto #57. #57's tests that open with the default seven days on a stored
    `FarFuture` or an out-of-bounds deadline now open with `Infinity`: under seven days the
    window check alone would erase the record, and the tests would no longer prove the bounds.
    The reviewer's `0a28f27` made the same change to #53's "refuses an infinite one" case, which
    #57 folded into its out-of-bounds table; it became empty on the restack and was dropped, its
    change carried by that table. #57's `Math.min(expires_at, FarFuture)` on the
    `askPassphraseAt` line is #57's own and stays, though the bounds now make it a no-op.
  * A test drives the resurrection race directly (another tab's `lock()` between this open's
    read and settle); it fails on the write-back build.
  * Left as the reviewer found it: a rejected `openVault` after `vaultDB.subscribe` leaks the
    watch (thread 2 fixes that on main's line).
* **For thread 4 (lock_race)**: the change stays inside `rememberedUnlock`, which runs only
  inside `openVault` before the handle exists. An open in this tab racing another tab's `lock()`
  can still unlock this handle in memory (it read the record first), but writes nothing.
* **For a later thread** (the Coach's rulings, after this thread was cut; not acted on here):
  * No backward compatibility at all until 1.0.0.
  * `Infinity` hours is coerced to `FarFuture` at the option's parse, and refused everywhere after.
