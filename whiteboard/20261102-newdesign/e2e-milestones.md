# E2E milestones

What the demo needs next, from thread 13 of sprint unrace, whose proof is `packages/safebyok/tests/models/proof.test.ts`. A host doing what that test does should work.

1. `Bank`, `Vault`, `Box`, `Gating` and their snapshot types exported from `src/index.ts`; none are yet.
2. `safebyok-react`'s provider, hooks and modals moved off the old `Bank`, onto what the test does.
  - `requestCleartext` opens the modal, which hands clears to `gating.attempt` and closes on `gating.whenSettled`.
4. ~~A timer calling `bank.autolock()`, and a call after each `hello`: it's a best-effort reminder, and nothing else locks a page left open. On a store with no watch, a timer calling `vault.hello()`.~~ add to TODO, not needed for e2e
5. ~~An effect that ignores a swept `hello`'s `disabled`, as a cancelled effect does.~~
  - a vacated or swept bank is finished, so a host makes a new Bank
6. A vault component keyed on `vault_tok`, and shown only while the bank's snapshot lists it: a rebirth is a new instance, `vault.boxListing` throws `vault_gone` on a tombstone, and a vacated vault's own snapshot stays `present: true`.
7. Something for "has a passkey": `VaultSnapshot` does not say, so a revoke button reads `vault.gate` in render. A `has_passkey` on the snapshot would be plainer.
8. ~~Boxes rendered only from `vault.boxListing`, as a box's own snapshot stays `present` past a vault delete~~ (this is a bug, if so -- discuss)
9. a reveal that re-renders after its own `expose`, as a replaced whisper tells nobody. (Explain reveal, but I think yes)

The next sprint's rulings change some of this: the host calls `vault.hello` after unlock. See `../20261104-newput/unrace-nextplan.md`. The Coach, on the host's new step: "if we have made it inconvenient for the react side we will adjust or sugar to their tastes once we're e2e".

helpers: logger, console-logger, checks/validator, stable-jsonify, one-at-a-time, crypto, phrases, consts

refusals: throwers, errors, refusals (should those latter be combined?), outcome, report-error, host-error,




