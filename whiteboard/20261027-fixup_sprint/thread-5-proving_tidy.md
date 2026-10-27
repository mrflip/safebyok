# Thread 5: proving_tidy (2026-10-27)

Branch `20261027-proving_tidy`, PR [#311](https://github.com/mrflip/safebyok/pull/311), stacked on [#295](https://github.com/mrflip/safebyok/pull/295).
Justify: green (safebyok 3405 tests passed, 37 skipped; every package's lint, typecheck, build and size budget green).

The code-sanity cleanup of `packages/safebyok/src/proving.ts`, to the Coach's six rulings. Behaviour
does not change: the same demands in the same places, the same zeroing, wraps, unwraps and
refusals. Every test that stood before passes unchanged; two tests are added for the new accessor.

* **Built**:
  - `provingTools`, a Symbol exported from `proving.ts` (`Symbol('Vault.provingTools')`, never from
    an entry point), and `get [provingTools](): ProvingTools` on `Vault`, beside `get [goneBy]()`.
    The module WeakMap registry (`registerProvingTools`, `toolsOf`'s lookup) is gone; the private
    `toolsOf(vault)` now reads the accessor and refuses `bad_option` as before for an object without
    it. `vaultRecordHeldBy` (test-only) reads through it.
  - `Proving` keeps its vault's tools: `protected declare readonly tools`, attached by `adorn` in the
    constructor, non-enumerable like `vault` and `header`. The eight `toolsOf(this.vault)` round trips
    are gone.
  - `#vaultStamp` and the protected `vaultStamp` getter are gone: every ctx is `wayinCtxOf(this.vault.stamp, …)`,
    and `Wayin.make` takes `this.vault.stamp`. The constructor takes `gateEpoch: number`, not a
    `VaultSparse`; the scope fields and `vault_tok` the demand reads come from `vault.stamp`.
  - One spelling of the demand: the module helper `demandOn(tools, thing, gating, { sealing }?)`,
    `firstGate: sealing && thing.gate_epoch === 0`. `#demand`, `#call`, `demandSelf` and the inline
    `tools.demand(passkeyProving, …)` in `sealWayins` are gone; `demandAfterFailedSeal(tools, { vault_tok, gate_epoch }, gating)`
    calls it.
  - `wayinRecordAt` is inlined as `gate?.[slotlabel] ?? null` in `isCarriedBy` and `#currentWrap`.
  - `tests/proving.test.ts`: a `provingTools` describe, two tests (the accessor is readable, not in
    `Object.keys`, own symbols or JSON, and not a `Symbol.for`; a seal on a vault slice refuses
    `bad_option`). No test of the refusal existed before.
  - `notes/security.md`: the thread 11 entry on `ProvingTools` amended in place (sonnet subagent).
  - An empty changeset, `.changeset/20261027-proving_tidy.md`: nothing an entry point exports changes.

* **Decisions taken**:
  - **The Symbol lives in `proving.ts`, not `vault.ts`.** `vault.ts` imports `Proving` as a value;
    had `vault.ts` exported the Symbol, `proving.ts` would import a value back, a module cycle. The
    style is `goneBy`'s; the home is the reader's, as `held-lease.ts` is the lease reader's.
  - **`tools` is `protected`, not public.** `Proving` is exported as a type from `src/index.ts`; a
    public `tools` field would add to that contract. A protected member is reachable only by a
    subclass, so the exported surface is unchanged, and `adorn` attaches it (`decorate`'s `Partial<Proving>`
    does not admit a protected key).
  - **`demandAfterFailedSeal` hands `{ vault_tok, gate_epoch }`**, where it handed a whole
    `VaultSparse` with `vault_epoch`. `Vault.#inconsistencyWith` refuses a thing whose `vault_epoch`
    exceeds the held record's; the held record is only ever replaced through `isOlderPicture`
    (`#takePicture`, `#takeOwnWrite`, the birth), so a `vault_epoch` read from it earlier can never
    exceed it later: that branch was vacuous for this caller. The scope fields it dropped are the
    vault's own, so `sameScope` is unchanged too.

* **Deviations**:
  - **`held-lease.ts` stays a WeakMap.** I built the Symbol route for it (`heldLease`, a `LeaseHolder`
    type, the getter on `Vault` and on `TH.leasedSliceOf`), and `tests/vault/vault-boxes.test.ts`
    *the Vault object's public surface* failed: it walks every own key, symbol-keyed getters of the
    prototype chain included, and asserts no `Lease` is reachable from a Vault object without a
    method call. A Symbol getter makes the Lease reachable to a host that enumerates
    `Object.getOwnPropertySymbols(Vault.prototype)`; the WeakMap does not. The test is a guarantee,
    not a convenience, so I reverted that half (the handoff's "if it comes naturally" fallback). The
    package therefore keeps two private-access mechanisms; a one-line note on why sits in the
    `provingTools` doc block's neighbour, this file, and `notes/security.md`.
  - Plan §5c (`#unwrap`'s over-long first line) was already done by the `docblocks_core_rest` run:
    its first line is 18 words. Nothing to fold in.

* **Discoveries**:
  - `vault[provingTools]` yields no key and no Lease by a field or getter, as the Coach ruled; one
    nuance for the record: `holdLease(record)` *returns* a `Lease`, by a call with a record the
    caller supplies. The surface test allows a method call; `notes/security.md` says it.
  - `notes/guarantees.md` on branch `20261027-guarantees` ([#306](https://github.com/mrflip/safebyok/pull/306))
    says in G9 "a proving reaches the vault's tools through the module-private `registerProvingTools`";
    once this thread files, that sentence should name the `provingTools` accessor. Not on my branch.
  - The FIXME answers the Coach asked for: (a) the `has` check in `registerProvingTools` was vacuous
    (its one caller was a constructor with a fresh `this`), and is gone with the registry; (b)
    `#vaultStamp` was `vault.stamp`, six fields, frozen, fixed for the Vault object's life; (c)
    `checkWayin` demands, unwraps the gate's current wrap at its slot under the wayinKey with
    `CheckUsage`, and discards it: it proves the passphrase or passkey is right without keeping the
    vaultKey, and its name hides that the subject is the proving; (d) `wayinRecordAt` was
    `gate?.[slotlabel]`, now inlined.

* **For the Coach**:
  - **Renaming `checkWayin`** (suggested `demandOpens`): `Proving` is exported as a type from
    `src/index.ts`, so the rename is a contract change and waits for a ruling. Not done here.
  - **`held-lease.ts` as a WeakMap**: confirm the deviation above, or rule that a reachable `Lease`
    is acceptable and the surface test should stop asserting it; I recommend keeping the WeakMap.
