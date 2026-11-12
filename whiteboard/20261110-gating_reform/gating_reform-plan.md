# gating_reform: one function per gating, read top to bottom

Branch `20261110-gating_reform`, worktree `../byok-gating_reform`, cut from main at `4910fcec9`.

## What a reader goes through today

To follow `vault.addPasskeyPrompt()` from the click to the lease takes eleven hops across three files:

1. `vault.ts` `addPasskeyPrompt` calls `Gating.launch('add_passkey', this.#launchArgs)`
2. `vault.ts` `#launchArgs` builds a six-field bag: `listing, scope, vault, prior: null, friend, askUser`
3. `shapes-gateish.ts` `LaunchArgs<KindT>` (a conditional type on `prior`) and `gatingLaunchArgs` (a Zod check of the friend)
4. `gating.ts` `launch` checks the bag, and the constructor looks up `RunForGatingkind[kind]` and `ProveForGatingkind[kind]`
5. `attempt`, then `#attemptOnce`, which builds a second bag, `asked`: `scope, vault, listing, world`
6. `ProveForGatingkind.add_passkey`, line 232
7. `timelyAnte`
8. returns a `PasskeyAddProvings`, typed in `shapes-gateish.ts` as `AnteProvings & {...}`
9. `RunForGatingkind.add_passkey`, 50 lines above the prove, unpacks the first bag again
10. `friend.unlockByProof`, typed by `GatingFriend`, an `objCheck` in `shapes-gateish.ts`
11. `vault.ts` `#unlockByProof`

What a gating of one kind does is split in two, 50 lines apart. Thirteen types and checkers carry it between the pieces:
`LaunchArgs`, `Asked`, `Prove`, `Run`, `ProvingsForGatingkind`, five provings types, `GatingFriend`, `gatingFriend`
and `gatingLaunchArgs`.

The parts that do real work are sound and stay as they are:
- the attempt state machine: `attempt`, `#attemptOnce`, `dismiss`, `#endAsking`, `#concludeOnce`
- `checkedClears`, `spendClears` and `isCorrectable`
- one open gating per bank, through `attachGating` and `detachGating`

## Proposal

**1. One function per kind, proving then changing, in one body.** These are module functions in `gating.ts`, all
with one signature, `(vault, clears, unlockByProof) => Promise<Vault>`:

```ts
const addPasskey = async (vault: Vault, clears: unknown, unlockByProof: UnlockByProof): Promise<Vault> => {
  const { passphraseClear, passkeyClear } = checkedClears(GX.passkeyAddClears, clears)
  const { ante, gate } = await timelyAnte(vault)
  const proved         = await PassphraseProving.buildStored(gate, passphraseClear, vault.world)
  const passkeyProving = await PasskeyProving.buildNovel(gate.stamp, passkeyClear, vault.world)
  const passkeyWayin   = await passkeyProving.buildWayin(proved)
  const stored = await vault.listing.addPasskey(ante, SX.passkeyWayinRecord.parse(passkeyWayin.pickle()))
  return unlockByProof(vault, proved, stored.gate.gate_epoch)
}

const delVault = async (vault: Vault, clears: unknown): Promise<Vault> => {
  const { passphraseClear } = checkedClears(GX.vaultDelClears, clears)
  const { ante, gate } = await timelyAnte(vault)
  await PassphraseProving.buildStored(gate, passphraseClear, vault.world)
  // The lock first: no box opens under a lease while the tombstone goes out.
  vault.lock()
  return vault.del(ante)
}

const ActOnVault: Record<VaultGatingkind, (vault: Vault, clears: unknown, unlockByProof: UnlockByProof) => Promise<Vault>> = {
  unlock_vault: unlockVault, replace_passphrase: replacePassphrase, add_passkey: addPasskey, revoke_passkey: revokePasskey, del_vault: delVault,
}
```

The provings types go, because the provings become locals. The mapped types go too, because every vault kind has
the same signature.

**2. Two launchers in place of one launcher and a bag.**

```ts
export const launchGatingOn = (vault: Vault, gatingkind: VaultGatingkind, unlockByProof: UnlockByProof, askUser: AskUser | null): Promise<Vault> =>
  launch(new Gating(gatingkind, vault.listing, vault.scope, vault, (clears) => ActOnVault[gatingkind](vault, clears, unlockByProof)), askUser)

export const launchBirthGating = (listing: VaultListing, scope: VaultScope, prior: Revision, unlockByProof: UnlockByProof, askUser: AskUser | null): Promise<Vault> =>
  launch(new Gating('build_vault', listing, scope, null, (clears) => buildVault(listing, scope, prior, clears, unlockByProof)), askUser)
```

The gating keeps one closure, `#act`, and `#attemptOnce` calls `outcomeOf(() => this.#act(clears))`. A birth is no
longer a special case threaded through the bag, with `prior` null for every other kind.

**3. The friend becomes one function argument.** `Vault` keeps a private static `UnlockByProof` that calls
`vault.#unlockByProof`, and passes it to each launch. `GatingFriend`, its `objCheck`, and the `#launchArgs` getter
all go.

**4. `Gating.launch` leaves the public surface.** `Gating` is exported from `src/index.ts`, so today any host can
call `Gating.launch` with a friend of its own and be handed the `Proving` the passphrase made. With that proving it can
call `proving.buildLease` with a lease friend of its own. That is the route G9 says the surface does not have. The
launchers above are exported from `gating.ts` only, which `src/index.ts` does not re-export. `Gating` stays
exported, for its instance members and as a type.

### After

`vault.addPasskeyPrompt` → `launchGatingOn` → `attempt` → `#attemptOnce` → `addPasskey`, which reads top to bottom →
`unlockByProof`. Two files, six hops, no bags.

Rough size: `gating.ts` about 274 lines to 230; `shapes-gateish.ts` loses about 45 lines and thirteen names, and gains
`UnlockByProof` and `VaultGatingkind`; `vault.ts` loses about 8 lines.

## What else it touches

- **G1** (`notes/guarantees.md`) says "no gate, vault or `run` hears a passphrase", and names `ProveForGatingkind` as
  the chain. Once merged, each kind's function hears the clears and hands the passphrase only to a `Proving` builder.
  How long a clear lives does not change: `#attemptOnce` already holds `clears` through the run, to spend them after.
  G1 and G9 get rewritten to the new names, and `notes/security.md` gets an entry through the sonnet subagent.
- **Public surface:** `Gating.launch` goes. That is a minor release with a changeset. The stored format is unchanged.
- **Tests:** the `gatingLaunchArgs` tests in `tests/shapes/shapes-gateish.test.ts` go. `vault-lease.test.ts:310`
  (`for (const named of ['friend', 'gatingFriend', 'launchArgs', 'unlockByProof'])`) takes the new private names.
  A new test shows that `Gating` has no static `launch`. The gating and vault behaviour tests stay as they are, and
  are what proves the change.
- **Docs:** the gating section of `notes/design-proof.md`.

## Open questions

1. **Merge prove and run (recommended), or keep the split?** The split says, in structure, that the part that makes
   the change never sees a clear. The clears outlive the run anyway, in `#attemptOnce`, so the split protects
   nothing, but it is a property a reviewer can read off the code. The fallback keeps the split as
   `{ prove, run }` side by side in one object per kind. That fixes the distance, but keeps the provings types.
2. **No validator on the launchers?** They are exported from `gating.ts` but not from the package, and their only
   callers are `Vault`'s verbs, which have already checked the scope. I'd drop `gatingLaunchArgs`. CLAUDE.md's
   "validate every export" reads as the package's entry points to me; if it means every module, I'll keep a scope
   parse in each launcher.
