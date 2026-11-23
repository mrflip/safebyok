# Thread 12: box_persist (2026-11-23)

Branch `20261123-box_persist`, PR [#856](https://github.com/mrflip/safebyok/pull/856), stacked on [#854](https://github.com/mrflip/safebyok/pull/854). Proved: `safebyok` 1459 tests, `safebyok-idb-lean` 112, lint and typecheck of both; `pnpm justify` pending.

Option **B** of `box_persist-plan.md`: one boxes snapshot per user and bank.

* **Built**:
  * `DevicePersisters` is `{ roots: Persister, boxes: PersisterOfBank }`, with `PersisterOfBank = (scope: BankScope) => Persister`
    exported from `safebyok` and `safebyok/storage` (`packages/safebyok/src/storage/persister.ts`). Its doc block has the
    example a host copies: `boxes: ({ userid, banklabel }) => new IdbPersister({ recordlabel: \`boxes:${userid}:${banklabel}\` })`.
  * `Minder.persist(queryClient, persister, scope?)`: with a scope, `shouldDehydrateQuery` keeps only queries whose
    first three key segments hash as that bank's head (`bankHashOf(bankKeyHeadOf(scope))`); without one, the whole client
    as before (`saveOptsOf` replaces `SaveOpts` in `minder.ts`).
  * `Device`: `hello` restores `roots` only. `#bringUp` awaits `hello`, then `#restoreBoxes(this.scope)`, then the
    minders' `hello`s. `#restoreBoxes` calls the host's `boxes(scope)` once, checks the answer is a Persister
    (`Checks.persister`), and tells `onBadNews` of a throw, a non-Persister (`bad_record`) or a failed restore; the bank
    comes up all the same, with that cache empty. `Device.make` checks `boxes` is a function.
  * Tests: `device.test.ts` (*a device's persisters*: boxes restored at signIn from the scope's persister, stage
    `starting` until then; a record per bank; restore failure and non-Persister told to onBadNews; make refuses bad
    `roots`/`boxes`), `minder-persist.test.ts` (scope saves only its bank from a shared client), idb-lean's device
    restore through per-bank `IdbPersister`s.
  * `safebyok-idb-lean` README and `IdbPersisterOpts` doc show the per-bank record. TODO.md has the size-limit entry.
* **Decisions made**:
  * The four plan questions as the handoff decided them. Stage: the boxes restore runs inside `#bringUp` before the
    cached world is attached, so the stage stays `starting` through it; no new stage.
  * Plug shape: a bare function type rather than a `persisterOf(recordlabel)` for both clients, since `roots` stays one
    record and only `boxes` varies by bank.
  * `Minder.persist` takes an optional scope rather than a second method: one TanStack loop, one predicate.
  * A host `boxes` that throws or answers a non-Persister is bad news, not a failed sign-in: persistence is optional,
    and the bank still comes up from the vaultDB.
* **Deviations**:
  * **Size limit**: the Coach (via the orchestrator) changed item 4 mid-thread: no comment in code, one TODO.md entry.
    Done; no comment at `IdbPersister` or `DevicePersisters`.
  * **"The same onBadNews"** (Closer Look 1.5, doc part): not literally possible. `Device.make`'s `onBadNews` takes a
    `BadNews` (`{ news, device }`), an `IdbPersister`'s takes a bare `VaultError`. The doc block and README instead show
    one `reportRefusal(news)` used by both: `onBadNews: ({ news }) => { reportRefusal(news) }` on the device, and
    `onBadNews: reportRefusal` on each persister.
  * **Changeset**: the handoff said idb-lean is published and wanted a minor changeset; it is `private: true` and the
    changeset script refuses it, so the changeset is empty. What a host must change is in the PR body and README.
* **Discoveries**:
  * A snapshot under the old single `boxes` record is never read again (no migration, per the pre-1.0 rule); it sits in
    IndexedDB until removed.
  * `device.test.ts`'s record-per-bank test shows two users' records stay apart; the filter itself is shown in
    `minder-persist.test.ts`, since a device's client holds only its one user's boxes.
* **For the Coach**: whether `IdbPersister`'s `onBadNews` should take the device's `BadNews` shape, so one handler
  serves both (Closer Look 1.5, not ruled).
