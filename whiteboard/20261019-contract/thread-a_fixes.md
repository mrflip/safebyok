# Thread a_fixes: phase A's fix-ups (2026-10-19)

Branch `20261019-a_fixes`, [PR #204](https://github.com/mrflip/safebyok/pull/204), stacked on
[#202](https://github.com/mrflip/safebyok/pull/202) (`20261019-box`). Justify: green; core 2560
(35 skipped), react 263, graphql 276 (14), demo 215 (16), 0 failed.

* **Built**:
  1. **`isVaultCondition` is `isCondition`**, core export, react's provider and dialog, README.
  2. **`staleMinutes` defaults to 5** (`StaleMinutes`, `types.ts`); its example is now
     `staleMinutes: 1`. Tests that leaned on 1 now pin 5 or read `StaleMinutes`.
  3. **`renewWithin` is `renewMinutes`** (`parseRenewMinutes`; the private `#ensureLease(renewMillis)`).
  4. **One check for a refusal across copies of safebyok.** `errors.ts`: each `VaultError`'s
     constructor sets an own, unenumerable property keyed by `Symbol.for('safebyok.VaultError')`
     (the mark); `isVaultError` is true for this copy's class, or for an `Error` carrying the mark
     with a known `refusalkind`. Used by `outcomeOf` (its private `isAnyVaultError`, a name test,
     is gone), the VaultDB base's `asStorageTrouble` (it was `instanceof`: a foreign
     `identity_revoked` from an adapter became `storage_unavailable`), and graphql's `vaultDBOf` and
     `crossing`; `#hearBadNews`, `RefusalPolicy.decide` and `isCondition` already called
     `isVaultError`. Test helpers `TH.foreignRefusal`, `TH.lookalikeRefusal` (also in
     `safebyok/testing`).
  5. **Check before prompting.** `#ensureLease(renewMillis, beforeAsking?)`: `beforeAsking` runs
     after the hello, only when the vault must ask. `#openBox` (getBox, getWhisper, useBox) and
     `#tryDelBox` pass `#checkListed(label)`: the floor first; when the listing in hand shows
     nothing under the name, one `#refresh()`, then `#nothingUnder` (`bad_label` by the host's
     check, else `absent_box`) if storage shows nothing either. `beforeAsking` is async, and
     `#ensureLease` reads why it asks again after it.
  6. **Tests**: an `ensureLease` row in `TwinCases`; the write-proof test loops over
     `Object.keys(vault.snapshot)` plus the handle-only fields; `created_elsewhere` and
     `damaged_wayin` through `ask.attempt` (`spoilSecondWayin` moved to `tests/vault/world.ts`);
     `Ask.attempt`'s doc drops `passkey_unavailable`.
  7. **Docs**: react README *Use*, the caveat (vault one render late, `null` first render and on
     the server, a second render per vault, `vault_closed` to calls on the old vault); TODO's
     *The react lifecycle* reopened; TODO *Soonish*: scope is immutable, a throwing `getProof`,
     `tryClose` a promise?, redaction batteries included; postgres README on lost grants; A4's
     *Throwing alone* names `delDamagedVault`; `notes/security.md` (sonnet): renames, the default,
     the A4 entry corrected in place, a new entry for items 4 and 5.
* **Decisions taken**:
  * **The mark, not duck typing.** A symbol travels through no JSON, structured clone or
    `postMessage`, so an error a client rebuilds from a server's answer (named `VaultError`,
    `refusalkind: 'identity_revoked'`) is no refusal: it is `storage_unavailable` in safebyok's own
    words, itself the `cause`. Under the name test a backend chose the kind (a lock, bad news) and
    the message the user sees. `instanceof Error` is also required, so a plain object never passes,
    marked or not. It is no defence against code in the page, which can call `new VaultError`
    anyway: it means "a VaultError constructor made this", as `instanceof` did, across copies.
    `Symbol.for`'s key is now a contract between versions.
  * **The listing only spares a prompt.** The check runs only when the vault would ask; an
    unlocked vault reads storage for the box as before. Locked, a listing miss reads storage once
    before refusing (the review's finding: with a store that pushes nothing, the listing lags up to
    `staleMinutes`, and a box another device stored read `absent_box` until `ensureLease()`). One
    read, only on the refusal path; a box in the listing costs nothing.
  * **A vault never made** refuses `absent_box` from `getBox`/`delBox` with no prompt (before, it
    asked `absent`, to create a vault, then refused `absent_box`).
  * **`vault_locked` tests now provoke it with `ensureLease()`** where they used `getBox` on an
    empty vault (five in `vault-lease`, one each in `vault-make` and `test-helpers.test`).
  * **Size**: `pnpm size:budget --write` raised `everything` 41 to 43 kB and `Vault` 34 to 36
    (measures 39.9 and 32.7). Most of that growth looks like B1's and B3's, which did not rerun it.
* **Deviations**: none from the thread text. The changeset sentence of try_twins ("kept as it
  came") still holds, so it stands; this thread's changeset says what changed.
* **a_sec's files touched** (for its restack): `ask.ts` (two doc lines: `renewMinutes`,
  `passkey_unavailable`); `outcome.ts` (`outcomeOf` calls `isVaultError`, `isAnyVaultError` gone,
  the import line); `vault.ts` (`#ensureLease`, `#whyAsk`, `#openBox`, `#tryDelBox`,
  `#checkListed`, the hello/ensureLease/getBox docs, the ensureLease option checks);
  `vault-provider.tsx` and `passphrase-modal.tsx` (the `isCondition` rename only). None of
  `#over`, `#takeStorage`, `#settleUnlock`, `#reviseWayins`, the take-up, `boundary.tsx` or
  `hostThrewRefusal`.
* **Discoveries**:
  * `tryOpenBox` (B3) has no row in `TwinCases` either.
  * The conformance battery (`vault-db-conformance.ts`) and `racing.ts` told a refusal by its name
    or `instanceof`; both use `isVaultError` now (review). `raceOutcomeOf`'s test imports it from
    `tests/test-helpers/racing` directly, as it is not in the door.
  * Through `graphqlVaultDB` and `convexVaultDB`, safebyok's own server code still chooses a
    refusal's kind and message: those clients rebuild a real `VaultError` on purpose (changeset and
    security note say so).
  * `TH.expectRefusal`/`expectBad` refuse a foreign VaultError on purpose (`instanceOf`); a test of
    one reads the Outcome by hand.
* **For the Coach**:
  * **A host's `instanceof VaultError`** misses another copy's refusal; the README now says to use
    `isVaultError`. A `static [Symbol.hasInstance]` on `VaultError` would make `instanceof` agree
    with the mark. Recommend: not now; the README line is enough.
  * **A listed-damaged box**: `getBox` on a locked vault still prompts, then refuses
    `damaged_box`. Recommend: leave it, since the listing's damage is a verdict on the record, and
    "will not open" needs the key.
* **Test counts** (vitest JSON; total includes skipped), base `6953b2c8` to tip: core 2524 (35)
  to 2560 (35): `errors` 59 to 72, `outcome` 17 to 18, `refusal-policy` 21 to 24, `vault-db`
  296 (17) to 297 (17), `test-helpers` 375 (18) to 378 (18) (two of them the reviewer's),
  `vault/vault-lease` 130 to 141, `vault/vault-storage` 74 to 76,
  `vault/vault-twins` 38 to 40. Graphql 275 (14) to 276 (14): `vault-resolvers` 21 to 22. React
  263, demo 215 (16), convex 280 (8), indexeddb 154 (10), postgres 281 (14), fastkey 49: unchanged.
* **Looked up**: nothing in the plan or progress doc beyond this thread's name (`a-fixes`, line 12)
  and a_sec's thread-file name on its branch.
