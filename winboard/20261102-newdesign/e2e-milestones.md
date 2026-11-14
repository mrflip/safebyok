# E2E milestones

What the demo needs next, from thread 13 of sprint unrace, whose proof is `packages/safebyok/tests/models/proof.test.ts`. A host doing what that test does should work.

1. `Bank`, `Vault`, `Box`, `Gating` and their snapshot types exported from `src/index.ts`; none are yet.
2. `safebyok-react`'s provider, hooks and modals moved off the old `Bank`, onto what the test does. `requestCleartext` opens the modal, which hands clears to `gating.attempt` and closes on `gating.whenSettled`.
3. A real `strengthChecker` passed to the bank: the default refuses every passphrase.
4. A timer calling `bank.autolock()`, and a call after each `hello`: it's a best-effort reminder, and nothing else locks a page left open. On a store with no watch, a timer calling `vault.hello()`.
5. An effect that ignores a swept `hello`'s `disabled`, as a cancelled effect does.
6. A vault component keyed on `vault_tok`, and shown only while the bank's snapshot lists it: a rebirth is a new instance, `vault.boxListing` throws `vault_gone` on a tombstone, and a vacated vault's own snapshot stays `present: true`.
7. Something for "has a passkey": `VaultSnapshot` does not say, so a revoke button reads `vault.gate` in render. A `has_passkey` on the snapshot would be plainer.
8. ~~Boxes rendered only from `vault.boxListing`, as a box's own snapshot stays `present` past a vault delete~~ (this is a bug, if so -- discuss)
9. a reveal that re-renders after its own `expose`, as a replaced whisper tells nobody. (Explain reveal, but I think yes)

The next sprint's rulings change some of this: the host calls `vault.hello` after unlock. See `../20261104-newput/unrace-nextplan.md`. The Coach, on the host's new step: "if we have made it inconvenient for the react side we will adjust or sugar to their tastes once we're e2e".


is the difference so important it's worth agent context -- will one of them flash a lightbulb while debugging that the other wouldn't? For example: we have one error type for bad data coming in to a store and a different one coming out (one is an oopsie, the other a panic). Good reason to have them distinct. Also, a validator that is "duckish" for scope -- validating all fields against the full type, holding only the desired ones required and stripping the rest -- should throw bad_scope: that's informative, the name is bad. I'm sure there are cases where it's not.

> The stamp binds the sidecar too, so it's authenticated
-- change to be unsealed. Customers can get "public and sealed" by including the sidecar in both objects, they can only get "public and modifiable" if we don't seal something

"until you {@link put} the box"	"until you {@link put} a patch, and put seals only the patch's whisper, never this value"	Setting box.whisper and then calling put({ sidecar }) drops the value you set

`hello: "hydrate the vault listing" became "fetch"` -- we need better words here

The next sprint's rulings change some of this: a vacated or swept bank is finished, so a host makes a new Bank; and the host calls `vault.hello` after unlock. See `unrace-nextplan.md`. The Coach, on the host's new step: "if we have made it inconvenient for the react side we will adjust or sugar to their tastes once we're e2e".
