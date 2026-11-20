# Thread 5: bank_gatings (2026-11-20)

Branch `20261120-bank_gatings`, PR pending, stacked on #770 (thread 4, `20261119-vault_writes`). Proved: `safebyok`
tests 1262 passed, typecheck and lint clean, at 683c5c958; `pnpm justify` not yet run.

* **Built** (`packages/safebyok/src/models/`):
  * `bank.ts` *Prompts*: the four born-bank prompts call `#launchOrJoin(gatingkind, attempt)`. An unlock
    (`launchUnlockBankPrompt`) joins a gating of **any** kind open on this bank; each gate-change prompt joins one of
    its own kind; joining awaits `gating.whenConcluded`. A prompt that may not join (another kind for a gate change, a
    birth gating, another Bank object's gating) still reaches `Gating.launch`, which refuses `already_asking`.
    `ensureUnlocked()` resolves at once when unlocked, else `launchUnlockBankPrompt()`.
  * `bank.ts` *Re-entry points*: `attemptUnlock`, `attemptReplacePassphrase`, `attemptAddPasskey`,
    `attemptRevokePasskey`, each through `#handIn(gatingkind, cleartexts, attempt)`: the open gating of exactly its
    kind on this bank gets `gating.attempt(cleartexts)`; with none, `attemptWithoutGating` runs the same attempt once.
    Each resolves `Outcome<Bank>`, as `Gating.attempt` does.
  * `bank.ts` *The gatings' attempts*: `#unlockBankWith`, `#replacePassphraseWith`, `#addPasskeyWith`,
    `#revokePasskeyWith` build the friends the prompts built inline (G9 unchanged). A commit of its own (652008f36),
    no behaviour change, so the refactor diffs cleanly from the behaviour.
  * `gating.ts`: `attemptWithoutGating(bank, cleartexts, attempt)`: refuses a disabled bank at the door, spends the
    cleartexts whatever the outcome.
  * `device.ts`: `lock()` locks `#thisIsTemporaryBank`; `cheatHoldBank(bank)`, called by each Bank's constructor
    (last made wins), is the thread's **one cheat**.
  * Tests: `tests/models/bank-prompts.test.ts` gains *ensureUnlocked*, *a prompt on a bank whose gating is open*, and
    one describe per re-entry point; `device.test.ts` gains *device.lock()*. VOCABULARY gains **prompt**, **re-entry
    point**, **join**, and **cleartext** says a re-entry point accepts one. `notes/security.md` has an entry (4e707fb3e).
* **Decisions made**:
  * **No `gatingseq` yet.** A re-entry point answers whatever gating of its kind is open on its bank. A sequence
    only earns its place once a form can read it from a snapshot (thread 6) and cite it (thread 9); adding it to
    the signatures now would settle an interface neither side of which exists. `Gating.gatingTok` (random, per
    gating) is still there for keying a dialog.
  * **Re-entry points resolve an `Outcome`, never throw**, matching `Gating.attempt`, which they forward to: a form
    shows a `wrong_passphrase` without a try/catch.
  * **With no gating open, every re-entry point acts directly**, not only the unlock: each kind's cleartexts carry
    all it needs. `attemptAddPasskey` refuses (as an outcome, `bad_record`, from `demandPasskeyAddable`) while the
    gate has a passkey; `attemptRevokePasskey` with no passkey resolves good at once, checking nothing, as
    `launchRevokePasskeyPrompt` returns at once.
  * **A gate-change prompt does not wait behind an open gating of another kind**: it refuses `already_asking`, as
    today. Waiting would be sequencing machinery (out of bounds).
  * **`device.lock()` reaches the bank through a held reference**, set in the Bank constructor, per the Coach's
    "no device→bank registry yet; if a handle is unavoidable, one bank on the device named as temporary".
* **Set aside**: an ungated attempt as a transient gating (launch silently, attempt, dismiss): reuses spending and
  the one-at-a-time slot, but a wrong passphrase would reject anyone who joined meanwhile `dismissed`, and thread 6's
  snapshot would flicker a gating for a form submit. A `demandEnabled` inside each `#…With`: it would change the
  gating flow; the check lives in `attemptWithoutGating` instead.
* **Deviations**: U's design puts answering on the Device (`device.unlock(gatingScope, …)`, `device.prompt`); per
  the Coach's later ruling the verbs are on the Bank. `device.dismiss(gatingScope)` is not built: `gating.dismiss()`
  serves.
* **Discoveries / for later threads**:
  * Thread 6: the open gating is `device.openGating`; `gatingkind` and `isOpen` are public, `#isAttempting` is
    private: the snapshot needs a getter for it, and a last refusal is not kept anywhere yet.
  * Thread 7: `bank.ensureUnlocked()` is ready for `withWhisper`; it joins any gating open on the bank.
  * Thread 9: `bank.attemptUnlock({ passphraseClear })` from a form action, outcome in hand.
  * Left unspecified (crossings, out of bounds): an `attemptUnlock` while a gate-change gating is open unlocks
    directly and leaves that gating open, its joined waiters still waiting; a direct gate change while an unlock
    gating is open likewise.
* **For the Coach**: open matters in the PR body: `gatingseq` deferred; Outcome vs throw on re-entry points;
  `attemptRevokePasskey` with no passkey resolving good unchecked; gate-change prompt vs a different open kind.
