# Thread 2: vault_boxes (2026-10-28)

Branch `20261028-vault_boxes`, PR [#340](https://github.com/mrflip/safebyok/pull/340), stacked on
[#336](https://github.com/mrflip/safebyok/pull/336). Justify: green (core 3476 passed, 37 skipped;
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
  * **Three delBox tests wait for the watch** (`TH.readAfresh`): `vault-del`'s "delBox removes the
    box", and `vault-races`' two "a deletion over a ... box written meanwhile elsewhere" cases.
    `putBox` resolves a few microtasks sooner now that `#sealAndPutBox` is folded. The watch's
    refresh rung by the put is still reading when the delete lands. The delete's own ring joins
    that refresh, so its stale listing lands after the delete. See Discoveries.
  * **useWhisper's order**: on a gone Vault object with a bad callback, it now refuses 'vault_gone'
    before 'bad_option', as every call does. This is the Coach's ruling; "behaviour stays" yields.
  * Two `vault-storage` tests expect `{ call: 'refresh' }` and `{ call: 'getWhisper' }` where they
    expected `untrustedStorage`.

* **Discoveries**:
  * **A ring during a refresh joins it.** Say this tab writes while the watch's read is in flight.
    That read's older listing can overwrite the write, and nothing corrects it until the next
    stale hello. Before, the in-memory store's timing hid this; a network store never did. Not
    fixed here (behaviour stays).
  * `bank.ts`'s `#revokeLease` still logs `{ call: 'untrustedStorage' }`, and its own bad news is
    `#tellBadNews`. Both are out of scope (bank.ts).

* **For the Coach**:
  * **useWhisper's callback throw**: it stays outside the try, so it reaches the host as the same
    object. A `VaultError` the host throws is not reported as the vault's bad news, and a plain
    Error does not become 'unexpected_error'. Uniformity did not need the change: the vault's part
    has the try and the one catch. Pinned by "passes a callback's throw through as the same
    object...". Recommendation: keep.
  * **Ring joins a stale refresh**: recommendation: a later thread has a ring that arrives during
    a refresh run one more refresh after it, rather than share the one under way.
  * **Locked box call during another gating answers at once**: recommendation: accept. The doc
    already says "at once, asking nobody".
  * **Gone-log at four sites**: recommendation: accept. Every other `#demandNotGone` is silent.
  * **Bank's `untrustedStorage` tag**: recommendation: `{ call: 'ensureVault' }` the next time
    bank.ts is touched. The README now names the tag as the bank's.
