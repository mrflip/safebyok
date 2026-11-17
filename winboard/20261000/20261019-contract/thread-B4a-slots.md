# Thread B4a: slots (2026-10-19)

Branch `20261019-slots`, PR [#207](https://github.com/mrflip/safebyok/pull/207), stacked on #206
(`a_sec2`). Justify: green. Per package: core 2529 passed, 35 skipped; react 279; convex 274 (8
skipped); postgres 268 (14 skipped); graphql 262 (14 skipped); indexeddb 144 (10 skipped);
fastkey 49; demo 202 (16 skipped); e2e 89 (96 skipped); root 265. Size check green.

The Coach's ruling (`ruling-one_of_each.md`, option A of `one_of_each-design.md`): a vault holds
exactly one passphrase and at most one passkey, as two slots of the vault props, in the existing
vault table. Slots on the vault proved a minimal code path: no second table was needed.

* **Built**:
  * **Stored shape** (`types.ts`): `VaultProps` is format `safebyok-vault-v5`, with
    `passphrase: PassphraseWayinRecord` and `passkey: PasskeyWayinRecord | null` in place of
    `wayins`. `wayin_id`, `wayinlabel`, `wayinList`, `distinctIn`, `distinctCredentials` and
    `MaxUnlocks` are gone. `v4` joins `OlderVaultPropsFormats`, so every stored vault reads
    `damaged_vault`; no migration. `mayBeNewer` tells newer from damaged by `format` alone.
  * **Opening** (`wayin.ts`, `vault.ts`): `tryOpenAmong`, `openWithPassphrase`'s list walk,
    `openWithPasskey`, `skippedByOtherDeriver`, `listOf` and `absentWayin` are gone. The vault's
    `#unwrapWith` picks the slot by `proof.kind` and calls `wayin.tryOpen`; a passkey's answer to a
    vault with no passkey refuses `absent_wayin`. `Wayin.make` gains overloads, so a passphrase
    record makes a `PassphraseWayin` without a cast. The ctx's first part is `safebyok-vault-v5`,
    and the header no longer holds an id or a label (`ctx-bytes.test.ts` pins it).
  * **Verbs**: `changePassphrase(passphrase, newPassphrase)`, `addPasskey(passphrase,
    makePasskey)` (resolves `true`/`false`; a second passkey replaces the first) and
    `delWayin(passphrase)` (removes the passkey). Each proves with the standing passphrase only,
    through `standingPassphraseOf`, which refuses anything but text (a passkey's answer) as
    `bad_option`. `addPassphrase`, `parseAim`, `parseWayinId`, `parseWayinlabel`,
    `passphraseToReplace`, `#checkRoomForWayin`, `#checkNewCredential` and `FirstWayinlabel` are
    gone; `unlock()` and `ask.attempt()` lose `{ wayinId }`. `#deadlineFor(proof, call)` became
    `#deadlineFromNow()`: every proof now renews the lease.
  * **Snapshot**: `wayins` became `passphrase: PassphraseWayinSummary | null` and `passkey:
    PasskeyWayinSummary | null`, with fields on the vault to match. `WayinSummary` stays, the
    union of the two, for `meta.wayin_listed`.
  * **Refusals**: `last_wayin` and `too_many_wayins` removed from `RefusalKindVals`, its families,
    the README table and every message.
  * **Validators**: the bag has no `wayinlabel` field.
  * **Adapters**: Convex validators, Postgres columns (`passphrase jsonb NOT NULL`, `passkey
    jsonb`) and the SQL, GraphQL schema and fields; IndexedDB's README.
  * **React**: `askPasskey(passkey: PasskeyWayinSummary | null, opts)` asks that one credential.
    It refuses `absent_wayin` for null, and `damaged_wayin` for a passkey stored damaged, without
    asking the browser. `offersPasskey` reads `snapshot.passkey`. `passkeysDamaged` is renamed
    `passkeyDamaged`, and the provider's `wayinlabelCheck` is gone. The demo's `WaysIn` changes the
    passphrase, adds or replaces the passkey, and removes it.
  * **Battery and helpers**: `wayinOf(tag)`, `passkeyWayinOf(tag)`, `vaultPropsOf` (v5),
    conformance cases; `world.ts`'s `spoilWayin`, `storedWayinOf`, `rolledBackWorld`.
  * **Docs**: the core README (*The passphrase and the passkey*, the passkey section, *No
    recovery*, the error table), VOCABULARY.md, STYLE.md's `_id` example, TODO.md's
    several-passphrases entry (settled; the G530 question stands), `notes/security.md` (by a
    `sonnet` subagent).
  * **`opening` after `rolled_back`**: `VaultState`'s doc says a read refused `rolled_back` reads
    `opening` again, its `trouble` saying so. React's `openError` falls back to that trouble while
    the vault is `opening`. Its test, in `vault-provider-refusals.test.tsx` ("hands down a
    rolled_back that a later read met as openError..."), fails without the fix. The README says
    `retryOpen` does not mend it.
  * **Size budgets**: the core's lines drop under the rule. react's `VaultProvider` and
    `reactEverything` rise 0.1 kB, for the `openError` fallback.

* **Decisions taken**:
  * Summary types are `PassphraseWayinSummary` and `PasskeyWayinSummary`, in line with
    `PassphraseWayinRecord` and `PassphraseWayin` (the design brief said `PassphraseSummary`,
    which reads as a summary of the secret).
  * A passkey's answer from another credential than the vault's passkey refuses `wrong_passkey`
    (`PasskeyWayin.tryOpen`'s own refusal, its message now saying the passkey may have been
    replaced or removed); it was `absent_wayin` when the list was searched by credential.
    `absent_wayin` now means only "the vault has no passkey".
  * `addPasskey` with the vault's own passkey again is allowed: it replaces it with a fresh wrap,
    which is how a passkey stored damaged is mended. The old "already a way in" refusal went with
    the list.
  * `addPasskey` resolves a boolean (it resolved the new `wayin_id`, or null): the smallest
    shrink; B4 gives it its Contract return.
  * `changePassphrase` stamps the new passphrase afresh (`device_id` of this device,
    `registered_at` now), per the design brief.
  * `delWayin` checks for a passkey before any derivation, so a vault with none refuses
    `absent_wayin` at no cost.

* **Deviations**:
  * `notes/security.md`'s header says an added entry changes no other entry. This thread's
    `sonnet` subagent amended the entries the change made false, each marked "amended 2026-10-19
    (slots)", and added one entry for the thread. An open matter asks whether that is right.
  * The thread lands as one code commit and one docs commit: the core, the adapters and react
    break together, so no smaller code commit is green.

* **Discoveries**:
  * The Coach's proof ruling has a consequence the README now says: **a forgotten passphrase can
    no longer be reset with the passkey**. The passkey still opens the vault and reads its boxes,
    but only the passphrase proves a new one, so such a vault is, in the end, removed and made
    again. Likewise a passphrase stored damaged cannot be replaced.
  * The Postgres and GraphQL adapters dropped a null field on read (`recordOf`), which would have
    read every vault without a passkey as damaged; both now keep a null cell as a null field.
  * Postgres hosts must drop both tables (`safebyok_boxes` too, for its foreign key) and run
    `VaultTablesSql` again; Convex hosts must clear the component's tables before deploying, as
    Convex refuses a schema its documents do not match.

* **For the Coach**: the open matters below. The forgotten-passphrase consequence most needs a
  look.

## Open matters

* **Second passkey replaces** (YOLO on the Rec, the row stands): built as replace.
* **`openError` falls back to a `rolled_back` trouble while `opening`** (YOLO, a row): built.
* **Contract drift: `absent_wayin`** now means only "the vault has no passkey" (to unlock with or
  to remove); the Contract's row says "no way in of that `wayin_id`, or none of the kind asked
  for".
* **Contract drift: another credential's answer is `wrong_passkey`**, not `absent_wayin`.
* **Contract drift: `last_wayin` and `too_many_wayins`** are gone from the refusal table; the
  Contract's *The policy* paragraph and its `putWayin`/`delWayin` brief still name them, and
  `wayin_id`/`wayinlabel` in the Wayin class block.
* **Forgotten passphrase with a passkey**: no reset path any more (the ruling's consequence).
  Recommend: accept before 1.0, as the README now says; revisit with G530.
* **`vault.passphrase` reads like the secret.** The snapshot field is named as ruled; a reviewer
  may read `snapshot.passphrase` as the passphrase itself. Recommend: keep until B4 or the Coach
  names the grouping object.
* **`addPasskey` returns a boolean** (it returned a `wayin_id`, or null). Recommend: B4 gives it
  its Contract return.
* **`notes/security.md` amended in place**, against its header's rule. Recommend: the Coach rules
  whether amend-in-place is the rule now.
