# Thread 10: names -- `signin`, and `banktok` on ask, answer and event (2026-11-24)

Branch `20261124-names`, PR [#876](https://github.com/mrflip/safebyok/pull/876), stacked on
[#875](https://github.com/mrflip/safebyok/pull/875). Red on purpose: the 18 `vault-minder` tests red from #870 up (listen 4,
writes 2, staleness 1, and 11 rows of `vault-minder-chains.test.ts`), the same 18 by name before and after. Proved:
see the PR's **Tests:** line.

Two commits and this file: `api:` for `signin`, `storage:` for `banktok`, and `plan:`.

* **Built**
  * **`signin`.** `Device.signIn` is `Device.signin`, its private half `#doSignin` (was `#bringUp`), its promise
    `#signinAnswer` (was `#broughtUp`), and the world's part `World.signin(sortedVaultDB)` (was `World.hello`), moved
    into the world's `[Signing in]` section. Every `signIn`/`SignIn` in the tree outside `safebyok-big`, `whiteboard/`,
    `winboard/`, `human/` and `notes/security.md` follows: the core, `safebyok-react-lean`, `safebyok-idb-lean`'s test
    and README, `safebyok-graphql`'s private `signinRefusalOf`, the four demos (their own session `signin`/`signinAs`
    and `demo-react`'s fake `auth.signin` among them), `docs/guide-react_query.md`'s `<Signin />`, VOCABULARY's row and
    `notes/wontfix.md`. The minders' `hello` keep their names.
  * **"Bring up" leaves the new core.** The birth's refusal before sign-in answers is `Throwers.signinUnanswered` and
    `Phrases.SigninUnanswered` (were `bankNotBroughtUp`, `BankNotBroughtUp`); the message says "This device's sign-in
    has not answered yet". In `safebyok-react-lean`: `isFetchStage(bank)` (was `isBroughtUp`), the local `isFetchable`
    (was `isUp`), and `Phrases.BankNotStarted`'s text says "The bank is not started". Prose says "sign-in".
  * **`banktok`.** The ask's and the event's `bank_lifetok` is `banktok` (`shapes-asks.ts`, `shapes-vault-event.ts`,
    the builders in `bank.ts`, `gating.ts`, `device.ts`, `agerank.ts`, `adapter-vault-db.ts`'s `itemEventOf`, the
    `SortedVaultDB`'s rung check). Every vaultDB answer gains `banktok: Lifetok | null`: `world?.lifetok ?? null`, set
    by `banktokOf` in `AdapterVaultDB` (`answerOf`, `tryListThings`, `tryBirthBank`, both `answerForThrown` paths) and
    null in `refusedAnswerOf`. `MemoryVaultDB`, `IdbVaultDB` and `PostgresVaultDB` extend `AdapterVaultDB` and build no
    answers of their own. The minder's cached `GotAnswer` omits `banktok` beside `read_tc`: it reads no datastore.
  * **The `SortedVaultDB`'s rule** (`listen`'s doc block). Before: "Its `bank_lifetok` is the one its dispatch
    carries: an answer's ask's, else its world's. Else it is that of the newest answer's world." Now: "An answer's
    events carry the answer's `banktok`, or undefined where it is null; a notice's or an event rung's carry its own,
    else that of the newest answer that read the bank." `#bankLifetok` is `#newestBanktok`.
  * VOCABULARY: a **banktok** row after **lifetok**. No row named the ask's or event's `bank_lifetok`; the lease
    record's row keeps the stamp's.
* **Decisions made**
  * The answer's `banktok` is null, the event's undefined: the handoff set the answer's null, and the event's field was
    already `Lifetok | undefined`, checked `.optional()` at `receive`. The `SortedVaultDB` maps null to undefined.
  * An answer's events take its `banktok` alone, with no fallback to the newest world's where it is null, as the
    handoff says. That drops thread 4's "last-world fallback" for an answer with no world (open matter).
  * A notice or a rung event with no `banktok` still falls back to the newest answer's: the handoff's "keeps its own"
    did not say to drop it, and dropping it would change what a listener hears.
  * Names for what they hold: `#signinAnswer` (what `signin` resolves), `signinUnanswered`, `isFetchStage`.
  * Renamed the demos' and graphql's own `signIn`s too, though none is `Device.signIn`, so the tree has one spelling.
* **Deviations**
  * Three passing tests in files near the red ones, and four fakes elsewhere, gained `banktok: null` in a hand-built
    answer so they typecheck: `vault-minder-reads` ("refuses a record the vaultDB answers of another Thing"),
    `vault-minder-writes` ("rejects an answer that carries a record of another bank", a green test in the red
    file), `gate-forms`, `gating` (two), `react-lean`'s `record-hooks`. None of the 18 was touched.
  * Left alone, as describing `safebyok-big`: `safebyok-react`'s "bring-up" comments, `notes/design-models.md`,
    `notes/design-proof.md`, `notes/gallant.md` and `notes/configuration.md`. `notes/security.md` has 10 lines with
    these words; it was not read or edited (CLAUDE.md: old entries are never rewritten).
* **Discoveries**
  * `safebyok-demo-dojo`'s `LoginTab` test "Exists: refuses gate_made_elsewhere ... still shows the bank unborn" fails
    at #875's tip (6d98b27c4, deps rebuilt), before this thread: it expects `unborn`, and gets `locked`, which is
    #875's first open question.
  * `notes/answer-contract.md` and `notes/wontfix.md` never named the ask's or event's field: nothing to rename there.
* **Tests whose promise changed**
  * `sorted-vault-db.test.ts`: "stamps an answer's events with its ask's bank_lifetok, else its world's, and a received
    event's with its own, else the newest world's" is now "stamps an answer's events with its own banktok, never its
    ask's, and a received event's with its own, else the newest world's"; the get's events expect the world's lifetok.
  * New, `adapter-vault-db.test.ts`, "AdapterVaultDB, the banktok of an answer": the world's lifetok from a get, a
    write, a list and a birth, good or refused; null where no world is reported and where the verb throws.
  * Renamed only: `device.test.ts` "keeps the bank brought up from the cache" is "keeps the bank it restored from the
    cache"; titles naming `signIn` or `bank_lifetok` now say `signin` or `banktok`.
