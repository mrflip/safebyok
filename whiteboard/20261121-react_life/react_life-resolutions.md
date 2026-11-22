# react_life: what the Coach ruled, and what was left to the orchestrator

Each matter as its row put it, with the Coach's answer word for word, the date, where it was asked and where the work went; newest batch first, rows within a batch in the order they were swept; every entry is dated 2026-11-21.

## Resolved

### Batch 7 (newest)

* **For coach: click through the Knock-Knock demo in a browser.** No one had used it in a real browser (passkeys especially); Rec: a click-through before it is shown. Coach: "looks good!" 2026-11-21, #803, thread 7. Work: none; the Coach clicked through and it runs well.
* **For coach: click through the envman demo in a browser.** Its flows were checked only under jsdom. Coach: "so does this!" 2026-11-21, #807. Work: none; the Coach clicked through and it runs well.
* **A lock landing mid-call to withLockableWhisper.** withLockableWhisper reads the stage and, unlocked, calls `withUnlockedWhisper`, which refuses `bank_locked` and never unlocks; the other waits on hello removed. Coach: "lgtm". 2026-11-21, #808, thread 15. Work: built in #811.
* **TOP Bank holds copies of records the minder already caches.** The Bank keeps its own main gate and root box beside the minder's cached records; Rec: a core redesign for the ownership work after this sprint. Coach: "this fits with upcoming changes, but it needs more design before anything should be rewritten, so leave the shim". 2026-11-21, survey after thread 12. Work: a TODO entry; the shim stays.
* **Queries also run before a bank exists.** The box, gate and listing queries run at `unborn` as well as locked and unlocked, for `useGate`'s null and `useBoxList`'s empty listing; Rec: keep it. Coach: (empty: took the Rec). 2026-11-21, #811. Work: kept.
* **The bridge skips the listing the minder seeds at hello.** Otherwise `useBoxList` found the seeded empty listing cached and never fetched; Rec: keep it. Coach: (empty: took the Rec). 2026-11-21, #811. Work: kept.
* **The wording of a failed bring-up's refusal.** `Phrases.BankFailed`, written without Closer Look E8; Rec: glance and keep or reword. Coach: "ok". 2026-11-21, #811. Work: kept.

### Batch 6

* **The bridge's held-back writes lose the bad-news handler.** The bridge's microtask took its writes into React Query outside the minder's error handling, so a throw from a host's broken function escaped uncaught instead of reaching the bank's bad-news handler; Rec: keep it and add the catch. Coach (in chat): "Bad news handler to the bridge and try catch on all deliveries sound perfect". 2026-11-21, #811. Work: `bridgeMinder` takes the device's `tellBadNews` and catches each held-back delivery (ceb458102), with a test.

### Batch 5

* **The ordering await in three queries.** useBox, useGate and useBoxList each waited one beat before asking the minder, because the bridge's refresh calls them from inside the minder's own notification and rule 7 forbids starting a fetch there; Rec: move it into the bridge. Coach (in chat): "Move to the bridge and flag as a pragmatic fix. If it causes other problems it will have to go." 2026-11-21, thread 15. Work: #811's bridge delivers each event a microtask later, flagged `#pragmatic-fix`; the three queries lost their await.

### Batch 4

* **WhisperMask: a late answer after a lock.** The part's effect wrote what withLockableWhisper resolved, with no cleanup, so a lock while an unlocked answer was in flight could leave the last four characters on screen; a wontfix row, with React's two-line stale flag offered. Coach: "Demonstrate react best practices everywhere especially if it trivially resolves a race or edge case; you may add that as a standing memory". 2026-11-21, #810. Work: thread 15 adds the stale flag in the effect's cleanup and drops the row; saved as a standing memory.

### Batch 3

* **Standalone gating makers dropped.** The old giver's standalone ...Gating makers and ...MutationOptions() were gone from the bank's surface, replaced by the five form hooks with a synchronous .gating. Rec: add back only if needed. Coach: "add them back; what does the dream_interface file prescribe you use? Both approaches are wanted i was told". 2026-11-21, #799. Answer: the dream prescribes the hook form, unlock = Knock.useUnlock(); unlock.mutate(unlock.gating({...})), and names no standalone makers. Work: thread 11 (giver_surface) adds them back beside the hooks.
* **Parts and kit take the bank as a prop.** <UnlockForm bank={Knock} /> where the dream writes <UnlockForm />. Rec: keep for the spike. Coach: "im pretty sure we dont want this in the end but getting it working is right. the context doesnt help?" 2026-11-21, #800. Answer: it does: with one bank per giver, SOK.Provider can put its giver and bank in a context the kit reads, so <UnlockForm /> works bare and the prop stays as an override. Work: thread 11 (giver_surface).
* **Three box-hook names against STYLE.md.** nullifyThing, PutBoxActionResult.error, delBox. Rec: rename all three now. Coach: "yes correct the names to what style says". 2026-11-21, #801's review. Work: thread 11 (giver_surface), before envman uses them.
* **The dream's stage switch loses a waiting knock.** With one component per stage, unlocking from the dialog unmounted the knock form. Rec: a sentence in the dream that locked and unlocked share their components. Coach: (empty: took the Rec). 2026-11-21, #803. Work: dream_interface.md, under the stage switch, on the sprint branch.
* **Form mutation keys leave out the userid.** The five form mutations are keyed ['sok', banklabel, verb]; the banklabel is the same for every user. Coach first asked (explain): "this sounds weird to me; is the form constant across user ids? later you say you have to pass the bank, which sounds wrong; here you are not depending on the userid, which corresponds to the bank" and "I think i'm out of my depth to say so". Rec, revised: add the userid, ['sok', userid, banklabel, verb]. Coach: (empty: took the Rec). 2026-11-21, #799. Work: thread 11.
* **The key's mask leaks its last four characters.** The demo's sidecar mask is sk-ant-…cdef, plaintext to storage. Rec: prefix only. Coach: "the amount masked should be tuneable. It's by design that a small number of characters are revealed so you know which particular key you typed in ; perhaps it was rotated, etc. If four makes you nervous but two or three will do, change the mask schedule for everyone." 2026-11-21, #803's review. Work: thread 11 adds a tuneable mask helper, default head 7 and tail 4 (four characters of a long random key reveal too little to matter, and match what key consoles show); both demos use it; notes/security.md records it.
* **Unsaved typing survives a lock.** In useDraft a field typed into keeps its unsaved text in the input after a lock. Rec: keep it. Coach: "is there an ergonomic hook or snapshot capability to run a callback when the stage changes? (by ergonomic I mean that if e.g. we provide the snapshot but you have to do other work to get the callback, the ergonomic version has us also offer the second) / don't empty it by default, but use such a callback to demonstrate how a customer might themselves clear the form on lock. Don't build that in to our /kit components". 2026-11-21, #805's review. Answer: not today: a host writes a useEffect over useBank((b) => b.stage). Work: thread 12 adds a stage-change callback hook, and envman clears its draft on lock with it, in the demo only.
* **Coach note: withLockableWhisper, and no secret characters in storage.** "I hadn't quite realized your point was that the masked text hits storage. Add withLockableWhisper that takes, in the second opts bag, a callback ifLocked. rather than calling ensureLocked, the function uses the main callback when unlocked, the other when locked. The value stored in the sidecar is as you proposed -- no secret characters, by calling mask with tail:0; when locked, that's what's rendered. If unlocked, the first callback is used: it calls mask with tail:4 and you see a helpful reveal". 2026-11-21. Work: thread 11 (now building) stores the demo's mask with tail: 0; thread 12 adds withLockableWhisper and the live tail: 4 reveal in both demos; notes/security.md records it.
* **Gear dialog stages into the draft.** In envman, the gear dialog's Done writes nothing; the row's Save stores the title, period and back-date along with any value change, and Undo discards them. Rec: keep it. — Coach: (empty: took the Rec). 2026-11-21, #807. Kept as built.
* **Envman: a back-date lost on Save.** A new value and a back-date in one draft save the rotation as today. Rec: accept it for a demo. — Coach: "or a "now" checkmark? agree with the wontfix". 2026-11-21, #807. Accepted as built; a "rotated now" checkbox, in place of stamping on every new value, noted on Cleanup's Your calls as a later demo idea.
* **The stored mask's head.** The demos store `mask(val, { tail: 0 })` with the helper's own head, not thread 11's seven characters. Rec: keep the helper's own head. — Coach: (empty: took the Rec). 2026-11-21, #808. Kept as built.
* **A short value shows its last four while unlocked.** `mask(val, { tail: 4 })` shows four characters of a value of 12 or fewer. Rec: leave it as specified. — Coach: "yuck. The flaw is in mask, not this: TODO: make mask have smarter policy for a locked/stored ue case". 2026-11-21, #808. A TODO.md entry on the sprint branch: a smarter policy in mask for a caller's tail.
* **The demos' tail-4 mask sits in the host's query cache.** Rec: keep it; the alternative writes the tail into the DOM as WhisperText does. — Coach: "can "the way whisper text does it" be made simple? I don't want a big deal, but it sounds like a dream interface would provide that". 2026-11-21, survey after thread 12. Thread 14 (whisper_mask): a small part that writes the live mask into the page; both demos use it in place of their mask queries.

### Batch 2

* **Sweep tests touched.** Removing cheatDropBank means a swept device shows the swept bank; thread 2 dropped five multi-bank sweep and lock tests and rewrote one; sweep code untouched. Rec: keep it. Coach: (empty: took the Rec); in chat, "it's quite reasonable to expect some tests may touch ending events". 2026-11-21, #798. Work: none; kept as built.
* **Birth hands the bank to the device from inside Bank.** Bank.birthGating calls device.adoptBornBank (a marked cheat). Rec: keep for the sprint, look here first when ownership is re-apportioned. Coach: (empty: took the Rec). 2026-11-21, #798. Work: kept; noted in the progress document for the re-apportioning.
* **safebyok/core now carries the minder.** Core exports Device, which owns the minder, so built core pulls in TanStack Query. Rec: reword core.ts's header at the restack; split a minder-free device later. Coach: "don't worry at all about /core sanctity". 2026-11-21, #798's review. Work: no split; the stale header line is a Cleanup item for the restack.

### Batch 1 (oldest)

* **Who owns the minder, and the bridge.** *Coach (2026-11-21, in chat):* "Who owns the minder - device; safebyok has query-core as a peer. who owns the bridge and the react query cache -- giver makes the bridge. safebyok-react-lean has RQ as a peer dependency." Asked in the plan; built by threads 1 to 3.
* **How a demo survives a reload.** The memory vaultDB saved to localStorage by a helper in the demo. *Coach (2026-11-21, in chat):* "I think the postgres adapter also works, but localStorage sounds grand too. The focus should be on react". Built by thread 7.
* **What ends a device.** Nothing, in this sprint. *Coach (2026-11-21, in chat):* "No transitions from a working state to a non-working state are to be contemplated." and "I do not want to remove the teardown machinery and replace with different, undesigned teardown machinery." The teardown code that exists is left alone; the plan's *What is in bounds* has the examples.
* **"Two recognizable use cases".** *Coach (2026-11-21, in chat):* "two apps, and yes the new-user flow, returning-user flow, lock and unlock; each gating verb except delete bank". The plan gained thread 6, the kit for the other gating verbs.
* **The bank boundary.** Out of bounds for this sprint: it exists to unmount state when a device ends, and no end is contemplated (the Coach, 2026-11-21, in chat). Not built.
* **What the provider's unmount does.** Out of bounds for this sprint (the Coach, 2026-11-21, in chat): "Nothing that tears down any instance". Nothing is built for it.
* **What "steadfastly maintain" means.** Out of bounds for this sprint: the proposed principles concern how a device ends (the Coach, 2026-11-21, in chat). They stay in the design file as Proposed.
* **Sign-out in the demos.** To change user or sign out, a demo clears its own session and reloads the page. *Coach (2026-11-21, in chat):* "Tell them to replace .sweep with process.exit if that's what it takes." Built by thread 7.
* **Lease expiry is not enforced.** *Coach (2026-11-21, in chat):* "there's no autolock yet: do not add one, mention one, implement checks for lease expiry, implement caching." Nothing is built or recorded for it in this sprint.
* **Where an end enters, later.** Out of bounds for this sprint (the Coach, 2026-11-21, in chat). Not asked again here.
* **Where the new React layer lives.** A new private package for the new hooks, parts and kit. *Coach (2026-11-21):* "safebyok-react-lean". Asked in the plan, thread 2; built by thread 1 of the redrawn plan.
* **Form glue: `unlock.formAction`.** The kit gets it as a private helper now, and it goes on the hooks once the two demos show it earns its place. *Coach (2026-11-21):* "sounds good". Asked in the design session; built by thread 5.
* **Is `unborn` a state of the slot?** Built as a stand-in in the device's snapshot. *Coach (2026-11-21):* "as needed, but fake things or substitute a shim, or anything so that startup questions don't get in the way of a working app". Carried into thread 2's gloss.
* **envman in its own repo.** A package in this repo, `demos/safebyok-demo-envman`. *Coach (2026-11-21):* "sorry yes I meant package not at all repo". Thread 10.
* **envman's meanings.** "Rename" edits the title, and saving a new `val` stamps the last-rotated time. *Coach (2026-11-21):* "yes to both!". Thread 10.
* **Dream items no thread builds.** *Coach (2026-11-21):* "if writing the app basically means writing the feature named, implement the feature: I could easily envision useBoxes, putBox with a revisor, or an editBox equivalent of withWhisper that returns a sealed putAsk being called for. The others seem nice-to-haves at this time". Carried into the plan: a thread whose app calls for one of those three builds it.

## Your calls (left to the orchestrator)

These are the *Cleanup* tab's *Your calls* rows: matters the Coach was not asked and did not rule on. Each is the sprint's own call, shown as the row put it (Matter | My call | Lands in); newest row first. No row carries a date; all were written on 2026-11-21.

| Matter | My call | Lands in |
|---|---|---|
| Envman's 'rotated now': the Coach asked 'or a "now" checkmark?' on the back-date row. | A later demo idea: a checkbox in the gear that stamps the rotation, in place of stamping on every new value. Not this sprint. | Envman, after the sprint |
| withLockableWhisper on a bank still starting throws demandBank's refusal, with no absent or not_started mapping. | Leave it for now: it is the same question as Closer Look E8 (do verbs at starting wait or refuse). | Closer Look E8's triage |
| useStageChange runs after commit, so one locked render may show envman's draft text before the callback discards it. | Leave it: its doc block says it runs after each render; a synchronous bank subscription would be machinery for a demo's convenience. | #808, as built |
| Envman's helper modules (env-sidecar.ts, session.ts) export loose functions where STYLE.md *Imports* would have a module imported whole with bare verb names. | Leave them: a rename sweep across callers for a demo is outside the sprint's value. | #807, as built |
| Envman judges overdue against the time a row was first shown, so a row left open past its due day turns red only at the next reload. | Keep it for a demo; a live clock would be a useSyncExternalStore over a one-minute timer, not worth it now. | #807, as built |
| PasskeyUnlockButton still needs a passkeyHeader prop; it could default to the bank's usePasskeyHeader() from the context (#806) | Default it from the context | Thread 12 |
| maskOf shows nothing unless at least as many characters stay hidden as it shows (22 characters for 7+4, 14 for 7+0) (#806) | Keep: a short secret never shows more than half of itself | #806, as built |
| Thread 11 built maskOf with its own MaskSchedule, reimplementing safebyok-big's mask(text, { head, tail }) (#806's review) | Corrected: use big's mask, exported through safebyok-big/internals (CLAUDE.md: never reimplement what big defines); the dream calls mask(…, { tail: 0 }) | Thread 12; dream_interface.md |
| es-toolkit added to safebyok-react-lean's runtime dependencies to compare sidecars by value, before proposing it (#805) | Keep: the core already depends on it, so a host installs nothing new | #805, as built |
| useDraft's callbacks are fresh each render; the dream's comment says stable (#805) | Amend the dream's comment; no refs for stability | dream_interface.md, on the sprint branch |
| A draft edits stored boxes only; on a box none is stored at it refuses absent_box (#805) | Keep: envman's add form uses putBoxOnce or putBoxAction | Thread 10's handoff |
| useDraft's put waits for the unlock form on a locked bank (it goes through withWhisper), where putBoxOnce refuses bank_locked (#805) | Keep: a draft needs the whisper; a write of a whole new box does not wait | #805, as built |
| useDraft's put cites the draft's base and refuses stale_write when another device wrote since, rather than overwriting (#805) | Keep: another device's change is never lost silently | #805, as built |
| A flaky ReplacePassphraseForm test from #802 (read the field before React's form reset) is fixed in #803, not #802 (#803) | Leave it in #803: the line merges as one | #803; noted on #802 |
| A new safebyok-react-lean/testing entry exports expectTextUnheld, holdsText, reactTreeOf and installFakeAuthenticator (#803) | Keep: a host testing its own components wants them; the package is private | #803, as built |
| RevokePasskeyForm asks for the passphrase, not the passkey being revoked (#802) | Keep: someone revoking may have lost the passkey | #802, as built |
| The strength meter and confirmation are copied from CreateVaultForm into ReplacePassphraseForm (#802) | Extract a shared part only when a third form wants it | Nowhere yet |
| formActionOf's cleartextsOf may resolve null: nothing runs and the form stays as it was (a dismissed passkey prompt) (#802) | Accept: the helper is private | #802, as built |
| No hook gives the bank's passkey header, which the demo needs to choose add or revoke and to feed the unlock button (#802) | Thread 7 adds Knock.usePasskeyHeader() in the giver, reading what the bank's snapshot carries; a marked cheat if the snapshot does not follow a gating | Thread 7's handoff |
| keys.under covers item keys only; listings need their own key (#801) | Thread 8 adds a list key or predicate; the minder's key grammar stays | Thread 8's handoff |
| A signed-out boxQuery called outside render rejects with TanStack's 'Missing queryFn', not absent_vault (#801) | Accept: one query factory for render and for calls outside it | #801, as built |
| putBoxAction empties every FormData field before its first await, not only those whisperOf reads, so useFormStatus().data is empty while a write runs (#801) | Keep: emptying all cannot miss a secret field | #801, as built |
| toHaveBeenCalledOnce in the new package's tests; STYLE.md is silent on it (#800's style pass) | Allow it: vitest's own matcher, already in react-giver.test too | No change |
| Kit and parts words are English constants (KitPhrases, PartsPhrases) a host cannot change (#800) | Leave until a host asks | Nowhere yet |
| Who deletes the old giver thread 3 left unexported (#799) | Thread 4, with porting its three test files | Thread 4's handoff |
| The provider's effect lists [userid, client, vaultDB, keyDeriver], not the design's [userid] (#799) | Keep: start ignores repeats, so the extra deps rerun a no-op, and no lint disable is needed | #799, as built |

## Cleanup: Finally, as the sprint closed

The *Finally* checklist of the *Cleanup* tab, in the doc's order. The doc's read showed every item as an unticked check box; none was ticked.

* [ ] The TODO.md entry on adapter client caches (`vaultDB.vacate`) rides the sprint PR; it is uncommitted in the base checkout until a base sync.
* [ ] `dream_interface.md` and the design file are mirrored into the base checkout's untracked `whiteboard/20261121-react_life/`; a base sync replaces them with the committed ones.
* [ ] `notes/security.md`: the entries this sprint owes (the provider's start, what holds user data) go in through the `sonnet` subagent as the threads land.
* [ ] The old-core `demos/safebyok-demo-react` and the `safebyok-big` parts of `safebyok-react` stay until the new demos prove out; removing them is not this sprint's.
* [ ] core.ts's header still says core carries no minder: one line to correct, at the restack (#798; the Coach waived core's minder-free subset)
* [ ] The copied eslint.config.mjs in safebyok-react-lean names safebyok-react in its block labels: rename when next touched (#797's review)
* [ ] A doc-block and test pass over safebyok-react-lean once the demos settle it: @example twin markers, long doc blocks, and the small missing cases #799 and #800's reviews listed (documentarian)
* [ ] putBoxAction's FormData emptying and the kit's private formActionOf do the same job: share one helper (#801, #800)
* [ ] dream_interface.md uses ensureQueryData, deprecated in TanStack 5.107: its examples become queryClient.query (#801)
* [ ] The documentarian pass also covers the Knock-Knock demo: src/lib/anthropic.ts's doc blocks, buildJokePrompt → jokePromptOf, test-helper parts (#803's review). Also envman (#807's review list: doc blocks narrating mechanism in AddEnvOpts, EnvEditor, Opened, AddEnvForm, EnvSettingsDialog, modal-dialog.tsx's header, envFieldsOf; ValInput's `label` prop; unit tests for env-sidecar, the add form's blank value and the gripe paths). Also #808's: rename valRevealOf to valLiveMaskOf; doc blocks of useValMask and KeyMask (they read their query key aloud), useStageChange's first line, withLockableWhisper's first two lines, and Phrases.BoxAbsent.
* [ ] `Vault.forceTimelyUnlocked` waits on the unlock and nothing calls it; ask before removing it (lean core).
* [ ] Documentarian: `withLockableWhisper`'s doc states a lock mid-call refusing `bank_locked` as contract; it is a crossing with a wontfix row (#811 review).
* [ ] Documentarian: `Vault.withWhisper` and `Vault.withUnlockedWhisper` doc blocks narrate and run long; the giver's `withWhisper` doc packs two facts on one line (#811 review).
* [ ] Flake: e2e `tests/graphql/graphql-bank-db.test.ts` "stops the server's watch once the browser stops watching" timed out once while filing #811 and passed on the re-run (safebyok-big, Postgres).
