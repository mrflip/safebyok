# Won't fix

Behaviour the package leaves undefined on purpose: cases a host can reach, whose outcome we do not
promise, test or design for, each with the ruling that put it here and what happens today. A
reviewer reads `notes/security.md` for what we decided; this file is for what we decided not to
decide. Add an entry at the end of the list, dated, with the ruling or the row it came from.

* 2026-10-16 (G129, the Coach: "make a file WONTFIX"): **one device, one setting.** Opening the
  same vault on one device with different settings -- a different `leaseHours`,
  `maxWhisperBytes`, `maxBoxes`, `validators` or `keyDeriver` -- is
  undefined behaviour, whether the handles are in one tab or in two. A device keeps one lease
  and one device mark per vault, shared by every handle on it, and each handle reads them by its
  own settings. Today, for the lease: an open with a shorter `leaseHours` than the lease was
  granted under discards it (see `fetchLease` in `packages/safebyok/src/vault.ts`), so a tab
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
  anyway." No refusal; a host that cares keeps such keys out of what it stores.
* 2026-10-22 (the Coach, primitives sprint, ruling against a turn queue): **no ordering among a
  vault's box calls.** `getBox`, `putBox` and `delBox` calls in flight together on one vault, for
  different boxes or the same `boxlabel`, settle in no promised order. The vault joins only its
  storage refresh (a `hello()` during one is in it, not behind it) and its gating (one prompt at a
  time); nothing queues the box calls. A store's expectation (`vault_tok`, `gate_epoch`, a box's
  `revision_tok`) prevents a lost update, not a reordering: a host that needs an order awaits each
  call before making the next.
* 2026-10-31 (the Coach, newvault sprint, thread 2): **a refused erase of a kept lease is not
  retried.** `Lease.get` meeting a lease past its `autolock_at`, and a lease that proves damaged,
  erase the deviceDB's record once (`tryDelLease`); a refusal is warned of and left. The record
  is unusable either way, and the next grant writes over it.
* 2026-10-31 (the Coach, newvault sprint, thread 2): **no autolock timer past the Trigger's cap.**
  A lease whose `autolock_at` lies more than `MaxTimerMillis` (about 24.5 days) away arms no
  timer, by design: it locks no vault on its own, but reads not in force, and refuses
  `vault_locked`, once the clock passes its `autolock_at`.
* 2026-10-31 (the Coach, newvault sprint): **a lease's `forget()` whose device erase is refused
  is not retried.** `forget()` drops the lease's keys and record, then erases the deviceDB's record
  once (`tryDelLease`); a refusal is thrown from `forget()`, and a second `forget()` on the same
  lease erases nothing, as it already dropped its record. The entry on a refused erase of a kept lease covers the refused erase
  on `Lease.get` and the damaged-lease path; this one covers `forget()` itself. The deviceDB is a
  cache, and the next session asks for the passphrase. Pinned by
  `packages/safebyok/tests/loosened/lease.test.ts` (its one test); the Coach, "yeah skip", on
  retrying a refused erase.
