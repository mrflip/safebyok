# Prompt: investigate the gating family

For an interactive session with Opus, from the Coach, at the top of sprint unrace's line (branch `20261103-unrace`). Paste what's below the rule.

---

I'd like your help thinking through one part of safebyok's new models: the gating, the object that asks a host for a passphrase or passkey and runs one proof with it. Don't change any code in this session. We're investigating, and I'll decide what happens next.

**What's bothering me.** A cold reader flagged `ProveForGatingkind` and its kind-keyed type maps, and I answered "same family of design smells around gating, do not like". I want to know how big that family is, what caused it, and what plain code would look like. I don't yet know whether the cause is the type gymnastics, the placement of the gating's state, the design draft, or something else, so please don't start from a conclusion.

**Where to look.** `packages/safebyok/src/models/gating.ts` (265 lines; its `// == ` banners are a table of contents) is the heart. Around it:

- `ProveForGatingkind`, a table of six async lambdas, with `ProvingsForGatingkind`, `VaultForGatingkind`, `ClearsForGatingkind` (`models-shapes.ts`), `Asked`, `Prove`, `Run`, `LaunchArgs`, and `AnyGating`, whose generic forces `as unknown as AnyGating` at `gating.ts:80` and `:87`.
- The one open gating, on `VaultListing` (`vault-listing.ts:47`, `:123` on): `openGating`, `holdGating`, `releaseGating`, `declineGatingAtLock`, `declineGatingAtDiscard`, and `bank.ts:185` reaching in through `openGating`.
- The lock path: `vault.lock`, `listing.declineGatingAtLock`, `gating.declineAtLock`, `declineAtDiscard`, `#endAsking`, `#settleOnce`. The draft names only `declineAtLock`.
- The state: `#settled` and `#settle`, a promise and resolver in fields; `#outcome`, `#isAttempting`, `#isLastAttempt`. A reader counted about twenty cells of state by input.
- `declineAtDiscard` answering `locked_while_asking` on a sweep where nothing locked; `gating.vault` exposing `receive`, `settle` and `takeWorld` to the host's dialog; `declineAtLock` and `declineAtDiscard` being public on the object the host holds.
- `#runBirth`, `#runReplacePassphrase`, `#runAddPasskey`, `#runDelVault` in `vault.ts`, with revoke inline, and `#landGate(proved, commit)`.
- Who owns a passkey answer's PRF bytes. `#attemptOnce` zeroes them unless the refusal is correctable, so the same bytes can go in again; the spec's trees say "unspent". Compare `spendClears`, the core's `spendAnswer` and `seal`, and `attemptOnce` in `packages/safebyok-react/src/passkey.ts`, whose doc says the retry is one "these dialogs never make". My worry: "someone is standing on the wrong principle (eg trying to make a dialog cancellable in a way that's unnatural) and in so doing dragging a concern across multiple sites".
- `tests/models/gating.test.ts` and `vault-gate.test.ts`, for what's pinned.

The design draft is `whiteboard/20261102-newdesign/newdesign-proof.md`. It's pseudo code, a design artifact, and I was wrong to call it authoritative, so a tree or table in it never outranks good sense. It may well be the cause of some of this. The sprint doc's *Closer Look* tab has the cold reader's findings, if you want them after forming your own view: https://claude.ai/artifact/AC8pGJrhjKv9scDmQZddj6

**What must stay true.** Read *The guarantees* in `notes/guarantees.md` first, G1, G2, G3 and G8 especially: some of this code carries real obligations, such as spending a clear after an attempt and never letting a host's throw quote a passphrase, and I don't want those lost as collateral. Don't open `notes/security.md`.

No concurrency machinery in anything you propose: no counters, joins or retries. We don't defend against crossings with new state; a crossing is a sentence, and it blocks nothing. A doc block is one or two 120-character lines.

**What I'd like from you, a step at a time, stopping to talk:**

1. Read it, then tell me in plain words what a gating actually has to do, as you now understand it, before saying anything about how it does it.
2. Name the family: which of the things above are one problem, which are separate, and what caused each. Say which of them the draft forced, which came from TypeScript, and which are agents' choices.
3. Sketch the plainest version you can, in enough code to show its shape: say, six private methods or a `switch` in place of the table, the kinds dropped from the generic, and the host's dialog given a narrow object. Give me two or three real alternatives if they exist, with what each gives up, and your recommendation.
4. Tell me what you'd want to know from me, and what you're unsure of. If you think the gating is fine and I'm wrong, say so.
