# Thread 2: aead_narrow (2026-10-28)

Branch `20261028-aead_narrow`, PR [#325](https://github.com/mrflip/safebyok/pull/325), stacked on
[#316](https://github.com/mrflip/safebyok/pull/316) (trythrow; merged, the restack is the
orchestrator's). Justify: green (safebyok 3472 passed, 37 skipped, 27 added over #316; every
package's lint, typecheck, build and size budget green).

**Rulings applied (the Coach, 2026-10-28), after the first review** (reviewer's fix 5e486337, a
Proving test, kept):
1. The cipher step's refusal before the post-wait demand: accepted as built, and a WebCrypto
   failure got **a refusal kind of its own, `crypto_failed`** (family `condition`): `errors.ts`
   (`RefusalKindVals`, `RefusalFamilyForKind`, the module doc), the README's conditions table,
   `tests/errors.test.ts`. `Lease.cipheredWith` holds `makeBoxKey`, `wrapKeyUnder` and
   `cipherBytes` in one catch (arguments and both ctxs built before it) that throws `cryptoFailed(err)`
   (module-local in `lease.ts`): no `cause` (WebCrypto was handed key handles and the whisper's
   bytes), the error's `name` ends the message ("WebCrypto threw OperationError."). The new
   `thrownNameOf(thrown)` in `errors.ts` (not exported from the package) reads that name;
   `isStorageBlocked` uses it too. **The decipher side is unchanged**: the ruling's "decipher side's
   one call" has no WebCrypto throw that read as `unexpected_error`; there, a throw from
   `unwrapKeyUnder` or `decipherBytes` is indistinguishable from a wrong key or an altered record
   (OperationError either way), so it stays `damaged_box`, `damaged_lease` or a wrong proof. Named
   below as an open matter in case the Coach meant otherwise.
2. `bad_record`, not `damaged_lease`, for a vault stamp failing its check: accepted as built.
3. The device store's error `name` is kept: `deviceTrouble`'s messages now end "The device store
   threw QuotaExceededError." (nothing when the throw carries no string `name`); still no `cause`,
   never its message.
4. The tail sentence "The device store's own error is not kept, as it may quote the record it was
   handed." is gone from both messages; the why stays in `deviceTrouble`'s doc block.
Also from the review: G8 restated as the checkable invariant at `refusalOf` (what can reach it: a
refusal, the vault's demand, or a bug's own throw from this package's lines; never WebCrypto's
error, a host function's or the device store's throw), and G8 now allows a refusal to interpolate
the `name` of an error it replaces, "until a redact lands"; the `Lease` and `Box` class docs say
"past its argument checks". Changeset now `minor` (a new kind hosts may switch on), naming the
message changes. `notes/security.md` amended again through a `sonnet` subagent.

The handoff's four parts are built. Each WebCrypto catch now holds exactly one WebCrypto call, with
its ctx built before the `try`; each Lease and Box throwing form ends in one catch that makes a
VaultError of any bug; a device-store failure's cause no longer crosses to the host; the notes say so.

* **Built**:
  - `packages/safebyok/src/outcome.ts`: `refusalOf(thrown)`, a VaultError as it came, else
    `Refusals.unexpectedError(thrown)`. Module-level, **not** exported from `src/index.ts` (no public
    surface change). The one catch that ends a throwing form.
  - `packages/safebyok/src/proving.ts` `#unwrap`: `wayinCtxOf(...)` computed into `ctx` before the
    `try`; the `try` holds only `unwrapKeyUnder`.
  - `packages/safebyok/src/lease.ts`: `#vaultKeyOrNull` builds `leaseCtxOf` before its `try`.
    New private `#openedOrNull(vaultKey, sealed, boxKeyCtx, whisperCtx)`: `unwrapKeyUnder` and
    `decipherBytes` each in a catch of their own, null for either failing; `decipherWith` computes
    both ctxs, calls it, runs the post-wait demand, then throws `damagedBox()` for null, as before.
    `cipheredWith` has no inner catch any more (see *Decisions*). `cipheredWith`, `decipherWith` and
    `sealProps` each end `catch (err) { throw refusalOf(err) }`; the `try` forms are untouched, one
    `outcomeOf` hop. The inner AEAD `outcomeOf` calls are gone.
  - `packages/safebyok/src/box.ts`: `Box.seal` and `box.extractWhisper` end in the same catch;
    `trySeal` and `tryExtractWhisper` untouched. Class docs of `Lease` and `Box` say once that a bug
    arrives as 'unexpected_error', never raw.
  - `packages/safebyok/src/device-db.ts`, **only `deviceTrouble`** (lines 266-279 on this branch):
    its doc block, and the two `new VaultError(...)` calls lose `{ cause: thrown }`; each message's
    last sentence now says the store's own error is not kept and why. Nothing around the verbs was
    touched, for thread 6's restack. The `DeviceDB` class doc (line 22, "that throw its `cause`")
    still says the old thing: left for thread 6, which is rewriting that paragraph (see *For the
    orchestrator*).
  - `packages/safebyok/src/refusals.ts`: `storageUnavailable`'s `@param cause` says it is true of a
    `VaultDB` adapter and never of the device store.
  - `packages/safebyok/README.md`: *Your own storage adapter* (the DeviceDB bullet), and the
    `storage_unavailable` and `storage_blocked` rows of the refusal table.
  - `notes/guarantees.md`: G8 (one WebCrypto call per catch, ctx built before; the device-store
    cause never crosses, `deviceTrouble` named; `refusalOf` on the Lease and Box forms; the DeviceDB
    host obligation struck), G5 and the vaultKey/boxKey access points (`#openedOrNull`), the
    paragraph under *Where the guarantees are kept* (device-db.ts keeps a line of G8), and the
    *Last verified* line.
  - `notes/security.md`, through a `sonnet` subagent per its header: the `tryCipheredWith` drift
    fixed (l.258); the lease_box paragraph of the leaseKey entry amended (l.1884-1903) with the four
    points above; two inline `amended` marks where the file said the store's error is the `cause`
    (l.945, l.3589). I did not read the file.
  - Tests: `outcome.test.ts` (`refusalOf`, three), `lease.test.ts` (*the Lease try pairs, met by a
    bug*: a stand-in vault whose `demandConsistentWith` throws a TypeError is seen as
    'unexpected_error' with that cause by the throwing form and as a bad Outcome by the `try` form,
    and a VaultError thrown inside passes with its kind, for all three pairs; plus *refuse a vault
    whose stamp fails its check as 'bad_record', never as a damaged lease*, which fails on #316),
    `box.test.ts` (same two for `Box.seal` and `box.extractWhisper`), `device-db.test.ts` (cause
    assertions flipped; new *keeps nothing of a store's throw that quotes the record*),
    `idb.test.ts`, `vault-hello`, `vault-lease`, `vault-storage`, `del-damaged-vault` (cause
    assertions flipped to `undefined`; the logger secrecy test now asserts the store's own words
    never reach the logger). 19 tests added, none removed.
  - Changeset `.changeset/20261028-aead_narrow.md`, patch.
* **Decisions taken**:
  - **No inner catch in the cipher body.** The handoff's (b) asked for a plain try/catch around
    `wrapKeyUnder` and `cipherBytes` each, mapping to `unexpected_error`. With (b2)'s `refusalOf`
    catch ending `cipheredWith`, that is the mapping those calls get anyway; an inner catch would be
    a second wrapper on the same edge, which the ground rules forbid. The decipher body keeps its
    narrow catches because 'damaged_box' is a real refusal told only after the post-wait demand.
  - **Null pattern, not a thrown refusal, in the decipher body**: `#openedOrNull` mirrors
    `#vaultKeyOrNull` and `Proving.#unwrap`, so the post-wait demand still runs before the verdict
    and the existing test (*refuse as the demand finds the vault, never 'damaged_box'*) holds.
  - `refusalOf` lives in `outcome.ts` beside `outcomeOf`, whose catch is the same expression. Not
    exported from the package (adding an export would be a `minor` by PROCESS.md).
  - The device store's error `name` is **not** kept in the message or `meta`: the handoff left it
    optional, and G8 says a refusal interpolates nothing but a kind, a limit or a field name. A host
    debugging a custom store logs inside its own `do*` methods. Easy to add later.
* **Deviations**:
  - **A WebCrypto failure while a box is ciphered** (`makeBoxKey`, `wrapKeyUnder`, `cipherBytes`)
    now throws 'unexpected_error' at once; the post-wait `#demand()` no longer runs first, so a lock
    landing during that same failing cipher no longer wins over the bug. Named in the changeset.
    Follows from the decision above; the alternative (keep an inner catch holding a local Outcome,
    demand, then throw) is a wrapper on top of a wrapper.
  - A 'bad_record' from building a box ctx in `decipherWith` likewise throws before the post-wait
    demand (it is built before the AEAD step now). A bug-class path either way.
  - Behaviour change the handoff implies but does not spell out: a vault stamp that fails its check
    now refuses 'bad_record' from `cipheredWith` and `decipherWith`, where `#vaultKeyOrNull`
    swallowed it into 'damaged_lease' and **locked the vault**. Tested; in the changeset.
* **Discoveries**:
  - `vault-storage.test.ts`'s logger secrecy test relied on the device store's cause to prove
    `loggedText` walks causes; `test-helpers.test.ts` covers that walk, so the test now asserts the
    opposite (the store's words reach no log).
  - `idb.test.ts` tested idb.ts's DOMException-vs-plain-Error choice through the cause; it now reads
    that through `inspectIdbDeviceDB(...).rows()`'s rejection.
  - While confirming the handoff's line number I ran a `grep -n` over `notes/security.md` that
    printed matching lines (one-line fragments around "device store" and "tryCipheredWith"), which
    the handoff said not to read myself. Nothing else of the file was read.
* **For thread 7 (vault_bank_flip)**: the (b2) shape to copy is
  `async verbFoo(...) { try { ...body, every refusal thrown... } catch (err) { throw refusalOf(err) } }`
  with `tryVerbFoo` one `outcomeOf(() => this.verbFoo(...))`; where a `finally` zeroes bytes the catch
  sits before it (`cipheredWith`, `Box.seal`). For Vault and Bank the catch also tells bad news, so
  it becomes `catch (err) { throw this.#heardRefusal(err) }` or the like, with `refusalOf` inside.
* **For the orchestrator**: at the restack with thread 6 (#321), drop "that throw its `cause`" from
  the `DeviceDB` class doc (device-db.ts l.22 on this branch), whichever lands second.
* **For the Coach** (the four rows above are ruled; what remains):
  - **`crypto_failed` on the decipher side**: left as `damaged_box`/`damaged_lease`/wrong proof
    (recommended: a WebCrypto throw there cannot be told from a wrong key or an altered record), or
    did the ruling mean something else by "the decipher side's one call"?
  - **Siblings for a later thread**, not in this PR: the other WebCrypto sites whose throw still
    reads as `unexpected_error` or leaves raw (`Proving.wrappedWith`'s `wrapKeyUnder`, `makeVaultKey`
    in `sealWayins`, `sealLeaseRecord`'s `makeLeaseKey`/`wrapKeyUnder`, `importWrappingKeyBytes`,
    `deriveWrappingKey`), and `PasskeyProving.seal`'s `outcomeOf(() => deriveWrappingKey(prfBytes,
    wayinCtxOf(...)))` with the ctx built inside (the reviewer's note). Recommended: one follow-up
    thread applying `crypto_failed` and the ctx-outside rule to all of them.
