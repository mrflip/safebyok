

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

We receive a vault record for every vaultDB op touching a vault (a vault, a thing in that vault, a listing). In the case of a vault op, it's the same as the vault itself, maybe.

On receipt of an answer:

* Place errors and conditions in the correct pipeline
* dispatch errors so severe the world can't be updated
* conditionally terminate, remove and clean up the vault (vault_gone)
* conditionally lock (ident changed, wayins changed)
* ...fill the rest of this in: things that are not true for other storables

If conditions are met:
* edit the record -- causes these things to happen
  - edit the local copies
  - updateSnapshot: if snapshot will change, make a new one and #replaceSnapshot (sets prop and sends to listeners)

Players:
* world (vault + bank):
  - provides a clock
  - carries listings
  - knows the vault scope and its epochs
  - knows vault states: locked/unlocked; fresh/stale; autolocking or not
* listing:
  - holds listed

I want to serve the react case and the non-react case: I can fiddle around
with the innards of sidecar and whisper

Listing boxes populates sparse records (without the encryptedWhisper or sidecar).
It would be pleasant for those objects to (a) be instances, (b) retain their
identity through updates, (c) hydrate in place, (d) manage local updates,
optimistic updates and ground truth (latest observed stored values)

Getting a box creates a live instance that guards the data. Triggered locally, via timer, or via subscription, a signal may come in to lock or evict the vault:

* if the vault is locked, boxes should stop showing secrets;
* if the vault is evicted, everything stops showing any data and disappears
* (an intermediate verb might have boxes remove their encryptedWhisper and sidecar but preserve the listing)

Whisper is anything JSONable. It is AES-GCM encrypted by a key that never leaves the device, sealed with the metadata. It may only be accessed while the vault is present and unlocked.
Sidecar is an object. It is visible even if the vault is locked.

* `ifAbsent`:  'create', 'fail', 'nil'
* `ifPresent`: 'replace', 'fail', 'fetch'
* `maxMillisSinceRefresh`, `maxWorldMillis`

* A listing is a map of live instances, and offers batch gets `listing.hydrateAll()`. Hydrating a record does not change its identity, only populate the missing fields.

* `thingListing.make(props)` constructs a thing. Don't call `new Thing()`
* `thingListing.at(scope): Thing | null` -- cached value

* `thingListing.fetch(scope, opts): Thing` (with `ifAbsent: 'nil'`, returns `Thing | null`)
* `thing.hydrate(opts)` if stale, fetches and caches; returns the cached value. Calls to hydrate are joined oneAtATime (only one call is pending at a time, all callers receive its result)
* `thing.send(props, opts)` hydrates, modifies, and db.puts the sealed record
* `thing.edit(props, opts)` async, edits the local state and settles side effects
* `thing.del(opts)` async, deletes the remote value
* `thing.deconflict(mediatorFunc, opts)` -- becomes timely, calls mediator with `{ stored, cached, current }`, then `modify`s with the result if non-blank.

* `vault.getBox(boxlabel): Box | null` (and tryGetBox)
* `box.unsealWhisper(opts): Whisper` on the instance unseals the whisper temporarily and returns it, storing nothing in the box (the customer can do what they wish).
* `box.expose(boxlabel, opts): void` unseals the whisper, stores in a private variable and offers it with a public getter on the box. (it's the customer's decision, and if we don't write it some will, but without the guard). On lock, a sentinel symbol is returned in place of the whisper prop
  - `box.get/set whisper(val)`: accesses private variable #whisper if exposed. returns `LOCKED` symbol if locked.
* `box.reseal(opts)` hydrates, unseals, then reseals that with its current metadata, updating encryptedWhisper
* `box.edit({ whisper?, sidecar? }, opts)` replaces the sidecar (if given) and seals the whisper (if given or exposed); with opts.reseal, if nothing is given or exposed it will reseal (hydrate, unseal, seal)
* `box.put({ whisper?, sidecar? }, opts)` becomes timely, modifies, then stores the sealed box record

Internally
* `#stored`
*

Meanwhile, there may be updates or tombstones from other devices or tabs coming in.
To any extent we allowed staged edits, remote updates must not overwrite them.
You must invoke a put() operation of some name to send the box deliberately.

`put`ting a box involves serializing and encoding the whisper to plaintext,
making keys, encrypting the plaintext bound to our metadata, so call it 15-45 ms.
Because we're doing CAS versioned updates, fast serial writes would require optimistic
local updates or some sort of hairy queue (so that I can chain each one)

| type  | immutable                                 | version        | hydrated                 |
| ----- | ----------------------------------------- | -------------- | ------------------------ |
| Vault | scope props, `registered_at`, `vault_tok` | revision props | `gate_epoch`, `gate`     |
| Box   | scope props, `registered_at`              | revision props | whisper props, `sidecar` |

Vault scope:    `applabel`, `user_id`, `vaultlabel`
Box scope:      `applabel`, `user_id`, `vaultlabel`, `boxlabel`
Vault revision: `format`, `revision_tok`, `revision_seq`, `written_at`
Box revision:   `format`, `revision_tok`, `revision_seq`, `written_at`, `box_key_wrapped`
Whisper:        `whisper_schema_version`, `whisper_codec`, `whisper_ciphered`

Performance & Overhead Breakdown

To perform JSON.stringify, generate a cryptographically secure key, and execute AES-GCM encryption with Associated Data (AAD), the total execution time on an iPhone 13 class browser will be roughly 0.15 to 0.45 milliseconds.


| Operation               | Estimated Time | Driver of Performance                                                                                                      |
| ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| JSON Serialization      | 0.05 – 0.15 ms | JSON.stringify on your medium-sized object + metadata. V8/JavaScriptCore highly optimizes this into native memory buffers. |
| Text Encoding           | 0.01 – 0.03 ms | TextEncoder.encode() converting strings to Uint8Array views.                                                               |
| Key Generation          | 0.01 – 0.02 ms | crypto.getRandomValues() to extract CSPRNG bytes for the key or IV (96-bit IV recommended for GCM).                        |
| AES-GCM + AAD Execution | 0.05 – 0.15 ms | Native crypto.subtle.encrypt hardware pipeline processing the plaintext payload while mixing in the cleartext AAD bytes.   |
