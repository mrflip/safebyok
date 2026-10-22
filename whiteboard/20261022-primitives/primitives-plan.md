# primitives: the sprint plan

* **Date:** 2026-10-22
* **Mode:** YOLO (the Coach, at the invocation, 2026-10-22).
* **Status:** #243, #244, #246 and #251 merged by the Coach (2026-10-22); thread 12 filed (#252, on main; capacity stays in the main meta, per the Coach's question); thread 5 filed (#253, on main); thread 6 built (#254), in review; threads 1 to 3 restacked onto main by the orchestrator.
* **Review level:** `medium`, reviewer on `sonnet`, unless a thread names another. At the end of
  the sprint, one `opus`, `high` pass over the whole line (see *Wrap-up*).
* **Threads at once:** 1 in the line, which is serial: every thread rewrites `vault.ts` or builds
  on the one before. Thread 12 runs beside it.
* **Issued by:** the Coach (flip), by `/sprint primitives` with `/turbochat`.
* **Sprint doc:** [Sprint primitives](https://claude.ai/artifact/XJsqP4CTaVdfwKMBGS1sQ4), the
  streamline doc renamed and reused: Open Matters, Progress, Resolved.
* **Sprint PR:** the `20261022-primitives` branch (`plan:`), a draft; it joins the line last.
* **Supersedes:** `whiteboard/20261021-streamline/` (the streamline sprint,
  [#242](https://github.com/mrflip/safebyok/pull/242)). Its threads 1, 2 and 11 are this sprint's
  first three, filed as [#243](https://github.com/mrflip/safebyok/pull/243),
  [#244](https://github.com/mrflip/safebyok/pull/244) and
  [#246](https://github.com/mrflip/safebyok/pull/246), left open; the line builds on their tip.
  [#245](https://github.com/mrflip/safebyok/pull/245) is not in the line.

The spec is `primitives.md` in this directory, the *Primitives* tab of the contract doc
(https://claude.ai/artifact/J8ooBpFq7tyAAPFrxb3qRq, tab *Primitives*) as exported at the sprint's
start; `primitives-preplan.md` is the whole design in one document. Where this plan and
`primitives.md` disagree, `primitives.md` wins on what a primitive does and this plan wins on
which thread builds it; the progress document (`primitives-progress.md`) wins over both.

The Coach's charge (verbatim):

> That plan was authored in part by an AI. Use flexible thinking, as we are making big changes to
> the contract. The goal of the sprint is clean confident control flow, and simplified methods.
> Fine-grained tests of the methods will change significantly (and in many many cases I hope move
> or go away as those methods do). However, outward expectations of consistency and correctness
> should not be altered; if we told you to do something that is contradictory, or eliminates a
> safety/consistency guarantee, call it out.

The Coach's charge at the invocation (verbatim):

> You are in charge of a very difficult sprint. Follow the plan, understanding that it was written
> in part by an agent. Think flexibly and honor outcome over specifics. The goal is that the
> control flow simplify according to principles described in the first few sections of the
> whiteboard files. It is easier and better to add synchronization on top of these primitives to
> cure unpleasant ergonomics than to build complicated logic within them.
>
> Still, if you find that something we proposed has the unacknowledged reality that some critical
> part of our guarantees fail, do not allow the final guarantee to fall. proceed with other parts
> of the plan: think "how can I, the orchestrator, and my team of capable thread workers, follow
> the good parts of the plan so that it gets easier to think through the dumb half-baked parts
> later"

*Orchestrator:* read together, the two charges say: simple primitives first, synchronization
layered on top later; and where building a primitive as written would let a guarantee a caller
relies on fall (a lock that does not lock, a stale write that lands, a wrong passphrase that
opens), the thread keeps the guarantee by the smallest means that does not add a mechanism inside
the primitive (keep today's behaviour for that one path, or leave the old path standing beside
the new), says so loudly as an open matter, and carries on with the rest.

## Read first

Every worker, beyond CLAUDE.md:

* `primitives-preplan.md` in this directory, whole: the design in one document, and how to
  search the other whiteboard files by section.
* `primitives.md`, whole. *The rules* and *The mutexes* bind every thread; the tables are the
  spec of what your thread builds, and of what the threads before yours built.
* `revised-outcomes.md` in this directory, the sprint doc's *Revised Outcomes* tab as exported:
  the lock's order, what work under way does when a lock lands (today's per-method contract,
  kept), the memory-only drop, and the tests the turns rethink asked for. Where it and
  `primitives.md` differ, `primitives.md` wins.
* `primitives-progress.md` in this directory: what earlier threads decided and found. Newer than
  the spec wherever they disagree.
* `primitives-toldjaso.md`: every guarantee relaxed so far. A thread that relaxes one more
  reports it for the list.
* `guarantees-audit.md`: what your thread must do so that no guarantee falls (*By thread*).
* `tests-retired.md`: the ledger of retired tests (*Ground rules*, 1).
* STYLE.md: *Naming* before naming anything new, *Tests* before writing a test, *Comments and doc
  blocks* before a doc block.
* VOCABULARY.md: look up any cast word you do not know; `notes/old_vocabulary.md` for retired ones.
* PROCESS.md: *Threads*, *Changesets*, *Size budgets*, and *Dependencies* if you add one.
* `packages/safebyok/src/vault.ts` by its banners (`grep -n '// == '`), never whole.

## Ground rules

1. **Outward guarantees hold, and no test dies unrecorded.** A test of what a caller can observe
   (a whisper read back is the one stored, a lock locks, a stale write refuses, a wrong
   passphrase opens nothing) keeps its meaning, rewritten to the new surface. A test is deleted
   only with a line in `tests-retired.md` naming its file, its title, and the ruling that retired
   it (an in-call refresh, an abort controller, a lease taken up outside birth, a turn-queue
   order, an `Outcome` shape that changed). The PR body carries a per-file count: tests before,
   after, retired, and the thread reviewer checks the ledger against the diff. The core has 1472
   `it(` cases at the sprint's start; the vault themes it touches hold 575 of them.
2. **Call out, don't route around.** Where the spec contradicts itself, or would remove a safety
   or consistency guarantee a caller relies on, stop building that part, write the case in your
   thread file and the PR's open questions, and report it as an open matter. If the rest of the
   thread can go on without it, go on.
3. **The Open Matters already raised** are the orchestrator's to carry back. Until ruled, a thread
   that meets one takes its row's Rec, says so in its PR, and keeps the choice easy to undo,
   **except** where the Rec would change the Contract (what a caller is promised): then the
   thread keeps the current contract and lists the question. The spec supersedes the sprint
   doc's *Resolved* tab except on tombstones and `vault_epoch`, which stand.
4. **One thread, one PR**, "Stacked on #N" in its body. Every PR's base is `main`.
5. **No format bumps, no back-compat.** Each changeset says what a host with records written
   before it will see.
6. **Security decisions** go to `notes/security.md` through a `sonnet` subagent, in the thread
   that makes them. The subagent may bring an entry it touches up to today's terms where it is
   certain of them; it does not bulk-rewrite the file. The Coach audits the file after the sprint.
7. **The Contract** is the *Contract* tab of the design doc
   (https://claude.ai/code/artifact/8ac26722-33ee-4082-a76f-f4c9b6722b70). Only thread 11 edits
   it; earlier threads list in their thread file the Contract lines their change makes untrue,
   and every refusal kind they add (`primitives.md`, *Kinds this tab adds*).
8. **Size budgets**: each thread runs `pnpm size:budget` after its `pnpm justify` and follows
   PROCESS.md's rule.
9. **Pull anticipated changes forward.** A thread that needs a later thread's change to stay
   simple may make it, declaring it in its PR; the orchestrator strikes it from the later thread.
10. **The demand model, not the turn queue.** Sync calls guarantee a consistent world; the one
    demand is the synchronous `demandConsistentWith(thing)`, before a primitive's first junction
    and after each one; every operation on ground truth is one store transaction with an
    expectation; throw on disagreement. Nothing in the core catches, reconciles, refreshes,
    re-reads or retries: no `p-limit`, no abort controllers, no in-call refresh, no check that a
    call's start matches its end. The mutexes are the spec's four and no other; `oneAtATime`
    stays, for the refresh. When tempted to add a guard after an await, name the thing in hand
    and demand on it instead.
11. **Name the operation.** CLAUDE.md
    ([#247](https://github.com/mrflip/safebyok/pull/247)): a name says which operation is meant,
    never a generic read or write. The spec's names are the names: `of` sync, `Class.make(vault,
    record)`, `Class.seal(vault, props, cleartext)` with the cleartext last, `cipheredWith` /
    `decipherWith`, `wrappedWith` / `unwrap`, `extractWhisper`, `current` for what stands now.
12. **Try pairs.** Every public method is `x` (throws its refusal, carrying its `kind`) and
    `tryX` (returns an `Outcome`). The doc block lives on the throwing one and the `try` one refers
    to it; the implementation goes on whichever half is easier to write, and `valOf` or one
    try/catch derives the other; a method whose Outcome carries meta is implemented on the `try`
    side. A method named `try` that makes no sense as an outcome is renamed. The VaultDB adapters
    keep returning `Outcome`: the core's `vault-db.ts` wrapper offers both halves. *A check is a
    triplet, not a pair* (the Coach, 2026-10-22, verbatim): "no that's an ensureConsistent() and get
    consistent() triplet. Add that triplet -- get foo(), demandFoo() and sometimes ensureFoo() near
    where the pair is documented": a sync yes/no query, `demandFoo()` that throws, and where a
    caller needs it an async `ensureFoo()` that makes it so. `tryDemandConsistentWith` goes (thread 6).
    Name operations exactly in PRs and thread files: `getBox`, `vault.refresh()`, never "the read".
13. **Flag races, never solve them with a mechanism.** A race the spec does not close goes in the
    PR's open questions and `primitives-toldjaso.md`, with what a user would see.
14. **Fluid design, no feature jealousy.** The spec's placement of a method is a guess the Coach
    will flip once the code is seen; build it as written and say in the PR where it fought you.
15. **`guarantees-audit.md` binds threads 4 to 9** (*Orchestrator*, 2026-10-22): nine places
    where the spec as written lets an outward guarantee fall, each with its fix and its thread
    (*By thread*). Where it and `primitives.md` differ, it wins until the Coach rules.
16. **A guarantee may loosen for a while** (the Coach, 2026-10-22, verbatim): "it's acceptable for a
    guarantee to loosen if a later commit will fix it, that should not cause a change in design to
    carry it through in every step -- we don't want that churn but it is acceptable." Name each
    loosening in the PR's open matters, with the thread that closes it.
17. **More refusals are expected** (the Coach, 2026-10-22, verbatim): "it is expected this sprint will
    result in more apparent scenarios where calls refuse. This is purposeful: we can build higher
    coordination on these primitives. (it's not great if something throws -- but resist your baked
    in training to say that it's a catastrophe.)" A call that now refuses where today coped is a
    named line (PR, toldjaso), not a blocker and never cause for a rescue mechanism.
18. **Same scope, other `vault_tok` is a new life** (the Coach, 2026-10-22, verbatim): "gets should be
    checking they are reading the same vault -- if scope matches but vault_tok doesn't that implies a
    new vault was created and the current should reload". Scope is the id, `vault_tok` the version
    (checked: every key and index in `packages/*/src` goes by scope).
19. **A removal is an aspiration; helpers live beside their callers** (the Coach, 2026-10-22,
    verbatim): "if the plan said "remove methods X, Y, Z, ..." that's an aspiration not a directive:
    it's the residue of the other functions designs' no longer needing it. (That said: there's a lot
    of spaghetti stack traces. If one function or method largely serves one or a few closely related
    ones, move them together. Those are a good thing often: as a test surface, or a sort of
    "paragraph marker" around a piece of code". Keep a helper the new design still wants; move it
    beside what it serves.

## Threads

Threads 1 to 3 are filed and open; the line is cut from their restacked tip.

### 1. renames, filed ([#243](https://github.com/mrflip/safebyok/pull/243))

`unlock_epoch` is `gate_epoch`, `vault_id` is `vault_tok`, everywhere. The base; nothing for a
worker to do.

### 2. get_vault, filed ([#244](https://github.com/mrflip/safebyok/pull/244))

`VaultDB.getVault(scope)` and `ensureVault(scope, draft)` resolve props and listing from one
read; gateless props admitted; a stale `putVaultProps` carries the winner. The base. Thread 4
changes `ensureVault` to one argument and the expectations.

### 3. wire_meta, filed ([#246](https://github.com/mrflip/safebyok/pull/246))

Over GraphQL, what a write's answer carries travels in the response body, never in error
extensions. The base.

### 4. store_verbs

> **store_verbs**: every VaultDB verb does exactly one thing, transactionally, with an
> expectation that names `vault_tok`: `putVaultProps(props, expected)` expecting `{ vault_tok,
> gate_epoch }` and resolving the stored props; `putBox` and `delBox` expecting `{ vault_tok,
> revision_tok }` and resolving the stored record or the tombstone; `delVault(scope, expected)`
> expecting `vault_tok` and leaving a tombstone that holds the scope and `vault_epoch`;
> `ensureVault(draft)`, one argument, which over a tombstone starts a new life with a fresh
> `vault_tok` and the counter carried on; `vault_epoch` on the props, bumped by the store on every
> gate write and on `delVault`; a tombstone meets no expectation but `delVault`'s. The listing
> stays summaries without ciphertext. `DeviceDB.putLease(record)` resolves the record as stored,
> and one scope's calls land in the order made, stated in the interface and checked by the
> conformance suite. `getVaultProps`, `ensureVaultProps`, `listBoxes` and their `do*` hooks go.

*Gloss.* `src/vault-db.ts`, `local-vault-db.ts`, `device-db.ts`, `idb.ts`, every adapter package
(Postgres DDL and statements, Convex validators and functions, GraphQL schema and resolvers,
IndexedDB), `VAULTDB.md`, `tests/test-helpers/vault-db-conformance.ts` and each adapter's suite.
The core's `vault.ts` keeps working through the wrapper with the fewest edits that compile; the
call paths are thread 5's. `idb.ts`'s `getLease` must not delete a row it found unparseable after
a newer `putLease` (the ordering obligation). The README says a server that restores a backup
must wipe the restored vaults. **Model:** `sonnet`. **Depends on:** 3 (cut from the restacked tip of
#243, #244 and #246). **Look-ahead:** thread 5 writes through these expectations; thread 7
reads the tombstone and `vault_epoch` at birth. **Size:** L (five adapters and the conformance
suite); may split into VaultDB and DeviceDB.

*Tests.* `tests/vault-db.test.ts`, the conformance suite, each adapter's tests: the new
expectations and the tombstone's life, one happy path and one refused expectation per verb.
Nothing retires here beyond the removed verbs' own tests (ledger them).

*Review:* **fixed** ([#251](https://github.com/mrflip/safebyok/pull/251)). Fixed: a first unlock
that lost the gate race over a vault ensured gateless now says `created_elsewhere`, not a bare
`wrong_passphrase`. Left, significant: Postgres `EnsureVaultSql` under READ COMMITTED can start a
new life at `vault_epoch` 0 beside a fresh tombstone when a `delVault` commits mid-statement;
accepted (fails safe as `vault_behind`), toldjaso 16, Open Matter. Left, minor: a damaged vault's
tombstone counts from 0; the two-write first unlock's gateless window; the Postgres
`($n * 0)` placeholder trick; Convex ignoring the draft's epoch (always 0).

*Orchestrator:* a ruling carried from the streamline doc (2026-10-22, on the `getVault` /
`getVaultRecords` pairs): keep both pairs, and add a **loud TODO** entry in the Coach's words:
"the vaultdb closest to the database should handle validation and consistency checks. I don't
mind if graphql does checks as well. But every vaultDB relies on the consistency guarantees of
its backing store -- in the case that you're a facade on another vaultDB this is particularly
easy." This thread writes it, since it rewrites every adapter's verbs. The Postgres route
recipe's meta is thread 12's, not this thread's.

### 5. demand, filed ([#253](https://github.com/mrflip/safebyok/pull/253))

> **demand**: the turn queue, the abort controllers and every in-call refresh go; in their place
> the stamp `{ ...scope, vault_tok, vault_epoch, gate_epoch }` on the Vault and on every thing it
> hands out, the synchronous `demandConsistentWith(thing)` with the kinds the spec names
> (`vault_gone`, `vault_remade`, `gate_moved`, `box_moved`, `vault_locked`), `replaceSnapshot()`
> as the one place the snapshot swaps, `refresh()` joined through `oneAtATime` (a `hello` at any
> staleness arriving during a refresh is satisfied by it; the watch's ring calls it through the
> join; a picture older than the one in hand is ignored, nothing thrown; the lease in memory
> dropped when the pantry's is absent or differs, dropped and erased when `vault_tok` moved; no
> lease taken up), `hello({ staleMinutes })` as the sync staleness check then `refresh`, the
> synchronous `lock()` (lease null, expiry disarmed, gating landed, snapshot swapped, then the
> erase, whose promise it returns), the expiry as a memory-only drop; `#refreshOnStale`,
> `#catchUp`, `#refuseCreatedElsewhere`'s re-read, every after-wait `#checkUnlocked()`,
> `#greeting`, `#greeted`, `#forgetHello`, `#takeUp`, `#createsStandDown`, every
> `isOvertaken`-shaped predicate and every `AbortController` out. `Vault.make` and the first hello
> keep their surface until thread 7.

*Gloss.* `src/vault.ts` (*Reading storage* and every call path), `one-at-a-time.ts` (stays),
`refusals.ts` (the new kinds), `tests/vault/*`. Every public call becomes `await
ensureUnlocked()` where it needs the lease, then one named operation, then return: no own demand,
no catch, no branch after its first step, no refresh (spec, *Composition*; the methods that need
no unlock are listed there). The box and whisper paths are rewritten here only as far as the
demand replaces their checks; their primitives are thread 6's. `lock()`'s order, and what each
call under way does when a lock lands (today's contract per method, unchanged), are
`revised-outcomes.md`, *Lock*; the memory-only drop that serves the expiry, `close` and the
revocation is `#dropLease()` there. A stale write's message says "another call, here or on
another device", since two calls on one label from one tab are ordinary. **Depends on:** 4. **Look-ahead:** thread 7 births through
the refresh's judgment, so keep it a function of what one read returned plus the fields in hand.
**Size:** L. Lowers the `Vault` and `everything` lines (code out).

*Tests.* `vault-races.test.ts` (66), `vault-hello.test.ts` (79) and `vault-lease.test.ts` (114)
change most. Each in-call catch-up, abort and after-wait check is a ledger line naming ground
rule 10. The races the spec lists (*Races the contract tests own*) that need only this thread's
surface are written here: the late read of this tab's own write, and the lock landing during a
box call. Chain tests are the happy path plus one injected failure per step.

*Review:* **fixed** ([#253](https://github.com/mrflip/safebyok/pull/253)). Fixed: `#reviseWayins` put
its written props back over a read that found the vault deleted or remade meanwhile (the base's
`#outrun`; two race tests now pin it); three doc blocks opened on a bare `/**`; a comment reflowed.
Left, minor: the kept take-up judges against a stale picture and erases (Open Matter, thread 9);
the read join weakens `del()`'s and the proving's promises (Open Matter, thread 11's Contract);
`#leaseSince` compares `>=` (errs toward a re-prompt); `standsBeside` reads an earlier
`ask_passphrase_at` as older; `#takeStoredBox` splices over a newer listed revision (toldjaso 13's
family); `#demandLease` says `vault_locked` before `vault_gone` in edge orders; `decryptWhisper`
opens before demanding (Open Matter, thread 11 picks the kind).

### 6. lease_box

> **lease_box**: the Lease and Box primitives as the spec's tables: `Lease.make(vault, record)`,
> `lease.endsBy(instant)`, `lease.cipheredWith(serialized, visible)` and
> `lease.decipherWith(ciphered, visible)` (a fresh boxKey wrapped under the vaultKey, as today;
> `damaged_lease` when the vaultKey will not unwrap, which drops the lease as `lock()` drops it;
> `damaged_box` when the box will not), `lease.sealProps(visible, { whisper })`; `Box.make`,
> `Box.seal(vault, { boxlabel, sidecar }, whisper)` with the sidecar bound into the ctx and
> server-side immutable, `box.extractWhisper()`, a box carrying the base revision it was sealed
> from; `vault.sealAndPutBox({ boxlabel, sidecar? }, whisper?)` with `putBox` as its sugar (a
> partial Box needing only `boxlabel`; sidecar or whisper omitted means `getBox` first and the
> stored box's, else `{}` and `no_whisper`; the put expects `vault_tok` and the base revision);
> `vault.getBox`, `delBox`, `getWhisper`, `useWhisper` as the rows say; `Lease.grant`,
> `wrapBoxKey`, `unwrapBoxKey`, `planSeal`, `sealPlanned`, `tryOpen` and `open` go.

*Gloss.* `src/lease.ts`, `box.ts`, `types.ts` (`ListedSummary` stays a summary), `vault.ts`'s box
section, `crypto.ts` only if a name moves. The whisper's JSON string cannot be zeroed and is not
kept; byte arrays are. Security note: the unwrap-rewrap on a whisper-omitted put, and where the
vaultKey lives during `cipheredWith`. **Depends on:** 5. **Look-ahead:** thread 8's
`grantLease` makes the Lease this thread opens. **Size:** M-L. *Orchestrator:* a box read names
the `vault_tok` it was read under (ground rule 18), so a box from another life reloads rather
than failing to decrypt; thread 5's `Stamped` is partial (Box carries only `vault_tok`, Lease the
scope and `gate_epoch`), and full stamps are this thread's.

*Tests.* `box.test.ts` (43), `lease.test.ts` (27), `vault-boxes.test.ts` (107): rewritten to the
new names; the races "a whisper-omitted put racing another device's write" and "a renewal during
a box write in flight" live here.

### 7. bank

> **bank**: `Bank` with `make`, `hello`, `ensureVault(draft)`, `reopenVault`, `closeVault`,
> `closeVaults`, `clearCachedVault(scope)`, its snapshot and `subscribe`; the libraries load at
> `hello`; `Vault.make` and the first-hello memo go, a Vault born of one read (`vaultDB.ensureVault`
> beside `deviceDB.getLease` and the device record); the stored lease taken up, the expiry armed,
> when its `vault_tok` and `gate_epoch` match and its deadline stands; the device record
> (`device_id` minted at first need, the highest `vault_epoch` seen per scope, written so a lower
> value never replaces a higher one); a picture below the record's highest refused `vault_behind`
> at birth and at refresh; `opening`, `UnreadVaultProps`, `currentVaultProps`, `close()` and
> `vault_closed` go (`vault_gone`); a Vault of one `vault_tok`, novel when gateless, never absent;
> `created_elsewhere` becomes `gate_made_elsewhere`; `syncing` becomes `freshness`; the mark and
> `heedMark`, `raiseMarkAfter`, `rolled_back` go; `safebyok-react`'s provider becomes
> `BankProvider`, `useBank`, `useVault(vaultlabel)`, and `openError`/`retryOpen` go.

*Gloss.* A new `src/bank.ts` and its tests; `vault.ts` (birth, states), `vault-opts.ts`,
`options.ts`, `refusals.ts`, `index.ts`, `device-db.ts`; `safebyok-react/src/vault-provider.tsx`
and `tests/vault-provider/`; `demos/` and `e2e/` that build a vault; the README's *A vault rolled
back* rewritten around `vault_epoch`. `del()` here only calls the store's `delVault` and then
`lock()`; proving it is thread 9's. Two features (core bank, React provider) in one thread because
`pnpm justify` builds the React package against the core: if the worker's context runs long, it
files the core half with the React package adapted minimally and reports, and the orchestrator
cuts the provider as thread 7b. **Depends on:** 6. **Look-ahead:** thread 8's provings carry the
device id in a header; thread 10's dialogs read the bank's entry. **Size:** L. Adds a `Bank` line
to `.size-limit.json` (or renames `Vault`'s); `VaultProvider`'s becomes `BankProvider`'s.

*Tests.* `vault-make.test.ts` (73), `vault-twins.test.ts` (17), `vault-del.test.ts` (25), the
provider's tests; the race "a stale device writing a vault made anew" needs the gate write and
lands in thread 8, so this thread writes its birth half (the tombstone, the new life, the device
record lowered across tabs).

*Orchestrator, rulings for this thread (2026-10-22):* the device record is option A (audit 6):
one highest `vault_epoch` per scope, kept on the device, raised at birth, at each refresh, and
from our own gate writes and `delVault`. A Vault object whose vault was deleted becomes gone for
good (every call `vault_gone`), and the bank hands out a fresh one when asked; the Coach on how a
fresh Vault object comes about after a deletion or a rollback, verbatim: "the process for getting a
new vault is not well thought through, perhaps impossible at the current time, for deletions and
for rollback": build the smallest path (`clearCachedVault`) and raise what is still unsettled.
Thread 5 left the first-hello memo `#birth` / `#born` and the device mark for this thread to remove.

### 8. proving_gate

> **proving_gate**: `Proof` becomes `Proving`, abstract, with `PassphraseProving` and
> `PasskeyProving` each declaring its own `static seal(vault, header, cleartext)` (the header the
> current wayin's visible fields, or `{ slotlabel }` for a fresh one whose salt `seal` mints;
> passkey bytes imported and zeroed at seal); a Proving holding its vault, slotlabel, header,
> stamp, gating and wayinKey, its demand asking whether the gate's wayin at its slotlabel carries
> its header and whether its gating still stands (`gating_landed`); `wrappedWith`, the private
> `unwrap`, `checkWayin()` (void), `sealWayins(passkeyProving?)` (novel only, one method, the
> vaultKey never crossing), `resealWayinFor(newProving)` demanding after its junctions,
> `grantLease()` with the demand immediately before `putLease`; `Gate.make(vault, { base,
> ...wayins })` recording its base epoch; `vault.putGate(gate)` within an attempt's hold,
> expecting `vault_tok` and the base; `vault.checkStrength(passphrase)`, public, today's
> `checkPassphrase`; Wayin is record only; `VaultKeyPair`, `wayinKeyFor`, Wayin's `seal` and
> `tryOpen` go. The gate's fields stay flat in the stored props.

*Gloss.* `src/proof.ts` (to `proving.ts`), a new `gate.ts`, `wayin.ts`, `lease.ts`
(`grantLease`'s record), `crypto.ts`, `vault.ts`'s unlock and gate-change paths as far as the
primitives reach (the chains are thread 9's; until then the existing paths call the new
primitives). The proving is bound to a gating from thread 9: until then, bind it to a placeholder
the gating thread replaces, and say so. Security notes: the wayinKey's lifetime, the header a
fresh proving mints, where passkey bytes are zeroed, the demand before `putLease`. **Depends on:**
7. **Look-ahead:** thread 9's chains call these in the spec's order. **Size:** L.

*Tests.* `proof.test.ts` (35), `wayin.test.ts` (47), `vault-wayins.test.ts` (94); the races "a
gate change racing another device's gate change", "a superseded passphrase proving a change" and
"a stale device writing a vault made anew" (the write half) live here; `lock()` and `decline`
during `grantLease` is written here against the placeholder and re-pointed in thread 9.

*Orchestrator, rulings for this thread (2026-10-22):* a cancel during the lease write, the Coach
verbatim: "If I enter my password and then somehow am prompted again I will as a human hit cancel.
Declining to prove does not imply an imperative to switch from "unlocked" to "locked", it is only
an imperative to NOT switch from locked to unlocked on that gating's say-so". So a cancel never
locks, and a cancelled gating never attaches the lease it was writing; a later take-up of what it
stored is the take-up's own judgment. Audit 1's step 7 checks both the proving and the stored
record. Rename `WayinStamp` (say `WayinOrigin`): it collides with thread 5's `Stamp`.

### 9. gating

> **gating**: `Ask` becomes a gating, a discriminated union on `gatingkind` (`initialize_gate`,
> `unlock_vault`, `change_passphrase`, `put_passkey`, `del_passkey`, `del_vault`), each shape
> carrying its typed attempt beside `decline` and `lockLanded`; the attempt holds the dialog's
> slot (`attempt_in_flight` for a second), runs the spec's chain for its kind, and settles the
> gating with the result or the throw, except that `wrong_passphrase`, `wrong_passkey`,
> `weak_passphrase` and `same_passphrase` return to the dialog and leave it open; a state that no
> longer fits settles `gate_made_elsewhere`; raised by `ensureUnlocked({ renewMinutes? })`
> (`unlock_vault`, or `initialize_gate` when novel; a lease ending within `renewMinutes` counts
> as ended), `putWayin(slotlabel)`, `delWayin(slotlabel)` (the passphrase slot refuses
> `passphrase_required`; no passkey refuses `absent_wayin`) and `del()`; handed to the host
> through `requestCleartext` (was `getProof`); `lease_ending`, `carry_on`, the renew path, Ask's
> `#over` and `#landed` controllers go; no vault call takes cleartext; `change_passphrase` drops
> the passkey as today.

*Gloss.* `src/ask.ts` (to `gating.ts`), `vault.ts`'s `ensureUnlocked`, `putWayin`, `delWayin`,
`del`, `options.ts` (`requestCleartext`, host and guarded), React's `passphrase-modal.tsx` and
`passkey-unlock-button.tsx` minimally (thread 10 reworks them). The gating line and the dialog are
one hold: an attempt runs its chain inside the slot it holds, and `putGate`, `grantLease` and
`delVault` never take it themselves. `initialize_gate` takes a passkey beside the passphrase in
one gating. The cleartext `===` for `same_passphrase` and `checkStrength` run only in the
attempt. **The public surface changes most here:** every vault call that took a passphrase or
passkey answer stops. *Orchestrator:* a ruling carried from the streamline doc (2026-10-22): a
host that sets the twilight at least as long as the lease "likely didn't understand", so
`ensureUnlocked({ renewMinutes })` with `renewMinutes` at least the lease's length refuses as a
misuse (`bad_option`), and the README says that a lease of zero is how to prompt every time.
**Depends on:** 8. **Look-ahead:** thread 10 dispatches on `gatingkind`.
**Size:** L. *Orchestrator:*
thread 5 pulled `hello({ staleMinutes: 0 })` forward into `unlock()` and `#reviseWayins` (audit 4)
and kept `#takeUp`'s AbortController for this thread to remove; the kept take-up erases on a stale
judgment, which the Coach rules recorded, not fixed ("yes record don't fix"): fix it here only if the
pantry consult's shape gives it for free.

*Tests.* `ask.test.ts` and the gating halves of `vault-lease.test.ts` and `vault-wayins.test.ts`;
one test per gatingkind's happy path, one injected failure per chain step, the open-on-typo, the
second attempt, the stale-state settle, and "a write that lands and then a lock".

### 10. react

> **react**: the dialogs dispatch on `gatingkind`, one per kind; `passphrase-modal`,
> `passkey-unlock-button`, `attempt-refusals`, `messages` follow; a correctable refusal is shown
> in place and the dialog asks again.

*Gloss.* `packages/safebyok-react/src/*` and its tests, `demos/`, `e2e/`. **Depends on:** 9.
**Size:** M. Moves the React lines.

### 11. docs

> **docs**: README, VOCABULARY (Bank, Gate, Gating, Proving, gatingkind, the stamp, `vault_tok`
> with the `_tok` rule reading "changes on every life", novel, freshness, requestCleartext, the
> device record, `cipheredWith` / `decipherWith`, `TH.makeGate` renamed out of the way), the
> Contract (every kind in `primitives.md`'s *Kinds this tab adds*, `hello`, `ensureUnlocked`,
> `lock`, the try pairs, what a lock landing mid-call does per method), `notes/old_vocabulary.md`
> (Proof, Ask, AskWhy, ProofAnswer, getProof, unlock_epoch, vault_id, lease_ending, carry_on,
> device mark, rolled back, vault_closed, opening, checkPassphrase, decryptWhisper), the
> `tests-retired.md` roll-up, and the hand-roll sweep with its verdicts.

*Gloss.* Gathers the Contract lines earlier threads listed as untrue. The hand-roll sweep covers
the preplan's *Libraries* candidates no earlier thread decided: each gets a verdict (library,
keep, or delete) in the PR, and a dependency added needs the Coach's yes first, so the sweep
proposes and does not add. **Depends on:** 10. **Size:** M-L. May split: docs, then the sweep. *Orchestrator:* add a TODO entry
for a test that reads the Postgres README's route-recipe code blocks, so the copy a host takes is
the one tested (Open Matters, from #252's review, the Coach took the Rec). Thread 5's Contract
lines made untrue are in `thread-5-demand-details.md` on #253, and its review adds two: `del()`
can resolve over a vault made elsewhere during a joined read, and the proving's "as storage holds
them now" may be a joined read's moment older. Pick `vault_locked` or `vault_remade` for a box
from a remade vault (`decryptWhisper` against the demand): settled, `vault_remade`, since thread 6
demands after each await. TODO entries from the Coach (2026-10-22): the Postgres README points to
(a) the GraphQL client and (b) an AI prompt that builds a route, rather than a server nobody wants;
an agent skill set; `capacity` as an attribute of the Vault object for the app; the Vault object
adopting storage's capacity on `vault_full`. Write the get/demand/ensure triplet into STYLE.md
beside the try pairs. `box_moved` is dropped from the kinds.

### 12. route_meta

> *Orchestrator*, from the Coach's ruling on the streamline doc's row "Postgres route recipe
> sends a refusal's whole meta" (2026-10-22), verbatim: "add meta on both, put error information
> in one if there is such / put these not-quite-an-error or full record where-do-they-go fields
> in the main meta field. Good and bad outcomes both have access to the main meta field /
> Sanitize out the wrapped/encrypted fields from what's in the error meta".

*Gloss.* The Postgres route recipe (`safebyok-postgres`, its route and its tests) and, where the
same shape is meant, the GraphQL wire (`safebyok-graphql`): one `meta` field on every answer,
good or bad; a write's not-quite-an-error records (`box_stored`, `vault_props_stored`) in that
main meta; error information in one place; wrapped and encrypted fields stripped from whatever
an error carries. Whether GraphQL's winner record moves from its opaque body field into `meta`
waits on the open row "Only a refusal's winner record is opaque": until ruled, the GraphQL half
keeps #246's shape and this thread does the route recipe. A wire shape is a contract the host's
server and browser share: the changeset says what a host sees. **Model:** `sonnet`. **Depends
on:** 4 (it rewrites the same adapters' verbs). Independent of 5 to 11: it runs beside the line,
and joins it at wrap-up just below the sprint PR. **Size:** S-M.

*Review:* **fixed** ([#252](https://github.com/mrflip/safebyok/pull/252)). Fixed: the changeset
headline overclaimed (the main meta's winner records cross whole, as ruled; only the refusal's own
meta is stripped). Left, minor: a non-JSON body's SyntaxError quotes its first characters (the
server's own body, as before); the README recipe and its test are hand-kept copies (Open Matter).

## Wrap-up

`wrapup.md`'s restack, then one `opus`, `high` reviewer over the whole line, briefed with
`primitives.md`'s *The rules*, *The mutexes* and *Races the contract tests own*, grepping for the
vestiges threads 5, 7 and 9 name in their "out" lines, the security notes, the Contract, and
`tests-retired.md` against the test counts. Its findings are Open Matters, not fixes. The Coach
audits `notes/security.md` after the sprint; no agent rewrites it.

## For the Coach

* ~~Restack #243, #244 and #246 onto main~~ (*Orchestrator:* done 2026-10-22). Close #245 and
  tag its branch `closed/20261022-turns`: still yours.
* Wind up the streamline sprint: its folder to `winboard/`, its paused note resolved.
* The Open Matters tab of the sprint doc is where the sprint raises what it cannot decide.
* Post-sprint security audit: `notes/security.md`'s store_rulings amendment (near line 639) and its
  stale_write/box_stored entry (near line 863) still say the route recipe sends meta whole; point
  them at #252's amended Postgres entry (the Coach: "yes save for post-sprint audit").
