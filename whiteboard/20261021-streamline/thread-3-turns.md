# Thread 3: turns (2026-10-22)

Branch `20261022-turns`, PR [#245](https://github.com/mrflip/safebyok/pull/245), stacked on [#244](https://github.com/mrflip/safebyok/pull/244).
Justify: green (root 265; core 2727, 37 skipped; convex 311; postgres 297; graphql 300; indexeddb
156; react 287; fastkey 49; demo 214; e2e 100, 109 skipped). Size budgets: none moved (`Vault`
34.3 kB of 38, `everything` 41.8 kB of 45).

**Stopping point (2026-10-22): paused, PR in draft.** The Coach ruled against the lock-in-line
design: "Lock should not get in line. I also didn't intend for writes to serialize. I only meant
for each write to await unlock and for at-most-one unlocking process to be executing at once." A
separate session reasons out the replacement; this thread does not start it. The branch stands
green and merges cleanly onto `main` as it is (no rebase was needed: `main` has only #241's merge
commit beyond this stack), so the Coach may merge it as a base to build on. The reviewer's two
fixes (hello's doc block rewrapped, a VaultDB banner) are on the tip. What the rework replaces:
`lock()`, `del()`, `close()` and the expiry as turns, and the serialized box reads and writes;
what it likely keeps: hello's one-round read and judgment, no read inside a call, stale writes
refusing at once, and the removals listed below.

* **Built** (`packages/safebyok/src/vault.ts`):
  * One queue, `p-limit(1)` (`#turns`, `#turn`, which refuses `vault_closed` at a turn's start).
    `hello` is one turn: settle if timely (`#isTimely`: `#readAt` within `staleMillis`; `#readAt`
    null means "read next time") else `#read()`. The read turn: one round
    (`strengthChecker.load()` beside `getVault`, `getLease`, `getMark`), judge (`#judgedMark`,
    `#judgeLease`, `#openKept`), commit, then the mark raise and lease erase, logged on failure.
    The judgment is a function of what the round returned plus `#held`/`#lease`, for thread 4.
  * The watch's ring is `#hello(0)`; one warn per failing streak (`{ call: 'refresh' }`).
  * `unlock`/`attempt`: hello, then a turn (`#settleUnlock`, `#makeVault` for an absent vault,
    `Lease.grant`, `putLease`, `#holdLease`). `putWayin`/`delWayin`: hello, then a turn.
    `getBox`/`getWhisper`/`decryptWhisper`/`putBox`/`delBox`: `ensureLease`, then a turn, each
    calling the sync `#checkUnlocked()` before it uses the lease (the Coach's ruling).
    `lock`, `del`, `close` (its key drop) and the expiry are turns.
  * Vault props and their device mark are held together (`#held`, with a private getter
    `#vaultProps`), so the device id a gate change seals with needs no check.
  * `putBox` lists the box it wrote (`#listWritten`), `delBox` unlists (`#unlist`): no read.
  * A stale or untrusted refusal sets `#readAt = null` in `#heedRefusal`, so the next hello reads.
  * Out: `#refresh`, `#readStorage`, `#takeStorage`, `#heedRevocation`, `#greeting`, `#greeted`,
    `#forgetHello`, `#greet`, `#helloWithin`, `#takeUp`, `#standDownTakeUp`, `#takeUpLease`,
    `#fetchLease`, `#grantLease`'s overtaken checks, `#createsStandDown`, `#standDownCreates`,
    `#drafted`, `#outrun`, `#movedOn`, `#refreshOnStale`, `#catchUp`, `#isCaughtUpStale`,
    `#refuseCreatedElsewhere`, `#refuseStalePutBox`, `#keptMark`, `#raiseMarkAfter`,
    `#deviceIdFor`, `#dropNow`, `isNewerCopy`, `#watchHelloWarned`; `one-at-a-time.ts` and its test.
  * `tests/vault/vault-turns.test.ts`: lock during a hello's read, unlock during a read, lock and
    close during a getWhisper's read, a getWhisper awaiting its hello when a lock lands, a ring
    during an unlock, del/lock/close during an unlock or putWayin, the expiry during a getWhisper.
  * TODO.md, *Lock timing*: what turns now do to each scenario, and the TODO to judge the in-turn
    `#checkUnlocked()`. `notes/security.md`: a new entry and four amendments (sonnet subagent).

* **Decisions taken**:
  * **Twilight** (Coach, confirmed): unlocked until a lock lands; the expiry turn at
    `askPassphraseAt` drops the lease it was armed for, matched by deadline (reads no clock).
    `ensureLease` asks (`lease_ending`) within `max(renewMinutes, staleMinutes)` of the end.
    `staleMinutes` as long as the lease or longer (Infinity) counts as no twilight, else every
    call would prompt (`#twilightMillis`).
  * `#raiseAsk` refuses `vault_closed` on a closed vault, so no prompt goes up over a vault
    closed during `ensureLease`'s hello (a check at the prompt's door, not after a turn's await).
  * An attempt's turn refuses `vault_locked` when its prompt ended (`promptOver`) before the turn
    began: one judgment at the turn's start, until thread 8's Gating owns it.
  * A created-elsewhere first unlock commits the props `ensureVaultProps` returned (the vault
    shows `locked`) with no listing, and marks the picture stale: the next hello lists the boxes.
  * A read keeps the lease in hand without a second unwrap when the kept record is the same
    grant (`isSameGrant`: deadline, tok, epoch, wrapped IV and ciphertext). Saves a crypto round
    per ring and made the ring-driven tests deterministic.
  * `del()` reads first (`hello(0)`) only when it holds no vault, keeping "never reports success
    over a vault standing". Its turn refuses `rolled_back` when it finds the props forgotten by a
    read's rollback refusal, deleting nothing and keeping the mark.
  * A failed strength-checker load takes the whole read with it (the vault stays `opening`): the
    old code committed the props, against `hello`'s own "applies no partial read".

* **Deviations**:
  * Took no commit of `vault_props_stored`: it would add a path.
  * Fixed thread 2's `getVault`/`ensureVault`: their private `#readVault`/`#ensuredVault` broke a
    VaultDB made with `Object.create(vaultDB)` (a Contract'd host shape). Now module functions.
  * Exported `byCodeUnit` from `vault-db.ts` (not from `index.ts`) for `#listWritten`'s order.

* **Discoveries**:
  * Every own write now rings a trailing background read after the call returns (before, the
    call's own refresh absorbed it). Tests that mock `getVault` after a write use a deaf vaultDB.
  * Convex's client shares an in-flight query's result: a ring read refused `not_permitted` can
    answer the next read the same (`convex-vault-db.test.ts` waits for it to settle).
  * A read can take up a lease another tab granted for a vault reborn elsewhere (same device
    store): V3, correct, but it is why two reborn-vault tests now end unlocked, not locked.

* **Races flagged, nothing built** (*Trust, checks and races* 4):
  * **Mark lowered across tabs.** The mark is read in the round and raised after the commit from
    that reading; another tab raising it in between is overwritten with a lower epoch (the test
    "refuses no vault another tab made while this one was making it" is deleted). Thread 5's
    replacement (write counter, tombstones) retires it.
  * **Burst of rings.** Each ring is a forced read, one after another; `oneAtATime` coalesced them.
  * **Cancel during an attempt at work.** The attempt finishes and unlocks (the user gave the
    proof); before, a Cancel stood it down. Thread 8's Gating decides.
  * **Concurrent calls on a refused read** each read again, so `onBadNews` hears one refusal per
    read, not one per burst.

* **For the Coach**:
  * **Contract vs turns (the big one).** The Contract and doc blocks still say a lock lands at
    once; turns make it land after the turn in flight. Untrue now (for thread 10): `lock()`
    "locked at once", "a getWhisper()/useWhisper() under way refuses vault_locked once storage
    answers", "an attempt under way takes nothing up"; `getBox`/`getWhisper` "a lock or a del()
    while storage is read refuses vault_locked" (the lease's end still does); `decryptWhisper`
    "when a lock lands while the box opens"; `close()` "an unlock under way takes nothing up ...
    a getWhisper() under way hands back nothing"; `Ask.attempt` "a Cancel stays cancelled";
    `unlock` "then the vaultKey is dropped, work in hand or not".
  * Also untrue: putWayin *Does 3* and delWayin *Does 2* ("as storage holds them now": now as
    the last hello read them); ensureLease *Does 3.4* ("says hello again on unlocked"); the
    getProof "attempt refuses: vault_locked" rows for a lock under an attempt; hello's "load
    fails ... though it read storage"; the handler's "told once, however many calls share it";
    putBox's "the snapshot shows the box as storage now holds it" after a stale write; the
    created-elsewhere "caught up with its boxes"; the watch's second, hello-worded warning.

* **Looked up**: the plan's thread 3 gloss and *Ground rules*; progress *Thread 1*; the preplan's
  *Rules*, *States*, *Turns*, *Each call*, *Lifecycle*, *Trust, checks and races*, *Threads*.
