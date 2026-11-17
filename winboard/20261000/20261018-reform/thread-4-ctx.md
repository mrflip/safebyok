# Thread 4: every cipher binding is a ctx (2026-10-18)

Branch `20261018-ctx`, PR [#162](https://github.com/mrflip/safebyok/pull/162), stacked on
[#161](https://github.com/mrflip/safebyok/pull/161) (line main → #159 → #160 → #161 → #162).
Justify: green (core 2110 passed / 35 skipped, four of them new; react, convex, graphql, postgres, indexeddb, fastkey, scripts, demo and e2e unchanged and green).

* **Built**:
  - `packages/safebyok/tests/ctx-bytes.test.ts`, committed first against thread 3's tip and green
    there. It pins the bytes of `cipherBinding`'s encoding (as hex, and as the JSON text it spells),
    the wayin's builder for both purposes, the lockbox's `boxBinding` for both wraps, and the
    lease's `localBinding`. Only identifiers changed in it with the rename.
  - The rename: `cipherBinding` → `cipherCtx`, `CipherBindingPart` → `CipherCtxPart`, the `binding`
    parameter of `cipherBytes`/`decipherBytes`/`wrapKeyUnder`/`unwrapKeyUnder` → `ctx`,
    `envelopeBinding` → `wayinCtx`, the lockbox's `boxBinding` → `boxCtx`, `localBinding` →
    `leaseCtx`; `wayin.ts`'s module-level `binding(...)` builder → `wayinCtxOf`. Doc blocks in
    `crypto.ts` say what a ctx is. Comments and test titles that said binding say ctx.
  - Empty changeset `.changeset/20261018-ctx.md`: `cipherCtx` and its part type are not exported
    from any package's entry.
* **Decisions taken**:
  - The builders in `vault.ts` are closures inside `openVault`, and the wayin's is private, so the
    fixture reaches each through the narrowest path and exports nothing. A ciphertext the
    builder's output sealed is unwrapped or deciphered under a hand-written literal of the bytes
    expected: the wayin through `Wayin.sealPassphrase`/`sealPasskey` (a passkey's HKDF `info`
    too), the lockbox through a stored `anthropic` box opened with the vaultKey from
    `Wayin.openWithPassphrase`, the lease through `deviceDB.readUnlock`. The literals are the
    UTF-8 JSON text of each ctx, readable and regenerable; only values drawn afresh (`vault_id`,
    `revision_id`, `salt_b64`) are interpolated from the record that carries them. Mutating the
    order of the lease's or the lockbox's parts makes the test fail.
  - `wayinCtxOf` for the wayin builder: `-Of` is the module's convention (`stampOf`, `headerOf`,
    `passkeyKeyOf`), and `wayinCtx` is the local it fills.
  - The error message of `cipherCtx` now says "A cipher ctx was handed ...": a message, not a byte.
* **Discoveries**: threads 5, 6 and 7 move the pinned bytes on purpose. The test's header comment
  says so: update its literals together with the tag, and with nothing else. The thread-3 test
  for a passkey's info (`wayin.test.ts`) still builds its ctx through `cipherCtx`, so it follows
  the production builder; `ctx-bytes.test.ts` is the one that holds literals.
* **Retirement grep**: see the PR. Survivors are all other senses of binding (React or host
  bindings, a JS variable binding in the eslint configs, Argon2's native binding), plus
  VOCABULARY.md's *Old names* table. One ctx sense, in `safebyok-postgres/src/columns.ts`, was
  renamed.
