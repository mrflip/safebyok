# Thread 5: matters_followups (2026-10-16)

Branch `20261016-matters_followups`, PR [#117](https://github.com/mrflip/safebyok/pull/117), stacked
on [#101](https://github.com/mrflip/safebyok/pull/101). Justify: green -- root 123, core 1183,
convex 298, react 75, indexeddb 108, postgres 162, graphql 159, argon2-wasm 44, demo 136.
Review: `fixed`, two commits (a taken unlocklabel or passkey refused without quoting the label;
an empty unlocklabel refused as `bad_label` at entry). After it, at the orchestrator's word: the
Convex message also points at the browser console, and TODO notes the sanitizer's reach.
`pnpm size` within every budget (`DefaultValidators` 3.75 of 4 kB).

* **Built**, one commit per item, in the plan's order:
  - **The sanitizer.** `packages/safebyok/src/sanitizer.ts`, exported as `Sanitizer`, holds
    `refusalFor(foreign, kind, message)`: the VaultError to throw in place of a foreign error,
    carrying nothing of it. `names.ts`'s throwing-schema drop goes through it, and so does
    `convexVaultDB`: every Convex failure that is not one of safebyok's own refusals is now
    `storage_unavailable` with no `cause`, its message pointing at the deployment's logs. Tests:
    `tests/sanitizer.test.ts`; in Convex, the stray-field case now asserts no cause and no
    `stray_field`, and a new case sends a note that is not text, which convex-test's validator
    quotes (asserted on the raw call), and finds it nowhere in the refusal.
  - **erase reads once.** `checkStandingBoxlabel` now also refuses an absent box, and
    `ensureBoxStands` is gone: one `readBox` for a refused name, a passing one, or a refused name
    with nothing under it. A test counts the reads.
  - **`read()` / `use()` docs** name `bad_label` for a refused name, a damaged box under one
    included, and `erase()` as the remedy (the README already said so).
  - **The vault-total estimate** is called conservative in `VaultDB.maxVaultBytes`'s doc block and
    the README's *Sizes follow the names*.
  - **`validators.unlocklabel`**, a sixth slot: `Label` in `DefaultValidators`, any well-formed
    text in `AnyTextValidators`, accepted by `checkValidators`, built by `rulesOf`, run by
    `parseUnlocklabel` through `Names.check`; `VaultProvider` passes it through. Four vault
    tests, one provider test.
  - **`close()` twice** returns early; a test spies the unsubscribe.
  - **`TODO.md`**: the two size checks, the pluggable sanitizer, the `unlocklabel` line updated,
    *Re-examine the pluggable validators interface* (the Coach verbatim, how it stands, our
    question), and #68's four KDF follow-ups as lines under the recommended-KDFs entry.
* **Decisions taken**:
  - **Convex drops every non-safebyok error's cause, not only the validator's.** The client gets
    each server failure as a plain `Error` whose text, on a dev deployment, may quote the
    arguments (a validator, a schema check on insert, a value the client could not encode). No
    structured way tells them apart; sniffing the text would fail open. The cost is debugging:
    the deployment's logs keep the error.
  - **`Sanitizer` is a namespace on the main entry** (like `Ckeys`), since `safebyok-convex` needs
    it and the decision belongs in the core. `refusalFor` takes the foreign error and ignores it
    (`_foreign`), so every call site reads as the decision being made there.
  - **`unlocklabel` is checked at entry only.** The gloss said "used where the stored envelope's
    `unlocklabel` is read". On read, a refused label could only make the bundle `corrupt_record`,
    which locks the user out, or hide a way in. Either is more than a slot. So stored labels read
    as text, as before, and the vault's own first label, `passphrase`, is not checked. A host check
    that refused it would otherwise make a vault impossible to create.
  - The missing-unlocklabel message no longer recites the `Label` grammar (the check may be the
    host's): "addPassphrase needs an unlocklabel, what the user calls this way in, as text."
* **Deviations**: the read-side `unlocklabel` check, above. "Offer a pluggable sanitizer" sits in
  the validator-guarantees section as the gloss placed it, though it concerns errors.
* **Discoveries**:
  - convex-test's validator quotes a mistyped value (`got \`...\``); only an unexpected field is
    reported by name alone.
  - `safebyok-react` from this PR on passes `unlocklabel` in its bag, which an older core's
    `checkValidators` (a `strictObject`) refuses: the two must move together (lockstep).
  - `VaultDashboard.test.tsx`'s "replaces a damaged lockbox" timed out once under the parallel
    `justify` (24 s) and passes alone in 1 s: a load flake.
* **For the Coach**: whether entry-only is the guarantee you want for `unlocklabel`, and whether
  dropping all of Convex's error text is too much (the alternative: sniff
  `ArgumentValidationError` and keep the rest). Both are in the PR's open questions.
