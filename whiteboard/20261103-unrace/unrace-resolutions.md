# Sprint unrace: the Coach's rulings and the orchestrator's calls, swept from the Claude Doc on 2026-11-03

## Ruled matters

Each bullet is a row of the doc's *Resolved* tab as it stood: the matter, the Rec, the Coach's answer word for word, the date, where it was raised, and where the work went. Batches run newest first; inside a batch, the doc's order.

### Batch 14 (newest)

- **A rule for try forms.** Coach: "Nothing that strident. It's not uniformly the case that one of them is natural / A try form that only calls other try forms builds an outcome with grace, that the throw form gives the val of / A try form riddled with catches and if statements should just be a throw form / It's usually not ambiguous, and if it is my next question is should it be broken up, calling out to service methods it sits next to". 2026-11-03. Closer Look. `unrace-next.md`.
- **A vaultDB verb of its own for the box list.** Coach: "call it vaultBoxes(vault)". 2026-11-03. Closer Look. `unrace-next.md`.
- **Does a box answer still carry the vault row?** Coach: "yes I intended no change to the world field, that's working great. I was pointing out the stink of calling getVault, earning vault twice directly (as val and world), plus the secret update to vault done by deliver, in a method that is attending to vault's startup. So it's a little simpler with vaultBoxes". 2026-11-03. Closer Look. `unrace-next.md`.
- **The box's rebirth machinery.** Coach: (empty: took the Rec). 2026-11-03. Closer Look. `unrace-next.md`.
- **The memory store's notice order.** Coach: (empty: took the Rec). 2026-11-03. Closer Look. `unrace-next.md`.
- **For coach: fate, before thread 19.** Coach: "yes work around it; it's working code that is mostly dangerous because agents may learn from it." 2026-11-03. Closer Look. `unrace-next.md`.
- **An undergrowth thread.** Coach: (empty: took the Rec). 2026-11-03. Closer Look. `unrace-next.md`.
- **The gating family.** Coach: "make a prompt I can use for an interactive session with an opus to just investigate this". 2026-11-03. Closer Look. `unrace-gating-prompt.md`.
- **With autolock out of hello, an old lease opens with no proof.** Coach, in chat: "it should remove the lease no-throw, and return whatever it would have if the lease was gone. autolock is not a guarantee, it's a process, and a lease past autolock is due for locking, not an attack." And in the row: "yes. It is the only intervention besides bank.autolock, and we make firmly clear that the autolock is a best-effort reminder process, not a guarantee". 2026-11-03. Raised #465. Thread 23.

### Batch 13

- **The badnews return and policy.** Rec: remove them, and have the watch tell the host when it drops a row. Coach: "yes". 2026-11-03. Closer Look. `unrace-next.md`.
- **Coach note: the base checkout.** Coach: "would you sweep my changes in the base checkout into your sprint-progress branch, and also advance the base checkout to sit at the same sha as you are so I can see the next sprint preplan? I made a new branch vaultdbnew, leave me at your sha switched to that branch (did that make sense?)". 2026-11-03. Coach notes. Their models-invariants.md edit committed on the sprint branch, which now sits on thread 22; their branch 20261103-vaultdbnew fast-forwarded to it.

### Batch 12

- **What tidy is for, and what it can miss.** Coach: "tidy is supposed to call lock() on them not fiddle with the devicedb, I have a feeling I misled someone. remove it from hello, we can instruct the host to call it on their own." 2026-11-03. Raised #460. Thread 22, tidy_host.
- **A store's atomic step checks fields only.** Coach: "We should enumerate the exact tests a VaultDB is asked to establish before and after, they should be reasonable and natural, and should assume that the parent vault db will zod validate its inputs and outputs so it should not repeat anything they did / There are two categories: narrowing and scouring: a listing only retrieve boxes matching on scope and vault tok, so it narrows the response to gauranteee its invariants, in some cases it might be appropriate to scour: refusing to proceed if conflicting information is present. I want to approve things of the second form". 2026-11-03. Closer Look. `unrace-next.md`.
- **What a refusal's error may carry.** Coach: "a standard loggableRowOf helper that does a simple safeParse to know it's getting a row-like thing and keeps only safe fields would be helpful if it's not overthought." 2026-11-03. Closer Look. `unrace-next.md`.
- **When the answer frame gets redone.** Coach: "I will work with another agent to plan the vaultDB work but your advice is sound". 2026-11-03. Closer Look. `unrace-next.md`.
- **Who calls vault.hello, with first-box vivification gone.** Rec: the host, after unlock; a box verb before it refuses hello-first. Coach: "Yes, and if we have made it inconvenient for the react side we will adjust or sugar to their tastes once we're e2e". 2026-11-03. Closer Look. `unrace-next.md`.
- **A vacated bank is finished.** Coach: "a vacated or swept bank is done: no hello afterward, so a host makes a new Bank YES". 2026-11-03. Raised #460. `unrace-next.md`.
- **Refusals in dedicated files, now or next.** Rec: add refusals to thread 14, one models-refusals file. Coach: (empty: took the Rec). 2026-11-03. Closer Look. Thread 14.

### Batch 11

- **This sprint or the next?** Rec: close after threads 21 and 14, and run the rest as a new sprint from a fresh session. Coach: "Agree". 2026-11-03. Closer Look. Threads 18, 19 and 20 move to `unrace-next.md`, the new sprint's seed.
- **Damage shrinks to a listing, doing nothing else.** damaged_records stays on getBank's and getVault's answers; am 'd', isDamagedVaultAt, isDamagedBoxAt, damagekind and the store's judging go. Coach: (empty: took the Rec). 2026-11-03. Coach notes. `unrace-next.md`.
- **Asking for a damaged row by name.** Rec: it refuses damaged_record, and delVault of a bad row goes. Coach: (empty: took the Rec). 2026-11-03. Closer Look. `unrace-next.md`.
- **The deviceDB's public surface.** Rec: a narrow cachedLease object; public deviceDB dropped. Coach: "Rather than bank and vault getting methods to cache leases vault friend should. Make cache device record be cache bank as I assume they are isomorphic. If you rename cache vacate call it "forget"". 2026-11-03. Raised #461. `unrace-next.md`.

### Batch 10

- **Coach note: damage.** Coach: ""damaged record is set aside, and nothing acts on it" there were parts of the code trying to salvage damaged records, and obsessively checking them and routing them on anyway. We have to do something when an item fails validation though, and so it was contemplated that a separate listing would allow them to be unlisted; that should be the extent of it: use a tombstone in a separate response field to signal a special action, doing nothing else. This is going to be a rich source of edge case paranoia no matter what we do". 2026-11-03. Coach notes. Became the rows on damage in Open Matters.

### Batch 9

- **The end-of-method checks, reversed.** Coach, in chat: "Can I pull a reverse card and cancel the post condition adding thread, this sounds like it could get theatrical." 2026-11-03. Thread 16 stopped and discarded; its other items went to thread 21. The patch is in the scratchpad only.
- **bank.vacate leaves the bank not ready.** Rec: not ready until the next hello. Coach: "Not ready until next hello, at least. This feels like a rich source of bugs. Who calls vacate and why? Shouldn't react just remake a new bank?" 2026-11-03. Raised #460. Done on #460; the question goes to triage.
- **A refused erase with no onPanic can still bring a false prompt.** Coach: "If the host has no on panic they've given their opinion, wontfix." 2026-11-03. Raised #460. Thread 14 writes the wontfix.md row.
- **Should STYLE.md take the doc-block bound?** Coach: "Yes. You are getting very inconsistent guidance right now on comments, I have only recently learned how dangerous they are for agents. I will reform that soon, but a brief note would help". 2026-11-03. Closer Look. Thread 14 adds a brief note.
- **For coach: thread 15's worker was denied gh pr ready.** Coach: "You and your agents have permission to modify ors and force push". 2026-11-03. Raised #461. #461 and #463 marked ready.
- **_cheat_leaseFriend is a door by name.** Rec: drop it, lease.isMadeFor and its refusal. Coach: "The point is to be unreachable right? Will we still have good coverage?" 2026-11-03. Raised #461. Thread 21, which says what coverage stands.
- **Short blocks that still list refusals.** Coach: "Yes strip we can add back". 2026-11-03. Raised #463. Thread 14.

### Batch 8

- **Closer Look: the do seam.** Coach: "Nothing has been contemplated that involved running zod inside a transaction, I think the "its checks" may have been loose language." 2026-11-03. Thread 18.
- **Closer Look: a refusal carries the whole stored row.** Coach: "world and dbhas have the full record by design. Refusals should use error factories that determine by selection what goes into the error and its meta". 2026-11-03. Thread 18.
- **Closer Look: a vault can become sparse.** Coach: "this sounds like someone worked around the typechecker by eviscerating the code. fix". 2026-11-03. Thread 19.
- **Closer Look: ensureUnlocked asks storage first.** Coach: "ensure timely is to make sure the vault is recent enough to know if it deserves a lease, the tree would be better off to say so". 2026-11-03. Code stands; thread 14 corrects the tree.
- **Closer Look: every vault fetch discards the box list.** Coach: "vault hello should not be involved in populating box listings by anything more than triggering the one code path that does". 2026-11-03. Thread 19.
- **Closer Look: badnews and policy.** Coach: "the bad news and other reporting during deliver is poorly conceived, but I don't know yet what the right thing is. Do those code paths (including build) have bad news they're unable to report ?" 2026-11-03. With an investigator.
- **Closer Look: vault and box reborn opposite ways.** Coach: "box being durable is useful and important for the non react user. Replacing a vault is epochal in a way that replacing a box is not,. Still, some of that machinery is a little sus". 2026-11-03. Both stay; thread 19 looks at the machinery.
- **Closer Look: draft rows wrong.** Coach: "yes it was wrong of me to state that those code paths were "authoritative", they are pseudo code as a design artifact. Is there residue of agents trying to satisfy those over common sense and good practice?" 2026-11-03. With an investigator; the plan's ground rule changes.
- **Closer Look: weak tests.** Coach: "Fix the weak tests great catch". 2026-11-03. Thread 20.
- **Closer Look: things exist twice.** Coach: "some of this sounds harmless coming from not touching code in the old pool. However a lot of these method names are nowhere contemplated in the design docs, investigate?" 2026-11-03. With an investigator.
- **Closer Look: doc blocks.** Coach: "100% agree with "says more about the method than the docs" listing every refusal possible is foolish, wastes tokens and metastasizes. Strip every doc block that is longer than one or two 120-character lines and have an agent replace it with a line that describe the purpose of the function WITHOUT sacrificing readability. A method that can't easily be described thusly is a big smell. Flag all methods with logorrheic "SLOPDOC" in the replacement". 2026-11-03. Thread 17.

### Batch 7

- **A gate change refused as vault_gone or vault_mismatch carries the row, but the Vault never takes it.** Coach asked: "Doesn't the reply carry world with it causing an update?"; explained: it does, and is dropped at the Bank's no-op takeWorld. Rec: a protected isRefusalOfRow, overridden in VaultListing, with a test. Coach: (empty: took the Rec). 2026-11-03. Raised #459. Thread 16.
- **A gate change can reject after vaultDB.replacePassphrase has stored the new gate.** Coach asked: "I don't understand "row moved". Please use specific terms. Caching a lease should cause an error that is sent to the host but not cause the change to fail, right? Please check / also check that an old lease will have the wrong gate epoch and not be adopted."; explained: both hold. Rec: a wontfix.md row for the narrowed cases, and one test. Coach: "I can't see at a glance that the ones you named are wontfix, so document them and if it's straightforward test in halpimonfire". 2026-11-03. Raised #459. Thread 16: not called wontfix; documented in crossings.md, tested in halpimonfire.test.ts where straightforward, with the refused tryCache test.
- **tidy runs first in bank.hello, before the spec's order.** Rec: move it first, so an offline hello still drops an expired lease. Coach: "Does tidy need to know what the updated vaults are first? I agree it should run once it has ground truth, but not if it is awkward to give that priority". 2026-11-03. Raised #460. Thread 12's rework checks the question and runs tidy after getBank has answered or refused, if a plain try/finally does it; else first, saying why.

### Batch 6

- **The spec's end-of-method checks don't exist yet.** No thread's items named them; Rec: a thread of its own after the proof and before the sweep, dropping any row a check can't be written for. Coach: "Have each check, then the empty invariant is obvious". 2026-11-03. Raised #459. Thread 16, method_ends: every row gets a check, none is dropped for lack of one.

### Batch 5

- **Whose leases bank.tidy vacates.** leasesProvedBefore spans every bank, so one user's tidy would vacate another's old leases; Rec: keep the scan, thread 12's tidy vacates only its own bank's rows. Coach: "At your convenience make it only tidy that banks leases, and test for that". 2026-11-03. Raised #452. Lands in thread 12, with a test.
- **A whisper crosses from box to lease as a string.** A JS string can't be zeroed, and G7 asks the note be amended first; Rec: accept, thread 14 amends G6 and G7. Coach: "I will review, thanks". 2026-11-03. Raised #455. Thread 14 amends the guarantees; the Coach reviews there.
- **A lock whose erase is refused can reopen with no proof.** A refused erase at lock() leaves a row the next ensureUnlocked takes up; Rec: accept, wontfix.md, vacate in both cases. Coach: "This is why the panic button exists, there is no fix we can apply if the system somehow is operational enough to read leases, decrypt data and everything else but delete data." 2026-11-03. Raised #455. Thread 14 writes the wontfix.md row.
- **A public leaseFriend.** vault.leaseFriend() and lease.friend are public, and peekLease answers the row with its lease key handle (G9); Rec: leave it this sprint. Coach: "Let's fix before end of sprint, important, record to security,md". 2026-11-03. Raised #455. A new thread, lease_narrow, records it in notes/security.md.
- **A strength checker's verdict can put the passphrase in an error.** A verdict whose getter throws left the passphrase in err.cause (G8); Rec: thread 11's first commit. Coach: "Yes fix where it's convenient". 2026-11-03. Raised #458. Done in 8ffe86eb on #459, and its high review confirms it.
- **A host's getter throwing a VaultError that quotes the passphrase.** It passes the gating's check whole; Rec: accept, a wontfix.md line. Coach: "Wontfix agreed". 2026-11-03. Raised #458. Thread 14 writes the wontfix.md row.
- **Coach note: checks and types out of the models' files.** Coach: "at some point in the sprint would you ask an agent to relocate the checks and types at the top of models files into the shapes directory or model-shapes ? Anything with a good reason can stick around, but it saves token ussage to not have them there, and agents will write better ones. Types are best made from checks". 2026-11-03. Coach notes. Folded into thread 14, shapes_sweep.

### Batch 4

- **Newer-format rows in listings.** A row written by a newer app version is listed as damaged, so a host can't tell "update the app" from "this is broken". Rec: thread 6 has damaged_records carry the kind it was refused as. Coach: "this is an aspirational feature that we don't really need as the owners of the first versions. but of we're carrying them along might as well award them a proper refusal name -- format_mismatch. at your leisure". 2026-11-03. Raised on #450, thread 2's review. Went to thread 6's handoff, as a small item.

### Batch 3

- **Refusal kinds reach the public list.** errors.ts gains six exported kinds and five optional RefusalMeta fields, with a minor changeset, against the pre-plan's "nothing reaches index.ts". Rec: keep them. Coach: "it's fine for things to expand old code, try not to change them". 2026-11-03. Raised on #450, thread 2. They stay; the reviewer checks the diff only adds.
- **vault_empty or vault_mismatch.** The refusal for a live row under another vault_tok; the specs disagreed. Rec: keep vault_empty. Coach: "vault_mismatch seems to be a better fit, if the cost isn't high". 2026-11-03. Raised on #450, thread 2. Went to thread 2's reviewer as a directive.

### Batch 2

- **Does `send` hydrate?** The seam tables say it does; noted.md says "send does not hydrate". Thread 1 kept the hydrate. Rec: keep it until thread 5 reworks timeliness. Coach: "yes because it might be sparse." 2026-11-03. Raised on #449, thread 1. `send` hydrates: thread 5's handoff, and noted.md corrected on the sprint PR.

### Batch 1 (oldest)

- **`Promptly`'s value.** How fresh a record a gating attempt insists on, in ms. Rec: 2,000 for now; it is one constant. Coach: "lgtm". 2026-11-03. Raised in the pre-plan, *For the Coach*. Went to thread 5 (`timerless`), whose text already has it.
- **Revoking when no passkey is there.** Whether an idempotent `revoked` with no passkey moves the vault's revision. Rec: no: nothing changed, so nothing moves. Coach: "we can switch if it's an issue". 2026-11-03. Raised in the pre-plan, *For the Coach*. Went to thread 2 (`vault_db_new`) as a directive, and thread 11's handoff.
- **The refusal name `locked?`.** The specs mark it with a question mark. Rec: `locked`, unless a thread finds a clash. Coach: (empty: took the Rec). 2026-11-03. Raised in the pre-plan, *For the Coach*. A clash found: see *Your calls* on Cleanup, which lands it as `vault_locked`.

## Calls left to the orchestrator

One bullet per row of the doc's *Your calls* table on Cleanup, in the table's order: matter; call; lands in.

- **Mode.** The pre-plan says normal; the invocation says YOLO. YOLO it is. Lands in: The plan's header.
- **The refusal name for a locked vault.** vault_locked, not locked. The Coach took my Rec of locked, "unless a thread finds a clash"; I had not looked. vault_locked is already the kind in errors.ts and in the lease's refusal today, and a new kind would mean editing the old code. Lands in: Threads 3 and 7; the spec's cell at the sweep.
- **The birth stopgap.** Thread 1 made it listing.create plus #sendGate's direct listing.put, not one protected method on the vault, as a held draft would be staging again. Keep it. Lands in: #449, until threads 10 and 11 replace it.
- **delVault's act.** deleted, as the spec's ok collides with the field. Correct the spec. Lands in: #450; the spec at thread 14.
- **getBox's act and kind differ.** Keep the existing kind absent_box, with meta.act void or gone. The one place they differ. Lands in: #450.
- **req_params on good answers.** Keep it on every answer, safe metadata only; thread 6 strikes answer.scope. Lands in: #450, thread 6.
- **leaseMillis off the friend.** Leave it off unless thread 7 finds a reader: a lease has no deadline now. Lands in: #451.
- **lock on the friend.** Keep it: a lease that will not open must still lock its vault. The spec's friend doesn't list it, so correct the spec. Lands in: #451; the spec at thread 14.
- **Lease.peek(friend, gate_epoch).** Keep the second argument, since peek must judge the epoch. Correct the spec's row. Lands in: #451; the spec at thread 14.
- **checkStrength answers a verdict.** Keep the spec's name despite STYLE's check* rule, as the spec is what the sprint builds to. Lands in: #451.
- **A lock crossing an unlock (thread 3 proposed settling it in #attachLease).** No fix. noted.md already rules it: past the enter key the unlock stands, and the next lock() ends that session. Thread 7 builds the spec's rows, nothing more. Lands in: Thread 7's handoff; crossings.md.
- **Lint suppressions so far.** Keep all three: require-await on listing.build, so a refusal rejects rather than throws, until the lib target has Promise.try; prefer-private-class-fields on MemoryVaultDB's two _cheat_ methods, as models-world does. Lands in: #449, #450.
- **delVault over another life.** Keep the void answer; its world stays the sentinel for now. No caller reads it this sprint. Lands in: #450.
- **A damaged lease row.** Leave it: vacate can't read its vault_tok, peek reads it as none, and the next cache writes over it. Matches "a damaged record is set aside". Lands in: #452.
- **fetch's join.** It stays, as the spec draws it (1️⃣ on vault.fetch and box.fetch) and the old code has it. My handoff told thread 5 to remove it, misreading the pre-plan's list; a small rework puts it back on the existing oneAtATime helper. Say if you would rather have no join and strike the spec's marks. Lands in: #453.
- **A send declined by ifPresent: 'get'.** Leave it: it resolves holding the live row, the whisper discarded, with no other signal. The spec's row says declined and the proof doesn't reach it. Revisit if the demo does. Lands in: #454.
- **gate_epoch at thread 3's restack.** Thread 3's required gateEpoch wins over thread 6's optional one. Lands in: The restack before thread 7.
- **A disabled thing's refusal.** A new kind, disabled, as the spec's Preconditions has it; the builder had used bad_option to stay out of errors.ts, but you've said expanding is fine. Lands in: #455.
- **A vault gone: vault_gone or absent_vault.** vault_gone for a vault in the slot and tombstoned; absent_vault for nothing held. One change in absentRefusal if you prefer otherwise. Lands in: #456.
- **A delete over a damaged row.** delVault and delBox delete a damaged row when named as damaged_records lists it, by your ruling that it leaves only when the customer names it. Nothing else in our code touches it. Lands in: #456.
- **A tombstone over a live vault.** It stays in its slot, as the Vault listing table says; the Bank table's "vacated and unlisted" row loses. Thread 14 corrects it. Lands in: #456; thread 14.
- **extractWhisper's answer.** The holder { val }, not bare text as the spec has it, as it round-trips with putBox. Thread 14 corrects the spec. Lands in: #457; thread 14.
- **A row damaged after hello.** The held instance stays, refusing damaged_record, until the next vault.hello, as the refusal can't tell a box row from its vault row. Lands in: #457.
- **A wrong passphrase crossed by a lock.** wrong_passphrase, not the spec's locked_while_asking: it's the truer answer, with one branch fewer. Lands in: #458; the spec at thread 14.
- **A birth's run.** It lives in VaultListing: a birth has no Vault yet, and the bank's verb is one line over it. Lands in: #458.
- **A refused lease at a birth.** The vault stays stored and held, locked, as the put was the commit, and the next ensureUnlocked asks. The spec's "nothing stored, nothing held" is for a refused put. A rebirth always mints a fresh vault_tok. Lands in: #458; the spec at thread 14.
- **listing.del's shape.** del(ante), taking the record, not the spec's del(scope, vault_tok), as "over the revision the gate was read at" needs all three. Lands in: #459; the spec at thread 14.
- **putVault's fail.** Keep it as the default refusal, though vaultdb-invariants.md strikes it too: repl was what could do harm. Lands in: #459; the spec at thread 14.
- **One door to delete a vault.** Vault.del is delVault(), through a gating, so no delete goes unguarded. Vault.fullRecord is public, as gating.ts needs the record; its name stays open. Lands in: #459.
- **A crossing the review fixed.** Keep 79dc2254, though the handoff says a crossing is raised and not fixed. It put a key on the wrong epoch, which is a real finding, and the fix adds no state and removes a read of the live vault, as the spec draws. Lands in: #459.
- **A refresh the spec doesn't draw.** Keep the Promptly refresh the review added to addPasskey and revokePasskey: a revoke on a view minutes stale could answer done with a passkey added elsewhere still opening the vault. Correct the spec's diagram. Lands in: #459; the spec at thread 14.
- **Where the two new threads go.** Your leaseFriend ruling becomes thread 15, lease_narrow, cut after the bank and run beside the proof. The checks, if you agree, become thread 16, method_ends, after the proof. The sweep stays last, so it sweeps what they add. Lands in: The plan.
- **Bank.goodbye.** Removed, as the spec names sweep; closeVault and closeVaults went to lock too. Restoring goodbye is two lines. Listing.goodbye stays. Lands in: #460.
- **Discards with no hello.** tidy, lock, vacate and sweep don't need ready, though the spec's Preconditions ask it of every bank call: they never throw and only make the device safer. Correct the spec. Lands in: #460; the spec at thread 14.
- **bank.vacate's reach.** It erases every cached lease row of its own bank, beyond the spec's "each listed vault". Otherwise identity_revoked on a fresh page, with nothing listed, leaves leases on the device. Lands in: #460; the spec at thread 14.
- **bank.sweep and its listing.** It swaps in a fresh listing at once, not at the next hello, so nothing reaches a swept one. Lands in: #460.
- **A bank call before hello.** It refuses bad_option, an existing kind, rather than a new one. Lands in: #460.
- **A getBank that never answers.** It holds tidy back, the cost of running tidy after ground truth as you asked. No timeout, per CLAUDE.md; recorded as a crossing. Lands in: #460; crossings.md.
- **Where a birth lives, again.** #runBirth and recordOfBirth moved to vault.ts behind a static Vault.launchBirth, which takes no proving. A public unlockByProof, which my handoff leaned to, would have handed the friend to whatever was passed. Lands in: #461.
- **A script patching the prototypes.** Accept: patching Proving.prototype.buildLease, Lease.grant or Lease.peek still captures the friend. Hostile script in the page is beyond this narrowing, and security.md should say so. Lands in: #461; thread 14.
- **A box's snapshot shows the lock.** Keep lockState on BoxSnapshot, though each box and the box list now repaint on every lock and unlock. Without it, a whisper stays on screen for any host that forgets to subscribe its reveal to the vault. Lands in: #462.
- **Where reconcileCentral's table lives.** It lived only in the stripped doc block and an old thread file. Leave it in git (bc37d226, storable.ts:346), and find it a home in a spec or notes only if the smell survives. Lands in: #463.
- **A host's own friend.** Leave the code: a friend of the host's own, handed to proving.buildLease, hears a new lease's record, but that takes a proving, so the passphrase its dialog already heard, and never reaches the cached row. Recorded in G9 and security.md. Lands in: #461.
- **A BoxListing given to launchBirth.** Leave it: MSX.isListing passes it, and by reading it throws a raw TypeError at demandBirthSlot. models/ is on no entry point, and that's the caller's own type error. Lands in: #461.
- **demandBirthSlot's name.** Keep it for now, though it answers the tombstone or null where STYLE.md's demandFoo only throws. It goes with the undergrowth, if you take that thread. Lands in: #461.
- **#leaseFriend's memo.** Leave it: nothing needs the friend's identity now, but it parses the stamp once. Lands in: #464.
- **replacePassphrase over a vault deleted mid-lease.** Leave it, pinned in halpimonfire: it resolves, the Vault is tombstoned, and the next verb says vault_gone. Lands in: #464.
- **A sweep during a renewal's buildLease.** Leave it: it erases the cached row where a sweep otherwise leaves it, so the next session asks a proof. Safe direction; recorded as a crossing. Lands in: #464; crossings.md.
- **bank.vacate's double panic.** Leave it: a refused erase on a listed vault panics from vault.vacate and from #eraseOwnLeases. The erase is unconditional, and a repeated panic does no harm. Lands in: #465.
- **When autolock resolves.** Leave it: await bank.autolock() returns with vaults reading locked and their erases started, as vault.lock() returns at once. The proof waits for the erase. Lands in: #465.
