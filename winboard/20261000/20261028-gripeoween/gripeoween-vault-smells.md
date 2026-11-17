# gripeoween: vault.ts smells

Scope: `packages/safebyok/src/vault.ts` at `origin/main` (f84d61bb), every section, read one method at a time against the Coach's standard (route; skinny try, fat catch; named action plans). Line numbers are main's.
Left out: `RefusalPolicy.heed` and the `outcomeOf(() => this.#vaultDB.X())` rewraps (ruled, in flight), and names VOCABULARY.md owns (gating, lease, wayin, pantry, take up, raise a gating).

## 1. Names that do not say what the method does

- `#takeStorage` (1002): reads the device record, then vault record + listing + kept lease, judges them, applies them, raises the device record. Plain: `#refreshFromStorage`.
- `#takePicture` (1054): replaces `#vaultRecord`/`#boxes`/`#damagedBoxes` from a read, drops a lease that no longer fits, publishes, tells news. Plain: `#applyRead(found)`. [GW-02] renames `#picture`; "the picture in hand" then survives in ~20 doc blocks with nothing named picture.
- `#judgeStored` (1030): named like a pure verdict (`record | 'ignore' | 'behind'`) but throws gone/remade and calls `#letGo` on the way. Plain: fold its four branches into `#refreshFromStorage`.
- `#raiseRecordAfter` (1098): [GW-21].
- `#helloWithin(staleMillis)` (1081), nine mentions: refresh if the last read is older than `staleMillis`, then republish. Plain: `#refreshIfStale(staleMillis)`.
- `#freshen(gating)` (1277): `#helloWithin(0)` plus 'gating_landed' if the gating landed. Plain: `#refreshForGating(gating)`, or hand gating.ts `#refreshIfStale(0)` and let it check `landed` itself.
- `#letGo(told)` (1428): makes the Vault object gone; `told === null` means the bank did it, else the bank is told. Two acts under one verb that is also the bank's public `[letGo]`. Plain: `#becomeGone(refusal)` and `[letGo]` calling it with null.
- `#landGating(told?)` (1272): one line, `this.#gating?.landLock(told)`. Fold at its four call sites.
- `#takeOwnPut(next)` (1369): accepts the vault record this Vault's own `putVaultRecord` stored, unless a refresh outran it. Plain: `#acceptOwnWrite(next)`.
- `#storedBase` (1681): [GW-02] (`#fillFromStored`). `#listedBase` (1663) and `#damagedBase` (1708): "base" is right (BoxBase), but `#damagedBase` is `#listedBase` minus `registered_at`, one call site. Fold.
- `#putOver(box)` (1717): puts the box over its base revision and remaps 'vault_mismatch' to 'stale_write'. Plain: `#putBoxOverBase(box)`, or inline the remap in `putBox`'s catch.
- `#gatedRecord()` (1181): reads as a getter; it is a demand ('absent_vault' while novel), one call site. Plain: `#demandGated()`.
- `#heardRefusal(thrown)` (1773): turns any throw into a VaultError and tells bad news. Past-tense "heard" says nothing of either. Plain: `#refusalOf(thrown)` is wrong too (side effect); `#reportRefusal(thrown)`.
- `#heedRefusal(refusal)` (1403): lock when `RefusalPolicy.decide` says so, else nothing. The Coach's own name: `#onStorageRefusal`. [heed thread] for its plumbing, not its name.
- `#hearBadNews(err)` (1787) / `#tellBadNews(news)` (1797) / `#heedLateThrow(answer)` (1810): hear = "tell once, then publish"; tell = "set trouble, call `onBadNews`"; heedLateThrow = "await the handler's promise, catch its rejection". Plain: `#reportBadNewsOnce`, `#reportBadNews`, `#catchHandlerRejection`.
- `#heedListener(listener)` (965): calls one subscriber, logging a throw. Plain: `#callListener`.
- `#watchStorage` (1087) subscribes; `#watchRefresh` (1756) is the ring handler. Plain: `#subscribeToStorage`, `#refreshOnRing`.
- `#boxGetRefusal` (1622), `#gatePutRefusal` (1349), `#leaseRefusal` (1166): named for what they return (STYLE: no side effects), yet each lets the Vault go or drops the lease. Plain: name the act, `#onGetBoxRefused(err)`, `#onPutGateRefused(gate, err)`, `#dropEndedLease()`.
- `#ensureUnlocked(renewMillis, shouldAsk?)` (1204): resolves false without ensuring when `shouldAsk()` says no. An `ensure` that may not. Plain: callers check `#isListed` before, and this stays an ensure.
- `#modelled` (904): a WeakMap of gate record to its made ways in. Plain: `#wayinsByGate`.
- `#lockNow()` (1389): named sync, returns `Promise<Outcome<void>>` (the erase), so `lock()` reads `valOf(await this.#lockNow())` (424). Plain: `#lockAndEraseLease()`, resolving void or throwing.
- `call: 'untrustedStorage'` (1414, 1417) in `VaultCall`: a log tag that is not a call. The log line should name the call that met the refusal.

## 2. Near-duplicate names

- `#heardRefusal` (1773) vs `#heedRefusal` (1403): one tense apart, unrelated jobs (convert-and-report vs lock-on-untrusted-storage). See section 1 for both. [heed thread] touches the second.
- `#hearBadNews` / `#tellBadNews` / `#tellListingNews` / `#tellWayinNews` / `#heedLateThrow` / `#handlerThrew` (1781-1853): six verbs for one pipeline. Two names would do: `#reportBadNews(news)` and `#reportNewDamage(shownBoxes, shownWayins)`.
- `getBox` (575) → `#getBoxUnlocked` (1587) → `#getBox` (1600): the private `#getBox` shares the public name and is the storage read; `#getBoxUnlocked` is the one that *makes* the vault unlocked, the opposite of what its name promises. Plain: `#getBox` to `#getBoxFromStorage`; `#getBoxUnlocked` folded into `getBox` and `getWhisper` (six lines, twice).
- `refresh()` (304) / `#refresh` (978) / `#refreshOnce` (984) / `#helloWithin` (1081) / `hello()` (281): `refresh()` does not call `#refresh`; it calls `#helloWithin(0)`, which calls `#refresh`, which calls `#refreshOnce`. One name, `#refreshIfStale`, and one body.
- Five "take"s: `#takeStorage` (read), `#takePicture` (apply), `#takeOwnPut` (accept), `#takeUpFromPantry` and `#takeUpAtBirth` (adopt a lease; house vocabulary). Only the last two earn the word.
- `#lockNow` (1389), `#dropLease` (1443), `#heedRefusal`'s lock (1419-1421), `#afterDel` (1302): three lockings written out by hand. `#lockNow` is `#landGating(); #dropLease(); tryDelLease`; `#heedRefusal`'s is the same with `#landGating(refusal)`. One `#lockOn(told?)`.
- `#letGo` (1428) / `[letGo]` (764) / `#goneBy` (885) / `[goneBy]` (767) / `#onGone` (795): a reader meets `this.#goneBy !== null` and `this.#goneBy()` ten times each; the field holds a factory, not the refusal (section 5).
- `#listed` / `#listedOf` / `#isListed` / `#isListedDamaged` / `#listedRevisionOf` (1527-1584): five one-liners over two arrays; `#listedRevisionOf` and `#isListedDamaged` have one caller each (`delBox`). Fold those two into `delBox`.
- `#demand` / `#demandAfterWait` / `#demandLease` / `#demandNotGone` / `#inconsistencyWith` / `#provingInconsistency` / `#leaseRefusal` (1105-1187): the demand family is the file's spine, fine; but `#demandAfterWait` also rethrows `UntrustedStorageKinds` first (1131), which its name hides.

## 3. Layer ladders

- `hello` → `#helloWithin` → `#refresh` (oneAtATime) → `#refreshOnce` → `#takeStorage` → `#judgeStored` → `#takePicture` → `#replaceSnapshot` → `#picture`. Fold `#refreshOnce` (its catch and recovery log) and `#judgeStored` into one `#refreshFromStorage` with a skinny try and a fat catch; keep `#applyRead` (shared with the constructor) and `#replaceSnapshot`.
- `getBox` → `#getBoxUnlocked` → `#ensureUnlocked` → `#helloWithin` → ...; then `#getBox` → `#boxGetRefusal` → `#letGo`. Fold `#getBoxUnlocked`.
- `putBox` → `#sealAndPutBox` (one caller) → `#storedBase` → `outcomeOf(#getBox)`; → `Box.trySeal`; → `outcomeOf(#putOver)` → `#putOver`'s try/catch → `#vaultDB.putBox` → `#updateBoxListingOf`. `#sealAndPutBox` exists only to place `#demandLease` after `#ensureUnlocked`: fold into `putBox`.
- `putWayin` → `#gatingFor(kindNow)` → `#raiseGating` → `RaisedGating.raise`/`run` → `tools.freshen` → `#freshen` → `#helloWithin(0)`; → `tools.putGate` → `#putGate` → `#gatePutRefusal` / `#takeOwnPut` → `#replaceSnapshot`. The vault half is four rungs before gating.ts; `#freshen` is the rung to fold.
- `del` → `#gatedRecord` + `#gatingFor(() => 'del_vault')` → gating → `tools.delVault` → `#delVault`; `tools.afterDel` → `#afterDel` → `#lockNow` + `#letGo` + `#raiseRecordAfter`.
- `#ensureUnlocked` → `#raiseGating` → gating → `tools.takeUp` → `#takeUpFromPantry` → `#fitsTakeUp` → `#holdLease` → `#armExpiry`. `#takeUpAtBirth` (1500, one caller) repeats `leaseOn` + `#fitsTakeUp` + `#holdLease`: one `#takeUp(kept, renewMillis)`.
- `lock` → `valOf(await #lockNow())` → `#landGating` → `gating.landLock`; `#lockNow` re-implements `#dropLease` plus one line.

## 4. Wrappers and indirection

- Constructor's `tools`, `#provingTools`, `#gatingTools` (833-856): thirteen closures, six of the form `async (x) => await this.#x(x)`, each a stack frame named `freshen`/`putGate` over `#freshen`/`#putGate`; gating.ts reads `this.#tools.putGate(...)` and the reader comes here to learn which private it is. Plain: `(x) => this.#x(x)` at least; better, gating and proving reach the Vault through one symbol-keyed getter as `[provingTools]` already does, with methods, not closures.
- `demand:` (835) reshapes `(thing, call, opts)` into `#demand(thing, { call, firstGate })`: an adapter between two signatures of one function. Give `#demand` the tools' shape.
- `heardRefusal:` (854): hands the public-call catch helper into the gating so an attempt's throws are converted there (gating.ts 256, 269, 279). The gating then converts what the vault would convert again in its own catch. Plain: gating rejects raw; the vault's one catch converts.
- `Promise.all([getVault, KeptLease.tryGet])` (1010): two awaits read better; the comment above (1005) says order is load-bearing for the device record, so sequential reads make the ordering visible. [GW-15] (thread 7 is in `vault.ts`'s try pairs; confirm it covers this site).
- `valOf(await ...)` and `valOf(x)` at 424, 654, 707, 1007, 1024, 1228, 1253, 1489, 1656, 1660: each is "await a `try` form, demand, unwrap" where a throwing form exists. [GW-15].
- `outcomeOf(() => this.#getBox(...))` (1682) and `outcomeOf(() => this.#putOver(box))` (1655) wrap *private* methods, not the VaultDB; likely outside the heed thread's rewrap list. Same cure: one catch.
- `#boxGetRefusal`, `#gatePutRefusal` (1622, 1349): `if (! got.ok) { throw this.#xRefusal(got.err) }`, a catch that calls a function to get the thing to throw. Plain: the mapping inside the catch, or a named `#onGetBoxRefused` that throws.
- `kindNow` closures (499, 534) handed to `#gatingFor(kindNow, call)`: a chooser re-run each loop turn that may also refuse (`passkeyBeforePassphrase`, 'absent_wayin'). The loop re-runs only while a gating of another kind is pending.
- `shouldAsk` predicate to `#ensureUnlocked` (605, 697, 1590): three callers pass `() => this.#isListed(label)` and read `false` back as "still locked, did not ask", then throw their own refusal. Plain: `if (! unlocked && ! this.#isListed(label)) { throw absentBox() }` before `await this.#ensureUnlocked(0)`.
- `readonly #refresh = oneAtATime(() => this.#refreshOnce())` (978): a field holding a wrapped closure, so `this.#refresh()` is not a method and the trace shows `oneAtATime`'s inner function.
- `registerLeaseGetter(this, () => this.#lease)` (832): [GW-22].
- One-caller helpers a reader must jump to: `#listedRevisionOf`, `#isListedDamaged`, `#damagedBase`, `#gatedRecord`, `#leaseLastsPast`, `#freshness`, `#capacity`, `#landGating`, `#watchStorage`, `#takeUpAtBirth`, `#takeOwnPut`, `#freshen`, `#sealAndPutBox`, `#heedLateThrow`. Not every one should fold; `#capacity` and `#leaseLastsPast` earn their names.
- `#demandAfterWait(x, { vault_tok: this.vault_tok }, ...)` (704, 1604, 1659, 1683): a demand on a literal made of the vault's own `vault_tok`, which can only fail as gone/remade: `#demandNotGone()` in disguise, plus the untrusted rethrow.

## 5. What a top-to-bottom reviewer stops on

- `#goneBy: (() => VaultError) | null` (885): a factory, so `#demandNotGone` throws a fresh error each call while `#onGone` was told the original (which, from `#boxGetRefusal`, carries a `cause` the later ones lack). Why not hold the refusal?
- `this.#refreshedAt = FarPast` as a signal (989, 1362, 1404): a sentinel assignment meaning "the next hello must read". A `#forceNextRead()` or a boolean says it.
- `#leasesHeld` / `leasesSeen` (880-885, 1003, 1070): a monotonic counter threaded as a plain number through `#takeStorage` to `#takePicture` to order a lease read against a grant; six lines of comment carry what a named `#leaseGeneration` and one predicate would.
- `#demand(stored, { call })` twice in `#putGate` (1337, 1341), around `#raiseRecordAfter`; `#demandLease(call)` in both branches of `#getBox` (1610-1614) with a comment explaining why. A reader asks why twice each.
- `#replaceSnapshot` (955) decides "changed" by `stableJsonify` of the whole snapshot on every call, with `trouble` compared by identity; `keptIfSame` stringifies each slice again. A reviewer asks what this costs per keystroke-driven change and why identity for one field only.
- `#checkedBoxlabel(boxlabel: unknown)` (1578) validates one field by parsing `{ ...this.#scope, boxlabel }` as a boxscope and taking `.boxlabel` back out.
- `#heedRefusal` (1403) builds its log line from a `why` chosen on `refusalkind` with `--` joins; the lock it does is the third hand-written locking (section 2).
- `useWhisper` (667) is the one public method with no `try`/`#heardRefusal` and no `#demandNotGone`: by design (the callback's throw is the host's), but it breaks the pattern the class doc states, with no word on the member.
- `consistentWith` throwing on misuse (388-391): [GW-18]. `checkHelloOpts`, `checkEnsureUnlockedOpts`, `checkDemandOpts` (1940-1951): [GW-19].
- Two homes for refusal factories: `Refusals.unexpectedError` (imported) and seven local `*Error` arrows (1858-1870) plus `absentBox`, `noWhisper`, `renewPastLease`, `passkeyBeforePassphrase`, `damagedBeyondNaming` (1944-1976); `lockedError`'s text is [GW-03].
- `#judgeStored` (1030) has three exit shapes: a record, a string verdict, a throw. One method, three protocols.
