---
"safebyok": minor
"safebyok-react": minor
---

**A bank serves one signed-in user.** `Bank.make` takes the user's `user_id` beside `applabel`, and refuses one left out or failing its check `bad_scope`; `bank.user_id` and `bank.scope` (`{ applabel, user_id }`, frozen) read it back. Make the bank as the user signs in, and at sign-out let its vaults go (`bank.closeVaults()`) and drop it. Make the key deriver and the strength checker once, before any bank, and hand them to each.

```ts
// before: one bank for the app, the user named at each call
const bank = Bank.make({ applabel: 'acme', vaultDB, ...browserOpts() })
const vault = await bank.ensureVault({ user_id: session.user_id, vaultlabel: 'main' })
// after: a bank per signed-in user
const bank = Bank.make({ applabel: 'acme', user_id: session.user_id, vaultDB, ...browserOpts() })
const vault = await bank.ensureVault({ vaultlabel: 'main' })
```

**The bank's calls name a vault by a bag whose `vaultlabel` is required, and take its own stores in a second bag.** `ensureVault`, `reopenVault`, `clearCachedVault` and `delDamagedVault` (and their `try` forms) take `(bag, opts?)`; `closeVault` and `entryOf` take `(bag)`. An `applabel` or `user_id` the bag carries must be the bank's, or the call refuses `bad_scope`, naming the field and quoting neither; anything else in the bag is left out, so a Vault object, its snapshot or an entry's `scope` may be handed in as it is (`bank.closeVault(vault)`), and a `{ user_id, vaultlabel }` from before still names the bank's own user's vault. A vault stored elsewhere moves its stores to the second bag: `bank.ensureVault({ user_id, vaultlabel: 'work', vaultDB: workVaultDB })` becomes `bank.ensureVault({ vaultlabel: 'work' }, { vaultDB: workVaultDB })`; a `vaultDB` or `deviceDB` left in the first bag refuses `bad_option`, rather than be ignored and the vault born in the bank's own store. Two refusals change: a first bag that is no object refuses `bad_scope` where it refused `bad_option`, and a field the first bag does not know (`userId`, a misspelling) is left out where it refused `bad_option`; the second bag refuses any field it does not take. `bank.demandConsistentWith(thing)` is new: it refuses `bad_scope` for a thing of another app or user than the bank's. Types: `MakeBankOpts` gains `user_id`; `VaultDraft` is `BankVaultOpts` (`{ vaultDB?, deviceDB? }`); `VaultChoice` is gone. `delDamagedVault({ ...bankOpts, vaultlabel })` takes the `user_id` from the bank's options.

**A key deriver may carry `load`**, as a strength checker may: each bank's `hello()` runs both side by side, before any vault is born. One that fails refuses the hello `unexpected_error`, what it threw the cause (the strength checker's refusal first, where both fail), and the next hello loads again. `Bank.make` refuses a `load` that is no function `bad_option`. The supplied derivers carry none.

**safebyok-react: `BankProvider` makes a bank per `user_id`.** It hands its `user_id` prop to `Bank.make`, and drops the bank, its vaults let go, as the `user_id` changes or turns null; `useBank()` is null while nobody is signed in. Its props are as before. A host calling the bank from `useBank()` names a vault by `{ vaultlabel }` (or its entry's `scope`), as above.

Nothing stored changes.
