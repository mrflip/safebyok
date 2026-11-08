# Hanging: bank-provider.tsx interactive session

Questions and issues either of us noticed, banked so we don't side quest. One bullet each; who raised it in brackets. Settled items move to provider-resolved.md.

## For this PR

* `eslint-disable-next-line react-hooks/set-state-in-effect` in `useHeldBank`, on `setContextValue`: report it in the PR's open questions. [agent]

## After this PR

* Does the host's `user_id` blink to `null` after a wake? The provider vacates on any change of user, `null` included, so a blink erases the cached leases and the user unlocks again. Check what Convex Auth (`useConvexAuth`), Clerk and Auth0 do while a token refreshes or a socket reconnects after sleep, and whether the demo's auth blinks. The README's *Signing out* asks the host to keep it steady. [agent, 2026-11-08]
* A hello reads every box three times, and Convex's watch already sends what `listVaults` and `listBoxes` fetch: the adapter drops the watch's first answer. Priced in notes/reference-sizes.md, *A bank hello on Convex* (on #554). For the fate makeover: listings that watch only their own rows, the list taken from the watch's first answer, and sparse rows stored apart. [agent, 2026-11-08]
  * The Coach (2026-11-08): an adapter declares that its watch sends a starting snapshot, and the listing takes that as its list ("things vivify anyway"), not a list call served from the adapter's cache.
  * The Coach (2026-11-08): the vault listing watches vault rows, and each box listing its vault's boxes, with an update sending only the changed vault or box. On Convex a watched query re-runs whole and re-sends its whole answer, so that takes a head row per vault (a seq every write bumps), watched, and a `boxesSince(seq)` query over an index, with tombstones for deletions: about 2-3 KB per write per client, against 136 KB for own-rows watches and 1.5 MB today. Postgres's notice already carries only the box. The same seq would let a tab that keeps its rows ask for a snapshot since its last seq. [agent]

* passkey.ts has a checker of its own (`PasskeyChecks`), not moved into `src/shapes/`. [agent]
* Does `bank.tryHello()` tell bad news (through `onBadNews`) as well as landing its refusal in the snapshot? [Coach, fingerpaint in bank-provider.tsx]
* `setRefused`: what it's for, and whether the provider should hold it. [Coach, next] It now lives only in `useDeviceId` (provider-hooks.ts), for a refused `ensureBank`; a throw from `Bank.make` in the effect reaches the error boundary by itself.
* Building blocks for hosts who compose their own providers: an optional `device_id` prop on BankProvider (skip the fetch when the host has one), or exporting `useDeviceId` / `useHeldBank`. Adding an export later is cheap and removing one breaks semver, so wait for a host to ask; the core plus `useSyncExternalStore` is already the full-control escape hatch. [Coach]
* `hello` awaits the strength checker's `load()`, but only choosing a passphrase needs it: every sign-in waits on the zxcvbn dictionary (memoized per page, so only the first). Option: the guarded checker awaits its own `load` at first check, and `hello` only starts it. Cost: a broken dictionary fails at first check, not at `hello`. [agent]
* Does our `DefaultOnPanic` log everything it gets at error level? [Coach]
* After a panic's vacate, should the provider remake the bank for the same `user_id`? "Who are we to disagree" says yes, but if the session really is stale, the new bank's `hello` hits `identity_revoked` again: a make, panic, vacate loop against the host's server. Remake only on new props (`user_id`, `device_id`, or a future host "session" signal)? [Coach, agent]
* On a disabled bank, `useVault` reports `'waiting'` forever (its snapshot never reaches `ready`). It should say the bank has ended. [agent]
* Add buttons to one of the Backdoor (devmode inspector) panels that simulate these: a revoked identity (panic and vacate), a sweep, a failed lease erase. [Coach]
* A demo that uses this to make a "doppler-lite" (a secrets manager in miniature). [Coach]
* The gating dialog is imperative because `requestCleartext`'s contract is ("resolve when the user is done"). A more React-native design: the bank's snapshot exposes the open gating, the provider's dialog renders it, and cancel calls `gating.decline()`; `requestCleartext` stays for hosts with their own dialog. A core and contract redesign. [agent]
* The device is named before the user and the bank: `device_id` should come down with, or before, `user_id`, as a thing the app provides, and we give it a tool to get one (today's `useDeviceId` / `ensureBank`). The bank's real identity is then `(device_id, applabel, user_id)`, which we could form into a `bank_id`. [Coach]
* Lease caching does an Outcome-to-throw-to-Outcome round trip for one caller. `tryStow` answers an Outcome, `lease.cache` throws it (`valOf`), `lease.tryCache` catches it (`outcomeOf`), and `cacheAsCacheCan` tells bad news; its only caller is `Vault.#attachLease` (vault.ts:202). Collapse to one method and stop `cache`/`tryCache` being public. Decide explicitly what a vacated lease's `#demandRecord()` throw becomes (today: bad news `vault_locked`). [Coach, agent]
* `bank.tellBadNews`, `vault.tellBadNews` and `bank.askUser` are public and unchecked, as `panic` was: hide them as friend calls too? [review of 20261108-bank_disable]
* One `onEvent` for the bank's handlers, and the bank's events in React's event loop (a hook that subscribes): weigh after this PR. [Coach]
* A vault names itself in a panic as `{ modelkind, applabel, user_id, vaultlabel }`. Give the box listing `applabel`, `user_id` and `vaultlabel` at birth, which will probably shrink it (and retire the binding in `boxListingOf`). [Coach]
* `DefaultOnPanic` vacates the vault, then the bank: if it vacates the bank, it shouldn't do the other. An idempotent `vacate` makes sense. [Coach]
* A safe eventual-success primitive: an in-memory, very lightweight task queue that, outside the main loop, keeps retrying a job (a vacate's erase when storage is down) and logs when it can't. It answers the panic cascade plus unavailable storage. Hear the reviewer's take first. [Coach]
* `fateOver` / `buildOrReceive` / `deliver` / `reconcileCentral` / `takeWorld` are already too complex and due for a makeover. Code nominated for machinery there goes on the list of accusations; other code shouldn't do work to cover for them. [Coach]
* `helloedVaults` is React-side bookkeeping riding beside the bank in the context value. If the core kept "this Vault object has had its `tryHello`", the context could be just `Bank | null`. [agent]
* `BankProviderProps` is written by hand beside `providerProps`. STYLE.md *Validation* wants the type to come from the schema (`z.infer`) or be held to it. Cost: the per-field doc comments a host sees on hover. [agent]
* dev-device-db-inspector.tsx:14 holds a future note ("The bank rows … will sit beside its leases, as a table of their own"): route it to human/ or here, then delete it? [agent, Opus pass]
* passphrase-modal messages: `passphrasesDiffer` ": nothing is attempted" and `passphraseFirst` ": the browser is not asked" describe behaviour, not the message. Keep them for translators, or cut? [agent, Opus pass]
