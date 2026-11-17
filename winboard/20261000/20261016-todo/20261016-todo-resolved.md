# TODO, resolved (2026-10-16)

Every entry of `TODO.md` as it stood on main at 2026-10-16 (after #100) that has been built, ruled or otherwise settled, verbatim, under its old heading. Open entries are in `20261016-todo-open.md`; `20261016-todo-resolution.md` lists the consolidated gripes behind both.

The scattered small tasks have their own preplan, ready to start:
`winboard/20261014-low_hanging_fruit/20261014-low_hanging_fruit-preplan.md` (the vault-size
cap, explicit options with a `safebyok/browser` defaults export, the provider surfacing a failed
open, epoch milliseconds everywhere, `mask` in `safebyok/utils`, the boundary audit,
`stale_write` retry, a size budget in CI, the sand below, a docs sweep, the label-grammar
report).

## Open from second_harvest (the Coach, 2026-10-16)

* **Follow-ups**:
  - move `tallyWatches` into `safebyok/testing`, if #52 did not already take it.

## Open from big_feats (2026-10-15)

What the big_feats sprint and its amendments leave open. Each item is its own later thread, so the
Coach can merge the stack and try it first. Already built in the amendments: the `unlock_epoch`
rename ([#84](https://github.com/mrflip/safebyok/pull/84)); a `maxLockboxes` each store declares,
which Postgres also enforces on the server ([#89](https://github.com/mrflip/safebyok/pull/89));
`addPasskey` checking its proof first, and the IndexedDB channel's `unref` and catch
([#88](https://github.com/mrflip/safebyok/pull/88)); `TH.perUser` in `safebyok/testing` and the
package names in CLAUDE.md ([#86](https://github.com/mrflip/safebyok/pull/86)).

* **Audit the VaultDB implementations and grow the standard battery.** `TH.describeVaultDB`
  (`safebyok/testing`) is already the shared suite. Convex, IndexedDB, Postgres and GraphQL each
  import it and run it on themselves, and the core runs it over `localVaultDB(memoryStore())`, the
  test-pony memory store it exports. The thread:
  * audits every adapter against the `VaultDB` contract;
  * moves into the battery whatever each package proves by hand that is really the contract;
  * then simplifies each package's bespoke tests to what is truly its own. Extra testing is fine,
    vacuous testing is not.
* **No null as an error's cause.** IndexedDB's `request.error` can be null on an abort, so a
  failed write's `cause` can be null. Report a calm "the write failed for an unknown reason"
  error instead, and never null.
* **IndexedDB reads only the scope's rows.** `listBoxes` and `eraseVault` read the whole store,
  every user's rows in that database, where a key range over the scope's prefix would do. The
  same thread revisits the bell's BroadcastChannel lifetime (it is `unref`'d since #88, but never
  closed).
* **The vault cap as a soft limit.** The Coach: the app's `maxLockboxes` is an alarm bell for the
  implementor (100 lockboxes may be unexpected) and, for some stores, a hard capacity limit. So
  the vault refuses additions past the app's number, and whether a store also *guarantees* it is
  that store's decision. #89's Postgres machinery is a lot of weight for that: a counter column, a
  trigger, a bundle-row lock on every lockbox insert and erase, and serialization failures at
  stricter isolation. Revisit whether Postgres should guarantee it at all, or simply declare a
  limit the vault enforces. No backward compatibility needed. This matter is under discussion in
  the sprint doc's Open Matters tab:
  <https://claude.ai/code/artifact/5a4d1c6c-b0ef-4483-becd-1a4dde21fc94>.
* **Ruled since** (sprint matters; the rulings note explains each): the passkey HKDF `info` gains
  `vault_id` and the scope, and every derivation and cipher binding was swept for a written field
  left out (thread 1); pnpm's `minimumReleaseAge` is a repo-wide seven-day rule (thread 2);
  `addPasskey`'s function-argument shape is kept as built. The epoch revocation note in
  `notes/security.md` is now part of the revocation matter above, under discussion in the sprint
  doc's Open Matters tab.

## Rulings from gripes_part2 (the Coach, 2026-10-16)

Recorded; no thread needed.

* **`Ckeys` stays public.** Its JSON-tuple encoding is a contract.
* **Old remembered unlocks are swept as now.** "yes, leave as is".
* **`lockbox_too_large` stays its own error kind.** "yes. error messages should be as fine
  grained as reasonable."
* **Adapters written to an old contract fail as they do.** No back-compat before 1.0.

## Roadmapped

### 1. Releases: version, bump, publish all work -- built, unproven

* The Coach's switches before the first release (the sprint's progress file lists them): allow
  Actions to create PRs, the first changeset, the tag ruleset, a token for the Version PR's CI.
* Before `safebyok-convex` joins the lockstep group: `safebyok` becomes its peer (today a
  dependency, so a host could hold two copies and `instanceof VaultError` would fail across
  them; low-hanging-fruit thread 10), and the package gets a publishable `dist/` (2).

### 2. Convex backend, documented well enough to test from another app -- built, unwalked

* **Component packaging**: a publishable `dist/` with `convex.config` and the generated types
  (design.md's open question, still open), and `safebyok` as a peer (1).

### 3. Reservations before the first release: the stored format and the public surface

* **The bundle holds a list of unlock envelopes, not one.** *Built: [#71](https://github.com/mrflip/safebyok/pull/71) (sprint big_feats), with several passphrases; `passphrase_epoch` kept its name (see *Open from big_feats*).* Today: `key_deriver_label`,
  `passphrase_salt_b64`, `vault_key_passphrase_wrapped`. Reserved: `unlocks`, a list of
  `{ method: 'passphrase', key_deriver_label, salt_b64, vault_key_wrapped }`, where a passkey
  envelope later adds `credential_id` and a recovery envelope its own method. The binding's
  purpose string already names the method (`vault_key_passphrase_wrapped`), so each method gets
  its own purpose and nothing already bound changes. `unlock_epoch` stays bundle-wide (it is
  the `versionedUpdate` expectation) and bumps when any envelope changes (renamed from
  `passphrase_epoch`, built). This is what makes fingerprint unlock (8) and recovery
  keys (*Not yet*) additive.
* **Every field the library writes is in the binding** (ruled: if we provide it, it is our
  name on the delivery truck). Additional data is already the queryable-but-tamper-proof
  design: stored outside the ciphertext, rebuilt on read, refused by the tag if altered. Today
  it is a positional array (format, scope, vault id, boxlabel, revision id, purpose). The
  thread's first decision: bind **the whole public header** instead, every stored field but the
  ciphertexts, canonically serialized (`stableJsonify`) as written, before zod fills any default.
  Then every future field is authenticated the day it appears, stripping one is detected, and
  nothing below needs reserving for the binding's sake (the envelope list still does, for its
  shape). If the positional array stays, the fields below are added to it now. Either way a
  backend must store strings as-is, no unicode normalization: the adapter README says so. An adapter's own columns
  (Convex's creation time, a Postgres default, response times) are never in the record or the
  binding; the Convex design already strips them on read, and surfacing them to a host is a
  later additive field on the listing. What no tag gives is verification while locked: a signed
  listing would need a vault signing keypair, and it is additive later, so it is not reserved.
  *Built for lockboxes in [#97](https://github.com/mrflip/safebyok/pull/97) (sprint matters,
  thread 1), which binds the whole public header. The `whisper_codec` and `public` bag
  reservations remain, and are bound automatically once they enter the schema.*
* **Every time is UTC epoch milliseconds, an integer** (ruled; now in STYLE.md; **built**,
  second_harvest thread 6, with the two bullets below it): stored
  records, the snapshot, the device record, the Convex columns, the demo's own records. The
  low-hanging-fruit `epoch_millis` thread does the code outside the stored records; the records
  switch here, with the rename below, since the old fields go anyway.
* **Timestamps named for the event, as epoch-millisecond integers, and only three** (built). Lockbox
  `registered_at` (first stored through the library; carried forward) and `changed_at` (ruled
  the stronger contract: it moves only when the serialized whisper differs; `store()` decrypts
  the previous whisper, which it already fetches, compares the serialized forms, and carries
  `changed_at` forward when they match while still writing a new revision; a previous record
  that will not decrypt is clobbered and counts as changed; `notes/security.md` records that a
  `changed_at` standing still across a write tells the backend two consecutive payloads were
  equal, one bit, only when a host re-stores identical content); bundle `registered_at`. Today's `created_at`/`updated_at` go: `updated_at` bumps on every
  store whether or not the contents changed, so it is a row fact under a content name, and the
  bundle's is redundant with the unlock epoch. The lockbox's ISO strings and the device
  record's epoch numbers become one convention (integers, which the clock seam already yields
  and any index sorts).
* **The device record's deadline is named for its consequence** (built): `expires_at` becomes
  `ask_passphrase_at` (see 4). Local-only, so this one is cheap at any time.
* **A vault has a size cap, mirrored on the adapter** (low-hanging-fruit thread 1 builds it;
  listed here because it is a surface to settle before the release). Today nothing caps how
  many lockboxes a vault holds, and on Convex listing, watching and erasing each read the whole
  vault in one 16 MiB transaction (erase reads it twice): past about 150 of the largest default
  lockboxes a vault cannot be erased, so "delete my account" fails, and every write re-lists a
  vault that only grows. The pattern already used for `maxWhisperBytes` against
  `maxRecordBytes`: `openVault` takes `maxLockboxes` (default 100, the host raises it freely),
  the adapter declares `maxVaultBytes` (Convex: 8 MiB, half its read budget; IndexedDB and
  local: Infinity), and `openVault` refuses as `bad_option` when `maxLockboxes` times
  `maxWhisperBytes` exceeds it, so raising either knob keeps the erase guarantee. `store()` of a
  new boxlabel at the cap refuses as `vault_full`, a condition the user can act on. A batched
  erase is not needed once the cap holds, and would leave list and watch unbounded anyway.
* **Surface names that are breaking after `0.1.0` and free before it**: `keyDeriver` required
  (low-hanging-fruit thread 2); `rememberForMs` -> `forcePassphraseReentryHours` and the
  snapshot's `expiresAt` -> `askPassphraseAt` (the field names ship now even if the shut timer
  comes with 4); and a decision on `safebyok/idb` (*settled: it moves before the release, [#77](https://github.com/mrflip/safebyok/pull/77)*): if `idbVaultDB` is to move to its own package
  (*Side quests*), either it moves before the release or `safebyok/idb` keeps re-exporting it
  forever. `store()` and `openVault` already take bags, and error kinds are additive, so those
  need nothing.

### 4. Coherent documentation

So the Coach can tell other people about this. One thread, after 1, 2 and 3 land, since all
three change what the documents say:

* **Promote the README**: `whiteboard/20261013-relic/proposed-README.md` becomes
  `packages/safebyok/README.md` (the npm page), corrected to the surface as built: the storage
  verbs, the error table with `whisper_too_large`, `bad_option`, `stale_write` and the adapter
  kinds, zod as a peer, `safebyok/browser` for the defaults, the screen-lock recipe, the
  no-recovery warning. The root README is the front page: what it is, the package table
  (core, react, convex), where to start.
* **An adapter author's guide** (in the core README or beside it): the `VaultDB` verbs, which
  two vary by store family (listing boxes: a prefix scan, an index, a WHERE; change
  notification: reactive query, LISTEN/NOTIFY, polling), the shared adapter test suite and how
  to run it against a new backend, `maxRecordBytes`, what an adapter must never log.
* **`notes/security.md` refresh**: entries that are mid-rename or pre-release (the release
  trigger, `rememberForMs`), plus the ones the sprints owe (versionedUpdate atomicity per
  adapter, the Convex tables).
* **VOCABULARY.md** checked line by line against the exports.

### 6. hash-wasm as a pluggable KDF -- built, [#74](https://github.com/mrflip/safebyok/pull/74)

Depends on low-hanging-fruit thread 2 (`keyDeriver` required, so noble tree-shakes out when
another deriver is passed). A package (`safebyok-fastkey` or so) exporting one KeyDeriver
over hash-wasm's Argon2id, with hash-wasm as its dependency and safebyok as a peer; the core
keeps noble as the default in `safebyok/browser`, since it runs everywhere with no setup.
Caveats:
- It carries the same label, `argon2id_web_v1`, and hardcodes the same parameters from
  `Argon2idWebV1`; the label is the whole contract and the parameters are never host-configurable,
  or vaults written on one device stop opening on another.
- A test derives one fixed passphrase and salt through both implementations and compares bytes.
  That test is what makes "same spec" a fact.
- Hermes has no WebAssembly, so this package does not serve React Native; that needs a native
  Argon2 binding behind the same label.

### 7. zod/mini and a tree-shaking audit -- built

Depends on low-hanging-fruit thread 8 (the size budget, [#42](https://github.com/mrflip/safebyok/pull/42), merged: it is the before-and-after). Measured
before: zod classic is about three quarters of every bundle (183 KB raw), and it does not
tree-shake because the schemas are built at module top level in a shared chunk; even a bare
`stableJsonify` import drags all schemas. The thread: move the core's schemas to `zod/mini`
(same runtime core, interoperable with classic; chained authoring becomes `Z.string().check(...)`
and error strings become per-check params), then audit: `sideEffects: false` is true, nothing
runs at module top level, each entry pulls only what it uses, and the budget limits drop to match.
Report what zod/mini cost in authoring clarity; if it is more than the bytes are worth, say so.

Built (second_harvest thread 1, `winboard/20261015-second_harvest/thread-1-zod_mini.md`):
every entry fell by about 14 kB brotlied, and a bare `stableJsonify` from 25 kB to 2.3 kB, no zod
in it. A host's label policy (*Pluggable label validator*, below) should be typed as
`Z.core.$ZodType`, so a classic or a mini schema both fit.

### 8. Fingerprint unlock (passkeys, hardware keys) -- built, [#76](https://github.com/mrflip/safebyok/pull/76)

The WebAuthn PRF extension yields 32 bytes per credential; `importWrappingKeyBytes` turns them
into a wrapping key. With the envelope list reserved in 3, this is additive: a second envelope
with method `passkey`, its `credential_id`, and its own binding purpose, plus a
`notes/security.md` entry on what a credential-held key does and does not protect against. The
WebAuthn call lives in the host or the React binding, never in the core: the core takes bytes.
Depends on 3 and 5 (the unlock path) and on 4 (the README has to explain it).

## Side quests

* *Built, [#77](https://github.com/mrflip/safebyok/pull/77):* **The IndexedDB vault store as its own package**, `safebyok-indexeddb`: the documented
  example of a KV-store backend, "duplicate this and type here, here and here", with its own
  tests, tsdown config and changeset, so it is the template for packaging as much as for the
  adapter. `idbDeviceDB` stays in the core (`safebyok/idb`): the device store is a fact about the
  device, not a backend choice. Duplicating the bell and BroadcastChannel plumbing (about forty
  lines) is fine: a template wants to be self-contained. After the core move and storage_verbs.
* *Built, [#73](https://github.com/mrflip/safebyok/pull/73):* **Postgres vault store**, `safebyok-postgres`: the example of a SQL backend; `versionedUpdate`
  is an `UPDATE ... WHERE revision_id = $1`, listing is a `WHERE`, subscribe is `LISTEN/NOTIFY`
  or polling. It earns Supabase nearly for free (Postgres plus row-level security as the
  `getUserId` equivalent, PostgREST as the wire, and Supabase realtime for subscribe), as a
  second thin package or a section of this one. The discipline question is only where the
  functions run: Convex hosts them (the component's queries and mutations are the whole backend,
  deployed with the app); a bare Postgres has nowhere to run them, so the host owns a route
  layer and the package is the SQL plus the route recipe. Supabase gives Postgres that function
  layer back, which is why it is nearly free.
* *Built, [#77](https://github.com/mrflip/safebyok/pull/77):* **IndexedDB `versionedUpdate` truly atomic**, inside one IndexedDB transaction (idb-keyval's
  `update()`, throw-to-abort mapped to `stale_write`), closing the window `notes/security.md`
  records. After storage_verbs.
* *Built, [#78](https://github.com/mrflip/safebyok/pull/78):* **A GraphQL vault store** (urql): listed because the Coach asked; it is not actually easy.
  Subscribe and `versionedUpdate` depend on a schema we do not own, so it needs resolvers on
  the host's GraphQL server as well as a client, and no host's existing schema has our tables.
  Do the REST one first; GraphQL is the same recipe with more ceremony.

## Soonish

### Pluggable label validator

A host chooses its own label grammar. Waits on the low-hanging-fruit report of what depends on
the current strictness (storage ckeys, the cipher binding, the Convex tables, the React package);
the seam is likely an `openVault` option with the current `parseLabel` as the default. The report
([#35](https://github.com/mrflip/safebyok/pull/35)) found the colon is the one character the
storage ckeys cannot take: they join applabel, user id, vaultlabel and boxlabel with `:` as plain
concatenations, so a label holding a colon collides with another scope or hides a box. **The
Coach's ruling: a pluggable label validator must also provide a label-tuple stringifier that
handles the `:` issue** -- the validator and the stringifier come as one pair, so a host that
widens the grammar also says how the tuple becomes a ckey. The current `:`-join stays the default
pair's stringifier, so every stored ckey keeps its shape.

### Validating the user id

`VaultScope.user_id` comes from the host's auth and is free-form today: any non-empty string, no
grammar, deliberately not a Label. **The Coach's ruling: it gets some manner of validation, and
the validation is replaceable** -- a default check (a length cap, no control characters, and
whatever the ckey stringifier above needs) that a host can swap for its own auth provider's id
shape. Same seam family as the label validator; decide them together.

### A lockbox row that breaks the listing locks the vault out

Found by [#87](https://github.com/mrflip/safebyok/pull/87)'s review: a stored lockbox row that
fails the listing's check (not JSON, a malformed note or timestamp) makes `listBoxes`, so every
`refresh()` and every `openVault`, throw `corrupt_record`. With no handle, neither `erase()` nor
`destroy()` can reach it; the only way back is clearing storage by hand. Decide: should the
listing skip a bad row, or list it marked as damaged so `erase()` can remove it (and the snapshot
can show it)? Either way, `erase()` should not report `corrupt_record` after its own delete has
landed because a different box broke the refresh that follows.

### Others

* **CI questions left by [#72](https://github.com/mrflip/safebyok/pull/72)**:
  - `justify:root` is defined and never used;
