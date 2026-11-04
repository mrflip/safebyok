# e2e status: what the React demo still needs

A Sonnet's read of `whiteboard/20261102-newdesign/e2e-milestones.md` against `20261104-del_damaged`, the tip of the stack, on 2026-11-04. Nothing was built or run. I spot-checked its main claims against the code: the exports, `bank.sweep` and `bank.vacate`, and the old classes in React and the IndexedDB adapter. The rest is the agent's reading.

**In short: the core on `models/` works, and the host-facing layer hasn't started.** `tests/models/proof.test.ts` drives a bank's whole life, but only on `MemoryVaultDB` and `MemoryDeviceDB`. Nothing else exercises `models/`.

## The milestones

| # | Milestone | Status | Evidence |
|---|---|---|---|
| 1 | Export `Bank`, `Vault`, `Box`, `Gating` and snapshot types | Not started | `src/index.ts` reaches nothing in `models/` or `storage/`. `tsdown.config.ts` has no entry for them. The names are taken by the old classes |
| 2 | `safebyok-react` on the new bank | Not started | `bank-provider.tsx` imports the old `Bank`, `BankVault`, `Gating`. `GatingModal` is keyed on the old gating kinds |
| 3 | A real `strengthChecker` | Core done, no host wiring | `RefusingStrengthChecker` is the default in `models/bank.ts`. `browser.ts` has a zxcvbn checker, typed to the old options |
| 4 | Timers for `bank.autolock()` and `vault.hello()` | Core done, no timer | Both exist and the proof drives them. Nothing schedules them |
| 5 | An effect that ignores a swept `hello`'s `disabled` | Core done, no effect | The proof's StrictMode tests run `tryHello`, `sweep`, `tryHello` |
| 6 | Vault component keyed on `vault_tok`, and `vault_gone` on a tombstone | Core done, no component | `vault_tok` is in `VaultSnapshot`. The proof asserts both |
| 7 | "Has a passkey" | Not started | `VaultSnapshot` has no such field. The proof reads `vault.gate.toJSON().passkey_wayin` |
| 8 | Boxes from `vault.boxListing`, and reveal re-rendering after `expose` | Core done, no components | The proof's `boxList` and `whisperReveal` do it. Since #470, a whisper's component also has to watch the vault for the lock |

## Out of date in `e2e-milestones.md`

* It says a vacated or swept bank is finished. That's ruled but not built: `bank.vacate()` and `bank.sweep()` reset `#lastHello`, so `hello()` works again after either, and the proof's "signing out" and "StrictMode" tests depend on that. It also conflicts with milestone 5's design.
* It doesn't mention that the new names collide with the old exports.
* It leaves out the storage adapters, an IndexedDB deviceDB, `browserOpts` and the demo itself, which are the largest gap.
* Item 8's "(Thread 13's review)" refers to a closed sprint.

## The shortest ordered path

1. **Decide the export route:** replace the old top-level classes, or add an entry point such as `safebyok/next`. Needs the Coach.
2. **Thread 1b, `plain_whisper`.** `WhisperField`, `whisper-text.ts` and the reveal code all touch `{ val }`, so port React after this, not before.
3. **Thread 2, `newhello`,** before the timer and effect work, as it reshapes what they call. Thread 3 matters only to the demo's damaged-box UI. Thread 4 is internal.
4. **Export `models/` and `storage/`** from `src/index.ts` and `tsdown.config.ts`. New work.
5. **`has_passkey` on `VaultSnapshot`,** if the Coach agrees. New work.
6. **An IndexedDB deviceDB** on `storage/device-db-new.ts`: five `do*` methods. New work.
7. **An IndexedDB vaultDB** in `safebyok-indexeddb` on `storage/vault-db-new.ts`: eight `do*` methods and an optional `doWatch`. New work. The conformance suites import the old classes, so adapters have no reusable test yet.
8. **`browserOpts`** returning the new `deviceDB`, `keyDeriver` and zxcvbn checker. New work.
9. **Port `safebyok-react`:** the provider, hooks, modals for the new gating kinds, passkey helpers, box components, and about 17 test files. New work, and the largest piece.
10. **Port `demos/safebyok-demo-react`:** `stores.ts`, `outage.ts`, the panels, and about 24 tests. New work.
11. **Delete the old top-level modules.** New work. The Convex, GraphQL and Postgres adapters break here.
12. **Run the demo** end to end.

## For the Coach to decide

* Replace the old exports, or add an entry point.
* Whether a swept or vacated bank is finished, and so what StrictMode does: a new `Bank` per effect, or `sweep` and `hello` on one.
* Whether `has_passkey` goes on the snapshot.
* Whether React gets sugar for `hello` after unlock and the timers, or the host wires them. The Coach said they'd adjust "once we're e2e".
* Whether the demo's damaged-box and outage UI survives Thread 3.
* Whether the Convex, GraphQL and Postgres adapters are in scope for e2e. The demo doesn't need them.
* Whether `safebyok-fastkey` is kept.

## Not checked

* Whether `models/` compiles standalone in a bundler with the new `BankOpts`.
* Whether the old `zxcvbnStrengthChecker` satisfies the new `StrengthChecker` type.
