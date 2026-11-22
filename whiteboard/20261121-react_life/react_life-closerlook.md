# react_life: Closer Look

Exported at the sprint's close. The Coach's replies were highlighted text in the doc; the export drops the highlighting, so a reply runs on after each item's last `path:line`. The *Draft for triage* and *Answers to your questions* sections near the top sort and answer those replies.

In this file the highlighted runs are marked inline as `[Coach: …]`, read from the tab itself.

# Closer Look: react\_life, read cold at dbfc2d0de

A reader with no stake in how the code got here (opus, read cold: no thread files, PR text, reviews or sprint doc) went through the line as it stood at #805's tip, against main from before the sprint (56e56b094), measured against the design, the dream and the plan. Reply beside any item in highlighted text; I read the tab only when you say you've replied, and nothing is scheduled until triage.

**Read:** all of the core diff, all of safebyok-react-lean's src, all of the demo's src, the provider test world, the provider, bridge and demo tests in part, every test title. 85 files, about 7,800 lines added: lean src 2,189; lean tests 2,898; demo src 499; demo tests 455; core src 185; verbatim eslint configs and a LICENSE 1,172; other config 377. **Not read:** thread files, PR text, the sprint doc, notes/security.md, the secret-search test helper. **Not in scope:** thread 11 (giver\_surface, now filed as #806) and thread 10 (envman, building). E4 bears on thread 11's mask helper, and I have already acted on it (below). **Probes** ran outside the repo, in the scratchpad's closerlook folder.

**Flavours:** guidance gap (the draft is silent where the code needed an answer); guidance wrong (the draft says one thing and the code shows it cannot hold); solution off (the draft was fine and the code missed it); redesign? (a small change of shape would dissolve the problem); can't tell.

## Draft for triage

Every one of your replies, sorted, with what I took it to mean. Nothing here is scheduled until you say so. Answers to your questions follow under *Answers to your questions*, from an agent that read the code.

### Settled in chat, already under way

- **E6** — "subscribing to a gate seems reasonable, then it's just a direct prop. what is "slot"? why would it not be using a bank snapshot? That doesn't look like anything someone designed." Settled in chat: thread 13 (`giver_device`, building on #808) dissolves `GiverSlot` into the giver's closure and the provider's context, adds `useGate()` reading the gate as a React Query record through the bridge (the wrapped bankKeys left out of the host's cache), and removes `usePasskeyHeader`. It also takes out two of E7's stand-ins (`StartingSlot`, `SignedOutSlot`).
- **E4** — "If there are multiple mask functions, use the one that was updated within the last two weeks". There is now one: safebyok-big's `mask` (last changed 2026-11-18, "MaskSchedule: how much mask shows of a text, by the text's length"). #808 removed thread 11's `maskOf`; both demos call `mask`. Nothing to do.

### Rulings: no change to the code

- **E1** — "the pleasant fix will come with nested boxes; one must "ensure" ones parents at the same time as making a box. Even then the primitive would refuse if its parent is absent, which it is, so this is correct behavior". Taken as: a box read before birth refusing is right; no test of `useBox` expecting null. One thing still open below: the refusal's *kind*.
- **E9** — "if the get function in the minder has no retry, but a higher level supervising function applies it, that's within design. retrying a put in a CAS system without consulting the customer is a different case". Taken as: the giver's box and listing queries keep React Query's default retries (a get); the form mutations keep `retry: false` (a put). Nothing changes.

### Later: on the list for after the sprint

- **E11** — "Nothing this sprint; keep it on the list bravo!" The device as composition root for bank, vault and minder, and the core's unreachable subset, go on the list for re-apportioning ownership.
- **E12** — "retire when the entire -big rewrite is done, not too long I hope". Taken as: the package's own knock-knock test app stays until the safebyok-big rewrite is done, then goes. (Thread 13 may retire the `_cheat_device` spy now, since the provider's context gives the test world the seam it lacked.)

### Plain instructions, ready when you say

- **E2** — "having a device verb sounds good". Taken as: birth becomes a device verb, `device.birthGating(cleartexts)`, wrapping `Bank.birthGating` and keeping the bank it resolves. That removes the `adoptBornBank` cheat (the bank-to-device call), and, with `buildBornBank` saying hello before it births, the fixture-only early return in `#bringUp` and the wontfix row "A bank born on a device while its hello still fetches". I stretched one point: you did not answer whether `buildBornBank` may say hello first; I took the device verb to imply it. A core thread, opus, stacked on 13.

yes, it will likely have to. Paper over what you must, my next session will build on it



- **E3** — "find out if it's an error: if so add the comment warning and a wontfix. If not, add a comment with a #not-a-crossing tag (this is a variation on the one in CLAUDE)." The finding-out is under *Answers*; the comment (and a wontfix row, if it is an error) is two lines, which would ride along on thread 13, already in that file.
- **E5** — "a note, no code, thanks". A note in `notes/wontfix.md` that `Vault.sweep` stops the device's minder, which it no longer owns, to be settled when ends are built. I can write it in the sprint branch at once.\
\

- **E8**, second half — ""verbs at starting wait, or refuse. Then one helper, or none" -- this sounds great". Taken as: you want the call made and the five copies collapsed. My recommendation is under *Answers* (Q2), with the first half of your reply; and the `BankNotStarted` advice, wrong at `failed`, gets fixed in the same pass.

### Questions still open

- **E8**, first half — "we have a stage variable for just this, how do react people normally write this? A promise to wait on?" Answered under *Answers* (Q2).
- **Undergrowth, useDraft** — "should I worry about this?" Answered under *Answers* (Q3).
- **Undergrowth, the nexus** — on "every minder ask has two regimes, untracked before the bank and tracked after": "this sounds bad". Taken as a reaction, not yet an instruction. What I see: with your E1 ruling and E2's device verb, the two regimes shrink to one honest case. Before a bank exists, the only asks the minder needs are bring-up's own three gets (bank, gate, root box), which cannot be tracked because there is nothing yet to track. Every other ask before birth (a box read) refuses anyway, by E1. So the stand-in root shell (`#rootShell`, the `-000000001` lifepath) could go, and a box read before birth would refuse as "no bank yet" (`absent_vault`) rather than `bad_record` with a message about lifepaths, which is the open point on E1. Proposal: fold that into E2's device-verb thread. Say if you want it, or not.
- **E1**, the refusal's kind — the read refuses correctly, but as `bad_record` ("A lifepath is one or more lifeseqs, joined by '/'"), because the stand-in parent's lifepath is malformed. A host reading that would think a record was damaged. Rec: refuse as `absent_vault` with a "no bank yet" phrase, by the nexus proposal above.

### Not replied to

- **E7** (the stage from four stand-ins over three stores, and `swept` surviving): no reply, only an underline on its heading. Thread 13 removes two of the four stand-ins; the other two (`PendingBank`, the device's `#banklessSnapshot`) and `swept` stay. The survey in chat argued the bank-record-as-query version would not remove them, and the Open Matters row "Bank holds copies of records the minder already caches" carries the deeper version.
- **E10** (the new-passphrase meter and the reveal machine each exist twice): no reply. Rec: one `useNewPassphrase` hook and one reveal helper, a small thread after 13. Say if you want it.
- Smaller notes, control primitives, new names: no replies.

## Answers to your questions

From an opus agent that read the code at #808's tip and, for E3, ran an experiment in a scratch copy.

### E3: "find out if it's an error"

**Not an error.** The hop keeps ground rule 7 (no fetch started inside the minder's own notification); correctness does not depend on it.

- **Experiment.** With the hop removed once bring-up has settled, 7 `minder.get` calls and 1 `minder.list` ran re-entrantly from the bridge's listener, across five bridge tests. Every bridge, giver and draft test passed. One test failed (whisper-text "stays masked … dismissed"), from test timing in withWhisper's hop, not from re-entry.
- **Why.** query-core tells its listeners in a plain synchronous loop; a fetch started inside it only nests its own `fetch` event, which changes fetch status, never a record. No record lands inside the loop: the answer comes back through the vaultDB's promise. The minder already supports a get from a listener (thing-minder.ts: `// A listener on a soon's success runs before the item is invalidated, so a get there needs the 0.`). In production the bridge is the only listener.
- **Which verbs it guards.** Only `getBoxShown` and `getBoxListing`: the bridge invalidates box and listing keys only. Thread 12's comment sits on the wrong verb (`withWhisper`: `// Awaited even once said: …`, "said" a typo for "settled").
- **The comment**, for getBoxShown (and getBoxListing), no wontfix row: `// Awaited even once settled: the bridge's invalidateQueries runs this queryFn inside the minder's listener, and the hop starts the get after it returns, so no fetch starts inside the minder's own notification. Without it the get still works. #not-a-crossing`
- **Rec:** it rides along on thread 13 (already in that file), with the misplaced comment moved. Say go.

### E8: "how do react people normally write this? A promise to wait on?"

**Both, by kind of call.** Queries wait on a promise; imperative writes read the stage and refuse.

- **Queries.** React Query shows "not ready" as pending: either `enabled`/`skipToken` until a flag flips, or a queryFn that awaits a ready promise. Loaders, `queryClient.query` and Suspense need the promise: they ignore `enabled` and reject on `skipToken`, and a loader is not rendering, so it cannot read the stage. The giver advertises exactly that (`loader: () => queryClient.query(Knock.boxQuery('jokes'))`).
- **Mutations and imperative calls.** The UI offers them only at the right stage, and a call made anyway refuses at once, with advice that fits.
- **For this code:**
    - `getBoxShown`, `getBoxListing`: wait (queryFns; loaders keep working).
    - `withWhisper`, `withLockableWhisper`: wait. withWhisper already waits at `locked` for the unlock form; waiting through `starting` is the same promise.
    - `putBoxOnce`, `delBoxOnce`: refuse at once. Both need the lease, and bring-up never ends unlocked, so today's wait at `starting` always ends in a refusal anyway, just later. Drop their `hello()` and let `demandVault()` refuse on the state it finds, as at `locked`.
    - `failed`: a third phrase in place of `BankNotStarted`'s wrong advice. And at `failed` the two queries still fetch boxes from a bank that never came up; they should refuse there.
- **Can the stage replace the promise?** For the refusals, yes. For the waits, no: the stage says where the bank is; the promise is how you wait for it.
- **The one helper**, called by the four that wait; it also gives E3's hop one named home: `async function broughtUpDevice(): Promise<Device>` — demand the device, `await device.hello()`, refuse `absent_vault` with a "failed to come up" phrase at `failed`, else return the device.
- **Rec:** a small thread after 13 (it rewrites lines 13 is rewriting).

### Undergrowth, useDraft: "should I worry about this?"

**No.** Nothing in it should worry a security reviewer. Two things deserve a tidy-up.

- **What it does.** An editor for one box. The sidecar lives in React state; the whisper's fields are uncontrolled, unnamed inputs. Focusing a field shows it: what was typed, or `withWhisper` writes the field into the input (waiting for the unlock form on a locked bank). Leaving it masks it and empties it unless typed into. `put` merges typed values over the unsealed whisper inside `withWhisper` and calls `putBoxOnce` against the base revision.
- **Fine as it is.** The whisper is in the DOM only while its field is focused and shown; the input has no name (so never in a FormData), carries the password-manager ignore attributes, and the text never enters React state or a cache. `readOnly` while a field is on its way is right.
- **Typed text survives a lock** (masked, until put or discard). *Premise check:* you already ruled this: "don't empty it by default, but use such a callback to demonstrate how a customer might themselves clear the form on lock. Don't build that in to our /kit components". Envman does exactly that through `useStageChange` (#808). Nothing to decide.
- **The reveal logic is written twice** (use-draft.ts and parts/whisper-text.tsx: pending state, withWhisper, write into the DOM inside the callback, mask on lock). This is E10's second half. Fold them when either next changes.
- **The focus branch** (`if (input.ownerDocument.activeElement !== input) { input.focus() }`) is needed, because the unlock dialog takes the focus, but it is subtle and uncommented; a one-line comment would do.

## 1. Eyebrows, ranked

### E1. Before birth, the device's stand-in root box cannot parent a box's shell, so reading any box at unborn refuses bad\_record

- **Where.** packages/safebyok/src/models/device.ts:119 builds #rootShell; device.ts:96 hands it to the minder as rootBox while the device has no bank. The minder uses it in one place, minding/thing-minder.ts:508, Shell.of(labelpathed, this.rootBox), which builds the shell of a box nobody has stored.
- **What happens.** The minder needs a root box from construction to make the shell of an absent box. The device, the minder's friend before any bank exists, invents a root shell whose lifepath is -000000001, which Shell.of will not accept as a parent. Probe: a device over an empty MemoryVaultDB, hello() (stage unborn), then minder.get of box/openai gives bad\_record, "A lifepath is one or more lifeseqs, joined by '/'". After a birth the same get, a putBoxOnce and the listing all work. In the giver, useBox at unborn goes to error, not null, after React Query's default three retries (E9).
- **Why nobody saw it.** The demo mounts its key panel only at locked and unlocked; no test reads a box at unborn.
- **Origin.** New: #rootShell and the device as friend. The minder before the bank is drawn by the draft.
- **Cost.** One stand-in every box shell is built from; before birth, root-level gets work and box gets throw. The draft's default, hooks that work anywhere under the provider, fails silently for a host that does not gate on stage.
- **Flavour.** Redesign? Before birth no box can be stored, so its shell needs no parent life, or the device could answer box gets without the minder. Solution off if #rootShell was meant to serve this.
- **What would settle it.** A test of useBox at unborn expecting null, and a ruling on whether hooks must work at every stage.

[Coach: the pleasant fix will come with nested boxes; one must "ensure" ones parents at the same time as making a box. Even then the primitive would refuse if its parent is absent, which it is, so this is correct behavior]

### E2. A device gets its bank through two entrances, and four artifacts exist to reconcile them

- **Where.** Bring-up, device.ts:160-181 (#bringUp). Adoption, models/bank.ts:187, where Bank.birthGating's friend calls device.adoptBornBank, and device.ts:153. Reconcilers: an early return for test fixtures only, device.ts:165 ("tests birth a bank before they say hello, which a device's startup never does"); a notes/wontfix.md row, "A bank born on a device while its hello still fetches"; #banklessSnapshot at device.ts:172,179, fake bank snapshots for unborn and failed; #hold at device.ts:186-190, shared by both, subscribing and never unsubscribing.
- **What.** hello's bank arrives locked; birth's arrives unlocked, with a lease, so it cannot be rebuilt from records. Birth is a static on Bank, so the device learns of it only through the bank-to-device call that is the cheat. The fixture buildBornBank births before hello, hence the early return.
- **Origin.** The adoption call is the kept cheat; the early return, the wontfix row and the stand-in snapshots are new.
- **Cost.** Two writers of #bank; each verb that needs the bank reasons over both. One production branch exists only for fixtures.
- **Flavour.** Redesign? Make birth a device verb, device.birthGating(cleartexts), wrapping Bank.birthGating and holding what it resolves. That removes the bank-to-device call; with the fixture saying hello first, the early return goes too, and the wontfix row becomes a plain sequence (birth offered only after hello shows unborn).
- **What would settle it.** A ruling on whether birth may be a device verb, and whether buildBornBank can say hello before it births.

[Coach: having a device verb sounds good]

### E3. Rule 7 holds only because of an uncommented await that looks redundant

- **Where.** packages/safebyok-react-lean/src/giver/react-giver.tsx:227-231, getBoxShown: demandDevice(), await device.hello(), then device.minder.get(...). The bridge's invalidations are at giver/react-bridge.ts:30,32,33.
- **What.** The bridge listens to the minder's events, so it runs inside the minder's cache dataflow, and on some events calls the host client's invalidateQueries. Probe (query-core 5.107.1): invalidateQueries on an observed query calls its queryFn synchronously, inside the call. The host's queryFn is getBoxShown, which calls minder.get. The only thing between the minder's listener and a re-entrant minder.get is that await of an already settled promise: one microtask hop. Nothing says so; a reader tidying startup would remove it.
- **Origin.** New: getBoxShown's shape. The bridge's invalidation logic is carried.
- **Cost.** An invisible invariant on the path every box query fetches through. Breaking it raises no error; it silently breaks rule 7.
- **Flavour.** Guidance gap (rule 7 does not name the host refetch that runs synchronously back into the minder), or solution off if the bridge was meant to defer its invalidations.
- **What would settle it.** In a scratch copy, delete that await and run react-bridge.test. If nothing fails, the invariant is untested; then decide whether the bridge or the fetch owns the hop.

[Coach: find out if it's an error: if so add the comment warning and a wontfix. If not, add a comment with a #not-a-crossing tag (this is a variation on the one in CLAUDE).]

### E4. safebyok already exports a tuneable mask, yet the demo and doc examples hand-roll one, and thread 11 planned another

- **Where.** packages/safebyok/src/index.ts:26 re-exports mask and MaskOpts from safebyok-big/utils (already at 56e56b094): a schedule by length, with per-call head, tail, minLen and maxLen overrides and padding that hides the length. Hand-rolled: the demo's KeyPanel.tsx:9-11 maskOf and putBoxAction's @example at react-giver.tsx:364. The dream writes mask(whisper.apiKey).
- **What.** Library first, and never reimplement a helper a different way (CLAUDE.md). Probe through big's built dist: mask('sk-ant-fake-0123456789abcdef') gave sk\*\*\*…\*\*\*cdef; with { head: 7, tail: 4 } it gave all stars, so the existing helper may refuse that schedule under its privacy floor: a reason to broaden big's helper, not to write a second.
- **Origin.** New (maskOf); the helper is carried.
- **Cost.** Two mask policies, revealing different amounts, in one product.
- **Flavour.** Guidance gap.
- **What would settle it.** Check mask against the Coach's schedule on source rather than dist; thread 11's helper becomes a re-export, an option, or a broadened schedule in big.
- *Orchestrator:* #806's review found the same, and thread 12 replaces maskOf with big's mask (through safebyok-big/internals) in both demos. I had wrongly ruled to keep maskOf and have corrected it. Correction: the probe above was wrong; thread 12 (#808) found that big's mask with { head: 7, tail: 4 } gives sk-ant-\*\*\*\*\*\*\*\*\*\*\*\*\*cdef, and tail: 4 shows four characters at every key length the demos use, so big's helper needed no broadening. maskOf is gone in #808.

[Coach: If there are multiple mask functions, use the one that was updated within the last two weeks] 

### E5. Moving the minder to the device changed what the existing teardown does

- **Where.** packages/safebyok/src/models/vault.ts:57-59: Vault.sweep calls this.#minder.goodbye(). vault.ts:37, a doc block rewritten this sprint: "The bank's sweep sweeps the vault too, and so the minder." device.ts:188 (Vault.make(bank, this.#minder)) and bank.hostVault.
- **What.** Each vault used to make its own minder, so sweeping it ended only what it owned. Now the device owns the minder, and a bank's sweep reaches through the vault to stop it. The device lives on with a stopped minder, and the bridge stays subscribed. "The teardown code stays as it is" was kept to the letter while its meaning changed.
- **Origin.** Vault.sweep is carried; the ownership change that alters its effect is new.
- **Cost.** One more path when ends are built: bank end, vault end, the device's minder end, against the device's own lifecycle. Nothing reaches it this sprint.
- **Flavour.** Guidance gap: the plan froze the teardown and moved the minder's owner without noticing they meet.
- **What would settle it.** A note now, in wontfix or the design's Ends, for later, that Vault.sweep should no longer stop a minder it does not own. No code.

[Coach: a note, no code, thanks]

### E6. usePasskeyHeader is a public hook that exists because the bank's snapshot lacks the passkey header

- **Where.** react-giver.tsx:205-218, a marked cheat, exported on the bank giver, used by the demo's KnockKnock.tsx:57 and WaysIn.tsx:6.
- **What.** It reads slot.device?.bank?.maingate.passkey0 during render. To re-render it subscribes to the stage and to every successful form mutation (useMutationState), using neither value.
- **Origin.** New, not in the draft.
- **Cost.** A hook reading the model outside useSyncExternalStore, plus two subscriptions whose values are thrown away.
- **Flavour.** Guidance gap: the draft never says whether the public wayin headers belong in BankSnapshot.
- **What would settle it.** A ruling on adding the passkey's public header to BankSnapshot; the hook becomes useBank((b) => b.passkeyHeader), or goes.

[Coach: subscribing to a gate seems reasonable, then it's just a direct prop. \
what is "slot"? why would it not be using a bank snapshot? That doesn't look like anything someone designed.]

### E7. The stage a host renders is assembled from four stand-ins over three stacked stores, and swept survives a "Directed: goes"

- **Where.** Stand-ins: PendingBank (starting, core shapes-bankish.ts); #banklessSnapshot for unborn and failed (device.ts:172,179); SignedOutBank (signed\_out, giver-slot.ts:34, exported); StartingSlot (react-giver.tsx:186, when the prop's userid is not the device's). Stores: Bank, then Device (DeviceSnapshot is only { bank }, compared by deep isEqual), then GiverSlot ({ userid, bank }, by identity). swept: bankStageVals still lists it (shapes-bankish.ts:108), and the demo renders it (KnockKnock.tsx:28).
- **What.** The design has, Agreed, signed\_out, starting and failed as states of a slot, not a bank; Proposed, unborn too. The code puts unborn and failed in the core device as fake BankSnapshots with isLocked true and the rest. "swept, vacated and deleted go" is Directed, but the frozen teardown still produces swept.
- **Origin.** New: the slot store and the stand-ins. Carried: the Bank and Device stores and swept.
- **Cost.** A stage change crosses three align functions with two equality rules; every reader of BankSnapshot must know some are of no bank.
- **Flavour.** Guidance gap (which layer composes the stage); on swept, guidance wrong ("swept goes" and "teardown stays" cannot both hold).
- **What would settle it.** A ruling on the Proposed unborn item; a shape such as { phase, bank | null } rather than a fake BankSnapshot; and whether swept stays in BankStage until ends are built.

### E8. hello() is used as a readiness barrier at five call sites, which the draft never describes

- **Where.** react-giver.tsx:229, 275, 322, 342, 351 (getBoxShown, getBoxListing, withWhisper, putBoxOnceAt, delBox): each awaits device.hello(), then demandVault() or the minder. The promise is stored at device.ts:55,147 (#broughtUp ??= this.#bringUp()).
- **What.** The draft defines hello() as starting an instance's async work, once. The code also uses it as "wait until bring-up settles", so a verb at starting waits rather than refusing. At failed the verbs then refuse with BankNotStarted, "wait for the stage to show locked or unlocked", wrong advice at that stage. One of the five is the hop E3 depends on.
- **Origin.** New.
- **Cost.** One memoized promise in a field and five verbs, each with a hidden "await bring-up" path; the same two lines repeated in each.
- **Flavour.** Guidance gap: the draft says nothing on how a verb behaves during starting.
- **What would settle it.** A ruling: verbs at starting wait, or refuse. Then one helper, or none.

[Coach: we have a stage variable for just this, how do react people normally write this? A promise to wait on? \
"verbs at starting wait, or refuse. Then one helper, or none" -- this sounds great]

### E9. Box queries keep TanStack's default retry, while the minder and the form verbs pin retry: false

- **Where.** giver/giver-defaults.ts:14-21 (recordQueryDefaults) sets networkMode, staleTime, structuralSharing, no retry; ListingQueryDefaults (:25-28) none either. Compare FormMutationDefaults.retry: false (:71, with a #no-slop-crossings comment) and the minder's FixedQueryCacheOpts retry: false (shapes-minder.ts:31, citing CLAUDE.md).
- **What.** A refused minder.get is retried three times with backoff by the host's React Query before error shows; with E1 that is every useBox at unborn. The dream's rule 3 says error is the minder's refusal; the bridge's comment says a refused get "refetches nothing", but the host's default retry asks again anyway.
- **Origin.** Carried (the old giver had no retry either); the listing defaults are new.
- **Cost.** A refusal shows as pending for about seven seconds.
- **Flavour.** Guidance gap.
- **What would settle it.** A ruling on whether the giver's record and listing defaults set retry: false; a host could still override.

[Coach: if the get function in the minder has no retry, but a higher level supervising function applies it, that's within design. retrying a put in a CAS system without consulting the customer is a different case]

### E10. The same code twice: the new-passphrase meter, and the reveal-into-DOM machine

- **Where.** kit/create-vault-form.tsx:32-65,101-111 and kit/replace-passphrase-form.tsx:33-68,283-293 carry the same confirmation state, compare, hearChosen, forget, strengthTextOf and matchTextOf, about 45 lines verbatim. Reveal: parts/whisper-text.tsx:31-48 (hidden, revealing, shown, with flushSync inside the withWhisper callback so the span exists before the text is written) and giver/use-draft.ts:96-148 ({ fieldname, isRevealed } | null, readOnly while revealing, a branch for the unlock form taking the focus). Both write a whisper into the DOM through withWhisper and hide it on lock.
- **Origin.** New, both.
- **Cost.** Two copies of a security-relevant path, a whisper written into and wiped from the DOM, that can drift apart.
- **Flavour.** Solution off.
- **What would settle it.** One useNewPassphrase hook for the two forms; one revealInto(input or span) helper for the two reveals.

### E11. A Bank cannot exist without a Device, and every Device builds a minder, so the design's "disciplined subset" is unreachable

- **Where.** bank.ts checks device instanceof Device; device.ts:126 runs ThingMinder.make in the constructor; device.ts:188 runs Vault.make; device.ts value-imports Bank, Vault and ThingMinder, and bank.ts imports Device: a cycle.
- **What.** Agreed in the design: the core can export a subset that signs in, unseals and gates with no vault, minder, giver or bridge. You ruled core sanctity a non-concern for this sprint, so this is evidence, not a fault: the device has become the composition root for bank, vault and minder.
- **Origin.** New, drawn by "the device owns the minder".
- **Cost.** One import cycle, and a minder (with its TanStack client) for any bank, even a test's.
- **Flavour.** Redesign?, later.
- **What would settle it.** Nothing this sprint; keep it on the list for re-apportioning ownership.

[Coach: Nothing this sprint; keep it on the list bravo!]

### E12. Tests: a second knock-knock app, a spy to find the device, a title claiming more than its test checks

- **Where.** packages/safebyok-react-lean/tests/giver/knock-knock.test.tsx (271 lines) builds its own knock-knock app, covering the same flows as the real demo's App.test.tsx (233 lines). tests/test-helpers/provider-world.ts:154-160,176 finds the giver's device by vi.spyOn(Device, 'make') (\_cheat\_device), because the giver offers no seam. The demo's anthropic.test.ts:14, "…and nothing else sees it", asserts only what the fake endpoint received.
- **Origin.** The package's knock-knock test is carried and ported; the provider world and demo tests are new.
- **Cost.** Two app-level suites to keep in step; a test world depending on how Device.make happens to be called.
- **Flavour.** Can't tell; the spy suggests the giver lacks a seam a host test would want too.
- **What would settle it.** Retire the package's fake app now that the demo exists, or say why both stay.

[Coach: retire when the entire -big rewrite is done, not too long I hope]

### Smaller notes, no rank

- **QueryClient.** The dream's rule 1 says the giver makes one where a host has none; the Provider throws outside QueryClientProvider, and a test asserts it. The design (given through the provider) agrees with the code: a disagreement inside the draft.
- **A rejection counted as a refusal.** kit/form-action.ts:30-35 resolves false for every rejection of mutateAsync, so a bug reads as the user's mistake. Minor; the gating() refusal surfaces, thrown before the try.
- **Weight.** About 1,172 added lines are verbatim copies (two eslint configs and a LICENSE), as the plan asked. Tests run about 1.5 times the source.

## 2. Undergrowth (found by search)

**Control primitives:** little that is new.

- **Promise in a field:** Device.#broughtUp (device.ts:55,147). New; the barrier of E8.
- **Generation counter:** judgeseq in useStrengthVerdict (react-giver.tsx:137-147) keeps an older verdict from overwriting a newer one. Carried verbatim from the old giver. The plan bans generation numbers as machinery for crossings, but this race happens in normal typing while the strength checker loads, not against an end-of-life event. Settles: a one-line ruling that it is exempt.
- **Structural sharing as a race guard:** newerOrSharedOf (giver-defaults.ts:36-40) stops a late host fetch from putting an older record back over a newer one. Carried; freshness machinery rule 8 forbids adding, but it was carried, not added.
- **The bridge's invalidation rules:** react-bridge.ts:28-34 (cancelRefetch false, refetchType none, a soon's success invalidates the item). Carried. The old bridge's sweep of existing host items on bank start was dropped, because the bridge now starts before the minder's first get: a mild ordering dependence.
- **Flag-gated paths:** in use-draft.ts, reveal.isRevealed gates readOnly and masking (:143-148); in whisper-text.tsx, 'revealing' disables the button. New, drawn by the plan; covered by E10.
- **flushSync inside a withWhisper callback** (whisper-text.tsx:41): new, an escape hatch to mount the span before writing into it; rendering the span always, empty and hidden, would avoid it. Solution off, minor.
- **Not found** in new code: timers, abort controllers, retries, queues, locks, or unique tokens beyond the marked device\_tok cheat (giver-slot.ts:98).

**New mechanisms:** nearly all drawn by the draft: 

GiverSlot, the provider, formActionOf, 

[Coach: useDraft,] 

[Coach: should I worry about this?]

LocalStorageVaultDB (a marked cheat over MemoryVaultDB's \_cheat\_things test door), the device as MinderFriend. 

Not in the draft: usePasskeyHeader (E6), #rootShell (E1), #banklessSnapshot and refusalSnapshotOf (E7), 

UnlockDialog as its own component (close to the plan's "UnlockForm, also as the dialog"), ModalDialog and useRevealToggle (carried ideas, new implementations), 

KitPhrases and PartsPhrases. 

[Coach: A nexus: Device.makeGetAsk, makeListAsk and rootBox each fall back with this.#bank?.x ?? standIn (device.ts:96,232-235), so every minder ask has two regimes, untracked before the bank and tracked after] 

[Coach: this sounds bad] 

; E1 is where it breaks.

**Non-standard JavaScript:** little. The giver is one closure, reactGiver() → makeBankGiver(slot, useShownSnapshot) → makeUseDraft(slot, { useBank, useBox, withWhisper }), hooks passed into factories as a friend, which follows from the dream's SOK.bank('acme'). Small items: useFormMutation(verb, gatingOf), a parameterized helper used five times, reasonable; heardCeremony(ceremony, hear) takes a thunk and a setter (passkey-forms.tsx:160-168), mildly golf-like; takeForm, a nested function with try/finally (react-giver.tsx:372-379), reads fine.

## 3. New names outside the draft

138 exported names and new members were checked against the three draft files and the old code. **85 are in none of the draft files: 51 new this sprint, 34 carried.** Five more appear in the plan only in its orchestrator notes: adoptBornBank, listQueryKeyOf, usePasskeyHeader, isWhisperDirty, keys.boxList.

**New, by concern:**

- **Core:** Device.adoptBornBank (the kept birth cheat); Device.rootBox (a stand-in shell before birth, E1); ThingMinder.listQueryKeyOf (the listing's key, shared with the host); MinderFriendExpected; VaultMinderExpected.
- **The slot:** GiverSlot, GiverSlotSnapshot ({ userid, bank }), SlotMount (the client and per-mount vaultDB and deriver), GiverConfig, GiverBanks; SignedOutBank (a BankSnapshot at signed\_out, exported); demandDevice, demandBank, demandVault; ProviderProps.
- **Refusal phrases:** NobodySignedIn, BankAbsent, BankNotStarted, OneBankExpected, TypedFieldGone.
- **Box queries:** BoxShown (a record or a tombstone, as fetched); BoxSelected (what the default select answers); BoxNamed (a labelpath or an object scoped to a box); BoxQueryOptions; BoxQueries (the sok.knock object); ListingQueryDefaults; boxQueryKeyOf, boxesQueryKeyUnder, boxListQueryKeyOf; bridgeMinder.
- **Writing and drafts:** PutBoxActionOpts, Draft, DraftPutOpts, makeUseDraft; whisperTextOf (exported from use-draft.ts, imported by parts); isWhisperDirty.
- **Parts and kit:** AddPasskeyFormProps, CreateVaultFormProps, PassphraseInputProps, ReplacePassphraseFormProps, RevokePasskeyFormProps, SubmitButtonProps, UnlockDialogProps, UnlockFormProps, WhisperInputProps, WhisperTextProps; UnlockDialog; RevealToggle, KitPhrases, PartsPhrases.
- **The demo:** KeyLabelpath, KeyPanel, KnockKnock, formTextOf, subscribeSession.

**Carried (34):** AskPasskeyOpts, BankGiver, BoxQueryOpts, CreatePasskeyOpts, FormMutationDefaults, FormMutationResult, GiverEvent, JokeModel, KnockForm, ModalDialog, PasskeyUnlockButtonProps, ReactGiver, ScopeChecks, Session, SessionBar, StrengthVerdictResult, UsernameField, WaysIn, WhisperFieldProps, buildJokePrompt, getSession, gripeForJokeErr, recordQueryDefaults, refusalTextOf, signOut, tellKnockKnockJoke, useRevealToggle, useSession, makeGetAsk, makeListAsk, useBirth, useReplacePassphrase, useAddPasskey, useRevokePasskey.
