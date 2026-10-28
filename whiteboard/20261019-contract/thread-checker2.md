# Thread checker2: a broken checker is thrown, and the vault checks a passphrase itself (2026-10-21)

Branch `20261021-checker2`, PR [#218](https://github.com/mrflip/safebyok/pull/218), stacked on [#217](https://github.com/mrflip/safebyok/pull/217),
in the line main → #213 → #212 → #214 → #215 → #216 → #217 → this. Justify: green. Core 2704
passed, 37 skipped; react 287; convex 295 (9 skipped); postgres 282 (15 skipped); graphql 279
(15 skipped); indexeddb 150 (11 skipped); fastkey 49; demo 209 (17 skipped); e2e 95 (104
skipped); root 265.

* **Built**:
  - *Thrown, not refused* (item 1): `ThrownMistake` (`src/errors.ts`, not exported), a VaultError
    subclass. The guard throws one for a host checker that throws (`unexpected_error`) or answers
    no verdict (`bad_option`), carrying nothing it heard. `#trying` rethrows it instead of
    resolving it (and tells no bad news); `Ask.#answerFrom` lets it through when `getProof` does.
    So `tryUnlock`, `tryPutWayin` and `ask.attempt` throw it.
  - *`vault.checkPassphrase(typed)`* (item 3): `guardStrengthChecker(hostChecker, scope)` binds
    the scope at make (frozen once). The method refuses a non-string `bad_option` and resolves the
    verdict; it reads nothing and waits on no hello. `vault.strengthChecker` and the
    `GuardedStrengthChecker` export are gone; `ProofVault` is `Pick<Vault, 'keyDeriver' |
    'checkPassphrase'>`; `TH.vaultSliceOf` carries `checkPassphrase`.
  - *React* (item 1): `PassphraseModal` asks `vault.checkPassphrase` for advice when given no
    `passphraseAdvice` (the provider's `adviceFrom` is gone). What advice throws, and what an
    attempt throws, goes to `AnsweringOnce`, above the dialog's own Boundary, and is thrown there
    (through `forBoundary`) to the app's boundary. `adviceFailed` sanitizes every host throw.
  - *The load* (item 2): `#greet` runs `load()` and `#refresh()` under `Promise.allSettled`; the
    load's failure wins, then the read's; no lease is taken up after either.
  - *The watch* (item 4): a hello the watch runs that fails is logged as `err.message`, `{ call:
    'hello' }`, the error itself (`unexpectedError` for a non-VaultError, as `tryHello` would),
    once until a hello succeeds (`#watchHelloWarned`). A refresh keeps its own streak warning.
  - *TODO.md* (item 5), under *Soonish*, in the Coach's words.
  - Docs: both READMEs, CUSTOMIZATION.md, `notes/security.md` (nine entries amended, sonnet).
* **The checker's contract, for the Contract rewrite**:
  - `vault.checkPassphrase(typed: string): Promise<PassphraseVerdict>`. Resolves `{ strong: true }`
    or `{ strong: false, reason }`; a blank passphrase is weak unheard. Rejects `bad_option` for a
    non-string. Reads nothing; no hello.
  - A host checker that throws, or answers no verdict, is a bug: `checkPassphrase` and every call
    that asks it -- `unlock`/`tryUnlock` creating, `putWayin`/`tryPutWayin`, `ask.attempt`, and
    `tryEnsureLease` when `getProof` lets it escape -- throw `unexpected_error` or `bad_option`,
    carrying no cause, meta or host text. Never resolved as a refusal; never told to `onBadNews`.
  - The load runs beside hello's read, at every hello that reads. A failed load fails the hello
    (`unexpected_error`, its throw the cause), as a result from `tryHello` (not thrown), and takes
    up no lease; the next hello loads again.
  - A weak verdict is `weak_passphrase` from create and `putWayin`, as before.
* **Decisions taken**:
  - A subclass, not a flag on VaultError: `instanceof ThrownMistake` at the two places that turn
    throws into results is the whole mechanism, and hosts cannot mint one (not exported).
  - React: *a throw is the app's, a refusal the dialog's*. Advice and attempt throws go above the
    dialog's boundary; misuse *results* (a key deriver's `unexpected_error`, `tryDel`'s) still show
    the dialog's "Something went wrong". The vault's own check became the modal's default so the
    dialog can tell its safe throw from a host's (which may quote the passphrase).
  - When load and read both fail, the load's failure is the hello's: as before, when it ran first.
* **Deviations**:
  - *State after a failed load*: #216 read nothing into state; with load and read together the
    read lands, so a failed-load hello may leave the state `absent` or `locked`, not `opening`.
    Keeping "nothing read" would mean splitting `#takeStorage`'s read from its take-up.
  - *PassphraseModal's default advice* is now the vault's check, where it said nothing; a host
    rendering the modal itself gets advice. `() => null` turns it off.
  - The watch now logs a read-failure streak once as a refresh and, when the next ring's hello
    fails too, once as a hello (`vault-races.test.ts` pins both).
* **Discoveries**:
  - `vault-provider-dialog`'s "a dialog that meets misuse keeps the app in place" timed out once
    under full-suite load (findByRole, 1 s) and passes alone; not touched by this thread.
  - `pnpm size:budget` says idbVaultDB wants 2.5 → 2.6 kB; not this thread's (untouched code), and
    justify passes, so left.
* **For the Coach** -- the answer to "why are functions messing with other functions' errors? If
  hello throws, how does that become a storage error?", ready to paste:

  > It shouldn't have. The vault watches storage, and when storage rings with a change it reads
  > again in the background. When no hello had yet succeeded, that background read was a whole
  > hello -- load the checker, read storage, take up the lease -- and the watch caught whatever
  > failed and logged one fixed line, "Storage rang with a change the vault could not read",
  > written when the watch only ever ran a read. Once hello also ran the checker's load, a failed
  > load came out of that catch dressed as a storage fault. There is nobody to throw to from a
  > background callback, so the watch must log, but now it logs the hello's own refusal as it is
  > (its message, the error itself, `call: 'hello'`), the same words `tryHello()` would have
  > resolved; only a plain refresh keeps the storage line. Nothing else rewrites a hello's error.

  - **try forms and misuse** (contract drift): the sprint's rule reads "conditions are results
    from `try*` calls; failures and mistakes throw", but `try*` calls resolve misuse as results
    today (`bad_option` for a bad argument, a key deriver's or `getProof`'s `unexpected_error`).
    The checker's are the first to throw. Recommend a later thread decide whether every misuse
    throws from a `try` form (the `ThrownMistake` seam generalizes: `#trying` would test the
    family instead).
  - **State after a failed load**: accept that the read lands (above). Recommend accepting.
  - **Advice errors leave the dialog**: a host `passphraseAdvice` that throws now takes the app
    down to its boundary (with no boundary, React unmounts the root), where it showed "Something
    went wrong" in the dialog. Recommend accepting: it is a bug in the host's code.
