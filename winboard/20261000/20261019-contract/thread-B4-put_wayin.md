# Thread B4: put_wayin (2026-10-19)

Branch `20261019-put_wayin`, PR [#208](https://github.com/mrflip/safebyok/pull/208), stacked on
#207 (`slots`). Justify: green. Per package: core 2538 passed, 35 skipped; react 280; convex 274 (8 skipped); postgres 268 (14 skipped); graphql 262 (14 skipped); indexeddb 144 (10 skipped); fastkey 49; demo 203 (16 skipped); e2e 89 (96 skipped); root 265. Size check green; `Vault` budget raised to 36 kB by the rule.

Built in YOLO to its Contract section, written before the build as the plan's B4 row asks, on
B4a's slots: [`thread-B4-put_wayin-contract.md`](thread-B4-put_wayin-contract.md), for the
orchestrator carrying it into the Contract tab. Its drift from the tab is under *Open matters*.

* **Built**:
  * **`putWayin` and `delWayin`** (`vault.ts`, *Vault: ways in*): `putWayin(passphrase, newProof)`
    replaces `changePassphrase` and `addPasskey`; a new passphrase as text replaces the
    passphrase, a `PasskeyAnswer` puts the passkey (replacing any). Both verbs, and `tryPutWayin`,
    `tryDelWayin`, resolve the vault. `newProofOf` checks the new proof at the door: a blank
    passphrase `weak_passphrase`, a passkey's salt by `checkFreshSalt`, both before any derivation.
    `#reviseWayins` lost its abandon path (no maker, no null) and resolves nothing.
    `parsePasskeyMaker` is gone.
  * **One `Wayin.seal`** (`wayin.ts`): `sealPassphrase`, `sealFirstPassphrase` and `sealPasskey`
    became `Wayin.seal(vault, proof, holder, stamp, vaultKey)`, overloaded by the proof's class,
    resolving `{ wayin, sessionKey }`. The two kinds' differences sit lined up in two helpers,
    `passphraseKeying` and `passkeyKeying`, each making the header and the wayinKey; the wrap,
    the instance and the session handle are shared. `checkFreshSalt` is exported for the vault's
    door.
  * **The strength checker** (`passphrase-strength.ts`), as ruled: the option is
    `strengthChecker` (type `StrengthChecker`), optional. Left out, `UnchosenStrengthChecker`
    refuses every passphrase as too weak, and the vault logs `UnchosenCheckerSaid` once per handle,
    at error level, when it first consults it (`{ call: 'unlock' | 'putWayin' }`). A throw from a
    checker is `unexpected_error` naming it, with no kind, meta or cause of the throw.
    `parseStrengthChecker` (was `checkStrengthTest`) hands back the default for none.
    `zxcvbnStrengthChecker` (was `zxcvbnPassphraseTest`; file `zxcvbn-strength-checker.ts`)
    answers weak when its dictionary fails to load, since a checker never throws.
    `RenamedMakeVaultOpts` names `passphraseStrengthTest` as `strengthChecker` now.
  * **CUSTOMIZATION.md** (`packages/safebyok/`, shipped in `files`): *Pluggable Passphrase
    Strength Checker*, with the shipped checker "good but useless without its dictionary", and the
    AI prompt, its last reason verbatim; a test holds both the heading the log names and that line.
  * **React**: the provider's advice runs the parsed checker, so with none the dialog shows the
    unchosen reason as the user types; `createPasskey`'s doc and the README's passkey section make
    the passkey first and hand its answer to `putWayin`. The demo's *Ways in* does the same.
  * **Docs**: the core README (*The passphrase and the passkey* lists both calls' refusals,
    *A new passphrase's strength*, the passkey section, the error table), VOCABULARY.md, STYLE.md's
    `check` example, the root README's surface list, TODO.md (*A passkey made for a refused
    `putWayin`*), `notes/security.md` (by a `sonnet` subagent).
  * **Tests**: `vault-wayins.test.ts` rewritten around the two calls, each Does step, Guarantee
    and Refuses bullet titled `(Contract: putWayin, ...)` or `(Contract: delWayin, ...)`;
    `wayin.test.ts`'s sealing tests to `Wayin.seal`; strength tests for the default, the log and
    the throw rule.

* **Decisions taken**:
  * **`putWayin` takes a passkey's answer, not a maker.** The Contract's brief has
    `putWayin(proof, newProof)`, and its *getProof* says data calls never contain UI; B4a's
    `addPasskey(passphrase, makePasskey)` called host code (the authenticator prompt) inside the
    change. The cost: a passphrase refused after the passkey was made leaves that passkey on the
    authenticator, opening nothing. Written into the README, `createPasskey`'s doc and TODO.md.
  * **Names follow the option**: `StrengthChecker`, `parseStrengthChecker` (it hands back a value,
    so a `parse`), `zxcvbnStrengthChecker`, `safebyok/testing`'s `anyStrengthChecker`.
  * **The default logs at first use, not at make**, once per handle: `make` stays inert, and an
    app that only opens a standing vault never needs a checker.
  * **`Wayin.seal` always resolves a session handle** (one more AES-KW unwrap per seal), so the
    three statics are one; only the creating unlock keeps it.
  * **A blank new passphrase is `weak_passphrase`**, not `wrong_passphrase` (which a blank proof
    still is): it is a new passphrase no checker should admit, refused before the checker runs.
  * **The race test "during addPasskey()'s prompt" is dropped**: there is no prompt now, and the
    plan says no thread pins lock timing; the passphrase one stays as it was.

* **Deviations**:
  * `notes/security.md`: the `sonnet` subagent amended the entries the renames made false in
    place, each marked "amended 2026-10-19 (put_wayin)", as B4a's did (its open matter stands),
    added a clause to the header's rename paragraph, and fixed the two passages the plan named
    (~731's "today's v3"; ~1407's lock during `addPasskey`'s prompt, which never left the vault
    locked). It left one already-stale line (~1903, secure_floor's "the default is NIST's 12 code
    points": the core has never had such a default).
  * The preplan's B4 list policy (ids, labels, `too_many_wayins`, `last_wayin`) is superseded by
    B4a, as the plan's row says; nothing of it was built.

* **Discoveries**:
  * `#reviseWayins` reads storage afresh before the proof (`hello`, then `refresh`) and catches up
    after a `stale_write` (`#refreshOnStale`): both stood before this thread; the second is a
    re-read on a miss, for `lean_core` or the policy session to weigh.
  * `TH.makeWorld` passes `strengthChecker` by default, so a test of the unchosen default passes
    `strengthChecker: undefined` explicitly.

* **For the Coach**: the open matters below; the first two most need a look.

## Open matters

* **YOLO: `putWayin` takes a `PasskeyAnswer`, not a passkey maker.** A mistyped passphrase now
  leaves an orphan passkey on the authenticator. Recommend: keep, per *simple control flow
  first*; TODO.md holds the UX question.
* **YOLO: names** `StrengthChecker`, `parseStrengthChecker`, `zxcvbnStrengthChecker`,
  `anyStrengthChecker`, and the file `zxcvbn-strength-checker.ts`, following the ruled option
  name. Recommend: keep.
* **YOLO: the default logs at error level, once per handle, at first use**, quoting no passphrase.
  Recommend: keep.
* **YOLO: `zxcvbnStrengthChecker` answers weak when its dictionary fails to load**, where it
  rejected `storage_unavailable`, to keep the checker's contract (never throw). Recommend: keep.
* **YOLO: a blank new passphrase is `weak_passphrase`.** Recommend: keep.
* **YOLO: `Wayin.seal` resolves `{ wayin, sessionKey }` for every seal.** Recommend: keep; B5 may
  weigh it.
* **Contract drift: the signatures.** `putWayin(proof: string, newProof: string | PasskeyAnswer):
  Promise<Outcome<Vault>>` and `delWayin(proof: string): Promise<Outcome<Vault>>`: no `{
  wayinlabel }`, no `wayinId`. The full nesting is in the contract file; the brief's "Their full
  nesting is written when they are specified" and *Not in this contract yet*'s `putWayin`/`delWayin`
  line go.
* **Contract drift: *The policy*.** "with a passkey it adds one, or is refused `too_many_wayins`"
  becomes "puts the passkey, replacing the one standing"; "deleting the passphrase is refused
  `last_wayin`" becomes "the passphrase is never deleted" (B4a's drift, carried).
* **Contract drift: `Wayin.seal`.** The class block's `static seal(vault, proof: Proof, vaultKey,
  stamp): Promise<Wayin>` is `static seal(vault, proof, holder, stamp, vaultKey): Promise<{ wayin,
  sessionKey }>`.
* **Contract drift: `weak_passphrase`'s row** adds "or a blank one".
* **Contract drift: `unexpected_error` from a strength checker carries no `cause`**, against
  *Shapes*' "`cause?`: the lower failure as it came". Proposed: *Shapes* adds "never a host
  function's throw that heard a passphrase".
* **Contract drift: *Vault.make*'s `strengthChecker`** gets the contract file's last section.
