# Thread 11: docs, the core half (2026-10-23)

Branch `20261023-docs`, stacked on [#262](https://github.com/mrflip/safebyok/pull/262) (thread 9b). Justify: green (core 3121 passed, 37 skipped; every package).

The core and repo-wide docs only; `safebyok-react`'s README and docs are thread 10's. Thread 9c
runs beside this in `packages/safebyok/src/`, so `src/` is touched only in doc blocks.

* **Built**:
  * **The Contract**: a new tab, *Contract, primitives*, in the design doc
    (https://claude.ai/artifact/J8ooBpFq7tyAAPFrxb3qRq, tab id `bf4f3281-e5dd`), placed after the
    old *Contract* tab, which it replaces. Written from the code's doc blocks at #262: every
    public call of `Bank`, `Vault` and the gating, what each does, guarantees, returns and
    refuses; the per-method table of a lock landing mid-call, led by "a lock spares only the
    transactional part"; every kind in `RefusalKindVals` with its family; the kinds retired
    (`created_elsewhere`, `last_wayin`, `too_many_wayins`, `rolled_back`, `vault_closed`) and the
    two specified and not built (`box_moved`, dropped; `vault_not_novel`, which is
    `gate_made_elsewhere`).
  * **The core README**: "proof" retired from the cast (a gating asks, a proving is made), the
    lock's transactional-part line in *Locking*, and the *Errors* example off the removed
    `tryUnlock`.
  * **`askPassphraseAt`'s doc block**: the `Intl` hint (`DateTimeFormat`, `RelativeTimeFormat`).
  * **VOCABULARY.md**: the bank, the Vault object (and gone), cleartext in place of proof,
    gating, gatingkind and requestCleartext, the gate, the stamp, `vault_epoch`, novel,
    freshness, the device record (in place of the device mark), behind (in place of rolled back),
    `cipheredWith` / `decipherWith` / `wrappedWith` / `unwrap` / `extract`, and the `_tok` rule
    reading "changes on every life". `Vault.make` options are `Bank.make` options.
  * **`notes/old_vocabulary.md`**: a row for each name the sprint retired (Proof, Ask, AskWhy,
    ProofAnswer, getProof, carry_on, lease_ending, the device mark, rolled back, vault_closed,
    opening, absent, decryptWhisper, unlock, ensureLease, the old wayin calls and kinds,
    `TH.makeGate`). `unlock_epoch` and `vault_id` were already there, from #243.
  * **`TH.makeGate` is `TH.makeLatch`** (`safebyok/testing`, so a minor changeset), and its
    local `gate`s in the timing helpers are `latch`es; other tests' local `gate` variables are
    left as they are.
  * **STYLE.md**: try pairs and the get/demand/ensure triplet, under *Naming*; its doc-block
    example in today's terms.
  * **TODO.md**: the Coach's entries (the Postgres README recipe test and pointers, an agent skill
    set, capacity on the Vault object, the stamp as VaultDB params and the immutable fields sent
    early, `damaged_lease` and `lock()`, "whisper unchanged", who holds the expiry, `bank.hello`
    checking the device store, the Auth.js trigger, the badge, the format helper, start over
    clearing only this device, asking every time); the lock-timing entry cut to what is left;
    `getProof`'s entry is `requestCleartext`'s; `tryClose`'s entry gone.
  * **VAULTDB.md, CUSTOMIZATION.md, the root README**: `Bank.make` for `Vault.make`, no catch-up
    after a refusal.

  * **`tests-retired.md`**: a roll-up at its head, by thread and by ruling (105 retired; 9b
    none), with the core's `it(` count at #262 beside the sprint's start.

* **The hand-roll sweep** (proposes; adds nothing). The preplan's *Libraries* candidates:

  | file | verdict | why |
  | --- | --- | --- |
  | `stable-jsonify.ts` | keep | already `safe-stable-stringify`; the file is a one-line name for the operation |
  | `adorn.ts` | keep | `Object.defineProperty` for a non-enumerable field: the platform's own primitive, nothing to replace |
  | `mask.ts` | keep | a display rule of our own (NFC, strip marks and controls, head and tail); no library does this cut |
  | `sanitizer.ts` | keep | one line making a `VaultError` that carries nothing: a contract, not a mechanism |
  | `string-store.ts` | keep | a Map or `Storage` with a subscribe, for the local adapters; `unstorage` and the like would add far more than it holds |
  | `utils.ts` | keep | the `safebyok/utils` entry's barrel, not code |
  | `report-error.ts` | keep | a guarded call of the platform's `reportError` |
  | `change-bell.ts` | keep | native `BroadcastChannel` plus an in-tab set; `broadcast-channel` (npm) polyfills what every target now has |
  | `idb.ts` | keep | already on `idb-keyval` |
  | `one-at-a-time.ts` | keep | the plan keeps it for the refresh's join |

  No deletion and no new dependency proposed.

* **Checked and left**: `checkPassphrase` stays (React uses it until thread 10; it is not
  retired). The plan's `old_vocabulary` list named it, but it is current.

* **Decisions taken**:
  * **A new tab, not an overwrite.** The old *Contract* tab is the vault before the sprint in
    nearly every section (`Vault.make`, `ensureLease`, `getProof`, `Proof`, `close()`,
    `Lease.grant`), so a rewrite in place is a new tab anyway. Beside it, the Coach can compare
    the two and retire the old one; nothing the Coach wrote or commented on is lost. Test titles
    cite sections by name ("Contract: Bank.make, Does 1"), which the new tab keeps.

* **Deviations**:
  * **`TH.makeGate`'s callers' local `gate` variables stay `gate`** in the core, React and
    Postgres tests: renaming them touches thread 10's React tests for no change of meaning. Only
    the helper and its own timing helpers say "latch".
  * **No security notes**: the thread writes down decisions earlier threads made; it makes none.

* **Discoveries**:
  * The old *Contract* tab still describes the vault before the reform sprints (`Vault.make`,
    `getProof`, `close()`, `rolled_back`, `too_many_wayins`, `vault_key_epoch`), not only before
    this one: its *Box*, *Wayin*, *Proof* and *Lease* sections were already out of date.
  * `vault_not_novel` (the spec's *Kinds this tab adds*) was never built: an `initialize_gate`
    over a gate standing refuses `gate_made_elsewhere`.
  * `checkPassphrase` is current, not retired: the plan's `old_vocabulary` list names it.

* **For the Coach**:
  * **Retire the old *Contract* tab** once the new one reads right (delete it, or rename the new
    one *Contract*). Rec: rename, so the tests' "(Contract: ...)" cites read as they are.
  * **"cleartext" for what the user hands a gating**, retiring "proof" (VOCABULARY, README).
    Rec: keep; it is the word `requestCleartext` already uses. The other answer is to keep
    "proof" for the input and "proving" for the key made from it.

* **Not done here (thread 10's)**: `safebyok-react`'s README and docs; the React demo's names.

* **Follow-up, after the restack onto #264 (thread 9c)**: 9c made some doc lines untrue, and
  they are fixed here. The core README's *Errors* `unexpected_error` row and safebyok-fastkey's
  README (*Errors* and the paragraph above it) no longer promise a key deriver's throw as the
  refusal's `cause`: it is kept nowhere, a condition-family `VaultError` keeps its kind in
  safebyok's own words, and the logger hears the call and a listed kind. CUSTOMIZATION.md says a
  strength checker's `reason` is shown as given, so it must never quote the passphrase. The 9c
  changeset notes that the exported `ProvingVault` type now requires `logger`. TODO.md: the badge
  entry says "log out", as the Coach wrote, and the line the worker added to *Lock timing*
  ("confirm with a test once the React dialogs settle") is dropped. Still stale, for thread 10:
  safebyok-react's README, *React reports it to you* (about line 296), says a key deriver's throw
  is `unexpected_error` "with that throw as the cause".
