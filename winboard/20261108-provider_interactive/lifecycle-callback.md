# A lifecycle callback: what it could take off our critical paths

An Opus survey, read-only, of #597 (2026-11-08). The Coach asked: "see what we can offload into this that we are doing now in a critical loop". Line numbers are at #597's tip.

## Rulings (the Coach, 2026-11-08)

* **Row 4, yes:** the core's panic friend vacates on `identity_revoked` itself, whatever `onPanic` the host gave. It's a guarantee, no longer an overridable default.
* **Row 3, yes for `onPanic` only:** `onLifecycle` replaces `onPanic`. **`onBadNews` stays apart.** It's a pipeline to the error-reporting system, frequent and of many kinds, often several around one lifecycle event. A host leaves it logging and out of the way while it writes its lifecycle handler. (The Coach left this to me; settled so.) The breaking change is `onPanic`, `PanicHandler`, `Panic` and `DefaultOnPanic`.
* **Row 1, yes:** one `lease_unerased` event.
* **Row 2, yes:** a `helloed` event announced by the core, which removes the provider's and `useVault`'s `.then` chains.
* **Rows 5 and 6, no:** the user switch and autolock keep their guarantees.
* **The event shape, yes,** without `bad_news`:

```ts
type BankEvent = { bank: Bank } & (
  | { kind: 'lease_unerased', refusal: VaultError, vault: Vault | null, where: 'lock' | 'tombstone' | 'vacate' | 'outdated' }
  | { kind: 'vacated',        cause: VaultError, unerased: number }
  | { kind: 'helloed',        outcome: Outcome<void>, vault: Vault | null })
```

* **Order:** after 20261108-bank_followups, which winds up as briefed; this thread repairs what it no longer needs. Then the react types move and the comment tour, on top.

## The survey

| # | Where, and what it decides today | Event, and the default we'd ship | What it removes | Risk |
|---|---|---|---|---|
| 1 | A refused lease erase gets a different severity at each site: vault.ts:183 panics, vault.ts:395 (from a tombstone) tells bad news, bank.ts:206-212 (the scrub) panics row by row, lease.ts:214-217 only writes a warning to the logger. | `lease_unerased`. Default: report to the platform, then `vault?.vacate()`. | `onRefused`, the override at :395, the scrub's handler unpacking, and the logger-only path. | Low. Today's outcomes are already only reports. The scrub stays the one place a disabled bank reaches the host. |
| 2 | A refused hello: bank-provider.tsx:52 (with its `isEnabled` check) and hooks.ts:48 each decide it's bad news. | `helloed {outcome}`, announced by the core from `bank.hello` and `vault.hello`. Default: the logger. | Two `.then` chains and the `isEnabled` branch, and React's need for `tellBadNews`. | Low. A host calling `tryHello` hears the outcome twice, which is why it's `helloed`, not bad news. |
| 3 | Fold `onPanic` and `onBadNews` into one `onLifecycle`, with a `DefaultOnLifecycle`. | | `Handlers`, `DefaultHandlers`, `guardOnPanic` beside `#tellBadNewsTo`, and the provider's handler omit list: about 30 lines. | Medium. A host that only wants to change logging now owns panic too, and could drop the vacate on a revoked identity. Safe only with row 4. |
| 4 | `DefaultOnPanic` (bank.ts:320-327) vacates on `identity_revoked`, but only if the host keeps the default. | None: the core's `#panic` friend vacates, then announces `vacated`. | The branch in `DefaultOnPanic`; adds one in `#panic`. | Closes a gap: today a host with its own `onPanic` keeps a revoked bank alive. Timing unchanged: `DefaultOnPanic` already vacates synchronously in `deliver`, which isn't touched. |
| 5 | Switching user: bank-provider.tsx:74-85 vacates the last user's bank. | `user_switched {last, next}`. Default: vacate. | One line: the ref, `onMade` and the effect stay, since something must name `last`. | Medium-high: the erase at a switch would hang on the host. |
| 6 | `autolock` (bank.ts:155-164) locks each lease row past the cutoff. | `lease_expired`. Default: lock. | One line. | Weakens a reminder that's already only best effort. |

Not candidates: the sweep in cleanup, `helloedVaults` (it deduplicates calls; it isn't policy), the tombstone `adopt`, the lock on a damaged lease, the vacate of a damaged box. Each is a safety primitive or deduplication, and announcing it would add calls inside `receive` or `buildOrReceive`.

**Recommended first version:** rows 4, 3, 1, 2, in that order. Row 4 lands with or before row 3. Rows 5 and 6 each remove about a line and move a sign-out or autolock guarantee onto the host.

**Event shape:**

```ts
type BankEvent = { bank: Bank } & (
  | { kind: 'bad_news',       news: VaultError }
  | { kind: 'lease_unerased', refusal: VaultError, vault: Vault | null, where: 'lock' | 'tombstone' | 'vacate' | 'outdated' }
  | { kind: 'vacated',        cause: VaultError, unerased: number }  // sent once the scrub settles, never awaited
  | { kind: 'helloed',        outcome: Outcome<void>, vault: Vault | null })
```

* `vacated` replaces both the panic on a revoked identity (`cause`) and the scrub's per-row panics, which become the `unerased` count.
* It's fired without being awaited, so a handler that awaits `bank.vacate()` still can't deadlock.
* `panic` stops being a kind: severity is policy too, so each event names what happened, and the host judges how bad it is.

**The contract holds:**
* Handlers are heard while the bank is enabled, and after a sweep or a vacate only from the vacate's scrub.
* `lock` and `vacate` stay synchronous.

**The cost of folding:** a breaking change in both packages.
* `onPanic`, `onBadNews`, `PanicHandler`, `BadNewsHandler`, `Panic`, `BadNews`, `DefaultOnPanic` and `DefaultOnBadNews` leave the exports and BankProviderProps.
* The README's advice to call the default from your own handler is rewritten.
* bank-ending.test.ts and the provider tests are rewritten.

Without row 4, keep both callbacks beside the new one.
