# Hanging: bank-provider.tsx interactive session

Questions and issues either of us noticed, banked so we don't side quest. One bullet each; who raised it in brackets. Settled items move to provider-resolved.md. The start-up reads, the listings and the IndexedDB cache are in whiteboard/20261108-query_efficiently/query_efficiently.md, after the fate makeover.

## To confirm

* #600's calls, made by its worker: a bank row the scrub can't forget goes to `onBadNews`, a warning rather than an error; when listing the leases is refused, `vacated` says `unerased: 0` and the refusal goes to `onBadNews`. [agent, 2026-11-08]
* After a panic's vacate, does the provider remake the bank for the same `user_id`? A stale session would loop: make, panic, vacate. Recommended: no. The bank stays spent, `useVault` says `spent`, and a host that wants another hears `vacated` and remounts `<BankProvider key=…>`; a vacate forgets the device row (#598), so that gets a fresh `device_id`. Costs one README line. [Coach, agent]

## Small

* notes/wontfix.md, design-models.md, design-proof.md, gallant-test_titles.md and reference-timings.md still name `onPanic`. wontfix.md's rulings ("a host with no `onPanic` has given its opinion") need rereading against `onLifecycle`, not just renaming. [agent, 2026-11-08]
* `Listing.bankFriend` is `protected` in TypeScript only, so a host can reach it at runtime through the bank's vault listing. Recorded in guarantees.md and security.md; a real `#private` route if it matters. [agent, 2026-11-08]
* The context value is `{ bank, helloedVaults, tellBadNews }`, against the wish for `Bank | null`. `helloedVaults` goes with query_efficiently; `tellBadNews` stays while `vault-controls` reports refusals. [agent, 2026-11-08]

## Waiting on a host

* The device is named before the user and the bank: `device_id` comes down with, or before, `user_id`, as a thing the app provides, and we give it a tool to get one (today's `useDeviceId` / `ensureBank`). The bank's real identity is then `(device_id, applabel, user_id)`, which we could form into a `bank_id`. An optional `device_id` prop on BankProvider (skip the fetch when the host has one) is the small form; exporting `useDeviceId` / `useHeldBank` the other. Adding an export later is cheap and removing one breaks semver; the core plus `useSyncExternalStore` is already the full-control escape hatch. [Coach]

## Later

* Add buttons to one of the Backdoor (devmode inspector) panels that simulate a revoked identity (panic and vacate), a sweep, a failed lease erase. [Coach]
* A demo that uses this to make a "doppler-lite" (a secrets manager in miniature). [Coach]

## Core

* `fateOver` / `buildOrReceive` / `deliver` / `reconcileCentral` / `takeWorld` are too complex and due for a makeover; query_efficiently waits on it. Code nominated for machinery there goes on the list of accusations; other code shouldn't do work to cover for them. Accused so far: `Listing.deliver` awaiting around synchronous work, and the lazy `Vault.boxListing` getter with `hydrate`'s fast path on a disabled vault (whiteboard/20261108-bank_disable/thread.md). [Coach]
