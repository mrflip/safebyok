# E2E milestones

What the demo needs next, from thread 13 of sprint unrace, whose proof is `packages/safebyok/tests/models/proof.test.ts`. A host doing what that test does should work.

1. `Bank`, `Vault`, `Box`, `Gating` and their snapshot types exported from `src/index.ts`; none are yet.
2. `safebyok-react`'s provider, hooks and modals moved off the old `Bank`, onto what the test does. `requestCleartext` opens the modal, which hands clears to `gating.attempt` and closes on `gating.whenSettled`.
3. A real `strengthChecker` passed to the bank: the default refuses every passphrase.
4. A timer calling `bank.autolock()`, and a call after each `hello`: it's a best-effort reminder, and nothing else locks a page left open. On a store with no watch, a timer calling `vault.hello()`.
5. An effect that ignores a swept `hello`'s `disabled`, as a cancelled effect does.
6. A vault component keyed on `vault_tok`, and shown only while the bank's snapshot lists it: a rebirth is a new instance, `vault.boxListing` throws `vault_gone` on a tombstone, and a vacated vault's own snapshot stays `present: true`.
7. Something for "has a passkey": `VaultSnapshot` does not say, so a revoke button reads `vault.gate` in render. A `has_passkey` on the snapshot would be plainer.
8. Boxes rendered only from `vault.boxListing`, as a box's own snapshot stays `present` past a vault delete; and a reveal that re-renders after its own `expose`, as a replaced whisper tells nobody. (Thread 13's review.)

The next sprint's rulings change some of this: a vacated or swept bank is finished, so a host makes a new Bank; and the host calls `vault.hello` after unlock. See `unrace-nextplan.md`. The Coach, on the host's new step: "if we have made it inconvenient for the react side we will adjust or sugar to their tastes once we're e2e".
