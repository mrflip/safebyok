# Thread 2: vault_boxes (2026-10-28)

Branch `20261028-vault_boxes`, PR pending, stacked on
[#336](https://github.com/mrflip/safebyok/pull/336). Justify: green at step 3 (core 3474 passed,
37 skipped; every package green).

Preplan steps 3 and 4 (`gripeoween-vault-preplan.md`), a commit each. Step 4 under way.

* **Built**:
  * **Step 3, the box ladders** (`vault.ts`). `getBox` and `getWhisper` fold `#getBoxUnlocked`;
    `putBox` folds `#sealAndPutBox`. `#getBox` → `#getBoxFromStorage`; `#putOver` →
    `#putBoxOverBase`, a throwing form resolving the record, its `vault_mismatch` → `stale_write`
    remap kept inside it. `#damagedBase` folds into `#storedBase`; `#listedRevisionOf` and
    `#isListedDamaged` into `delBox`. `#ensureUnlocked(renewMillis)` has no `shouldAsk` and always
    ensures. The four `#demandAfterWait(x, { vault_tok }, …)` sites are written out as
    `if (isUntrustedStorageRefusal(err)) { throw err }` then `#demandNotGone()`.

* **Decisions taken**:
  * **The refresh moved out of `#ensureUnlocked` into its callers.** The listing check must come
    after the hello, as `shouldAsk` did, so each caller (`ensureUnlocked`, `getBox`, `getWhisper`,
    `putBox`, `delBox`) reads `await #refreshIfStale(staleMillis); #demandNotGone()`, then its own
    check, then `#ensureUnlocked`, as `putWayin`, `delWayin` and `del` already did. One read, as
    before. The check is `! #leaseLastsPast(0) && ! #isListed(label)`, the loop's own first test.
  * **`#putOver` became `#putBoxOverBase`**, not a remap in `putBox`'s catch: the catch stays the one
    conversion, and the remap belongs to the one write that meets `vault_mismatch`.
  * `#ensureUnlocked` resolves void; an `ensure` that hands nothing back is what STYLE.md calls
    misnamed, but the public one hands back the vault and the private one has nothing worth handing.
  * A module predicate `isUntrustedStorageRefusal(err)` replaces the three spellings of
    `UntrustedStorageKinds.some(...)`.

* **Deviations**:
  * **Two edges move** (changeset says so). A box call on a locked vault whose listing lacks the box
    now answers at once while a gating of another kind is pending; before, it waited that gating out
    and asked `shouldAsk` after. And the four written-out demands no longer log "A call found the
    vault moved on" for a Vault object gone meanwhile, as `#demand` did; `#demandNotGone` never logs.
  * **Three delBox tests wait for the watch** (`TH.readAfresh`): `vault-del` "delBox removes the
    box", and the two `vault-races` "a deletion over a ... box written meanwhile elsewhere" cases.
    `putBox` resolves a few microtasks sooner with `#sealAndPutBox` folded, so the watch's refresh
    rung by the put is still reading when the delete lands, and the delete's own ring joins it: the
    stale listing lands after the delete. See Discoveries.

* **Discoveries**:
  * **A ring during a refresh joins it**, so a write of this tab's own that lands while the watch's
    read is in flight can be overwritten by that read's older listing, and no later ring corrects it
    until the next stale hello. Before, an in-memory store's timing hid it; a network store never
    did. Not fixed here (behaviour stays): see For the Coach.

* **For the Coach**:
  * **Ring joins a stale refresh**: recommend a later thread have a ring during a refresh run one
    more refresh after it, rather than share.
  * **Locked box call during another gating**: recommend accept; the doc already says "at once".
  * **Gone-log at four sites**: recommend accept; every other `#demandNotGone` is silent too.
