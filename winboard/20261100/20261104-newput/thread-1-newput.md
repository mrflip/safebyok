# Thread 1: newput (2026-11-04)

Branch `20261104-newput`, PR [#470](https://github.com/mrflip/safebyok/pull/470). Justify: green at the local tip (core 4883 passed, 37 skipped; every package green). The Coach's fix list is built **locally and not pushed**: the PR still shows the branch from before the rebase, and its body is unchanged. Old tip tagged locally as `20261104-newput-prerebase-2`.

Spec: `whiteboard/20261102-newdesign/newput-plan.md` in the base checkout, section "Thread 1: the fix list for #470". Item 9 stays for Thread 4.

* **Built**:
  * Void sentinels: `VoidRevision` and friends; a new instance's central is the one stable void revision. `demandNotHeld` out.
  * The VaultDB's `ifAbsent`: `VS.putIfAbsent`, defaulting `'add'`, `PutTerms.mayAdd` enforced by `MemoryVaultDB`.
  * `listing.put(record, { prior, ifAbsent, ifPresent })` answers the instance held. `putDraft`, `priorOf`, `ante` gone. `prior` is a bare revision (`VS.revisionOf`): no ciphertext in an options bag.
  * Nothing depends on `hello`: `#ensureGreeted` gone; `boxListing.get` owns what `vault.getBox` did.
  * `box.send` is `box.put`. The chute: `boxListing.puttable`, `create`, `box.put` sealing over the revision it took on entry, `vault.putBox` as sugar.
  * Plain demands in `box.expose` and `vault.hello`; `vault.unlock` keeps `ensureAttachable`, for a sparse vault. No suppression added.
* **The fix list, as built**:
  * **`BoxListing.get`**: `at`, `fetch` when none is held, else `hydrate`, then `handleIfAbsent`. **A locked `get` now succeeds**, answering the sealed box; `extractWhisper` and `putBox` refuse `vault_locked`. A held tombstone within its horizon fetches nothing. `'nil'` gives null for a held tombstone. `put` and `del` skip `handleIfAbsent`: a `del` answers its tombstone. `BoxListing.demandUsable` gone.
  * **`isRefusalOfRow` gone**: `deliver` asks `isOwnRow`. It delivers a `dbhas` under any refusal kind, and a `stale_write`'s `dbhas` under another `vault_tok` stays undelivered with no bad news (test changed). f0a9fab2's test passes.
  * **`demandPuttable`** uses `boxPatch.parseConsistent`, and carries the recycled-data and absent checks. `box.put` no longer calls `puttable`. `puttable`: `at`, refuse only an empty slot under `'fail'`, else `held ?? shell`.
  * **`vault.putBox`** drops its parse; `boxPut`, `BoxPutGiven` and `Phrases.BoxPatchAdvice` went. **`#boxscopeOf`** and `boxlabelArg` went. A missing or bad `boxlabel` refuses `bad_scope` on `getBox`, `fetchBox`, `putBox` and `delBox`.
  * **Doc blocks** added or touched on the branch, tests included, rewritten to purpose. The two `SLOPDOC` blocks this branch changed were rewritten, their tag dropped; others left. `phrases.ts`'s "Why a..." openers stay.
* **Decisions taken**:
  * `VoidRevisionTok` is the zero UUID as well as `VoidLifeTok`.
  * `#demandRecordOfScope` moved into `deliver`'s two paths, the only place the scope asked can differ from the record's.
  * `demandPuttable` runs `demandEnabled` before the vault's demand: a box disabled hears `disabled`, a deleted vault with a box enabled hears `vault_gone`.
  * One checker, `MSX.boxPutOpts`, for `box.put` and `puttable`. Lint forbids `createOpts`, hence `boxCreateOpts`.
  * The changeset is empty and VOCABULARY.md untouched: nothing here is exported.
* **Deviations**:
  * **`create` keeps `boxDna.parse`, and the pin in item 4 can't hold as written**: see *For the Coach*.
  * The plan handles a null answer in `fetch`. It is in `#receiveNothing`, reached from `deliver`'s good path, because a del's `void` answer also delivers null, and `del` is out of this thread.
  * `{ ...patch, ...this.scope }`, not the plan's `{ ...this.scope, ...patch }`: a patch may hold `undefined` scope props, and this leaves a wrong-vault patch to `box.put`'s `bad_option`. The cost is a harmless void shell.
  * The plan expects `create`-over-held tests to become `stale_write` tests. Under `create`'s `ifPresent: 'fail'` a live row answers `camped`; over a tombstone held, a `create` lands at the next seq. `stale_write` is a `repl` put missing its `prior`.
* **Rulings to carry**:
  * **The shell stays timely.** `#shellFor` goes through `receive`, so absence in the listing is trusted, and a put over a stored box fails `stale_write`, frontier delivered.
  * **A birth defaults both halves**: `whisper ?? { val: {} }`, sidecar `{}`, and `boxDna` fills both. `box.put` naming neither stays refused. `Phrases.NoWhisperToKeep` and the `no_whisper` kind stay for `src/vault.ts`, at main's text.
  * **Refusal order is predictable, no particular order.** A bad patch costs its ensure before `bad_option`.
* **Discoveries**:
  * 90cf9b74 was pushed with one test red: my scratch justify wrapper's exit status was its filter's. Since then every commit is gated on the real status.
  * `vault.putBox` of a sidecar alone over a box stored but not listed hears `stale_write` with the frontier; its retry keeps the whisper. Over a damaged row not listed it hears `damaged_record`.
  * `vault.delBox` of a stored box not held goes over the sentinel and hears `stale_write`, a retry landing. Pinned.
  * Set aside: `demandPuttable` before `puttable`, or in `box.put` first of all: whole needs the ensure first.
* **Races, each a row and no fix**:
  * The central moving during `box.put`'s seal: `prior` was taken on entry, so the CAS answers `stale_write`. Pinned.
  * `lock()` during the seal: the second `demandPuttable` refuses `vault_locked`, nothing stored. Pinned.
  * A sweep, vacate or lock crossing `box.expose`'s unseal: refused, nothing exposed. Pinned.
  * Two puts on one void shell: one lands, the other hears `stale_write` or `camped`. A vault deleted during a seal: the put hears `disabled`.
* **`newdesign-models.md` stale lines** (the Coach is editing it, so not touched): 94, 95 and 312 say `box.send`; 97 and 313 say `box.del=>listing.del`; 131 has `vault.hello` as the first box call.
* **For the Coach**:
  * **`create({ ...record })` can't reach `recordForNewBox`.** Item 4 and the plan say `boxDna` strips record props, but it is `.strict()` and refuses `whisper_ciphered`, `box_key_wrapped` and `revision_seq` as `bad_option`, before any put, naming the fields it takes. Measured. Built for now: `boxDna.parse` stays, `put({ ...input, ...dna }, filled)`, the pin says `bad_option` with nothing stored and no shell left, and `Phrases.RecordForNewBox` is pinned through `box.demandPuttable` and `vault.putBox(..., { ifPresent: 'fail' })`. Options: **A**, keep this: same kind, nothing recycled, a different sentence, raw input moot. **D**, `boxDna` admits and strips sealed parts and `revision_seq`: a line in `models-shapes.ts`, `RecordForNewBox` heard, its pinned refusal cases flip, a refused `create` leaves a shell. **F**, drop `boxDna.parse` per the pseudo code: `boxDna` dies, labels go to `bad_scope`, most churn. Recommend D if the sentence matters, else A.
  * **A void shell answers absent.** Item 1's shape undoes the reviewer's 27f52e1e: a shell left by `puttable` or a refused `putBox`, say while locked, answers `absent_box` or null from `getBox` within its horizon, even with a box stored. `fetchBox` hears storage. A held tombstone likewise misses a rebirth elsewhere until its horizon. Recommend accepting, per the ruling.
  * **A sidecar alone over a tombstone is reborn with an empty whisper**, per the birth ruling; say if it should read otherwise.
  * **`delBox` over a box not held**: `stale_write` then a retry, or a fetch first? Recommend settling it with `del`'s thread.
