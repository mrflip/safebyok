# bank_world: resolutions

The Coach's rulings on the sprint's open matters, from the sprint doc's *Resolved* tab, and the orchestrator's own calls, from the *Cleanup* tab's *Your calls* table. Newest batch first.

## The Coach's rulings

### 2026-11-13, the deleted Vault and box, and #691, #692, #694 (threads 20, 21, 24)

- **Deleted Vault refuses vault_gone** (asked on #691, thread 20). Matter: YOLO, a deleted Vault's own calls refuse vault_gone (get, del, beginWatch and the box verbs always; hydrate and ensureTimely when they must fetch), so a host can't refresh a deleted Vault object to find a new life through it. Rec: keep. Coach (2026-11-13): "let a deleted vault and box stay enabled". Went to: thread 25 `vault_enabled`, stacked on #694. A deleted Vault stays enabled, as a box does, and is still delisted and discards its box listing (the earlier 1.5 and E5 rulings).
- **A deleted box stays enabled** (#691, thread 20). Matter: its put begins its next life; deleted things stay in the listing's map, out of its list. Rec: keep. Coach (2026-11-13): (empty: took the Rec). Went to: nothing to do; thread 25 makes the Vault match.
- **Bank.isPresent means a live row of the bank's own life** (#691, thread 20). Rec: keep. Coach (2026-11-13): (empty: took the Rec). Went to: as built.
- **gate.del() still refuses bad_option** (#692, thread 21). Rec: keep the refusal, at the bankDB call. Coach (2026-11-13): (empty: took the Rec). Went to: as built.
- **bank.del() deletes with no prompt and no proving** (#692, thread 21). Rec: accept; delPrompt is the friendly door. Coach (2026-11-13): (empty: took the Rec). Went to: as built; notes/security.md records it at wrapup, through its subagent.
- **Two throwers remain, BankListing's and GateListing's doTryPut** (#692, thread 21). Rec: keep both. Coach (2026-11-13): (empty: took the Rec). Went to: as built.
- **Agreement checked by tokens alone** (#694, thread 24; deliver-contract open item 3). Coach, in chat (2026-11-13): "I'm ok with no further checks on agreement". Went to: as built.
- **Convex grew about 41 lines, reading back each written doc** (#694, thread 24). Coach, in chat (2026-11-13): ok "with the convex growth". Went to: as built.
- **The e2e batteries skip the stored-otherwise cases** (#694, thread 24). Coach, in chat (2026-11-13): ok "on leaving the individual data stores to test those cases". Went to: as built.

### 2026-11-13, closer fix (a), from chat

- **Closer fix (a), the watch-count test, after all** (Closer Look 2, 1.2). Coach, in chat: "you can go head on "closer fix" (a)". 2026-11-13. Work: thread 23 checks thread 20's watch-count test covers a disabled lock, a tombstone or another life, and a sweep, and adds what's missing.

### 2026-11-13, Closer Look 1 and Closer Look 2

- **The device's snapshot changes before its bank and boxes align** (Closer Look 2, 1.1). Coach: "the device should make its own snapshot, it can serve as the bank listing's parent / world". 2026-11-13. Work: thread 20 `listing_membership`.
- **May a BankDB's unwatch throw?** (Closer Look 2, 1.3). Coach (explain): "who calls unwatch? It sounds like it should never throw but it should deliver bad news". Answer: Listing.goodbye calls it, when a listing finds itself disabled in an align (a lock, a tombstone, another life, a sweep, a vacate); the watch's own errors already go to device.tellBadNews. 2026-11-13. Work: thread 20: goodbye never throws, an unwatch's throw goes to bad news.
- **Is a tombstone a life for the box listing below it?** (Closer Look 2, 1.5). Coach: "> A deleted vault stays listed and enabled, That's very different than the design or guarantees, fix". 2026-11-13. Work: thread 20.
- **Where does delete policy live?** (Closer Look 2, 1.7). Coach: "don't throw on any of them puritanically, it's causing agents to make bad decisions." 2026-11-13. Work: thread 21 `gate_verbs_plain`: bank.del(), gate.del() and the listings' throwers do the plain thing.
- **Swap the GraphQL server's hand-built iterator for @repeaterjs/repeater?** (Closer Look 2, 1.9). Coach: "yes". 2026-11-13. Work: next sprint, a side quest (*Finally*).
- **Do damaged rows belong in a listing's snapshot?** (Closer Look 2, 1.11). Coach: "no, damaged rows don't exist. Delist them. Listing should tell its listeners when its list changes". 2026-11-13. Work: thread 20.
- **bank.ensureUnlocked() fetches the whole bank first** (Closer Look 1, E1). Coach: "why is the time set to 2 seconds? Make it 1 hour". Answer: VX.Promptly (2000 ms) was set so a prompt shows the wayins as they stand just before asking; with the watch on, that's redundant. 2026-11-13. Work: thread 23 `closer_fixes`: Promptly 3600000.
- **Who restarts the box watch when a vault begins a new life?** (Closer Look 1, E5). Coach: "a deleted vault should discard its listing". 2026-11-13. Work: thread 20.
- **"One plain function per verb" and the gate verbs** (Closer Look 1, E10). Coach: "This does not sound like readable code. is this code in vaultDB? It should be calling the gate verb on its adapter. Why is any of them more complicated than a set of checks and then a call to this.doPutGate, followed by postcondition checks? If multiple error conditions are present and any of them is impossible, none of them are ordered. the special gate verb checks are all impossible. I suspect an agent came and tried to "improve" the code by merging "repeated" lines. vault db should call gate verbs on the adapter, and dealing with the result. none of those at the vault db level should look materially different than putVault." 2026-11-13. Work: thread 21.
- **The watched life_tok** (Closer Look 1, E11). Coach: "I'd prefer to fix later, if it's not disastrous; I'm of a few minds and there's another big refactor coming". 2026-11-13. Work: next sprint's design notes.
- **Convex's tidyGone range arithmetic** (Closer Look 1, E14). Coach: "good golly that sounds wrong. can you replace it with deleting up to 1000 and then reporting a bound on how many remain? (i.e. "zero", "one to 1000" and "more than 1000" is actionable)". 2026-11-13. Work: thread 22 `convex_tidy`.
- **Plain fixes from both looks** (Closer Looks 1 and 2). Coach: "a skip; f only if the other refusal is not true or if it removes code; all the rest are good". 2026-11-13. Work: thread 23 (b, c, d, e, g, h, i; f only as stated; a skipped, though thread 20 writes the watch-count test for its own change).
- **Salts in the gate snapshot** (#678, thread G). Coach (explain): "why does the gate need to show it? Who wants to see it? Even if it's not secret, it's ugly and useless in the logs." Answer: nobody: only the demo's WaysIn reads the gate snapshot's wayins, for which wayins exist and their registered_at. 2026-11-13. Work: thread 21: the gate snapshot keeps per wayin only presence and registered_at.

### 2026-11-13, #686 and #688 (threads 19 and 17)

- **YOLO: the device hears when a bank of another life replaces its bank** (#686, thread 19). Device.dismissGatingAtDiscard remakes the device's snapshot; one test. Coach: proceed (took the Rec: keep). 2026-11-13. Work: filed in #686. Note: Closer Look 2's 1.1 (a later row) proposes moving that remake after the align.
- **Does a wayin change keep making other devices prove again?** (#688, thread 17; owed at the sprint's end). Today, yes: a cached lease citing an earlier gate revision is forgotten. Coach: proceed (took the Rec: keep, for simplicity). 2026-11-13. Work: none; thread 17's docs state it.
- **gallant.md's #no-fake-values / #ask-the-host pair argues the wrong way** (#688, thread 17). Coach: proceed, and "to be clear: is it the case that Device calls an async method, Bank.make is sync and receives the device_tok at birth?" Answer: yes, with one correction: Device.make is sync and takes no device_tok; device.ensureBank() awaits deviceDB.ensureCachedDevice(scope), which mints or reads it; the Bank is then built synchronously by the bank listing (there is no public Bank.make) and reads device_tok from its device at birth, checked non-null. A host never passes it. 2026-11-13. Work: the pair rewritten in a later docs pass (*Finally*, next sprint).
- **Remove TODO's "A storage read begun before a create can undo it"?** (#688, thread 17). Coach: "leave, will cull many a TODO in upcoming days". 2026-11-13. Work: none.

### 2026-11-12, #685 (thread 18)

- **A leaf's children are an empty array, not a DummyListing** (#685, thread 18). Coach: "whatever's easiest" 2026-11-12. Work: as built.
- **bank.del() and gate.del() refuse at once** (#685, thread 18). Coach: "yes, but do remember that the customer is not an adversary; if anyone with dev tools can access listing.del, they can also access Bank.del" 2026-11-12. Work: as built; no guard on the listing's del (18's review had flagged it).
- **The unlock ruling now prompts where a locked bank used to refuse** (#685, thread 18). Coach: "I may have led you astray, did not mean to recommend replacing demandUnlocked with ensureUnlocked. Let's revert to demandUnlocked"; in chat: "Did not mean for a wholesale demand->ensureUnlocked, let's keep it simple." 2026-11-12. Work: a rework of 18 reverts it; `bank.ensureVault` keeps taking a locked bank, sealing keeps its demand.

### 2026-11-12, #680, #683, #684 (thread T and the documentarian)

- **The ruleset requires node-compat (26), which ci.yml means only to report** (#680, thread T). Coach: "it usually finishes with or before lint+typecheck, and often catches flakes; since it's running anyway I'll leave it" 2026-11-12. Work: none; the ruleset stays.
- **Rename Convex Tallies.refuses to wouldPassLimit?** (#683, documentarian). Coach: "rename" 2026-11-12. Work: thread 17.
- **Rename IndexedDB's Rung, #ring, #bellname?** (#683, documentarian). Coach: "I actually like it, it's a good name for 'only people within earshot hear this' vs notify 'tell everyone, NOW'. Short, and clear, and keeps the bankDB / deviceDB separation" 2026-11-12. Work: none; the names stay.
- **Rename Convex Tallies.weigh to sizeOf?** (#683, documentarian). Coach: "ys" 2026-11-12. Work: thread 17.
- **Rename React devmode's Listing\<ValT\> to PanelListing?** (#683, documentarian). Coach: "y" 2026-11-12. Work: thread 17.
- **Rename React useProvided to useProvidedDevice?** (#683, documentarian). Coach: proceed, 2026-11-12. Work: thread 17, as the Rec: renamed if exported, left if internal.
- **Keep the Chute: lines in doc blocks?** (#684, documentarian). Coach: "keep -- name that as an exception in style if you think it's needed, but it helps a user 'gosh I wish I could just call a method that takes an object/doesn't hydrate/etc'" 2026-11-12. Work: thread 17 names them in STYLE.md as the exception, with that reason.
- **Bank.ensureVault demands an unlocked bank for any vault not already listed** (#684, documentarian). Coach: "I would say storable.put/del (public) ensureUnlocked(), even if they carry ensure semantics; I think these are just sugar for listing.put/del. The semi-public listing.put/del do not. ensureVault (a harmless create or a get) does not. seal does." 2026-11-12. Work: thread 18, as a directive (unless it outgrows that thread's context).
- **Confirm the readiness thresholds on #680** (#680, thread T). Coach: "1. while building, or for mid-workstream rebasing, or reviewer's fixes: the tests that bear on the change (a file or a package) 2. push and add ci once the touched packages pass tests and typecheck 3. ready (ask for review) on a green pnpm justify 4. justify again after the rebase in preparation to file. If there are issues, revert to (1) selective tests, or justify, based on how lucky you feel 5. justify before taking out of draft mode (file-thread runs it); reviewers prove what their fixes touch" 2026-11-12. Work: a commit on #680.

### 2026-11-12, #680, #681, #682 (threads T, 12, 16)

- **CLAUDE.md says justify is green before every commit** (#680, thread T). Coach: "oh heck no. Run the tests with the flag that targets touched files, or on folders, or in whole, as you judge. The tests are a tool for you to write good code, at the pace your training and memory already know. Justify runs for a long time and is about having confidence that CI will pass. Run it when you're confident enough it will be green and want to prove you're ready to file. Run it, or the tests alone, to become ready. (supervisor: choose the best threshold for becoming "ready"; how much longer is justify vs the test suite alone?)" 2026-11-12. Work: on T. On CI, lint takes 1:41, typecheck 0:32, and build plus tests 2:00, so the full justify, run serially, is about twice the test suite alone and four times one package's. The threshold: a worker is ready when lint, typecheck and tests are green for the packages it changed and their dependents (`pnpm --filter "...[<base>]"`), plus `justify:root` when it changed root files; it pushes with `ci` so CI runs the whole suite, and file-thread's justify stays the gate.
- **The Version PR now waits for you before CI** (#680, thread T). Coach: "it's already the case that I need to tickle it, I will remember that the label may be also needed" 2026-11-12. Work: as built.
- **Convex upgrade: empty every component table before deploying** (#682, thread 16). Coach: "roger" 2026-11-12. Work: as built.
- **YOLO: CI no longer listens for labels; add ci, then push** (#680, thread T). Coach: proceed, 2026-11-12. Work: as built (7ce73f534, 508b34113).
- **A thing's align duty is alignLock(), not lock()** (#681, thread 12). Coach: "no need for a back compat layer, we've had no public release. remove lock() on storable, it's just on -- device? bank?" 2026-11-12. Work: as built at 12's tip: `bank.lock()` is the one lock, and no Storable has a `lock()`. The reason is not compatibility but that a thing's `alignLock()` locks nothing. Listing's `lock()`, which only fans out `alignLock()`, is renamed `alignLock()` in 17.

### 2026-11-12, #677, #678 (threads G and 10)

- **autolock holds the lease row, key handle included** (#678, thread G). Coach: "We will be reworking the semantics of how the lease is stored later (should it be CAS? should it be per-tab, and different tabs notify on changes or rely on the vaultDB notify?) -- it's not clear yet where the ground truth is, but I think even now it's the live lease held by the bank, not what's in the cache. Either way, have the lease itself report an expires at time, abstracting all those details into a method opaque to bank." 2026-11-12. Work: thread 8d, a Lease method reporting its expiry, Bank.autolock through it; the guarantees note's Open item 2 closed after 8d.
- **A gate row of another gate_tok is adopted** (#677, thread 10). Coach: "The stakes here are low for replacement because no customer should see a gate object (if it's not the case that they can't, TODO it). However, with Bank now being a singleton owned by device, I hope to get rid of replacement altogether -- will evaluate and execute that after the sprint. tl;dr: go with what's easy, which is vault, box and gate are not "remake"able (that's your rec, right)? Leave bank remake able, or not, whatever you have right now. Don't rip out remake either way." 2026-11-12. Work: as built (yes, that was the Rec); hosts do see the gate (bank.maingate), so a TODO entry by 8d.
- **A refused lease revoke at a lock now vacates the device** (#677, thread 10). Coach: "yes vacate, the best hope for resolving the situation would have nothing trying to access it. bank should get vacate at some point; is there a reason it can't go on storable -- vacate myself, vacate my protected getter `children():Listing` -- now that bank vault and box look more alike?" 2026-11-12. Work: as built; the bank-vacate question answered in chat and recorded as a TODO entry by 8d.
- **An ended bank's snapshot still lists its vaults** (#677, thread 10). Coach: "I think the previous suggestion would handle this." 2026-11-12. Work: folded into the bank-vacate TODO entry.

### 2026-11-12, the bank- drafts of the contract notes

- *Coach note: the bank-* drafts\* (Coach notes). Coach: "did you see the files bank-(contract-, design, etc) in the whiteboard. They're for swapping in atop the notes/ versions when you wish. They were written prospectively, though, so I might have a sonnet merge them as you go, with the code overriding both". 2026-11-12. Work: guarantees-bank.md now, by a sonnet worker (thread G, guarantees_bank, on 9's tip, code overriding both); deliver-contract-bank.md stays with thread 10, which is building the lifecycle that draft describes; 8d brings guarantees up to date after 10.

### 2026-11-12, #673 and #675 (threads 8c and 5b)

- **A gate row landing between a gate verb's write and its lease grant** (#673, thread 8c). Another device's gate change landing between this device's gate write and its lease re-grant leaves the lease citing a superseded revision, so the next unlock proves again. Rec: leave it. Coach: "yes TODO not this sprint. Add to the TODO for this -- If the lease is only handled during align -- i.e. after the newest version has been adopted -- is there an issue?  (I think so). Should we adopt CAS for the lease in deviceDB (probably, and some solution for the tabs issue as well)". 2026-11-12. Work: a TODO.md entry, as a ride-along commit on thread 10.
- **How the device row learns the package version** (#675, thread 5b). 5b added a PackageVersion const, a root script syncing it at release:version, and a drift test. Rec: drop the script, keep the test. Coach: (empty: took the Rec). 2026-11-12. Work: 5b's reviewer, in its fixes.

### 2026-11-12, #667, #668, #670 (threads 8b, 5, 14)

- **Doubled default prefix** (#668, thread 5). Nothing beyond the host's dbName scopes an IndexedDB database's name; with no dbName it is safebyok:bank-v…, with one safebyok-\<dbName\>:bank-v…, for the bank and device databases together. Coach: (empty: took the Rec). 2026-11-12. Work: thread 5b (device_shelf), started from 8c's tip.
- **tidyGone can't say rows remain** (#670, thread 14). Convex's delBank and tidyGone delete on a budget; `{ totalCount }` can't report rows left, so the README tells hosts to call tidyGone now and then. Rec: leave the core contract alone, no scheduled continuation. Coach: (empty: took the Rec). 2026-11-12. Work: none; ruling noted on #670.
- **Two device tells per lock and unlock** (#667, thread 8b). bank.lock() tells the device once for the bank and again as it aligns its vaults, so a host painting on every tell sees a vault unlocked under a locked bank. Rec: one tell per lock and unlock. Coach: "one tell per lock and unlock". 2026-11-12. Work: thread 10 (one_enabled), with the lifecycle; 8c had already filed.

### 2026-11-12, the plan, the sprint's first threads, and #663 to #669

- **Your hand edits in the base checkout.** `box.ts` (`#dropExposed` renamed `#doUnexpose`) and two lines of `TODO.md`, uncommitted on `20261111-pushto100`. Rec: "carry" and the next thread in `box.ts` takes them. Coach: "carry". 2026-11-12, plan. Went to: `coach-hand-edits.patch` in the sprint directory; thread 6 applies it as its first commit. The base checkout's copies are then duplicates.
- **`gates: ['main']` as a host option.** Rec was: the Device sends `gates: ['main']` itself and the option goes. Coach: "Note: the following is background, and describes potential post-1.0.0 features. The design has two use cases in mind: the react BYOK case, and a "dopper-lite" secrets vault, allowing me to issue an expirable token a standalone process can use to dispense a vault as env.vars This is the most likely non-provider case, and as you can see we don't want to be offering default behavior that lands the main gating to the container. `gates: []` will be a required array, and only the labelled ones retrieved." 2026-11-12, thread 6. Went to: Rec declined; `gates` stays a required `Device` option with no default, `BankProvider` fills it in for React; noted in the progress document and thread 6's handoff.
- **Coach note: red PRs as a landing point.** "I have no objections to a pr that has red tests or .skips as a landing point if it allows more efficient thread scheduling. I can merge a set of stacked prs that are intermediate red leading to a mergeable green. (This is an offer, not a directive)". 2026-11-12. Went to: plan ground rules 20 and 21 (stacked threads cut from a ready tip; thread 8 skips what 8b re-points once).
- **Coach note: force-push and PR handling.** "You and agents have permission to force-push-with-lease and to use gh or git commands to manipulate PRs, or to take them in or out of draft." 2026-11-12. Went to: plan ground rule 21.
- **Coach note: bank-world drafts of the contract notes.** "Consider having an Opus write parallel documents for answer-contract, deliver-contract and guarantees in the envisioned new bank world, moving the others to answer-contract-old, etc, if that will help lower-powered agents make good decisions." 2026-11-12. Went to: an opus agent writing `guarantees-bank.md` and `deliver-contract-bank.md` in the sprint directory, promoted into `notes/` by threads 8b and 10; no draft for answer-contract, which threads 3 and 4 write in place (plan rule 23).
- **Coach note: standing guidance for /sprint.** "Would you please add standing guidance to the /sprint skill that: it's occasionally acceptable to file a PR whose test suite is red or has .skips, only resolved on a later stacked PR -- coach will merge the tip of the ministack, causing the run to "go purple" in github; you may start one thread while the prior is in review, justify, or filing if there's capacity; it's acceptable to push before justify; to use the restacker skill (or to read it and follow its advice) when rebasing a large number of PRs simultaneously: they're likely to all be green, so don't try to justify each. one. in. a. line." 2026-11-12. Went to: the harness refused the `.claude/` edit as self-modification; the text is in `sprint-skill-guidance.md`, a For coach row in Open Matters, and plan rules 20 to 22 meanwhile.
- **Coach note: user_id then device_tok.** "user_id then device_tok sounds right as it's not contemplated to have multiple users" 2026-11-12. Went to: progress document; nothing to change.
- **Coach note: stale IndexedDB databases.** "stale indexeddb droppings: fine; the code has not had a public release. Do make sure that we can unambiguously pick out what db shelves were written by this library (safebyok-...), and perhaps even save a version number in the right place updated on write." 2026-11-12, thread 2. Went to: thread 5 names every IndexedDB database the library opens `safebyok-` and judges a version on write; the Cleanup item is struck.
- **Two Open Matters rows reading "(see below)"**, proceed: their content moved to Coach notes, handled above. 2026-11-12.
- **For coach: the /sprint skill guidance.** The harness had refused the `.claude/` edit; the text waited in `sprint-skill-guidance.md`. Rec: apply it yourself, or allow agents to edit `.claude/skills`. Coach: "You and agents have permission to modify .claude files, CLAUDE.md in pursuit of better token and time usage after conversation with me through chat or turbochat. In particular, you and agents have permission to update the .claude sprint skill as I directed. You and agents have permission to modify the turbochat document. You and agents have permission to use git and/or gh to force-push-with-lease and other such commands on PRs owned by this sprint. An agent can force-push or manipulate another agent's PR." 2026-11-12. Went to: the skill text applied on the sprint branch (`SKILL.md`, `wrapup.md`, `thread-worker.md`), in #656; a memory of the permission.
- **Coach note: read the tab with a sonnet reader.** "I've been advised to have you read the turbochat matters tab with a sonnet doc-tab-reader and then edit cells by id (if the doc-tab-reader is not currently emitting everything you need, you have permission to modify it). This should save a notable amount of context. Follow on with other ideas to save time or tokens" 2026-11-12. Went to: passes now use the `open-matters-reader` agent; two ideas offered as new matters (file-thread rebasing stacked threads; why /code-review returns nothing in reviewer worktrees).
- **Coach note: boxes carry bank_tok.** "boxes should carry vault_tok and bank_tok; hopefully it works to treat their concatenation as a virtual parent_tok life token (join with '/' to use as a string; in SQL you'll set separate predicates)" 2026-11-12. Went to: thread 4 as a directive mid-build (BankDB's box row is BX's own, fmt 5003, parent life `bank_tok/vault_tok`); design.md *Stored rows*; progress document.
- **Two new React hooks, useDevice and useDeviceSnapshot.** Rec: keep both. Coach: (empty: took the Rec). 2026-11-12, #661. Went to: progress document.
- **file-thread rebases a stacked thread.** Rec: a small change to cut-thread and file-thread. Coach: (empty: took the Rec). 2026-11-12. Went to: thread S1 `filer_stack`, its own PR from main.
- **/code-review returns nothing in reviewer worktrees.** Rec: a sonnet agent finds out why. Coach: "I was pretty sassy about code reviewers in my opening notes and in the plan, do they see those? If so moderate my remarks. I do want them to be aggressive, but we mustn't let an opus high be led a merry muckle by a sonnet medium's neuroses / yes run the experiment. / we also recently updated STYLE.md and the other guidance files. The notes/gallant-* files are great resources but large, if they load those. What is the context size for them?" 2026-11-12. Went to: rule 18 rewritten (look hard, report plainly; worries to Open matters, not rework); a sonnet probe running; the gallant answer in chat.
- **BankAnnouncement and BankPanic are now the Device's.** Rec: rename in thread 8. Coach: "yes. keep an eye out for other things that were liminal in the lifecycle, like handlers that were permitted to pass messages for a brief time after sweep/vacate/etc / I suspect Device will end up holding most of what Bank did and Bank what vault did / A Device does not need to sweep as aggressively as a bank did, it does have to respect the Provider lifetime" 2026-11-12. Went to: thread 8b's handoff; progress document for 8, 10, 12.
- **One documentarian pass at the end.** Coach: "yes". 2026-11-12. Went to: plan, before thread 17.
- **Coach note: merge conflict in one of the PRs.** "merge conflict in one of the PRs" 2026-11-12. Went to: #661 and #662 conflicted with main after #660 merged; a worker is rebasing #661, and #662 follows once its review is done.
- **The device's check of the gate policy (R3).** Rec was: the device calls the core's per-verb check before each gate verb. Coach: "There are two notable security boundaries in the library: isUnlocked, and the bastion side of the bankDB's backing store -- a postgres stored function, a convex function, etc. The bankDB code, for all it feels like a remote server, is right there in the same page with all the iFrames and chrome extensions. So some datastores will re-run the basic checks internally as well: is the wayin that is authorizing a gate change identical? These are not terribly robust now but could be made more so later. tl;dr -- make the new code look like the current code -- the adapters already do this. No bold thinking is" 2026-11-12, thread 8c. Went to: Rec declined; 8c moves today's device-side gate code as it is; the bastion adapters (13, 14) re-run the policy in-database; progress document and thread-8-cut.md.
- **Coach note: rescheduling.** "your rescheduling sounds smart" 2026-11-12. Went to: 8a under way from thread 7; 4b and 5 beside the 8 line.
- **The Bank as a Storable before thread 10.** Rec was: a five-line private adapter as the Bank's world. Coach: "have device be its world, that's smart." 2026-11-12, thread 8b. Went to: the Device is the Bank's world until thread 10; progress document and thread-8-cut.md.
- **The device's check of the gate policy (R3), final text.** The Coach's answer, as finished: "...tl;dr -- make the new code look like the current code -- the adapters already do this. No bold thinking for the hard work here". 2026-11-12. Went to: as the earlier bullet says.
- **Coach note: tidyGone and damaged rows.** "tidyGone swept every vault row whenever the bank row was damaged, against its own comment / just to check: tidyGone should have the data store referencing the current bank at its scope -- not sending a bank_tok / Also: damaged rows within the datastore are out of scope, we can't write code if we can't trust the datastore. make sure there's an actual path to the error being hypothesized." 2026-11-12, #663. Went to: confirmed tidyGone's ask is scope-only; plan ground rule 24; thread 4b reverts the review's damaged-bank guard instead of pinning it.
- **Is a row of a later fmt a real path?** (#666, thread 4b) No: the production adapters run app-controlled functions server-side and cannot drift; a mutilated bank row leaves nothing readable, so `tidyGone`'s contract holds either way. No guard, check or test in any adapter; told 4b's reviewer, 5 and 13; in the progress doc.
- **A vault birth racing delBank** (#669, thread 13): left as is. The Coach: "yes, it will stick around, and that's acceptable. We may offer postgres users advice or code to run lock-ier stored functions under the same contract but with tighter atomicity." In the progress doc.

## The orchestrator's calls

Each of these was a call left to the orchestrator, not a ruling of the Coach.

- **Thread 8 is too big for one context**
  - My call (the orchestrator's): Split: its new tests and its notes (`guarantees.md`, VOCABULARY) become thread 8b; the switch stays green on the re-pointed suites
  - Lands in: plan, thread 8
- **When the server adapters (13 to 15) start**
  - My call (the orchestrator's): After thread 9, from the line's tip, beside 10 to 12: R7's own argument, and no porting of 8's contract fixes or 9's renames
  - Lands in: plan, ground rule 19
- **Reviewer depth**
  - My call (the orchestrator's): `sonnet` reviewers at `low` or `medium`, told to file plain reports and send edge cases to Open Matters (your note 3)
  - Lands in: plan, levels
- **Your four notes at the invocation**
  - My call (the orchestrator's): Ground rules 15 to 18 of the plan, quoted in each handoff they bear on
  - Lands in: plan, ground rules
- **fastkey's changeset level for the banklabel rename (#1)**
  - My call (the orchestrator's): Kept at patch: only a README and one @example changed there
  - Lands in: #657, as built
- **Thread 4 is too big too (#3 compacted four times on less)**
  - My call (the orchestrator's): Split: the battery is thread 4b; 5 waits on 4b. Thread 8 gets cut further before it starts
  - Lands in: plan, 4 and 4b
- **Box verbs see only the vault row, not the bank (#3)**
  - My call (the orchestrator's): As today (rule 2): a vault row left by an ended bank is caught at the vault, not the bank
  - Lands in: #660, as built
- **A gate row under another bank_tok (#3)**
  - My call (the orchestrator's): It is no row: gate verbs refuse ahead, ensure and build throw damaged_row (rule 17: whichever falls out)
  - Lands in: #660, as built
- **No damaged_bank refusal (#3)**
  - My call (the orchestrator's): A damaged bank row refuses damaged_row, like any other
  - Lands in: #660, as built
- **buildBank policy cells (#3)**
  - My call (the orchestrator's): Refused bad_record at the ask check, not gate_issue (rule 17)
  - Lands in: #660, as built
- **tidyGone parent in design.md (#3)**
  - My call (the orchestrator's): The cell held a description by mistake; the row now reads: acts on an ended life's vault and box rows, answers a count, no parent
  - Lands in: design.md
- **Gate snapshot named gateRow-fmt4001 (#3)**
  - My call (the orchestrator's): Kept: there is no gate tombstone, so record and row are one
  - Lands in: #660, as built
- **A refused device-row ensure goes to onLifecycle, not the error boundary (#6)**
  - My call (the orchestrator's): Kept: every other start-up refusal already goes there
  - Lands in: #661, as built
- **device.ensureBank() when the bank is already up (#6)**
  - My call (the orchestrator's): Returns the bank in hand and announces nothing
  - Lands in: #661, as built
- **Three races in the Device start-up (#6): two ensureBank calls at once; a sweep during the device-row ensure; React's user switch**
  - My call (the orchestrator's): Left as carried over from today's hello (rule 2); none adds machinery
  - Lands in: thread 6's file
- **A vacate during the device-row ensure can leave a device row for a signed-out user (#6 review)**
  - My call (the orchestrator's): Left (rule 2): a fix needs a check inside the deviceDB verb or a join
  - Lands in: #661 review comment
- **Changeset silent on the lost forced re-list; stale Bank.make words in test docs and TODO (#6 review)**
  - My call (the orchestrator's): Two-liners ride along in thread 7
  - Lands in: thread 7
- **Thread 7's edges: cancelling the confirm while a delete runs; unsealing a box during a vault delete; a deleted vault refusing vault_locked, not absent (#7)**
  - My call (the orchestrator's): Left as carried (rules 2 and 17)
  - Lands in: #662, as built
- **The vault_locked phrase says 'locked mid-operation' even when the vault was locked before (#7)**
  - My call (the orchestrator's): Thread 8 rewrites it as bank_locked's phrase
  - Lands in: thread 8
- **vault.del takes the vault as its argument (Storable's signature), where the design writes vault.del() (#7)**
  - My call (the orchestrator's): Kept for now; thread 10, which aligns the listings and things, judges the signature
  - Lands in: thread 10
- **Thread 8 cut in three (8a keys, 8b switch, 8c prompts; 8d tests and notes); 8a starts once 7 files**
  - My call (the orchestrator's): An opus planner read the code; red from 8a to 8c, green at 8c (rule 20)
  - Lands in: thread-8-cut.md, plan
- **Thread 4's calls (#4): bank_void/gone refuse absent_vault and bank_reborn refuses vault_reborn; gate verbs answer replaced/passed; tidyGone counts rows left (design said deleted); Heard is {row, parent}; BadAnswer.act widened in vault-db and graphql until 16; the wire module is WX inside BX; a bad notice is dropped, as today**
  - My call (the orchestrator's): Kept as built: each needs no new code, and only stale_write and wrong_passphrase are refusal contracts (rule 17)
  - Lands in: #663, as built
- **The plain delete confirm focuses Delete first, so Enter deletes (#7 review)**
  - My call (the orchestrator's): Thread 12 lets ModalForm focus Cancel in a destructive confirm
  - Lands in: thread 12
- **/code-review low printed (none) where medium found defects; threads 1 and 2 were reviewed at low. A medium re-run found: IndexedDB layout versions not bumped when thread 1 reordered keys; two changesets that misdescribe what a host sees**
  - My call (the orchestrator's): Reviews never below medium (thread-reviewer.md, sprint branch); thread 5's safebyok- prefix makes every database new; thread 17 corrects the two changesets
  - Lands in: #656; threads 5 and 17
- **delBank and delVault cascades notify no watcher; a box row of another life must not be overwritten by an ifAbsent put in a scope-keyed store (#4 review)**
  - My call (the orchestrator's): Stated in answer-contract's The bank adapter, where adapter authors read; the battery pins tidyGone's fix
  - Lands in: thread 4b
- **The BX barrel (storage/bankdb.ts, an export-star file) (#4 review)**
  - My call (the orchestrator's): Kept: it is the published BX namespace
  - Lands in: #663, as built
- **thread-worker.md told an exit-3 worker to rebase onto main, wrong for a stacked thread (#S1 review, significant)**
  - My call (the orchestrator's): Fixed in #664: rebase onto the ref file-thread names, from the recorded base
  - Lands in: #664
- **8b's first worker stopped at its release valve after the renames (bank_locked, one thrower, Device announcement types)**
  - My call (the orchestrator's): The rest goes in three legs on the same branch and PR, from its ten-step plan; one review at the end
  - Lands in: #667, plan
- **8b's small calls: BankAnnounce renamed with the two you named; ensureVault's bank_locked judged by the listing; a vault listing lists empty when ensureBank finds no bank until 8c; Gate.make becomes Gate.recordOfBirth; the vault snapshot keeps isLocked (scaffold until 12)**
  - My call (the orchestrator's): Taken as the worker recommends
  - Lands in: #667
- **4b review's leftovers (#666): battery titles joining facts with ';', a few doc-block phrases, vaultScopeOfRow beside vaultScopeOf, the doPutGate hook name the race cases reach**
  - My call (the orchestrator's): Titles and phrases wait for the documentarian run; rename vaultScopeOfRow to vaultScopeFrom with the next thread in bankdb-world.ts; thread 5 told to keep doPutGate if it overrides the gate write
  - Lands in: documentarian run; 16 or whichever thread touches bankdb-world.ts; 5
- **8b leg 1's matters (#667): GateSparse without wayins; the stub bank and gate listings' put/del throw; what a stub throws when nothing is stored (there is no absent_bank kind)**
  - My call (the orchestrator's): Yes; yes; no new error kind: the gate reuses mainGateMissing, the bank an existing thrower (ensureBank's null val launches build_bank, so a host never reaches it). Existing throwers over new ones wherever a kind fits (rule 4).
  - Lands in: 8b leg 2
- **Thread 13's matters (#669): vault and bank SQL share function names, so one database holds one set; battery plants need a superuser (session_replication_role); the registered_at battery case split in two, pulled forward into 4b's file; #668 and #669 export the bankDB world from safebyok/testing under two names (BankDBWorld, BW)**
  - My call (the orchestrator's): Leave the shared names until 16 drops the vault set; accept the superuser (PGlite and the e2e role are already); keep the split; one name, BW, settled when 5 and 13 are lined up as 4b, 5, 13
  - Lands in: 16; none; none; the restack of 5 and 13
- **Thread 5 review's matters (#668): the changeset and README say every database starts safebyok-, true only once 5b and 16 land; IdbVaultDB's notice channel name**
  - My call (the orchestrator's): Leave the sentence: the line ships together (no release until it is whole). The vault channel is moot: thread 16 deletes IdbVaultDB.
  - Lands in: none; 16
- **Thread 13 review's leftovers (#669): bankChannelOf and the bank watch lack the vault file's direct tests; vaultRowsOf in the e2e helpers is an arrow const**
  - My call (the orchestrator's): Port the channel and watch tests when thread 16 deletes the vault file they live in (move, not copy); convert vaultRowsOf with the next change to that helper
  - Lands in: 16; 15 or 16
- **8b leg 2's matters (#667): a new thrower writtenByOwnVerbs (bad_option) for a stub listing's put/del; reused throwers (mainGateMissing, actRefused bank_void, rowOfOtherWorld); lease_revoke_failed names the bank; device_tok null before ensureBank; Bank.ensureTimely resolves at once; vault.lock() left only notifying**
  - My call (the orchestrator's): Accept all but the last; vault.lock and its siblings become one-line calls of the bank's, as ground rule 11 already says (leg 3). The lifecycle event's rename is in the changeset; the line changes that surface anyway.
  - Lands in: 8b leg 3
- **Thread 14's matters (#670): a scheduled continuation for delBank's cascade; the bank tables named safebyok_bank_vaults, _boxes, _tallies beside the vault tables; refusals.ts's vault-only gate_issue crossing**
  - My call (the orchestrator's): No continuation: tidyGone reaches the leftovers. Thread 16 drops the vault tables, then renames the bank ones without bank_ (moving capacity and watchScope out of validators.ts first) and prunes gate_issue.
  - Lands in: none; 16
- **Thread 15's matters (#671): GraphQL sends passkey0: null where the core's gate check wants the field absent; core WX.delBankAnswer's good branch now defaults parent to null (one token in thread 4's file)**
  - My call (the orchestrator's): Keep the null dropped in the GraphQL client (only GraphQL turns absent into null; the core's wire check stays strict); keep the core default, as the other always-null fields have
  - Lands in: none
- **Thread 14 review's matters (#670): the Convex bank component and wrapper have no test files of their own; doc blocks and private names; tidyGone's reads off the budget; ConvexVaultDB's e2e pairing gone before 16**
  - My call (the orchestrator's): 16 moves the vault component's server, tallies and validators tests to the bank side as it deletes them; doc blocks go to the documentarian run; leave the reads (gate-verb end of the ladder); the e2e gap closes at 16
  - Lands in: 16; documentarian run
- **8b leg 3's matters (#667): 29 safebyok cases still failing (not 8c's); tests dropped whose subject is gone (the gate inside the vault record, sparse vaults, VaultListing world checks); a vault's delete or rebirth no longer locks the bank or forgets its lease; React's vaultDB-bound tests and the devmode vault-db inspector; vault-gate.test.ts held under @ts-nocheck and a listed eslint-disable for 8c**
  - My call (the orchestrator's): A short leg 4 makes the 29 green before review; accept the drops and the lease behaviour (it follows from the bank holding the lease; tests pin it); React's vaultDB tests to 12, the inspector to 16; 8c lifts the hatches as it points vault-gate's cases at the Gate
  - Lands in: 8b leg 4; 12; 16; 8c
- **8b review's leftovers (#667): the gotgone parent not passed on; entrypoint tests for the new throwers and stub listings; README and notes/guarantees.md still name vault.ts's lease and build_vault; naming (#fetchBank, the two launchBirths, BankListing.build); unused replace/add/revoke cleartexts in shapes-gateish**
  - My call (the orchestrator's): 8c takes the gotgone line and the tests; the docs thread takes README and guarantees.md (through its sonnet subagent); names at 16 or the documentarian run; 8c uses or drops the cleartexts
  - Lands in: 8c; 17; 16; 8c
- **8c's matters (#673): the private demo left red (threads.md gave its bankDB to 12); React asks ensureBank once per device, so after a delete or newer life the host sees no bank; del_bank has no React dialog; the generic Listing.put checks expected as a vault row, so the bank and gate put stubs are unreachable; a refused build's parent still not delivered**
  - My call (the orchestrator's): Port the demo minimally now (8c leg 2, bounded) so the line merges green at 8c rather than red through 9, 10 and 12; React's re-ensure and the del_bank dialog to 12; drop the bank and gate put stubs or give them their own options at 10; leave the build's parent (needs a try/catch, not one line)
  - Lands in: 8c leg 2; 12; 10; none
- **8c leg 2's matters (#673, demo): React's CreateVaultButton over a locked bank refuses locked (the demo's own flows unlock first); a cancelled build_bank at sign-in leaves no bank until the next sign-in; DevVaultDBInspector removed from the labs page**
  - My call (the orchestrator's): All three to 12 (whether the button unlocks first; re-ensure after a cancelled build, with React's once-per-device ensureBank); the inspector's retirement is 16's
  - Lands in: 12; 16
- **replacePassphrasePrompt's Promptly refresh (ridden along on 9 from 8c's review) has no test that fails without it (#674)**
  - My call (the orchestrator's): Leave it untested: the line mirrors its two siblings, and a test that passed either way was dropped
  - Lands in: #674, as is
- **TODO.md's live backlog lines renamed to bankKey, rotateBankKey, prior_bank_key; vault_key_epoch (a removed field) left (#674)**
  - My call (the orchestrator's): Keep: TODO.md's open entries are live, not a ledger
  - Lands in: #674; thread 17 judges TODO.md's gate and lease entries again
- **IdbBankDB's BroadcastChannel name is <prefix>:bank, with no layout version in it (#675)**
  - My call (the orchestrator's): Leave it: a notice's shape is checked on receipt, and a layout bump needs no new channel
  - Lands in: #675, as is
- **A delete naming the old vault life, after a fetch adopted the new one, refuses stale_write, not vault_reborn: the revision check comes first (#677)**
  - My call (the orchestrator's): Leave it: rule 17, no host switches on which of the two
  - Lands in: #677, as is
- **The lease's expiry is still worked out from the cached row (another tab's re-proof holds off this tab's autolock), not the live lease the bank holds (#679)**
  - My call (the orchestrator's): Keep it: your ruling said "either way", and the method now hides which; the switch to the live lease goes with the lease rework (TODO)
  - Lands in: #679 as is; TODO's "Who keeps the lease's expiry" updated in the guarantees follow-up
- **With two providers open, a gating dialog names its bank only in the hidden username field (#681)**
  - My call (the orchestrator's): Leave it until a host has two banks
  - Lands in: #681 as is
- **A click during the provider's build_bank can refuse already_asking, seen only in jsdom (a browser modal blocks the click) (#681)**
  - My call (the orchestrator's): Report only (rules 1 and 2)
  - Lands in: #681 as is
- **The demo's Delete account with no bank in hand yet takes the plain confirm and leaves the stored bank (#681)**
  - My call (the orchestrator's): Accept it for a demo
  - Lands in: #681 as is
- **The ensureUnlocked calls before ensureVault in bank-controls.tsx (CreateVaultButton) and the demo's KnockKnockWidget, listed on Finally as no longer needed (#687)**
  - My call (the orchestrator's): Keep both. The Finally item's premise was wrong: KnockKnockWidget goes on to putBox, which still demands an unlocked bank; CreateVaultButton's doc block, its tests and the dialog the user sees all say it unlocks the bank. Dropping either is a UX change, not a cleanup.
  - Lands in: Nowhere (17r left them; useProvided is internal, also left)
- **Convex tidyGone reads live box rows too, so it refuses storage_unavailable once a bank's live box rows pass about 12 MiB (#690)**
  - My call (the orchestrator's): Accept: watchRows already has the same limit; a bank that large is past what the component supports today.
  - Lands in: Nowhere
- **Convex tidyGone caps a batch at 2 MiB as well as 1000 rows, so large rows clear fewer per call (about 375 at today's record size) (#690)**
  - My call (the orchestrator's): Keep: it keeps one call inside Convex's read limit; the leftover bound still tells the host to call again.
  - Lands in: Nowhere
- **Convex tidyGone deletes vault rows and tallies of ended lives whole, outside the 1000-row batch (#690)**
  - My call (the orchestrator's): Keep: the reads just before them already bound how many there are.
  - Lands in: Nowhere
- **Convex tidyGone never counts the box rows under a damaged vault, so leftover: 'none' doesn't speak for them (#690 review)**
  - My call (the orchestrator's): Keep: unchanged from before, and the comment above tidyGone says so; damaged rows are their own matter.
  - Lands in: Nowhere
- **A bankDB revokePasskey with no passkey stored now stores a no-op revision instead of refusing (#692)**
  - My call (the orchestrator's): Accept: the gate put is plain now, and the model never sends one (gating checks before the call).
  - Lands in: Nowhere
- **The old three-argument safebyok_put_gate stays in an upgraded Postgres database (#692)**
  - My call (the orchestrator's): Accept: pre-1.0, no migrations; the changeset says it may be dropped by hand.
  - Lands in: The changeset
- **After the gate verb checks went, should the Postgres function keep a cheap registered_at or main-wayin check as defence in depth? (#692 review)**
  - My call (the orchestrator's): No: the Coach ruled the verb checks impossible, and a host writing gate rows is inside the trust boundary (the host is not our threat model).
  - Lands in: Nowhere
- **Exported renames maxParentMillis, isKept, ensureParentTimely: patch or minor before 1.0? (#693)**
  - My call (the orchestrator's): Patch, as the sprint's other renames are; the whole line ships as one release.
  - Lands in: #693's changeset, as is
- **demandPromptable and demandAttachable (gone, now Bank.demandEnabled) still named in notes/gallant.md, design-models.md, design-proof.md (#693)**
  - My call (the orchestrator's): Design docs stay as historic text; gallant.md's mention goes with the gallant pair rewrite next sprint.
  - Lands in: Next sprint seed
- **Closer fix (f), the refusals with the wrong name (#693)**
  - My call (the orchestrator's): Closed: by your rule, none gives an untrue refusal or removes code when fixed, so none changed.
  - Lands in: Nowhere
- **#693's changeset is silent on what a host still passing maxWorldMillis sees (#693 review)**
  - My call (the orchestrator's): Leave it: pre-1.0, and the changeset names the rename.
  - Lands in: Nowhere
- **The e2e batteries (graphql, convex, postgres) don't pass _cheat_storeOtherwise, so they skip the stored-otherwise cases (#694)**
  - My call (the orchestrator's): Leave it: each package's own battery runs those cases against the same adapter.
  - Lands in: Nowhere
- **A watch begun by hand (hello()) on a deleted vault's box listing runs until the vault's next life (#695)**
  - My call (the orchestrator's): Accept: it follows from a deleted vault staying enabled, nothing in the package calls it, and a test pins it.
  - Lands in: As built
