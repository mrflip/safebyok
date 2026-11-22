# Thread 8: misuse_cull (2026-11-22)

Branch `20261122-misuse_cull`, PR #851, stacked on #849. Proved: see the PR's **Tests:** line.

The Coach: "don't change users' error messages preemptively. They are not the threat model.. Remove that and
anything else that hunts for guessed-at misuse."

The rule I applied: a check goes when it polices an argument only our own code passes (a nominal `instanceof`, a
consistency check between two things our code built together), or a call order we guessed someone might get wrong.
A check stays when it validates what an interface requires of a host (a duck check of a host's object, a record's
shape), guards a real state the object passes through, or guards data integrity of what storage hands back.

## Removed

* **Minder reads** (`at`, `soonAt`, `deadAt`, `isBehindAt`, `listingAt`, `tryAt`, `get`, `isStaleAt`, `list`): no
  longer refuse a Thing the minder does not mind (`#demandItemScope` there, `#demandListingScope`, the abstract
  `mindsListingAt`). A read of a Thing another minder minds answers what this cache has: nothing.
* **`hello`'s `BankMindedInClient`**: refused a second minder of one bank in one client. Our device makes one.
* **`newerThingOf`'s `RecordsOfOtherThings`**: two records of different Things; only the minder's own query calls it.
* **`Gate.make`'s device and wayin, `Bank.make`'s device and gate, `tellBadNewsTo`'s device**: `instanceof` on
  objects only our code hands over (`GateExpected`, `NovelOrProvingExpected`, `WayinExpected`).
* **`Vault.make`'s bank and minder checks, and that the minder is of the bank** (`VaultBankExpected`,
  `VaultMinderExpected`): the device builds both together.
* **`birthBank`'s device check** in gating.ts: the gating holds its own device.
* **A proving's `wayinSource`** instanceof check of the proving or novel its wayin is built from.
* **`VaultMinder.make`'s `bankMinder instanceof BankMinder`**, with the option itself (below).

## Kept

* **`#demandOwnScope`** on every read: a ThingScope of this bank. Interface validation of the argument's shape and
  bank.
* **`tryWrite`'s `NotMinded`**: a VaultMinder's write of the bank, main gate or root box, or a BankMinder's of a box,
  would land in storage and nowhere in the cache: `sendToTSQ` drops a record its minder does not mind, and no watch
  notice brings the write's own record back. It stops a write that would silently cache nothing.
* **`MinderNotStarted`**: a real state, between make and hello.
* **`MinderClientExpected` (`isClient`)**: a client not made by `makeClient` has no landers; the minder would fail
  on an undefined.
* **`MinderFriendExpected`, `HostedVaultExpected`, `VaultDBExpected`, `PersisterExpected`, `SealerExpected`**: duck
  checks of an interface a host may implement.
* **`FeedVersionOther`**: the listen feed's version handshake, designed.
* **`StaleTimeShape`**, the label and record shape checks: values a host types.
* **`DeliveredOfOtherScope`, `ChildrenStoredDamaged`, `BankRootsMissing`**: data integrity of what the vaultDB answers.
* **`Bank.birth`'s Device `instanceof`**: a host calls it.
* **Gate and Bank record-against-record `record_conflict` checks**: records, not arguments.
* **Proving's `wayinMadeAlready`, `wayinNotMadeYet`, `ProvingOfOtherGate`, `LeaseOfOtherGate`**: they sit in the
  unlock path and guard key material; left for a Coach ruling (open matter).
* **`GatingSpent`**: guards cleartexts already zeroed (G2).
* **`WorldNotHeard`, `BoxOfOtherRoot`, `passkeyAlreadyAdded`, `leaseNotInForce`, `TombstoneSecretsGiven`**: real
  states, or what an interface requires.

## Built (ride-alongs and directives, a commit each)

* **rootBox**: `VaultMinder.rootBox`, `BankMinder.rootBox`, VaultMinder's `bankMinder` option, `VaultMinderOpts` and
  `BankMinderExpected` are gone. `VaultMinder.make(opts: MinderOpts, bank)`.
* **One owner refetches an observed listing, the minder.** `invalidate()` now invalidates with TanStack's default
  `refetchType` (`'active'`) and `cancelRefetch: false`, so a hook's listing is listed again. The giver's
  `refetchMarked` no longer refetches listings. It still refetches a behind item that a hook observes (see Decisions).
* **eqeqeq.** No config turned it on: `packages/safebyok/eslint.config.mjs`, `packages/safebyok-react-lean/eslint.config.mjs`
  and the root `eslint.config.mjs` don't name it, and none of their presets (`js.configs.recommended`,
  typescript-eslint `strictTypeChecked`/`stylisticTypeChecked`, unicorn, sonarjs, react, react-hooks) enables it.
  `eslint --print-config` confirms. Added `eqeqeq: ['error', 'always']` to the core's and react-lean's configs. The
  one hit was the giver's `mounted?.userid == null`, which became `typeof mounted?.userid === 'string'`
  (`prefer-optional-chain` refuses the two-clause form). safebyok-big's config is untouched.
* **`useridsSeen`** counts only entries holding data, a record or Absent. A user whose roots fetch was refused is not
  seen. New device test.
* **Dead entry wording**: "the tombstone that last landed" in minder.ts (class doc, `deadAt`), shapes-minder.ts
  (`DeadEvent`) and VOCABULARY.md.
* **A refused list carries `read_tc`** under `void` or `gone` (the read found the parent). `ListThingsActual`'s refused
  branch requires it, the classifier sets it, `AdapterVaultDB` passes it on. A thrown answer has none. The battery and
  adapter tests check it. safebyok-postgres gets a patch changeset, since it bundles `AdapterVaultDB`.
* **TODO.md**: the size limit on a persister's snapshot.

## Decisions made

* **`list`'s `staleTime: 0` stays.** `list()` promises to ask the vaultDB every time, and joins a list under way. The
  listing's query default carries the minder's own staleTime, so dropping the per-call one would answer from the
  cache. Removing it means setting the listing's default staleTime to 0 in `#setQueryDefaults`, which the
  coordinator gave to a later thread.
* **The giver keeps refetching items.** The directive named the listing. The item half of `refetchMarked` (a behind
  item, a soon's success) still lives in the giver. Moving it to the minder would mean `#markBehinds` invalidating with
  `refetchType: 'active'`. That is a change to the core's item behaviour, and nobody asked for it (open matter).

## For the Coach

* **Proving checks** kept pending a ruling (above).
* **`BankMindedInClient` removed**: two minders of one bank in one client would now share queries quietly. Only a
  hand-built setup could do it.
