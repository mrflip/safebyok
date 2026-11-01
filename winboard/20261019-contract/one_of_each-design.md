# The one-passphrase-one-passkey shift: design for the Coach

*Orchestrator:* written 2026-10-19 at the Coach's request ("If you see it importantly simplifying
work in this sprint, would you do the design work now so I can look it over"), by a planning agent
reading the code at `origin/20261019-lease`. Paths are under `packages/`. The rows in *Open
Matters* ask the questions below one at a time; B4 waits on them.

## Where it stands

- **Stored.** `VaultProps.wayins` is a list of `WayinRecord`, format `safebyok-vault-v4`
  (`safebyok/src/types.ts:374`). The list holds 1 to `MaxUnlocks = 8` records (`:228`); its refines
  (`wayinList`, `:321`) keep `wayin_id`, `wayinlabel` and `credential_id` distinct. Every record
  carries `wayin_id`, `wayinlabel`, `vault_key_epoch`, `device_id` and `registered_at`, all bound
  into the wrap through `wayinCtx` (`safebyok/src/wayin.ts`).
- **Opening.** `Wayin.tryOpenAmong` (`wayin.ts:247`) dispatches to `openWithPassphrase` (`:449`),
  which filters by `wayinId`, key deriver and damage, then derives once per passphrase; its
  messages name what it passed over (`skippedByOtherDeriver`, `:511`). `openWithPasskey` (`:482`)
  is already a lookup by credential.
- **Verbs.** `vault.ts:464-684`: `changePassphrase`, `addPassphrase`, `addPasskey`, `delWayin`, each
  aimed by `wayinId` or `wayinlabel`, behind `passphraseToReplace`, `parseAim`, `parseWayinId`,
  `parseWayinlabel`, `#checkRoomForWayin` and the `last_wayin` guard; all through `#reviseWayins`,
  a write conditional on `vault_id`/`unlock_epoch`.
- **Snapshot.** `wayins: WayinSummary[]` (`types.ts:343`); react's `askPasskey(wayins)` and
  `offersPasskey` read it; the provider and `names.ts` carry a `wayinlabel` validator.
- **Already decided on paper.** The Contract (*Wayin*, *The policy*) and the preplan's B4 put the
  policy on the existing list: `putWayin(proof, newProof, { wayinlabel })`, `delWayin(proof,
  wayinId)`, `too_many_wayins` and `last_wayin` stay, `MaxUnlocks` becomes 2.

So the question is not whether to have the policy (B4 brings it) but whether the **stored shape**
and the **surface** say "one and one" rather than "a list a refine keeps to one and one".

## The shape proposed

```ts
VaultProps = { format: 'safebyok-vault-v5', ...scope, vault_id, registered_at,
               unlock_epoch, vault_key_epoch,
               passphrase: PassphraseWayinRecord,          // required: a vault is made with it
               passkey:    PasskeyWayinRecord | null }
```

- **Removed from each record:** `wayin_id` and `wayinlabel`: nothing aims at a way in, and a label
  on a singleton names nothing.
- **Kept:** `wayinkind` (the ctx purpose already tells the slots apart, and keeping it leaves
  `Wayin.make` and the ctx untouched); `device_id` and `registered_at` ("passkey added from another
  device on 3 Oct").
- **Replacing the passphrase** stamps it afresh: new `registered_at`, this device's `device_id`.
- **Snapshot:** `passphrase: PassphraseSummary | null` (null until a vault exists) and `passkey:
  PasskeySummary | null` replace `wayins`; `askPasskey(snapshot.passkey)` takes one summary.

**Slots or a capped list?** A capped list keeps the adapters' `wayins` column, but keeps a refine
for the invariant, ids to name entries, and the `distinct*` checks. Slots make an illegal vault
unrepresentable, which is the schema's job. Slots.

## What it removes or simplifies

Most of the runtime simplification comes from the policy itself, which B4 brings either way; the
shape adds the rest.

- `tryOpenAmong`, `openWithPassphrase`, `openWithPasskey`, `skippedByOtherDeriver`, `listOf`
  (about 90 lines of `wayin.ts`) collapse: the vault picks the slot by `proof.kind` and calls
  `tryOpen`. A null `passkey` refuses `absent_wayin`.
- Ids and labels go: `wayin_id`, `wayinlabel`, `WayinStamp`'s naming, `FirstWayinlabel`;
  `parseAim`, `parseWayinId`, `parseWayinlabel`, `passphraseToReplace`, `#checkRoomForWayin`; the
  `wayinlabel` validator and react's `wayinlabelCheck`; `bad_label` for ways in; `attempt`'s and
  `unlock`'s `{ wayinId }`.
- Two refusal kinds go: `last_wayin` (the passphrase cannot be named for deletion) and
  `too_many_wayins` (if a second passkey replaces the first, question 2).
- B4's verbs become `putWayin(proof, newProof)` and `delWayin(proof)` (deletes the passkey).
- Types: `wayinList`, `distinctIn`, `distinctCredentials`, `MaxUnlocks` (about 40 lines).
- React and demo: no "which passphrase" choice, no label field; D2's dialog and D4's `WaysIn.tsx`
  shrink to "change passphrase" and "add / replace / remove passkey".

Honest size: roughly 250-300 lines leave the core and its doc blocks, plus a smaller test surface.
Modest. The bigger saving is not building, documenting and testing a `wayinId`/`wayinlabel`
surface in B4 only to tear it out later.

## What it costs

- **Stored format** to `safebyok-vault-v5`; `v4` joins `OlderVaultPropsFormats`
  (`vault-db.ts:851`). Every existing vault reads `damaged_vault`, `delDamagedVault` clears it, the
  user makes it again; no migration (CLAUDE.md). The changeset says so, as v3→v4 did.
- **Adapters, in the same PR:** Convex validators (`wayins` becomes two fields; clear the
  component's tables before deploying); Postgres `vault-tables.ts`/`columns.ts` (`passphrase jsonb
  NOT NULL, passkey jsonb`; recreate `safebyok_vaults`); GraphQL `vault-schema.ts`/`fields.ts`.
  IndexedDB and local storage hold JSON whole.
- **Battery and helpers:** `wayinOf`, `vaultPropsOf`, `vaultPropsAtEpochOf`; conformance cases
  (~430, ~1024).
- **Tests:** `vault-wayins.test.ts` (909 lines; B4 rewrites it anyway) and `wayin.test.ts` (826);
  the e2e Convex test's `changePassphrase`.
- **React:** `askPasskey`'s signature, `offersPasskey`, the validators bag, `passkeysDamaged`.

## Recovery and multi-device questions

1. **Can a passkey prove a passphrase replacement?** The Contract's brief says both verbs take "a
   proof of the standing passphrase"; the code today lets a passkey reset a forgotten passphrase,
   the passkey's main recovery value. *Recommend:* any standing way in proves either verb (a
   passkey holder can already open the vault; they gain only locking the owner out of the
   passphrase).
   *Coach (2026-10-19):* "The standard default must be to provide old passphrase to get new
   passkey or new passphrase. Don't know why, but it's how it's done everywhere else, and we don't
   invent crypto." Only the standing passphrase proves either change.
2. **A second passkey:** refuse (`too_many_wayins`) or replace the first? *Recommend: replace*,
   with the dialog warning "this replaces the passkey added on <date> from another device"; every
   other device relocks anyway as `unlock_epoch` moves.
3. **A lost passkey:** the passphrase is always there. *Recommend:* nothing more.
4. **One passkey, one device?** Not quite: a synced passkey (iCloud Keychain, Google Password
   Manager) or a security key spans devices, and a phone can answer by hybrid sign-in where PRF
   allows; a user mixing ecosystems gets the passkey on one, passphrase-plus-lease on the rest.
   *Recommend:* accept before 1.0; option C is the escape hatch.

## Options

- **A. Slots, in B4** (B4 builds on the new shape). Gives up B4's scope: medium → large, every
  adapter, review `high` for the stored format.
- **B. B4 as planned (policy on the list), slots after the sprint.** Gives up B4's work twice: its
  Contract section, tests, react wiring and D3's README policy redone, a second break of the
  stored format and surface.
- **C. `passphrase` plus `passkeys: PasskeyWayinRecord[]`** (capped, `credential_id` the
  identifier, no `wayin_id` or labels). Keeps several devices' platform passkeys; gives up
  `delWayin`'s argument-free form (it takes a `credentialId`) and keeps add-versus-replace in the
  UI. Cheap: nearly all the list's complexity came from several passphrases.
- **D. Policy only, forever** (a list with a refine). Smallest diff; gives up an honest schema,
  keeps ids and labels.

## Recommendation

**Option A, in B4, before B4 builds.** It does not hugely simplify the sprint in lines, since B4's
policy already captures the runtime collapse, but it spares B4 writing, testing and documenting a
surface (`wayinId`, `wayinlabel`, `last_wayin`, `too_many_wayins`) the shift would delete; it puts
the one stored-format break inside the sprint already breaking the surface; and it settles TODO.md's
"Are we doing anyone a favor by accepting multiple passphrases?", which must be decided before 1.0.

What changes in the sprint's threads:

- **B4:** rewrite its brief to slots plus answers 1 and 2; large, `opus`, review `high`. To keep B4
  narrow, split the adapters, battery and format bump into a sibling thread landing in the same
  restack.
- **B5:** fewer statics (`tryOpenAmong`, `listOf` and the three seals gone).
- **C7 and C3:** rewrite every adapter's vault-props verbs and the battery after; landing the shape
  first means they build once, on v5.
- **D2:** the dialog has no choices beyond the passkey button and the passphrase.
- **D3:** writes the README's policy from the schema. **D4:** the demo's `WaysIn`.

If the Coach leans toward C, the timing is the same: `passkey` becomes `passkeys`, and
`delWayin` takes a `credentialId`.

## Coach thoughts

- *Orchestrator:* ruled 2026-10-19: option A, carried on the vault for now. The Coach's words are in `ruling-one_of_each.md`; built by thread B4a.
