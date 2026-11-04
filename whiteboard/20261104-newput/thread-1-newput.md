# Thread 1: newput (2026-11-04)

Branch `20261104-newput`, PR [#470](https://github.com/mrflip/safebyok/pull/470), off main at b83afc28. Justify: green at the tip (core 4889 passed, 37 skipped; every package green), and at each commit but 90cf9b74 (see Discoveries). Reworked after review: see *The rework*.

Spec: `whiteboard/20261102-newdesign/newput-plan.md` in the base checkout (untracked there).

* **Built**, in the plan's commit order:
  * 1, void sentinels: `VoidRevision` and friends; a new instance's central is the one stable void revision.
  * 2, `demandNotHeld` out; its tests re-made by hand from stash 0.
  * 3, the VaultDB's `ifAbsent`: `VS.putIfAbsent`, defaulting `'add'`, `PutTerms.mayAdd` enforced by `MemoryVaultDB`. Pinned in `tests/storage/vault-db-new.test.ts`.
  * 4, `listing.put(record, { prior, ifAbsent, ifPresent })` answers the instance held. `putDraft`, `priorOf`, `ante` gone.
  * 5, nothing depends on `hello`: `#ensureGreeted` gone; `boxListing.get` owns what `vault.getBox` did.
  * 6, split in two. The rename: `box.send` is `box.put`. The chute: `boxListing.puttable`, `create`, `box.put` sealing over the revision it took on entry, `vault.putBox` as sugar.
  * 7, plain demands in `box.expose` and `vault.hello`; `ensureExposable` gone. `vault.unlock` went plain too, and got `ensureAttachable` back in the rework.
  * Probes pinned in `tests/models/vault-boxes.test.ts` ("a void instance, then a put"); every row of the plan's table held. No suppression added: no `@ts-expect-error`, no `eslint-disable-line`.
* **Decisions taken**:
  * `VoidRevisionTok` is the zero UUID as well as `VoidLifeTok`: the plan's ruling says "a zero tok".
  * `#demandRecordOfScope` moved into `deliver`'s two paths, the only place the scope asked can differ from the record's.
  * The put's checker is `putIfAbsent` in both `VS` and `MSX`, beside the get's `ifAbsent`.
  * `boxListing.demandUsable()`, `get`'s demand, asks `world.demandBoxesUsable()` first, then `demandEnabled()`, so `vault_gone` beats `vault_locked` and the listing's `disabled`. `BoxWorld` grew `demandBoxesUsable`.
  * `puttable` carries no demand (0bcf3288, STYLE.md's guard rule): it only prepares a put, and `box.demandPuttable` carries the vault's. There, `demandEnabled` comes first: a box already disabled hears `disabled`, a deleted vault with a box still enabled hears `vault_gone`. Set aside: a demand in the vault's sugar (ruled: no logic there).
  * One checker, `MSX.boxPutOpts`, for `box.put` and `puttable`: timely options strip. Lint forbids the name `createOpts`, hence `boxCreateOpts`.
  * The changeset is empty and VOCABULARY.md untouched: nothing here is exported.
* **Deviations**:
  * The plan handles a null answer in `fetch` (`this.at(scope)?.receive(null)`). It is in `#receiveNothing`, reached from `deliver`'s good path, because a del's `void` answer also delivers null, and `del` is out of this thread.
  * `create` keeps `boxDna.parse` (both halves required, sealed parts refused), unlike the pseudo code. So for `create` `boxDna` refuses a record first, and `puttable`'s record check matters for `putBox(…, { ifPresent: 'fail' })` and a direct `puttable`. `puttable` gets the raw input.
  * `{ ...patch, ...this.scope }`, not the plan's `{ ...this.scope, ...patch }`: a patch may hold `undefined` scope props, and this leaves a wrong-vault patch to `box.put`'s `bad_option`, as today. The cost is a harmless void shell.
  * The plan expects `create`-over-held tests to become `stale_write` tests. Under `create`'s `ifPresent: 'fail'` a live row answers `camped`; over a tombstone held, a `create` lands at the next seq. `stale_write` is a `repl` put missing its `prior`, which is what a void instance over an unlisted row hears.
* **Discoveries**:
  * 90cf9b74 was pushed with one test red: my scratch justify wrapper's exit status was its filter's. The next commit repairs it.
  * `vault.putBox` of a sidecar alone over a box stored but not listed seals and puts over the void revision, no fetch, and hears `stale_write` with the frontier; its retry keeps the whisper. Over a damaged row not listed it hears `damaged_record`, the row standing.
  * `vault.delBox` of a stored box not held now goes over the sentinel and hears `stale_write`, frontier delivered, a retry landing. Pinned in `vault-boxes.test.ts`; see *For the Coach*.
  * A refused put leaves a void shell: in `things`, not the snapshot. The next `create` reuses it.
* **The rework** (the Coach, 2026-11-04):
  * **The shell stays timely, by ruling.** `#shellFor` goes through `receive`, so a void is whole and timely, absence in the listing is trusted, and a put over a stored box fails `stale_write`, frontier delivered: the right answer. A birth fetches nothing. A correction in between (hold the void with no `receive`, so `put` fetches) was built and withdrawn the same hour: nothing of it landed.
  * **`box.demandPuttable(patch)`** parses, checks consistency, then enabled, vault usable, whole (`Storable.demandWhole`), and answers the parsed patch. A void or a tombstone is whole. A sparse record isn't: `hydrate` fetches for it, and one still sparse after that is refused `bad_option` (`PartialLoad`). `put`: `puttable`, then `await ensurePuttable(timely); const given = demandPuttable(patch)`, the seal, `demandPuttable(patch)` again with nothing awaited before the put.
  * **A bad patch costs its ensure**: an `ensureTimely`, and a `get` if the box is sparse, before `bad_option`. Accepted. It is still refused before any demand, so the Coach's 2026-10-31 "first of all" tests now pin no `put` and the order of refusals, not no calls.
  * **A birth defaults both halves** (ruling). Over a tombstone or void, `#edit` takes `whisper ?? { val: {} }` beside the sidecar's `{}`, and `boxDna` fills both, so `create` works with neither. `no_whisper` is gone from the models; `Phrases.NoWhisperToKeep` and the kind stay for `src/vault.ts`, the sentence back to its text on main, since this thread's rewording about listing and `vault.hello()` isn't true of that Vault. `box.put` naming neither stays refused by `boxPatch`, as a no-op.
  * **`BoxListing.get`**: only a present box hydrates, anything else asks storage. `isHeard` went, so a tombstone held asks storage on each `getBox` and hears a rebirth elsewhere. A birth still makes no `getBox`: `put` hydrates, it does not `get`.
  * **Refusal order**: when several things are wrong the Coach wants it predictable, no particular order, so the "first of all" describes now say "before any demand".
  * **`demandPuttable` before `puttable`** (the reviewer's suggestion) can't work: whole needs the ensure first.
  * **`vault.unlock`** has `ensureAttachable` back: a public entrypoint on a sparse vault refreshes rather than refuse `bad_option` from the Gating constructor. Pinned, and seen red without it. `expose` and `hello` keep plain demands.
* **Races, each a row and no fix**:
  * The central moving during `box.put`'s seal: `prior` was taken on entry, so the CAS answers `stale_write`. Pinned in `box.test.ts`.
  * `lock()` during the seal: `demandPuttable` after it refuses `vault_locked`, nothing stored. Pinned.
  * A sweep, vacate or lock crossing `box.expose`'s unseal: refused, nothing exposed. Pinned.
  * Two puts on one void shell: one lands, the other hears `stale_write` or `camped`. A vault deleted during a seal: its boxes are disabled, so the put hears `disabled`.
  * A dead `box.put` (disabled box) plants a shell, as `puttable` demands nothing. The next demand refuses it.
* **`newdesign-models.md` stale lines** (the Coach is editing it, so not touched): 94, 95 and 312 say `box.send`; 97 and 313 say `box.del=>listing.del`; 131 has `vault.hello` as the first box call.
* **For the Coach**:
  * **A sidecar alone over a tombstone is reborn with an empty whisper.** The deleted whisper does not come back, and a host that meant to keep it gets `{ val: {} }` with no refusal. This follows your ruling; say if it should read otherwise.
  * **`delBox` over a box not held.** `stale_write` then a retry, or a fetch first as `getBox` does? `del` is out of this thread and redesigned later, so I left it. Recommend settling it with `del`'s thread.
  * **Doc blocks.** Those marked `SLOPDOC` I renamed through but did not rewrite. Every one I wrote is one line of purpose; none refused to describe that way.
