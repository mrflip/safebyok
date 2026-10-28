# Thread 7: vault_bank_flip (2026-10-28)

Branch `20261028-vault_bank_flip`, PR #PRNUM, stacked on #321 (cut from its tip 496e3046). Justify: green
(core 3475 tests pass, 37 skipped; every package lints, typechecks, builds, tests and fits its size budget).

The Coach's ruling of 2026-10-28: the throwing body does the try/catch that fixes its refusals, and the
`try` form wraps as usual. Behaviour is kept: every demand, every `#demandNotGone`, every await and every
refusal kind is where it was; a throw that is no VaultError still leaves both forms as 'unexpected_error';
bad news is told exactly once on either path.

* **Built**:
  - `packages/safebyok/src/vault.ts`: the twelve Vault pairs (`hello`, `refresh`, `ensureUnlocked`, `lock`,
    `checkStrength`, `putWayin`, `delWayin`, `putBox`, `getBox`, `getWhisper`, `delBox`, `del`) hold their
    bodies whole in the throwing form, inside `try { ... } catch (err) { throw this.#heardRefusal(err) }`;
    each `tryX` is `return outcomeOf(() => this.X(...))`. The bodies moved from `tryX` to the `X` directly
    above them, unchanged inside but for `return good(v)` becoming `return v` (`good(undefined)` dropped).
    `useWhisper` composes through `getWhisper`, so its refusal is told once, as before.
  - `#badOutcome` is `#heardRefusal(thrown): VaultError` (banner *Two forms*): the same two lines (a
    VaultError as it came, else `Refusals.unexpectedError`), `#hearBadNews` told, the refusal returned
    rather than wrapped in `bad()`.
  - `packages/safebyok/src/gating.ts`: `GatingTools.badOutcome` is `heardRefusal: (thrown) => VaultError`;
    its three catches (`#run`'s decline, `#attempt`'s check and chain) call it, wrapping in `bad()` where
    an Outcome is settled or returned. `BadOutcome` is no longer imported there or in `vault.ts`.
  - `packages/safebyok/src/bank.ts`: the five Bank pairs (`hello`, `ensureVault`, `reopenVault`,
    `clearCachedVault`, `delDamagedVault`) hold their bodies in the throwing form inside
    `try { ... } catch (err) { throw refusalOf(err) }`, with `refusalOf` a module-private helper in the
    *Helpers* section; each `tryX` is one `outcomeOf` hop. `ensureVault` and `reopenVault` end
    `return await this.#ensureEntry(parts)` (the `await` is what lets the catch see a rejection; it was
    `return this.#ensureEntry(parts)` inside `outcomeOf`'s async arrow, where `outcomeOf` awaited it).
  - Changeset `.changeset/20261028-vault_bank_flip.md`, empty: no refusal changes.
* **Decisions taken**:
  - `#heardRefusal`, the handoff's name: it acts (tells the news) and returns the refusal, so it is not a
    pure `fooOf`; the gating tool takes the same name so its doc and the vault's read alike.
  - The Bank's catch only maps: the Bank tells bad news at a birth (`#tellBadNews`, from the birth's
    settling), never in a pair's catch, so a `#heardRefusal` of its own would have nothing to tell. Hence a
    module-level `refusalOf`, thread 2's name and expression, so the restack can fold it: once #325 lands,
    `bank.ts`'s goes and it imports `outcome.ts`'s, which that thread must then export from the module
    (not from `src/index.ts`) for `bank.ts` to reach. Until then the expression is written three times in
    the package: `outcomeOf`, `#heardRefusal`, `refusalOf`.
  - `tryX` is `return outcomeOf(...)` with no `await`: it sits in no `try`, as STYLE.md's `return await`
    rule has it (thread 6's DeviceDB forms are the model; thread 1's `Box.trySeal` has the `await`).
* **Deviations**: none from the handoff. The doc blocks were already on the throwing forms with the
  `try` form's one line, so none moved.
* **Discoveries**:
  - The handoff counted 18 Vault pairs; there are 12 (above) and 5 Bank pairs. The 18 was near the count
    of `#badOutcome` mentions.
  - The route handing `#badOutcome` out of the Vault was `#gatingTools` (`gating.ts`'s `GatingTools`),
    not `[provingTools]`: `ProvingTools` never carried it. Flipped as the handoff meant, in the gating.
  - The Bank's pairs were not in the `#badOutcome` form: `tryX` was `outcomeOf(async () => { body })`,
    with `X` as `valOf(await this.tryX())`. Same flip, same result.
  - For thread 8 (read_names): nothing inside any body changed, and no private name did; `git diff`
    shows each one-line `X` growing into the body and the `tryX` beneath it shrinking to the hop.
  - After #325 and this thread, every throwing form in the package throws a VaultError (Lease and Box
    through `refusalOf`, Vault and Bank through these catches, the stores through theirs); the raw-throw
    asymmetry thread 1 reported is closed.
