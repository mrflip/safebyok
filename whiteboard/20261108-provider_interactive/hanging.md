# Hanging: bank-provider.tsx interactive session

Questions and issues either of us noticed, banked so we don't side quest. One bullet each; who raised it in brackets. Settled items move to provider-resolved.md.

## For this PR

Nothing open.

## After this PR

* **Next, stacked in order:** 20261108-bank_followups (running), then the lifecycle callback (lifecycle-callback.md, *Rulings*), then the react types into one shapes file, then the react comment tour. [agent, 2026-11-08]
  * Types: every type into one shapes file, `PassphraseModalProps` too, with `shapes-provider.ts` folded in. A single-use local alias (`SafeNavigator`) stays beside its use. The Coach: prop names are already in the destructure, it saves agents tokens, and the checkers can share props.
  * Comment tour, every react file but the provider, the hooks and the shapes: "is this comment necessary for a competent React programmer assisted by an agent?", or "would they plausibly undo something important without it?" An export keeps its first-line doc block, since the host reads it on hover.

The start-up reads, the listings and the IndexedDB cache moved to whiteboard/20261108-query_efficiently/query_efficiently.md.

* passkey.ts has a checker of its own (`PasskeyChecks`), not moved into `src/shapes/`. [agent]
* Does `bank.tryHello()` tell bad news (through `onBadNews`) as well as landing its refusal in the snapshot? [Coach, fingerpaint in bank-provider.tsx]
* Building blocks for hosts who compose their own providers: an optional `device_id` prop on BankProvider (skip the fetch when the host has one), or exporting `useDeviceId` / `useHeldBank`. Adding an export later is cheap and removing one breaks semver, so wait for a host to ask; the core plus `useSyncExternalStore` is already the full-control escape hatch. [Coach]
* Does our `DefaultOnPanic` log everything it gets at error level? [Coach] And do we log or tell bad news as we ought? [Coach, 2026-11-08]
  * Found 2026-11-08: `DefaultOnPanic` hands every refusal to `reportToPlatform` (the browser's `reportError`: an error event, and an uncaught error in the console), never to `bank.logger`. Where there's no `reportError` (Node, SSR, some test runners) a panic goes nowhere. `DefaultOnBadNews` does log, at warn, through `bank.logger`. The Coach said yes (2026-11-08): `DefaultOnPanic` also logs at error through `bank.logger`; building on 20261108-bank_followups. [agent]
  * Found 2026-11-08: the provider calls `void bank.tryHello()` and drops the outcome. A refused hello lands in the snapshot, but nothing tells the logger or `onBadNews`, while `useVault` does tell bad news for a vault's refused hello. Done 2026-11-08 (#597): the provider hands a refused hello to `onBadNews`, and tells nothing of one a sweep crossed. [agent]
* After a panic's vacate, should the provider remake the bank for the same `user_id`? "Who are we to disagree" says yes, but if the session really is stale, the new bank's `hello` hits `identity_revoked` again: a make, panic, vacate loop against the host's server. Remake only on new props (`user_id`, `device_id`, or a future host "session" signal)? [Coach, agent]
  * Still open, 2026-11-08. The Coach: could we ask the host to mint a new `device_id`? With a host-provided `device_id` (the `bank_id` item), a new one is a new key and so a new bank, and whether to retry is the host's call. A lifecycle callback (the `onEvent` item) would tell the host the bank was vacated. The Coach (2026-11-08): a vacate forgets the device row by contract; building on 20261108-bank_followups.
* On a disabled bank, `useVault` reports `'waiting'` forever (its snapshot never reaches `ready`). It should say the bank has ended. [agent]
* Add buttons to one of the Backdoor (devmode inspector) panels that simulate these: a revoked identity (panic and vacate), a sweep, a failed lease erase. [Coach]
* A demo that uses this to make a "doppler-lite" (a secrets manager in miniature). [Coach]
* The gating dialog is imperative because `requestCleartext`'s contract is ("resolve when the user is done"). A more React-native design: the bank's snapshot exposes the open gating, the provider's dialog renders it, and cancel calls `gating.decline()`; `requestCleartext` stays for hosts with their own dialog. A core and contract redesign. [agent]
* The device is named before the user and the bank: `device_id` should come down with, or before, `user_id`, as a thing the app provides, and we give it a tool to get one (today's `useDeviceId` / `ensureBank`). The bank's real identity is then `(device_id, applabel, user_id)`, which we could form into a `bank_id`. [Coach]
* Lease caching does an Outcome-to-throw-to-Outcome round trip for one caller. `tryStow` answers an Outcome, `lease.cache` throws it (`valOf`), `lease.tryCache` catches it (`outcomeOf`), and `cacheAsCacheCan` tells bad news; its only caller is `Vault.#attachLease` (vault.ts:202). Collapse to one method and stop `cache`/`tryCache` being public. Decide explicitly what a vacated lease's `#demandRecord()` throw becomes (today: bad news `vault_locked`). [Coach, agent]
* `bank.tellBadNews`, `vault.tellBadNews` and `bank.askUser` are public and unchecked, as `panic` was: hide them as friend calls too? [review of 20261108-bank_disable] The Coach said yes (2026-11-08); building on 20261108-bank_followups, React getting its own route to the host's `onBadNews`.
* One `onEvent` for the bank's handlers, and the bank's events in React's event loop (a hook that subscribes): weigh after this PR. [Coach]
  * The Coach (2026-11-08): what was meant is a callback the host hands us, through which we announce lifecycle events (a bank made, helloed, swept or vacated, a panic, a user switch), taking the policy that follows out of our hands. The host then decides what follows: vacating at sign-out, remaking after a panic, minting a new device_id. Surveyed and ruled 2026-11-08: lifecycle-callback.md. `onLifecycle` replaces `onPanic`, `onBadNews` stays apart; its own thread after 20261108-bank_followups.
* A vault names itself in a panic as `{ modelkind, applabel, user_id, vaultlabel }`. Give the box listing `applabel`, `user_id` and `vaultlabel` at birth, which will probably shrink it. [Coach] (`boxListingOf` is gone: the box listing is handed `this.panic`.) The Coach said do it (2026-11-08); building on 20261108-bank_followups.
* `fateOver` / `buildOrReceive` / `deliver` / `reconcileCentral` / `takeWorld` are already too complex and due for a makeover. Code nominated for machinery there goes on the list of accusations; other code shouldn't do work to cover for them. [Coach]
