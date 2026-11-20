# 2026-11-20: Doc blocks of the vault_snapper line -- 78 blocks rewritten, five disagreements, one rename

The target was the doc blocks that the vault_snapper line (up to #781, `20261120-pending_bank`) adds or changes, in the
21 files it touches under `packages/safebyok/src` and `packages/safebyok-react/src`. Only doc blocks changed, plus one
`//` comment that took the mechanism moved out of `agerankOf`'s block. `core.ts`, `index.ts`, `storage.ts`,
`refusals/throwers.ts`, `shapes/shapes-thing.ts` and `giver/minder-bank.ts` needed nothing: the line either touched no
doc block in them or left the block sound.

## Findings: blocks that said something the code does not do

1. **`ThingMinder`'s class invariants** said "altering the gcTime is misuse". But `QueryCacheOpts.gcTime` is an option
   a host may choose, and a finite gcTime removes queries. The block now says what the cache does: it removes a query at
   `goodbye`, or once a finite gcTime passes. Which is meant?
2. **`ThingMinder.listen` and `invalidate`** named "a `thing` event", "a `listing` event" and "an `invalidation` event":
   the `carkind` tags that this line removed from the event shape. They now link `ThingEvent` and `ListingEvent`.
3. **`bridgeDevice`** said it starts by "fetching again each entry that shows a car". The code calls
   `invalidateQueries`, which refetches only an entry with a mounted observer and marks the rest stale. It now says
   "invalidating".
4. **`Vault.withWhisper`** said `fn` gets "the box's newest revision". It gets what `minder.get` answers: the cached car
   when it is timely under the minder's staleTime, which need not be the newest one stored. It now says "as
   `ThingMinder.get` answers it".
5. **`Bank.sealBox`** said a live box's revision keeps its sidecar unless `publicProps` gives one. A sparse donor has no
   sidecar to keep, so `BaseBox` refuses `sidecarMissing` (`base-box.ts`, `if (sidecar === undefined)`). It now says
   that over a sparse box, a tombstone or the shell, `publicProps` must give the sidecar. `Vault.tryPutBoxOnce` already
   said this.

## Proposed rename

* **`ThingMinder.childrenQueryKey`**: the prefix it returns selects every car and listing under the Thing, at any depth,
  not only its children. Its old name, `subtreeQueryKey`, matched that. `descendantsQueryKey` would fit as well.

## Open questions

* The findings above, the gcTime one first.
* `BankStage` lists `signed_out`, `unborn` and `failed`, and `BankSnapshot.lastErr` is described, but no code produces
  them yet. A bank's snapshot is `locked`, `unlocked` or `swept`, `PendingBank` is `starting`, and `lastErr` is always
  null. That is sound for a type a host switches on, but a host reading the block may expect them now.
* `Device.#thisIsTemporaryBank` and `cheatHoldBank` are named as stand-ins. I kept the names and gave their blocks plain
  first lines.

## Changes, member by member

**shapes/primitives.ts**: `Revseq.padded` and `paddedSeqOf`. Plainer wording ("spelled as a lifeseq is" became "as
fixed-width text, which sorts in revision order like a Lifeseq").

**shapes/shapes-stamps.ts**: `LeaseFormat`, as two sentences.

**shapes/shapes-bankish.ts**: `SealedBoxAsk` opens on the noun. `BankStage`, `RefusalSnapshot`, `BankSnapshot`,
`OpenGatingSnapshot` and `DeviceSnapshot` lose the "X as a host renders it" figure. `BankSnapshot.isEnded`, `.endCause`
and `.lastErr` are plain sentences. `PendingBank` is one line. `OpenGatingSnapshot.gatingseq` now says what it is for:
key a dialog's form on it.

**shapes/shapes-minder.ts**: `ThingCar` says "deeply frozen" in place of "frozen through". `ThingCar.agerank` drops how
it is built. `MinderEvent` no longer opens on "What". `MinderEventOf` and its `action` (now a list of values), `queryKey`
and `state` are plain sentences. `ListingEvent` gets a short first line.

**storage/refused-answer.ts**: the module block and `refusedAnswerOf` say when to call it: for a call that threw
before the vaultDB answered.

**phrases.ts**: the doc blocks of `FeedVersionOther` and `CarAgerankNotOwn`.

**minding/thing-car.ts**: `carOf` says it deep-freezes both records in place ("frozen where they lie" was a figure).
`frozenCarOf` reads "deeply frozen". `agerankOf`'s second line, which said how the string is built, moved into the `//`
comment above it.

**minding/thing-minder.ts**: the class's listener invariant (finding 1), `listen`, `invalidate`, `queryKeyOf`, `isThingEvent`
and `childrenQueryKey`.

**models/bank.ts**: `#snapshot`, `getSnapshot` and `subscribe` (plain: the getter or subscribe, already bound, as
`useSyncExternalStore` wants it). `ensureUnlocked` names the act. The four `tryAttempt*` blocks each have a short first
line, then where the attempt goes, then one case per sentence, and lose "where it lands". `sweep` names `endCause`.
`#align` and `#makeSnapshot`. `sealBox` is split into one fact per sentence.

**models/device.ts**: `#gatingseq`, `#thisIsTemporaryBank`, `#snapshot`, `getSnapshot`, `subscribe`, `lock`,
`cheatHoldBank`, `alignOpenGating`, `#align` and `#makeSnapshot`.

**models/gating.ts**: `attemptWithoutGating` loses "a re-entry point" and "refuses at the door", and says that the PRF
bytes are zeroed, not that the cleartexts are "spent".

**models/vault.ts**: the class block. `tryPutBoxOnce` and `tryDelBoxOnce` each get a short first line, and say "Misuse is a
bad outcome too" once. `withWhisper` points to `Bank.ensureUnlocked` and `ThingMinder.get` rather than comparing itself
to them. `#newestAt`.

**giver/react-bridge.ts**: `bridgeDevice` (finding 3). `deliverEvent` loses its semicolon.

**giver/react-giver.ts**: `ServerSnapshot` names the noun. `carStaleTimeOf` says it returns a staleTime and which value.
`newerCarOf` says it is the structural sharing. `makeReactGiver` names the act, and its vaultDB warning is plain.
`forBank`. `boxCarQueryOptions` lists its defaults. `useBoxRecord` gets a short first line.

**giver/shapes-giver.ts**: `GiverEvent`, `GiverEvent.queryKey`, `GiverBank` and `GiverDevice` no longer open on "What".
`GiverDevice.getSnapshot` and `.subscribe` lose "As a Device's".

## Facts dropped that STYLE.md does not plainly cut

* `ThingCar.agerank`: how the string is built (the newest's lifepath and revseq, the liveness, and the revseq of
  `fullest ?? newest` joined by `~`, with a placeholder below every revseq when bare). This is now kept once, in the
  `//` comment above `agerankOf`.
* `ThingMinder` class invariants: "Removal is contemplated as part of a later feature allowing nested boxes, but not
  yet." (future plans), and "(the customer may do as they please with the Giver's React Query cache)".
* `BankSnapshot.endCause`: "the one `bank.endCause` returns".
* `BankStage`: "one of `bankStageVals`" (the type says so).
* `PendingBank`: "signed in, and the bank not yet started" (its stage, `'starting'`, says so).
* `OpenGatingSnapshot.gatingseq`: "it grows with each one opened, and again as each ends" (how it counts). This is kept
  on `Device.#gatingseq`.
* `Device.cheatHoldBank` and `alignOpenGating`: who calls each (the `//` comment above `cheatHoldBank` keeps it).
* `attemptWithoutGating`: "no next attempt waits for them".
* `Bank.sealBox`: "The seal checks its arguments ... and the box it seals" (the reason a caller can pass `donorProps` as
  they have it).
* `Bank.ensureUnlocked`, `tryAttemptRevokePasskey` and `GiverDevice.getSnapshot`/`.subscribe`: "as X does" comparisons.
