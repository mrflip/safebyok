# Thread 21: cloak (2026-11-20)

Branch `20261120-cloak`, PR #789 (draft), stacked on #786 (thread 18, giver_forms). Proved: `pnpm justify` green after the catch-up onto #786 (sprintbase 173338ec8): safebyok 1330, safebyok-big 2946, safebyok-react 347, e2e 576, scripts 328, postgres 341, graphql 448, convex 334, indexeddb 215, fastkey 43, demo 99; lint, typecheck and build clean in every package.

* **Built**:
  * `packages/safebyok/src/helpers/cloak.ts`: `cloak(cleartexts)` and `class Cloak`, exported from the core's entry (`core.ts`), with the type `CloakCleartexts` (in `shapes-gateish.ts`, beside the checker `CleartextChecks.cloakArgs`).
    * Fields are private (`#`). One getter per gating prop: `passphraseClear`, `passkeyClear`, `nextPassphraseClear`, `nextPasskeyClear`. A passkey answer's getter hands out a fresh copy at each read.
    * Adopting a passkey answer copies its PRF bytes in and zeroes the host's (G2).
    * `vacate()` zeroes the cloak's own bytes and drops all four fields.
    * `toJSON()`, `toString()` and the `Symbol.for('nodejs.util.inspect.custom')` method return `'[cloaked]'`. It has no own key, and it is frozen.
  * The giver (`packages/safebyok-react/src/giver/react-giver.ts`):
    * The five form mutations take a `Cloak` as their variables.
    * `cleartextsOf(cloak)` builds the verb's cleartexts from the getters at each attempt, keeping only the fields the cloak holds.
    * `FormMutationDefaults` is `{ networkMode: 'always', onSettled: vacateCloak }`. `retry: false` is gone.
    * The `BankGiver` doc block tells a host that its own `onSettled` in the options replaces the vacate, and to retry no `condition` refusal.
  * Rename spend→vacate across the new core: `vacateCleartexts` and `vacateAnswerAt` in `models/gating.ts`, plus a comment in `bank.ts`, `gating.test.ts`, `models-world.ts` and `notes/guarantees-drift.md`.
  * safebyok-big exports `Validator.isBytes` (through `internals`) for the cloak's answer check.
  * Tests:
    * `tests/helpers/cloak.test.ts`: 13 tests.
    * The giver's form-mutation tests now go through a cloak. Each case checks the verb's cleartexts and the vacate, there is a refusal-vacates test, and a retry test shows two attempts with the cleartexts whole.
    * Knock-knock's `expectUnheld` checks the React tree (`TH.reactTreeOf(container)`) and the mutation cache again. Both pass, mid-unlock as well.
  * VOCABULARY row **cloak**. Empty changeset `.changeset/20261120-cloak.md`, with a body. An entry in `notes/security.md`, plus an amendment line appended to thread 18's entry.
* **Decisions made**:
  * **The cloak's entry check is shallow.** It takes an object with known field names only (strict) and leaves the values unjudged; each verb's own strict check judges them, as before. A malformed passkey field (prfBytes not a Uint8Array) is kept as given, neither copied nor zeroed, for the verb to refuse. When `cloak()` refuses, nothing is adopted and the host's bytes are left alone.
  * **`CloakCleartexts` is `Partial<intersection>`** of the five verbs' cleartexts. A union made field access fail to type.
  * **The giver hands the verb a plain object built from the getters, never the cloak itself.** The core zeroes the answers it is handed, and the verb's strict check must still see each field. A cast to each verb's type sits at three of the call sites; unlock and revoke need none, since all their fields are optional. The verb judges what the cast claims.
  * **The giver does not re-export `cloak`.** The giver is on no published entry; its hosts and tests import from `safebyok`.
  * **The vacate is in `onSettled`, inside the shared defaults.** It runs once, after the last retry. A host's `mutate(..., { onSettled })` callback runs beside it; an `onSettled` in the options replaces it, as documented.
* **Set aside**:
  * Vacating in `mutationFn`: that would break retries (the Coach's ruling).
  * Copying with `Uint8Array#slice()`: lint's unicorn/prefer-spread fires on it, so the copy is `new Uint8Array(bytes)`. The vacate test spies `Uint8Array.prototype.fill` instead of using a species subclass.
  * A generic `cleartextsOf<T>()`: lint's no-unnecessary-type-parameters; the casts sit at the call sites instead.
* **Deviations**:
  * "spend" stays in `notes/guarantees-drift.md`'s "build and spend the provings", which is about provings, not cleartexts. It also stays in safebyok-big, in `notes/design-proof.md` (big's G2) and in security.md's older entries.
  * The security subagent appended an `amended 2026-11-20` line to thread 18's security.md entry, which said the mutations keep `retry: false`. The header provides for that kind of amendment, and no old words changed.
* **Discoveries**:
  * `TH.holdsText` walks own property descriptors, so it cannot see private fields: the knock-knock checks pass because the cloak's fields are `#`. A `TH.holdsText(cloak, …)` proves nothing about the cloak's contents; `cloak.test.ts` tests through the getters.
  * "vacate" also names the device's sign-out verb (`device.vacate()`).
* **For the Coach**:
  * **The vacate's name overlaps `device.vacate()`.** Both empty what holds a secret, so the overlap is likely intended; worth a nod.
  * **The cloak holds a live PRF copy for the whole mutation**, all its retries included; before, the core zeroed the copy within one attempt. This follows from "so retries can work". It is recorded in security.md as a residual.
