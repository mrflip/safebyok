# Preplan: vault.ts reads one method at a time

Stacked on #334 (`20261028-heed_inline`), which removed `RefusalPolicy.heed`. Raw material:
`gripeoween-vault-smells.md` beside this file (line numbers there are main's before #334).
One thread; a natural split point after step 4 if the PR grows past review size.

## The ruling

The Coach, 2026-10-28, on how a vault method reads:

1. **VaultDB describes what happened.** Refusal kinds, messages and `meta` are minted there.
2. **The vault, on success, orchestrates what to do with it.**
3. **The vault, on failure, decides which plans to run**: a skinny try, a fat catch that dispatches.
4. **Plans decide how to respond.** `putBox` never decides whether to lock; `#onStorageRefusal` does.

Plus: methods readable and consistently ordered; action plans named for the act
(`onStorageRefusal`), not the Apollo binder number; not over-DRY; a clean stack trace beats a
bento box; a one-caller helper folds unless its name is earning its keep (`#capacity` does).

## Steps, each a commit with justify green

### 1. The refresh ladder (smells §1, §3; answers GW-21)

Today: `hello → #helloWithin → #refresh (oneAtATime) → #refreshOnce → #takeStorage → #judgeStored
→ #takePicture → #replaceSnapshot`. After:

- `refresh()` public; `#refreshIfStale(staleMillis)` (was `#helloWithin`); `#refresh`, still
  `oneAtATime`, but a method body a trace can name, not a field holding a closure.
- `#doRefresh()`: the orchestration. A skinny try around `#loadFromStorage()`; its fat catch
  marks the refresh refused, forces the next one (`#forceNextRefresh()`, replacing the three
  `#refreshedAt = FarPast` sentinel writes), republishes, dispatches `#onStorageRefusal` where
  the load's answer was a refusal, and rethrows. On success, in this order: the gone/remade checks
  (`#becomeGone`), the `behind` check (`#onStorageRefusal(bad(behindError()))`), the
  older-than-in-hand skip, `#applyVault(found)` (was `#takePicture`), `#noteEpochSeen(epoch, 'refresh')`
  (was `#raiseRecordAfter`), the recovered-after-warning log. `#refreshOnce` and `#judgeStored` go.
- `#loadFromStorage()`: three reads and nothing else, returned as one plain object. The device
  record first, then `getVault`, then the kept lease, as three awaits, not `Promise.all`. The
  comment on the ordering is rewritten to say it plainly: *read the device record before storage,
  or a write of this device's own that bumps the record while storage's answer is in flight has
  that answer, served before the write landed, judged behind a record it could not have known.*
- `#freshen(gating)` folds into its caller as `#refreshIfStale(0)` plus the landed check.

### 2. The device-record seam (smells §4; GW-27's rule)

`deviceRecordFor(scope, valOf(await deviceDB.tryGetDeviceRecord(scope)))` at `vault.ts` and twice
in `bank.ts`: the parse-and-consistency check moves inside `DeviceDB.getDeviceRecord` (and
`raiseDeviceRecord`), next to the storage, so each resolves a checked `DeviceRecord | null` and the
callers read `await this.#deviceDB.getDeviceRecord(this.#scope)`. `deviceRecordFor` becomes
module-private or goes. Not a `Device` class: the record is stored plain data, as the house has it.
`DeviceDB` is exported; pre-1.0, a patch changeset saying the throwing forms now validate.

### 3. The box ladders (smells §2, §3, §4)

- Private `#getBox` → `#getBoxFromStorage`; `#getBoxUnlocked` folds into `getBox` and `getWhisper`
  (six lines each): a name that promised the opposite of what it did.
- `putBox`: `#sealAndPutBox` folds in (it existed to order `#demandLease` after `#ensureUnlocked`);
  `#putOver` → `#putBoxOverBase`, or its one remap (`vault_mismatch` → `stale_write`) moves into
  `putBox`'s catch; `#damagedBase` folds into `#listedBase`'s one caller; `#listedRevisionOf` and
  `#isListedDamaged` fold into `delBox`.
- `shouldAsk` into `#ensureUnlocked`: callers check `#isListed(label)` themselves and `ensure`
  always ensures.
- `#demandAfterWait(x, { vault_tok: this.vault_tok }, …)` at four sites is `#demandNotGone()` plus a
  hidden rethrow of `UntrustedStorageKinds`: write both out at the sites.

### 4. Failure plans named for the act (smells §1, §2)

- `#heardRefusal(thrown)` (maps a throw to a VaultError, tells the news, returns it for the
  caller's `throw`) → `#onRefused(thrown)`. Every public method's catch then reads
  `catch (err) { throw this.#onRefused(err) }`: the fat catch dispatching, point 3 of the ruling.
- `#boxGetRefusal`, `#gatePutRefusal`, `#leaseRefusal` are named as pure mappings and each lets
  the vault go or drops the lease. → `#onGetBoxRefused(err)`, `#onPutGateRefused(gate, err)`,
  `#dropEndedLease()`: plans, point 4.
- The bad-news pipeline's six verbs (`#hearBadNews`, `#tellBadNews`, `#tellListingNews`,
  `#tellWayinNews`, `#heedLateThrow`, `#handlerThrew`) → `#reportBadNews(news)` (once, then publish)
  and `#reportNewDamage(shownBoxes, shownWayins)`; the handler-rejection catch folds into
  `#reportBadNews`.
- `call: 'untrustedStorage'` in `VaultCall` is a log tag, not a call: `#onStorageRefusal` logs under
  the call that met the refusal (pass `call` with the Outcome, or take it from `meta`).

### 5. One locking (smells §2; Coach-gated)

Three lockings by hand: `#lockNow`, `#onStorageRefusal`'s, `#afterDel`'s. They differ in what the
gating lands on (`undefined` vs the refusal) and whether the device lease is erased. **Read
`notes/guarantees.md` *The guarantees* first.** If one `#lockVault(told?: VaultError)` serves all
three without a flag that hides the difference, do it; if a flag is needed, stop and ask. `#lockNow`
is named sync and returns the erase's promise: `lock()` reads `valOf(await this.#lockNow())`; the one
locking resolves void or throws.

### 6. The gating and proving tools (smells §4; interface change)

Thirteen closures in the constructor; six are `async (x) => await this.#x(x)`, a frame named
`freshen` over `#freshen`. At least: `(x) => this.#x(x)`. Better: gating and proving reach the
vault through one symbol-keyed getter with methods, as `[provingTools]` already does. The
`demand:` closure adapts `(thing, call, opts)` to `#demand(thing, { call, firstGate })`: give
`#demand` the tools' shape. The `heardRefusal:` closure has gating.ts convert throws the vault's
own catch converts again: gating rejects raw, the vault's one catch converts. This step touches
`gating.ts`'s interface: propose the shape in the thread file before cutting it.

### 7. Residue, one commit

`#letGo(told)` → `#becomeGone(refusal)`, `[letGo]` calling it with null; `#modelled` →
`#wayinsByGate`; `#gatedRecord()` → `#demandGated()`; `#watchStorage`/`#watchRefresh` →
`#subscribeToStorage`/`#refreshOnRing`; `#heedListener` → `#callListener`; `#takeOwnPut` →
`#acceptOwnWrite`; `#takeUpAtBirth` and `#takeUpFromPantry` share one `#takeUp(kept, renewMillis)`;
`#leasesHeld`/`leasesSeen` named for what they order (`#leaseGeneration`); "picture" struck from
the ~20 doc blocks once GW-02's `#snapshotAt` rename lands (coordinate, or do GW-02's vault.ts
part here and say so); `#checkedBoxlabel` parses the one field, not the whole scope.

## Open for the Coach, not blocking

- `#goneBy` holds a factory, not the refusal, so each `#demandNotGone` throws a fresh Error with
  its own stack. Likely deliberate (one Error object thrown from many calls shares a stack and an
  identity the snapshot compares on). Keep, and say so in a comment? Or hold the refusal and
  throw a copy?
- `#replaceSnapshot` decides "changed" by `stableJsonify` of the whole snapshot on every call,
  trouble compared by identity. Fine until shown slow; a reviewer will ask. A one-line comment.
- `useWhisper` is the one public method with no try and no `#demandNotGone`, by design. The class
  doc states the pattern; the member should say it is the exception.
- `DeviceDB.raiseDeviceRecord` keeps "raise" (it is a max-write, the word is honest); only the
  vault's `#noteEpochSeen` renames. Confirm.

## Out of scope

GW-02's non-vault renames, GW-03's messages, GW-18, GW-19, GW-22. Anything in `gating.ts` beyond
the tools' shape (step 6). `bank.ts` beyond step 2's two sites.
