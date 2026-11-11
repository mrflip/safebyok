# Won't fix

This file lists behaviour the package leaves undefined on purpose: cases a host can reach, whose
outcome we do not promise, test or design for. Each entry gives the ruling that put it here and what
happens today. A reviewer reads `notes/security.md` for what we decided, and this file for what we
decided not to decide. Add an entry at the end of the list, dated, with the ruling or the row it
came from.

**This file is in flux (November 2026).** The vault is being redesigned, and many entries describe the
design as it stood in late October. Read each one as what we expected to leave alone under that design,
not as a settled ruling, and check it against the current design before relying on it.

* 2026-10-16 (G129, the Coach: "make a file WONTFIX"): **one device, one setting.** Opening the
  same vault on one device with different settings -- a different `leaseHours`,
  `maxWhisperBytes`, `maxBoxes`, `validators` or `keyDeriver` -- is
  undefined behaviour, whether the handles are in one tab or in two. A device keeps one lease
  and one device mark per vault, shared by every handle on it, and each handle reads them by its
  own settings. Today, for the lease: an open with a shorter `leaseHours` than the lease was
  granted under discards it (see `Lease.buildFromCache` in `packages/safebyok/src/models/lease.ts`), so a tab
  opened with the shorter setting discards the lease a tab with the longer one granted, and every
  tab on the device asks for the passphrase again.
  That is the safe direction, and it is all we say of it. A host that varies a setting by route
  passes the same one everywhere a vault opens on a device.
* 2026-10-16 (the Coach, thread 7, [#129](https://github.com/mrflip/safebyok/pull/129) and thread
  14, [#134](https://github.com/mrflip/safebyok/pull/134)): **Chrome ignores `autocomplete="off"` on
  a password-type field.** The whisper field may still be offered a saved password in Chrome.
  Avoiding it would take a text field masked by the non-standard `-webkit-text-security`, which not
  every browser honours. The Coach: "put as WONTFIX." We keep the password-type field, which
  every browser masks, and turn away what the attributes can turn away (autofill and generators).
* 2026-10-16 (the Coach, thread 2, [#133](https://github.com/mrflip/safebyok/pull/133)): **an own
  `__proto__` key in a sidecar or a whisper is undefined behaviour,** as `undefined` and
  functions are. A sidecar or a whisper with an own `__proto__` key loses it on the way in, because
  Zod's record assigns it as the prototype: nothing leaks, but the host gets back less than it
  stored, the way it already does for `undefined` and functions, which JSON does not serialize.
  The Coach: "we check for a crazy edge case used by people who know exactly what they're doing or
  have nfid what they're doing, so we can make them drop the weird field we would have dropped
  anyway." There is no refusal. A host that cares keeps such keys out of what it puts.
* 2026-10-22 (the Coach, primitives sprint, ruling against a turn queue): **no ordering among a
  vault's box calls.** `getBox`, `putBox` and `delBox` calls in flight together on one vault, for
  different boxes or the same `boxlabel`, settle in no promised order. The vault joins concurrent
  calls in two places only: its storage refresh (a `hello()` during a refresh joins it rather than
  waiting behind it) and its gating (one prompt at a time). Nothing queues the box calls. A vaultDB's
  expectation (`vault_tok`, `gate_epoch`, a box's `revision_tok`) prevents a lost update, not a
  reordering. A host that needs an order awaits each call before making the next.
* 2026-10-31 (the Coach, newvault sprint, thread 2): **a refused forget of a cached lease is not
  retried.** When `Lease.buildFromCache` finds a row of another epoch, it forgets the deviceDB's
  record once (`tryForgetLease`). A refusal is warned of, and the record left. The record is unusable
  either way, and the next grant writes over it. A `lock()`'s own refused forget is told as a panic (`vault.#panic`).
* 2026-10-31 (the Coach, newvault sprint, thread 2): **no autolock timer past the Trigger's cap.**
  A lease whose `autolock_at` lies more than `MaxTimerMillis` (about 24.5 days) away starts no
  timer, by design. It never locks a vault on its own, but once the clock passes its `autolock_at`
  it reads as not in force, and refuses `vault_locked`.
* 2026-10-31 (the Coach, newvault sprint): **a lease's `revoke()` whose device forget is refused
  is not retried.** `revoke()` drops the lease's keys and record, then forgets the deviceDB's record
  once (`forgetLease`). A refusal is thrown from `vacate()`, and a second `vacate()` on the same
  lease forgets nothing, because the lease already dropped its record. The entry on a refused forget
  of a cached lease covers `Lease.buildFromCache`; this one covers `revoke()` itself. The deviceDB is
  a cache, and the next session asks for the passphrase. Pinned by
  `packages/safebyok/tests/models/lease.test.ts`, *a revoke whose forget is refused*; the Coach, "yeah skip", on
  retrying a refused forget.
* 2026-11-02 (the Coach, unrace, `unrace-new_vault.md` at commit e135d0352, since deleted; not yet built):
  **a failed delete still locks the vault on this device.** `del_vault` locks first, because a lock
  is synchronous and safe, then removes the vault from the vaultDB and the deviceDB, then vacates. So
  a delete the vaultDB refuses still logs the user out of this device, and they log back in to try
  the delete again. That is unpleasant, and could leave them thinking the vault is gone from their other
  devices when it is not. The verb does refuse, so a host can say so. The Coach: "Still: WONTFIX."
* 2026-11-03 (unrace, `whiteboard/20261102-newdesign/newdesign-proof.md`, *The lease*): **a `lock()` during
  the cache's `Lease.buildFromCache` loses.** The vault reports unlocked on the lease built from the cache, the lock's forget
  stands, and the next session asks the user to unlock again. The next `lock()` ends that session.
* 2026-11-03 (the Coach, unrace, `whiteboard/20261102-newdesign/newdesign-proof.md`, *Rows for `notes/wontfix.md`*,
  since moved here):
  **a `lock()` whose forget is refused can unlock again without asking the user.** The vault locks, but the lock's
  forget of the deviceDB's cached lease is refused and reported as a panic, so the record survives. The next `ensureUnlocked`
  gets it from `Lease.buildFromCache` and attaches it, asking nothing, so a vault the user locked reopens with no
  passphrase. With no `onPanic`, the panic's vacate stops that in the tab that locked. With one, stopping it is up
  to the host. Either way, the row can survive for other tabs and later sessions. The Coach, 2026-11-02: won't fix, but
  "one I worry about"; and, 2026-11-03: "This is why the panic button exists, there is no fix we can apply if the
  system somehow is operational enough to read leases, decrypt data and everything else but delete data."
* 2026-11-03 (the Coach, unrace): **a refused forget with no `onPanic` can bring a false prompt.** `Vault.#panic`
  delists the vault, so `ensureVault` then asks for a passphrase for a vault that exists. The Coach: "If the
  host has no on panic they've given their opinion, wontfix."
* 2026-11-03 (the Coach, unrace): **a delete whose forget is refused, with no `onPanic`, still succeeds.** The vault
  is tombstoned in the vaultDB and the delete succeeds, whatever happened to the forget of the cached lease. The same
  ruling: a host with no `onPanic` has given its opinion.
* 2026-11-03 (the Coach, unrace): **a host's own getter that throws a `VaultError` quoting the passphrase passes
  the gating's check whole.** The gating replaces any other throw from a getter with `unexpected_error`, keeping nothing of it.
  It passes a `VaultError` on unchanged and does not inspect its text, so if a host's getter throws one with the passphrase in its
  message, it reaches the caller whole. The Coach: "Wontfix agreed".
* 2026-11-03 (the Coach, unrace, `whiteboard/20261102-newdesign/newdesign-proof.md`, *Rows for `notes/wontfix.md`*,
  since moved here): **cross-tab complications, all of them.** Tab A's `lock()` or
  vacate leaves tab B unlocked, and nothing tells it.
* 2026-11-03 (the Coach, unrace, `whiteboard/20261102-newdesign/newdesign-proof.md`, *Rows for `notes/wontfix.md`*,
  since moved here): **a put can be written though its answer is lost.**
* 2026-11-04 (the Coach, on `Lease.buildFromCache` rejecting where a clock throws): **anything to do with a host clock.**
  The package reads the device's clock, `Date.now()`. A host has no clock to pass, and a test sets it with
  `_cheat_clock`. A device clock that jumps or runs backward is undefined behaviour.
* 2026-11-05 (the Coach, on `box.put` returning `this`): **a box discarded while its own `put` is in flight returns itself, not the instance listed.**
  A box listing never replaces a box it lists, so `put` returns the instance it was called on. Only a `box.vacate()` or `box.sweep()`, or a
  `boxListing.hello` that finds the box damaged, empties the slot, and only if it runs during the put's `doTryPut`. The delivery then lists a new
  instance. The caller has the discarded one, which refuses `disabled` from then on, and the listing returns the new one.
* 2026-11-05 (the Coach's brief for `box.putExposed`: "a race gets a row"): **a `box.unexpose()` crossing a `box.putExposed()`.** `putExposed` takes
  the value exposed when it is called, before its hydrate. An `unexpose` that runs during the put's awaits changes nothing about what is sealed:
  the value taken at the call is stored, and the instance keeps none.
* 2026-11-05 (the Coach's brief for the fields, now `BoxFields` in `safebyok/dom`: "a race gets a row"): **a `box.expose()` crossing the last unbind.** An `expose` in flight when the
  last field unbinds completes after the `unexpose`, so the whisper stays exposed with no field to tie it to, until the host unexposes or the box is
  swept, vacated or deleted. Also: **a `fields.put()` crossing an edit:** it reads the fields when called, so what is typed during the put's awaits is
  not in that put, and stays in the element for the next.
* 2026-11-06 (a review of #505, the Coach: "add the row"): **two copies of `safebyok/dom` in one page.** `BoxFields.of` keeps one `BoxFields` per box
  in a module-level map, and each copy of the module has its own map. A page that loads `safebyok/dom` both as ESM and as CommonJS gives a box two `BoxFields`,
  each with its own fields and its own last unbind, so the box unexposes when either copy's last field unbinds.
* 2026-11-07 (the Coach, vaultdb_cleanup, thread 7, the Convex field-name row): **Convex refuses a field name that starts with `$` or contains a
  non-ASCII character, at any depth of a record.** Convex refuses a sidecar or a record field with such a name, and the call fails as
  `storage_unavailable`. Convex's docs list more it will not take: an empty name, a name starting with `_`, nesting past 16 levels, and more than
  1024 entries in one object. The core does not check for any of these before the call.
* 2026-11-07 (the Coach, vaultdb_cleanup, thread 7, the GraphQL stream row): **the GraphQL stream stops on a best-effort basis.** The server's
  resolvers call `getUserId` again on each notice, so an idle stream stays open until its next change. A `getUserId` that does not look the
  session up live (a cached or decoded token) never stops the stream.
* 2026-11-07 (the Coach, vaultdb_cleanup, thread 7, "A Convex vault full of tombstones needs a delVault": "publicize and accept"): **a Convex
  vault whose deleted boxes fill its cap refuses new box labels until the vault is deleted.** A deleted box leaves its tombstone, which counts
  toward the vault's box cap as a live box does. Only a put under the label of a stored tombstone reuses its row. The Convex README says so.
* 2026-11-07 (the Coach, devicedb_idb, on a damaged lease row outliving a vacate: "I predict trouble when multiple tabs have the
  same lease. Mark anything like this wontfix. We will in future have tabs notify but store independently, how I don't know."):
  **a lease row that fails its check is neither listed nor forgotten.** `DeviceDB.listLeases` leaves it out, and `DeviceDB.forget`
  leaves it standing because it has no `vault_tok` to match, so neither a vacate nor a `bank.autolock` forgets it. It stays until a later
  stow over its scope. `DeviceDB.listRawLeases` shows it beside its scopepath, and a host deletes it by that scopepath with
  `DeviceDB.forgetRawLease`. Also: **tabs sharing one device database's leases are undefined.** Every tab of an origin opens the same
  `IdbDeviceDB` database, so one tab's stow, forget or vacate changes another tab's lease without telling it.
* 2026-11-07 (devicedb_idb, the device database's wipe): **a tab that has an old device database open keeps it.** `IdbDeviceDB`
  deletes the databases of an older version unread on its first call. A tab of an older release that still has one open blocks
  that delete. The database is deleted once that tab closes and a later page load tries the delete again.
* 2026-11-07 (the Coach, on a proposal to chain each revision to its prior): **storage that rolls a record back.** Nothing detects it beyond one session,
  and nothing chains a revision to its prior. The Coach: there is no certainty the device is right and the server wrong or vice versa; a device
  that writes on top saw a working state, storage saw one, and a record that deciphers was sealed under a working key. Today a fetch below
  the revision the device has is ignored as `older`. After a reload, the older copy is accepted as found, so a vault row restored from before a
  passphrase change unlocks with the replaced passphrase.
* 2026-11-09 (the Coach, after designing it in `whiteboard/20261108-del_damaged/del_damaged-spec.md`: "I predict too many bug reports about
  non-bugs"; replaces the 2026-11-03 row that a damaged row stays until the customer names it): **the library does not delete a row that
  fails its check.** A damaged box row stays listed in `damaged_rows`, reads as `damaged_row`, and still counts toward `maxBoxes`. A damaged vault
  row is reported as bad news and stops a `delVault` that meets it. The customer clears either with their own datastore's tools. If that changes,
  start from the spec.

* 2026-11-09 (the Coach, on the React forms thread: "the specific UI annoyance of clearing all three passwords is a wontfix by the library authors"): **a dialog's fields empty after each attempt.** React resets an uncontrolled form when its action ends. A wrong current passphrase in the change-passphrase dialog clears all three fields, and a dismissed passkey prompt in the add-passkey dialog clears the passphrase typed before it. Keeping them would mean leaving React's form actions for hand-written submit handling. Pull requests accepted.
* 2026-11-09 (the Coach, closing out the old design: "this was decided to be unnecessary"; "Apple requires the passphrase on the next login but doesn't
  disable, we won't do either"): **a new passphrase leaves the passkey in place.** Replacing the passphrase changes only the passphrase wayin. The passkey
  wayin stays as stored and still unlocks the vault, and no later use of the passkey demands the passphrase. Someone who knew the old passphrase and added a
  passkey keeps that access until the passkey is revoked, which is a separate gate change. Recorded as a decision in `notes/security.md`.
* 2026-11-09 (the Coach, closing out the old design): **a vault uses its bank's storage.** `ensureVault` takes no `vaultDB` or `deviceDB` of its own, as it did in
  the old design. A host wanting a vault in other storage makes a second `Bank` over it.
* 2026-11-10 (the Coach, on the review of #618: "If you set maxWorldMillis to zero you get what you asked for"): **a get with `maxWorldMillis: 0`
  may fetch the vault twice.** When a listing's `get` falls through to its `fetch`, each of the two makes sure its world is timely, so a horizon of
  zero fetches the vault row once for each, before the box's own get.
* 2026-11-10 (the Coach, on the review of #618: "an eventual gc mechanism"): **a listing's joined fetches are never collected.** For each slot a listing
  has fetched, absent slots included, it keeps a small entry that joins its fetches, for the listing's life. Collecting them waits on a gc mechanism.
* 2026-11-11 (the Coach, on #639: "This is paranoiac coding, you have validated the record correctness before writing it"): **a row garbled
  outside the vaultDB may be overwritten.** Postgres runs a put or del as one call that compares the stored row's revision, state, life token
  and `fmt`, and reads nothing else of it. Its tables refuse a flawed row one level into each `jsonb` field. If a direct write garbles a row
  deeper than that, every get throws it as damaged, and a put or del citing its exact revision overwrites it.
