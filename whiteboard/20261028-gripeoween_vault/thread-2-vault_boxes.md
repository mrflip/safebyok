# Thread 2: vault_boxes (2026-10-28)

Branch `20261028-vault_boxes`, PR [#340](https://github.com/mrflip/safebyok/pull/340), stacked on
[#336](https://github.com/mrflip/safebyok/pull/336). Justify: green (core 3485 passed, 37 skipped;
every package green). Size budgets: none moves (`pnpm size:budget`).

Preplan steps 3 and 4 (`gripeoween-vault-preplan.md`), a commit each, and the Coach's `useWhisper`
ruling as its own commit inside step 4.

* **Built**:
  * **Step 3, the box ladders** (`vault.ts`). `getBox` and `getWhisper` fold `#getBoxUnlocked`;
    `putBox` folds `#sealAndPutBox`. `#getBox` → `#getBoxFromStorage`; `#putOver` →
    `#putBoxOverBase`, a throwing form resolving the record, its `vault_mismatch` → `stale_write`
    remap kept inside it. `#damagedBase` folds into `#storedBase`; `#listedRevisionOf` and
    `#isListedDamaged` into `delBox`. `#ensureUnlocked(renewMillis)` has no `shouldAsk`, and always
    ensures. The four `#demandAfterWait(x, { vault_tok }, …)` sites are written out as
    `if (isUntrustedStorageRefusal(err)) { throw err }`, then `#demandNotGone()`.
  * **Step 4, failure plans named for the act.** `#heardRefusal` → `#onRefused(thrown)`: every
    public catch is `catch (err) { throw this.#onRefused(err) }`. It takes any throw, and the
    `heardRefusal:` gating tool still points at it, for thread 3 to remove. `#boxGetRefusal` →
    `#onGetBoxRefused(err)`; `#gatePutRefusal` → `#onPutGateRefused(gate, err)`: each acts and
    returns the refusal for its caller's `throw`, as `#onRefused` does. `#leaseRefusal` →
    `#dropEndedLease()`, which returns the lease in force; `#demand` makes the 'vault_locked'
    itself. The six bad-news verbs are now two. `#reportBadNews(...heard)` reports each unreported
    bad news, keeps a handler's throw or rejection as the trouble, and publishes. The rejection's
    catch is a `.catch` inside it; `#handlerThrew` is a local closure. `#reportNewDamage(shownBoxes,
    shownWayins)` reports damage a read newly shows. `#onStorageRefusal(refused, call)` logs under
    the call that met the refusal; `VaultCall` drops `'untrustedStorage'`.
  * **useWhisper, the Coach's ruling.** It runs `#demandNotGone()`, then a try around
    `callback.parse` and `getWhisper` with the one catch. The callback runs after the try.
  * `notes/guarantees.md`: `#sealAndPutBox` struck from the whisper's path. README's logging list
    names the call.

* **Decisions taken**:
  * **The refresh moved out of `#ensureUnlocked` into its callers.** The listing check must come
    after the hello, as `shouldAsk` did. So `ensureUnlocked`, `getBox`, `getWhisper`, `putBox` and
    `delBox` each await `#refreshIfStale(staleMillis)`, then `#demandNotGone()`, then make their own
    check, then call `#ensureUnlocked`. `putWayin`, `delWayin` and `del` already read this way.
    There is still one read. The check is `! #leaseLastsPast(0) && ! #isListed(label)`, the
    loop's own first test.
  * **`#putOver` became `#putBoxOverBase`**, not a remap in `putBox`'s catch. The catch stays the
    one conversion, and the remap belongs to the one write that meets `vault_mismatch`.
  * **`#onRefreshRefused` kept its name and its body**: it is already of the `#on…Refused` family,
    a plan a catch dispatches, and it earns its name.
  * **`#reportNewDamage` reports the boxes, then the ways in, publishing after each** (two
    `#reportBadNews` calls). That keeps the two publishes the old pair made, so listeners hear
    exactly what they did.
  * `#ensureUnlocked` resolves void. STYLE.md says an `ensure` that returns nothing is misnamed, but
    the public form hands back the vault, and the private one has nothing worth returning.
  * `isUntrustedStorageRefusal(err)`, a module predicate, replaces the three spellings of
    `UntrustedStorageKinds.some(...)`.

* **Deviations**:
  * **Two edges move** (the changeset says so). First: a box call on a locked vault whose listing
    lacks the box now answers at once while a gating of another kind is pending. Before, it waited
    that gating out and then asked `shouldAsk`. Second: the four written-out demands no longer log
    "A call found the vault moved on" when the Vault object goes gone meanwhile. `#demand` logged
    that line; `#demandNotGone` never logs.
  * **useWhisper's order**: on a gone Vault object with a bad callback, it now refuses 'vault_gone'
    before 'bad_option', as every call does. This is the Coach's ruling; "behaviour stays" yields.
  * Two `vault-storage` tests expect `{ call: 'refresh' }` and `{ call: 'getWhisper' }` where they
    expected `untrustedStorage`.

* **Discoveries**:
  * **A ring during a refresh joined it** (fixed in the rework below). A read in flight when this
    Vault object's box write landed could then put its older listing over the write.
  * `bank.ts`'s `#revokeLease` still logs `{ call: 'untrustedStorage' }`, and its own bad news is
    `#tellBadNews`. Both are out of scope (bank.ts).

* **For the Coach**:
  * **useWhisper's callback throw**: it stays outside the try, so it reaches the host as the same
    object. A `VaultError` the host throws is not reported as the vault's bad news, and a plain
    Error does not become 'unexpected_error'. Uniformity did not need the change: the vault's part
    has the try and the one catch. Pinned by "passes a callback's throw through as the same
    object...". Recommendation: keep.
  * **Locked box call during another gating answers at once**: recommendation: accept. The doc
    already says "at once, asking nobody".
  * **Gone-log at four sites**: recommendation: accept. Every other `#demandNotGone` is silent.
  * **Bank's `untrustedStorage` tag**: recommendation: `{ call: 'ensureVault' }` the next time
    bank.ts is touched. The README now names the tag as the bank's.

## Rework: a deleted box came back (2026-10-28)

The reviewer's probe: `putBox` then `delBox` listed the box again after `delBox` resolved. Fixed in
d53be040, one commit.

* **Built**:
  * `oneAtATime` (`one-at-a-time.ts`) has two doors. `join` shares the run under way, as before.
    `runAfresh` waits that run out, then shares the one run after it. A failed run still starts
    its follow-up.
  * The watch (`#watchRefresh`) uses `runAfresh`. `#refresh` and so `hello`, `refresh` and the
    gating tool's `freshen` still `join`. `#tellReadsRecovered` is the old tail of `#refresh`.
  * `#landedSinceRefresh`: box writes of this Vault object's own that landed in the listing since
    the refresh began, as `boxlabel` mapped to the stored revision, or null for a deletion.
    `#updateBoxListingOf` and `#dropBoxListingOf` fill it. `#doRefresh` ignores a read whose
    listing disagrees with it (`showsLanded`), as it ignores an `isOlderPicture`.
  * Tests: the three delBox tests are unawaited again. Three new tests: put-then-delete lists 0
    boxes right after `delBox` and after 50 ms; a box written elsewhere during a held read shows;
    a put over a held read never shows the revision before it (a subscriber checks). The test of
    three rings now expects two reads. Six new `oneAtATime` tests cover `runAfresh`. The first
    fails at 88be53db; each of the other two fails with its half of the fix taken out.
* **Decisions and probes**: in `thread-2-vault_boxes-rework.md` beside this file, for the
  reviewer and thread 3. In short: the follow-up alone does not fix the probe; the landing check
  does. Hellos keep sharing a read, as the Contract says. The extra probes found nothing wrong.
* **For the Coach**:
  * **Hello during a read**: keep sharing (the Contract row) or wait for a fresh read too?
    Recommendation: keep sharing; only rings follow up.
  * **Extra read**: a ring during a read now costs a second `getVault`. STYLE.md bars a re-read
    in the core; this one is the watch's, not a call's. Recommendation: accept.

