# Thread 16: birth_verb (2026-11-21)

Branch `20261121-birth_verb`, PR #813, cut from #811 (since merged; the PR's base is main). Proved: before the catch-up,
safebyok 1346, safebyok-react-lean 251, knockknock 26, envman 24, each with lint and typecheck; `pnpm justify` pending.

* **Built**:
  * **`device.birthGating(cleartexts)`** (`packages/safebyok/src/models/device.ts`, section *Starting*): the gating of
    a birth of the device's bank. It makes the gating through `Bank.birthGating(device, cleartexts, keep)`, whose
    `keep` hands the bank the attempt births to the device's `#hold`, so the device's snapshot shows it unlocked.
    `device.adoptBornBank` and its cheat comment are gone, with the `bank` check it used.
  * **A birth refuses `disabled` until `hello` answers.** `device.birthGating` throws `Throwers.bankNotBroughtUp()`
    (`refusals/throwers.ts`, phrase `BankNotBroughtUp` in `phrases.ts`) at the stage `'starting'`. That is what makes
    the fixture-only early return in `#bringUp` (`if (this.#bank !== null) { return }`) unnecessary, and it is gone.
  * **`Bank.birth(device, cleartexts)`** checks its device (`Checks.device`, `instanceof Device`) and calls
    `device.birthGating(cleartexts).attempt()`; `Bank.tryBirth` goes through it, as before.
  * **The giver** (`packages/safebyok-react-lean/src/giver/react-giver.tsx`): `birthGating` calls
    `demandDevice().birthGating(cleartexts)`. The create-vault form is untouched (thread 17 works there).
  * **Fixtures**: `buildBornBank` (`tests/test-helpers/models-world.ts`) says `hello` before it births;
    `buildBornVault` no longer says it again.
  * **Notes**: `notes/wontfix.md` loses "A bank born on a device while its `hello` still fetches" (a birth before `hello`
    answers now refuses) and gains E5, "A bank's sweep stops its device's minder, which the device owns".
    `notes/guarantees-drift.md` amends the G2 entry; `notes/security.md` has a line from a `sonnet` subagent (below).
* **Decisions made**:
  * **`Bank.birthGating` takes the keeper as a required third argument**, and its doc calls it internal: only
    `device.birthGating` makes it. A gating's body is private, so the device cannot wrap the attempt from outside.
    Set aside: a public getter for the friend (it would let a caller hand a body a proving, against G9); removing
    `Bank.birth`/`tryBirth` (a contract change the thread does not name); a `Bank.birth` whose bank no device keeps
    (a born bank its device would not show).
  * **The stage check refuses only at `'starting'`.** At locked or unlocked the vaultDB already refuses the birth
    (`gate_made_elsewhere`), and at failed the vaultDB decides; refusing there would be a predictive throw. Thread 15's
    rule from the Coach: assume a verb is disabled while its state is not right, and refuse.
  * **The refusal is `disabled`**, as `minderNotStarted`'s "call hello first" is.
* **Deviations**:
  * **`Bank.birth` handed a non-Device no longer zeroes the passkey answer.** It refuses `bad_record` before any gating
    is made. The zeroing test moved to `Bank.birthGating` with a non-Device, which still makes the gating and zeroes.
    A birth refused `disabled` before `hello` answers also zeroes nothing, as the giver's makers already leave an
    answer to the host when they refuse before reaching a bank. Written into `notes/guarantees-drift.md` (G2) and
    `notes/security.md`.
  * **A sweep test changed**: device.test.ts's "does nothing on a device with no bank, which births one after it" now
    says `hello` before the sweep and births through `device.birthGating`. Its subject is unchanged.
* **Discoveries**:
  * #809, #810 and #811 merged while this thread was built, so the catch-up rebases onto main.
* **For the Coach**:
  * **The internal `keep` argument** on `Bank.birthGating`: is a third argument on a public static acceptable, or should
    `Bank.birthGating` leave the entry points?
  * **The zeroing change** above: a birth refused before its gating exists leaves the answer to the host.
