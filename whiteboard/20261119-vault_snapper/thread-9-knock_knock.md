# Thread 9: knock_knock (2026-11-20)

Branch `20261120-knock_knock`, PR #776, stacked on #775. Proved: `pnpm --filter safebyok-react test` (25 files, 314 tests), its lint and typecheck.

* **Built**: `packages/safebyok-react/tests/giver/knock-knock.test.tsx`, four tests of Hue's knock-knock app over the real core and a `MemoryVaultDB`:
  a `useMutation` whose `mutationFn` calls `vault.withWhisper`; an unlock dialog rendered from `Giver.useGating()` (with `askUser` null),
  whose `<form action>` is a `useActionState` action calling `bank.attemptUnlock` with the passphrase from its FormData.
  The tests: unlock then answer (holding the deriver mid-attempt to check the disabled button and `isAttempting`); a second line with no second
  unlock; a wrong passphrase keeps the dialog, shows the refusal from the action's own outcome, empties the field, and the next try unlocks;
  a second line sent while the dialog is open joins the same gating (one gatingseq, one derivation) and both are answered.
  Each checks the passphrase is in no Device snapshot, nothing React holds of the tree, and no React Query cache entry.
  Helpers: `tests/test-helpers/knock-knock-world.ts` (`makeKnockKnockWorld`, `makeHeldDeriver`, the cheat) and
  `tests/test-helpers/secret-search.ts` (`holdsText`, a cycle-safe deep search over own data, Map/Set/FormData entries and Error message
  and cause; `reactTreeOf`, the fiber root under the container's `__reactContainer$` key).
* **Decisions made**:
  * **`useActionState` with `<form action>`, the field taken out of the FormData first** (`takeText` in the test). React keeps the FormData a
    form action is handed after the action ends: as the form fiber's pending status (what `useFormStatus` reads) and as the action
    update's payload in the hook's queue. Commenting out `form.delete` fails test 1 mid-attempt and test 3 after the refusal, so the
    search catches it. The action runs synchronously inside the dispatch when nothing is queued, so the field is gone before any render.
    This keeps React's own pending flag and its reset of the uncontrolled input.
  * **Set aside: `onSubmit` with `preventDefault`, `new FormData(form)` and a manual `form.reset()`**, pending read from the snapshot's
    `isAttempting`. It keeps the passphrase out of React entirely but rebuilds what React 19 gives for free; I judged the one-line
    delete the better host code, and the more likely thing a host will write anyway.
  * **The cheat lives in the test helpers, not on the core Device**: `_cheat_giverDeviceOf(device, vault)` is the giver's `GiverDevice`
    over the Device's own `getSnapshot`/`subscribe`, with `ensureBank` and `onBankStart` handing a bank object over the vault's minder.
    The core gains nothing that knows the giver's shapes. It is the test's one way past the core; when the Device grows `ensureBank` and
    `onBankStart`, the world passes the Device itself.
  * The submit button is disabled on `isUnlocking || isAttempting`; `useActionState` would queue a second submission otherwise.
* **Discoveries**:
  * The giver kit's own `unlockAction` (if it is to have one, per `dream-interface-2.md`) needs the same delete, or React holds the passphrase.
  * React resets an uncontrolled form after the action's transition commits: the input's DOM value holds the passphrase for the whole attempt.
  * The world's birth and stored proving derive too; the test counts derivations from render.

## Where the passphrase is naked

JS strings cannot be zeroed. Every place below holds a reference to the one string (or a copy the engine may share); it is reclaimed by the
garbage collector, at its leisure, once the last reference drops. "Dropped" below means that reference ends.

1. **The form's input.** The DOM `value` from the first keystroke until React resets the form when the action's transition commits: after
   `attemptUnlock` resolves, refused or not. On success the dialog unmounts too. The browser's own form history is out of our hands;
   `autoComplete="current-password"` hands it to the password manager, which is the user's choice.
2. **The FormData.** Built by React on submit. The field is deleted at the top of the action, synchronously, before the first await. Without
   that it lives in the form's status and the hook's queue until later renders replace them, past the end of the attempt.
3. **The action's local.** `takeText`'s result is passed straight into `{ passphraseClear }`; that object is the cleartexts, alive across the
   `await bank.attemptUnlock(...)` and dropped when the action returns. React never sees it: the action's state is `{ refusalkind }`.
4. **The re-entry point.** `bank.attemptUnlock` passes the cleartexts to `#handIn`, then to the open gating's `attempt`; it keeps nothing.
5. **The gating attempt.** `Gating.attempt` and `#attemptOnce` hold the cleartexts for the attempt; `checkedCleartexts` parses them into a new
   object holding the same string. A correctable refusal (`wrong_passphrase`) leaves them unspent, but the gating stores none: they live
   only in the attempt's frames. `spendCleartexts` zeroes passkey PRF bytes, and can do nothing for a string.
6. **The proving.** `PassphraseProving.buildStored` parses again (`typed`) and calls `passphraseKeyOf`; the proving keeps a non-extractable
   CryptoKey, never the passphrase.
7. **The key deriver.** The host's deriver gets the string. The test's SHA-256 deriver encodes it to bytes it does not zero; the Argon2id
   deriver (@noble/hashes) zeroes the UTF-8 bytes it encoded. The derived key bytes are zeroed by `passphraseKeyOf` once imported (G2).

Out of reach of the test: closures and private fields (`holdsText` follows own data only), and the JS heap itself.

* **For the Coach**:
  * **Should the giver kit ship an `unlockAction` that takes the field out of the FormData?** I recommend yes when it ships: every host
    that writes the obvious action leaves the passphrase in React for the rest of the dialog's life.
  * **A double Enter before React re-renders the disabled button** queues a second FormData, holding the passphrase, in React's action queue
    until the first attempt ends; the second attempt then deletes it. Accepted as residual; not something the core can reach.
