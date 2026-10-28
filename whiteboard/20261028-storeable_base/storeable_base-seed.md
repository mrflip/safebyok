# storeable_base: seed (2026-10-28)

The Coach, in chat, 2026-10-28, after cancelling `gripeoween_vault`: a sprint to implement a
client-side `Storeable` base class, built independently of box and vault against its own contract
and tests, and matched to them only once that contract is tight.

## Read first

* `whiteboard/20261028-gripeoween_vault/gripeoween_vault-consistency.md` (untracked in the base
  checkout; committed on branch `20261028-gripeoween_vault`): the consensus, the six lanes, the
  versioning rules, the session guarantees and the tests that pin them, and **section 9**, which
  is this sprint's brief.
* `whiteboard/20261028-gripeoween_vault/gripeoween_vault-plan.md`, thread 4's *Orchestrator*
  paragraphs: the horizon names (`maxMinutesSinceRefresh`, `minMinutesToAutolock`, and their
  millis forms), `#ensureUnlocked` → `#doEnsureUnlocked` under one shape with its public verb,
  the salt (512 B) and `credential_id` (1023 B) bounds. These rulings stand.
* `whiteboard/20261028-gripeoween/gripeoween-todo.md`: the rows that point here.

## Open for the Coach at seed time

* Whether *autolock* enters VOCABULARY.md (the plan assumes it does).
* Whether `gate_epoch` stays beside `vault_revseq` (the orchestrator's call: it stays).
* Names for the split box write (`putBox`, `putSidecar`, `putWhisper` proposed).
* Section 10 of the consistency note is a TODO, deliberately.

## Skeletons, 2026-10-28

Written in the base checkout for discussion, no doc blocks, each step of a verb a named call:

* `packages/safebyok/src/models/storeable.ts` -- the `Storeable` base class: `get`/`put`/`del` as
  try pairs, `ensureTimely`, snapshot and `subscribe`, `settleOwnOp` as the one hooked policy for
  what an own operation's answer does to the cache, and the abstract `do*` hooks.
* `packages/safebyok/src/utils/timed-launcher.ts` -- `TimedLauncher`: `launchAt` and the three
  `last*At` times (read as one `timing`), `isTimely`, `snapshot`, `ensure`, `launch`/`tryLaunch`
  (a call made during a run joins it), `scheduleLaunchAt`, a timer.

Both typecheck and lint clean. Questions the skeletons raise, for the Coach:

1. Spelling: the dictionary has *storable*; the sprint and §9 say *storeable*. Pick before any
   import names it.
2. `world` is not in VOCABULARY.md. The consistency doc said "circle" for vault+core.
3. The base class takes no vaultDB: the subclass's constructor does, and its `doGet`/`doPut`/`doDel`
   close over it (STYLE.md, a collaborator gets what it needs when it is made).
4. Uniform version fields on every stored thing: `revision_tok` (today's name) and `revision_seq`,
   or the per-thing `box_revseq` the consistency doc wrote. The base wants one spelling.
5. `takeAnswerWhileLocked` is the same as unlocked for now: the lock-landed-mid-operation policy is
   the one open branch of `settleOwnOp`.
6. `oneAtATime` returns `Promise<void>`; the launcher keeps its own `running` to hand the outcome
   back. Either `oneAtATime` grows a valued form or the launcher stays as written.
7. The launcher's timer fires `tryLaunch` at `launchAt` on its own. Whether a library should make a
   storage read from a timer in an idle tab is policy, not mechanism.
8. `get sparse` and `toJSON` read through the snapshot, as STYLE.md asks; `get()` is the purposeful
   read, `ensureTimely()` the lazy one, and there is no `refresh()` beside them yet.

## Second pass, 2026-10-28

Rulings taken into the files: `Storable` and `storable.ts`; `Trigger` in `utils/trigger.ts`;
`revision_tok` and `revision_seq` on every stored thing; the timer stays, a mechanism; no `ckey`,
no listing in the base, no clock of its own (the world's); `vaultDBGetSelf` / `vaultDBPutSelf` /
`vaultDBDelSelf` as the compromise facade until the vaultDB verbs are renamed (`fetch`, `replace`,
`retire` or the like) and `get`/`put`/`del` go to the customer; public verbs return the instance;
one precondition (`ensureTimelyStorability`) and one drift check (`demandStorability`) after every
await, both defined by the subclass; the throwing form is written and the try form wraps it.

`get()` holds the lifecycle undried: listed version, stored record sought now, consequences for the
world then self, the live instance (`this`), the snapshot. `cachedRecord`, `fetchRecord` and
`timelyRecord` stand as named primitives for the call-chain discussion, not yet called by `get`.

Still open: the lock-landed-mid-operation policy; `world` in VOCABULARY.md; a null `record` in an
answer reads as absent, so a conditional "unchanged" answer needs its own shape when it comes.


## The issue

These forms do not imply pojo or instance:
* sparse: suitable for listing. does not have heavyweight attributes. Not sure if vault draft is (or can be made to be) sparse.
* tombstone: scope, revision, sentinel that it's gone
* record: all props in the database row ("full")
* snapshot: confection of fields to serve react and other clients (snapshots are pojos; may have extra props or methods. Serves customer, not us)
Separately:
* live: an instance, meeting one of those shapes via getters or ownprops, enumerable or not
* pojo: any of the above, but props-only

We have these copies of the data for a thing, which hopefully collapse to no more than two:

* listed: might be tombstone, sparse, or full // (unclear if instance or pojo)
* live instance instantiated from full record
* cached or local copy
* draft?
* most-recent
* best-guess (most recent + optimistic update)

Players:
* world (vault + bank):
  - provides a clock
  - carries listings
  - knows the vault scope and its epochs
  - knows vault states: locked/unlocked; fresh/stale; autolocking or not
* listing:
  - holds listed

We receive a vault record for every vaultDB op touching a vault (a vault, a thing in that vault, a listing). In the case of a vault op, it's the same as the vault itself, maybe.

On receipt of an answer:

* Place errors and conditions in the correct pipeline
* dispatch errors so severe the world can't be updated
* conditionally terminate, remove and clean up the vault (vault_gone)
* conditionally lock (ident changed, wayins changed)
* ...fill the rest of this in: things that are not true for other storables

If conditions are met:
* update the record -- causes these things to happen
  - update the local copies
  - updateSnapshot: if snapshot will change, make a new one and #replaceSnapshot (sets prop and sends to listeners)
is the live copy an immutable object made from the record, or is it updated?



As a customer of the library:

box   = vault.getBox(boxhandle): Box | null (and tryGetBox)
boxes = vault.getBoxes(): Record<Boxlabel, Box> // cached locally for some period
vault.getBox(boxhandle): Box | null             // returns box if not stale and unlocked
box.expose(box.boxlabel): void                  // sets private whisper prop
box.getWhisper(): Whisper                       // returns whisper, stores nothing
box.sidecar                                     // writable, mutable
box.whisper                                     // if exposed. writable, mutable

Some customers will want to be able to fiddle around with the innards of sidecar and whisper


?? can I fiddle with the box's sidecar props in place? No:
const { ...scope, whisper, sidecar, written_at, registered_at } = box.unseal() // epochs? revision?



scratch
staged --
stored -- out of my control; may be sparse (if only listed)

I want to serve the non-react and the react case.

Listing boxes populates sparse records (without the encryptedWhisper or sidecar).

Getting a box creates a live instance that guards the data. Triggered locally, via timer, or via subscription, a signal may come in to lock or evict the vault:

* if the vault is locked, boxes should stop showing secrets;
* if the vault is evicted, everything stops showing any data and disappears
* (an intermediate verb might have boxes remove their encryptedWhisper and sidecar but preserve the listing)

Whisper is anything JSONable. It is AES-GCM encrypted by a key that never leaves the device, sealed with the metadata. It may only be accessed while the vault is present and unlocked.
Sidecar is an object. It is visible even if the vault is locked.

* A listing is a bag (not a map) of live instances, and offers batch gets `listing.hydrateAll()`. Hydrating a record does not change its identity, only populate the missing fields.
* `.hydrate(opts = { maxMillisSinceRefresh })` on an instance populates values not in the listing (zero forces a fetch). Calls to hydrate join oneAtATime (only one call is pending at a time, all callers receive the same value)
* `.unsealWhisper(opts)` on the instance unseals the whisper temporarily and returns it, storing nothing in the box (the customer can do what they wish).
* `.expose(boxlabel, opts)` unseals the whisper, stores in a private variable and offers it with a public getter on the box. (it's the customer's decision, and if we don't write it some will, but without the guard). On lock, a sentinel symbol is returned in place of the whisper prop
* `reseal(opts)` hydrates, unseals, then reseals that with its current metadata, updating encryptedWhisper
* `update({ whisper?, sidecar? }, opts)` replaces the sidecar (if given) and seals the whisper (if given or exposed); with opts.reseal, if nothing is given or exposed it will reseal (hydrate, unseal, seal)
* `put({ whisper?, sidecar? })` updates then stores the sealed box record

Meanwhile, there may be updates or tombstones from other devices or tabs coming in.
To any extent we allowed staged edits, remote updates must not overwrite them.
You must invoke a put() operation of some name to send the box deliberately.

`put`ting a box involves serializing and encoding the whisper to plaintext,
making keys, encrypting the plaintext bound to our metadata, so call it 15-45 ms.
Because we're doing CAS versioned updates, fast serial writes would require optimistic
local updates or some sort of hairy queue (so that I can chain each one)

To perform JSON.stringify, generate a cryptographically secure key, and execute AES-GCM encryption with Associated Data (AAD), the total execution time on an iPhone 13 class browser will be roughly 0.15 to 0.45 milliseconds.
The operation remains well under half a millisecond because the A15 Bionic's ARMv8 hardware acceleration processes both the encryption and the GMAC hashing (for AAD verification) simultaneously in a single pipeline pass.


| type  | immutable                   | version       | hydrated                             |
| ----- | --------------------------- | ------------- | ------------------------------------ |
| Vault |                             |               |                                      |
| Box   | `...scope`, `registered_at` | `...revision` | `whisper{_sch_ver,_codec,_ciphered}` |

Box revision: format, box_key_wrapped, revision_tok, revision_seq, written_at
Whisper: whisper_schema_version, whisper_codec, whisper_ciphered,

Performance & Overhead Breakdown


| Operation               | Estimated Time | Driver of Performance                                                                                                      |
| ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| JSON Serialization      | 0.05 – 0.15 ms | JSON.stringify on your medium-sized object + metadata. V8/JavaScriptCore highly optimizes this into native memory buffers. |
| Text Encoding           | 0.01 – 0.03 ms | TextEncoder.encode() converting strings to Uint8Array views.                                                               |
| Key Generation          | 0.01 – 0.02 ms | crypto.getRandomValues() to extract CSPRNG bytes for the key or IV (96-bit IV recommended for GCM).                        |
| AES-GCM + AAD Execution | 0.05 – 0.15 ms | Native crypto.subtle.encrypt hardware pipeline processing the plaintext payload while mixing in the cleartext AAD bytes.   |
