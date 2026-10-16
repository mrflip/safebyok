# Security: decisions to look at

Describe decisions here that, in your judgement, could merit closer security review, or could
interact with later decisions to create a security issue. Do not justify why they are, or are not,
concerning; do not predict what might heighten concerns. Instead, in a sentence or so, brief a
security expert who knows what questions to ask.

## Of Interest

* 2026-10-16: `describeVaultDB` now races every compare-and-write line (VAULTDB.md, 3.1 to 3.5, 3.7,
  4.5) from two devices, holding one before each of its round trips while the other moves
  (`raceEveryWay`, a turnstile the adapter's test factory wires into its client). What it shows: no
  check is split from its write across round trips or awaits, and no in-process lock or queue
  makes the devices take turns. What it cannot: split one round trip. Every in-tree backend under
  test runs one call at a time, which is the real promise of Convex's mutations and of IndexedDB's
  readwrite transactions, but not of Postgres at READ COMMITTED, whose statements run at once: the
  atomicity of `postgresVaultDB`'s one-statement writes under concurrent connections is reasoned
  (thread 11's verdict), not tested. The self-tests that prove the races catch a broken adapter
  run over an in-memory backend, not over each real one. Separately, `postgresVaultDB` now calls a
  subscriber once as its listen begins (6.1), so a vault reads a write that landed while its watch
  was starting, which it missed before.
* 2026-10-16: **the `vault_key_epoch` expectation** (`VAULTDB.md` line 3.8). Every lockbox carries
  the `vault_key_epoch` of the vaultKey its lockboxKey is wrapped under (bound into both its
  encryptions with the rest of its header), and `updateBox` lands only while the scope's standing
  bundle has that epoch, compared by the adapter in the same atomic step as `vault_id` and
  `revision_id`; the base class refuses a lockbox whose own epoch is not the expected one. This is
  the only thing that stops a device still holding a replaced vaultKey, which has not looked at
  the bundle since, from sealing a new whisper under it: `store()` does not read the bundle first.
  An adapter that skips the comparison lets that device write a lockbox the replaced vaultKey
  opens. `localVaultDB` compares it now; IndexedDB, Convex, Postgres (and GraphQL through it) do
  not yet, and the battery holds them to it as a pending test until they do. Every vault is at
  epoch 1 today: nothing replaces a vaultKey yet. Erases name no epoch. A lockbox whose epoch is
  not the bundle's reads as `damaged_lockbox`, its key never tried.
* 2026-10-16: **the rollback check.** Each device keeps a device mark per scope in its deviceDB:
  the vault's `vault_id` and the highest `unlock_epoch` and `vault_key_epoch` it has seen the
  bundle at, raised on every read of a newer bundle and after its own writes. A bundle of the same
  `vault_id` at a lower `unlock_epoch`, or a lower `vault_key_epoch`, is refused as `rolled_back`
  at open, unlock, every change to the ways in, and
  every refresh, before anything is taken from it; a vault unlocked when it meets one stays as it
  stood. Its reach: only a device that saw the newer bundle, and only while its local storage
  lasts (clearing site data, a damaged mark, or another `vault_id` -- a vault made anew -- starts
  a new mark). Its blind spot: bundles cannot be ordered across `vault_id`s, so storage serving an
  old, destroyed vault in place of the current one is not caught, nor is anything on a device
  that never saw the newer bundle. A mark holds one vault per scope, so storage that hands back
  another vault's bundle even once moves the mark to that vault, and an older copy of the first is
  then taken as it stands. `unlock_epoch` is bound into no encryption, so storage can serve an
  older bundle under a raised `unlock_epoch`; but `vault_key_epoch` is bound into every envelope
  and held equal to the bundle's, so storage cannot raise it on an older bundle and still have a
  way in open, and the mark refuses one at a lower `vault_key_epoch` whatever its `unlock_epoch`:
  a bundle from before a rotation, and with it the vaultKey the rotation replaced, is caught even
  so. What still passes is an older bundle at the same `vault_key_epoch` under a forged higher
  `unlock_epoch`: it can bring back only a way in `removeUnlock` dropped, or a passphrase
  `changePassphrase` replaced, which still opens only the vaultKey the vault stands under, never a
  replaced one. (A device that opens such a bundle through its remembered unlock opens no envelope:
  it takes the vaultKey it already held, and lists the older copy's ways in.) The way out of a
  refusal is the host's: it erases the device's mark (`deviceDB.eraseMark(scope)`) and opens again,
  taking the older copy as it stands, the core README's recipe. The README has the host decide that
  from its own knowledge of a restore, never from the user's answer: storage that rolls back on its
  own would ask the user the same, and the user cannot tell the two apart. `destroy()` and
  `eraseDamagedVault` erase the mark. Two tabs of one device
  each read and write the mark without a lock, so a tab that read an older bundle before the
  other tab's newer one can write the mark back down: the check weakens to the older epoch. A
  bundle is held to the mark as read before the bundle itself, so a newer bundle that another tab,
  or this one, landed while it was being read never passes for a rollback: against storage whose
  reads see every write landed before them, the check never refuses wrongly. Within a bundle, an
  envelope whose `vault_key_epoch` is not the bundle's is passed over as damaged
  (`damaged_unlock`), so an envelope spliced in from an older bundle never hands over its vaultKey
  as the current one.
* 2026-10-16: **`device_id`.** Every unlock envelope carries the `device_id` of the device that
  added it, and its `registered_at`, both in its header and so bound into its wrap (and, for a
  passkey, its HKDF `info`), and kept when the envelope is sealed anew. The id is a random UUID
  (`crypto.randomUUID`) a device mints for one vault the first time it reads or makes it, kept
  only in its device mark: never derived from the device (no fingerprinting, hardware or
  advertising identifier, no user-agent label), and one per vault per device, so the server learns
  which envelopes one device added to one vault and nothing more -- no link between a user's
  vaults, or between users on one device. It is visible to the server in the clear. No
  user-chosen device label is stored. Clearing site data mints a new id; envelopes keep the old.
* 2026-10-16: the record formats moved on with these fields (`safebyok-vault-v2`,
  `safebyok-lockbox-v2`, and the new `safebyok-mark-v1`), and each binding's first part with
  them. No vault written before reads: its bundle is `damaged_bundle`, and `eraseDamagedVault`
  recognizes `safebyok-vault-v1` as an older format, not a possibly newer one, so it clears such a
  vault rather than asking the user to update the app.
* 2026-10-16: the VaultDB contract (`packages/safebyok/VAULTDB.md`, line 4.2) makes a storage
  adapter's lockbox limit a best effort: writes made one after another never pass it, but writers
  racing for the last places may take a vault a few past it, and a client that bypasses the
  library (a modified browser) is the host's to meter, as an abuse quota, not the adapter's to
  stop. An adapter may offer a hard limit only as an opt-in. The vault's own `maxLockboxes` is
  enforced in the client alone. Postgres today holds a hard limit on the server (#89); the next
  thread replaces it with this best effort.
* 2026-10-15: a lockbox row that fails the listing's check (not JSON, a malformed note or time, a
  record naming another boxlabel than the ckey it sits under, an unknown `format`) is listed as
  `{ boxlabel, damaged: true }` instead of making `listBoxes` -- so every `refresh()` and
  `openVault` -- refuse `corrupt_record`. The boxlabel comes from where the row is stored (a
  `VaultDB`'s `doListBoxes` now hands up `{ boxlabel, lockbox }` pairs; the in-tree adapters read
  it from the ckey, Convex from its column), never from the damaged record, and nothing else of
  the record reaches the snapshot. A row whose boxlabel or note the vault's `validators` refuse --
  stored under other checks, before a host narrowed them -- lists as damaged too, and `erase()`
  reaches it by its stored name: for a box that already stands, erase checks the boxlabel only as
  text (the ckey it rebuilds is still this scope's own). So the snapshot carries a damaged box's
  boxlabel as stored, text the host's check refuses: one who can write storage can put any text
  there, as a name a host renders. `store()` checks every boxlabel against
  the host's check, so it refuses a refused name (`bad_label`, writing nothing) even over a box
  standing under it; over a box whose note alone is refused, it writes afresh. `store()` over a
  lockbox whose record fails validation (any listed as damaged, and one whose ciphered fields are
  missing or malformed) now erases it (`eraseBox`, expecting only the `vault_id`) and then writes
  a fresh lockbox expecting no revision, carrying neither its note nor its `registered_at`; two
  steps, so a failure between them leaves the box erased. Since that erase names no revision, it
  also removes a sound lockbox another device stored under the boxlabel after this store read the
  damaged one (this store's write then stands in its place, as a retried store's would, but should
  the write fail, neither stands), and an erase of the damaged box elsewhere does not stop this
  store. What one who can write storage could already do -- erase or replace any row -- is
  unchanged; what is new is that planting junk under a boxlabel shows the user a damaged box where
  a refused open used to show, and that the user's next `store()` to that boxlabel clears the junk
  rather than refusing. `read()` and `use()` still refuse a damaged box.

* 2026-10-15: `erase(boxlabel)` removes a lockbox whose stored record fails validation or
  verification (`corrupt_record`), rather than refusing it: it reads the record only to tell an
  absent box (`absent_box`) from a present one, and a damaged record counts as present. It still
  needs the vault unlocked, still names the boxlabel the caller gave, and still lands only in the
  vault this device holds keys for (its `vault_id` expectation). `read()`, `use()` and the
  background refresh still leave a damaged record in place; only an explicit erase of that
  boxlabel deletes it.
* 2026-10-15: a scope's `user_id` is text of 1 to 100 characters (`UserId`), checked at
  `openVault`, by every `VaultDB` verb, and in every stored record that names a scope; a refusal
  names the bound and never quotes the id. The Convex component's validators and its `getUserId`
  check do not bound it themselves: the client's `VaultDB` refuses a longer one before a call is made.
* 2026-10-15: `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (seven days, in minutes) and
  `minimumReleaseAgeStrict: true`: pnpm resolves and installs nothing, transitive dependencies
  included, younger than that, and fails rather than fall back; the frozen-lockfile install in CI
  verifies the lockfile against it too. Its exceptions are `minimumReleaseAgeExclude` entries,
  each by name and exact version, each listed here until removed (PROCESS.md, *Dependencies*).
  Adding the rule re-resolved the whole lockfile (the old one held 51 entries under seven days
  old) and lowered the floor of nine direct dependencies' ranges to releases that had aged (the two hand
  pins on `graphql-yoga` and `@graphql-tools/schema` became ranges again: the rule now does what
  they did). Dependabot's `cooldown` is 7 days to match.
* 2026-10-15, **exception, remove once past 2026-10-16T23:01Z**:
  `minimumReleaseAgeExclude: convex-test@0.0.61` (`safebyok-convex`'s test dependency, pinned
  exactly; published 2026-10-09T23:01Z, so it ages past seven days at 2026-10-16T23:01Z). Not a
  security fix: 0.0.61 is the first release with `defineTestApp`, which the Convex tests already
  use, and 0.0.60 fails them. Development-only, never shipped. Revisit: once it has aged, delete
  the exclusion and make the pin a `^` range again.
* 2026-10-15: `mask` (`safebyok/utils`) takes a whisper and returns text meant for display: its
  first and last few characters (two and four by default, at the caller's choice) and, up to
  `maxLen` (15 by default), its length. Beyond `maxLen` the result is fixed-width
  (`head***...***tail`), or `maxLen` stars when even that does not fit, so the length stops showing;
  a `head` and `tail` large enough to cover a short whisper show it nearly whole, and `minStars: 0`
  shows a short one entirely. It makes the whisper safe to butcher (normalize and strip the whole
  input), butchers it, and then checks the result is safe by passing it through the same stripping,
  so every result, even the stars, is free of combining marks, control, format, surrogate,
  private-use and unassigned code points, spaces, ignorable code points, bidirectional controls and
  direction marks, and the symbols drawn blank or as a box (U+2800, U+1D159, U+FFFC); it is one
  plain line that cannot hide or overwrite anything. Right-to-left letters and numbers are kept (the
  Coach's ruling: strip the direction markers, not the scripts), so a mask may reorder neighbouring
  neutral characters, such as stars and punctuation, in a display; with no controls in it, it cannot
  do worse. `mask` is meant for plain text, and arbitrary blobs may give unusual behavior. `head`,
  `tail` and `minStars` are capped at 1000, so no option makes it build an unbounded string. It
  throws `bad_option` or `bad_whisper` without quoting its input.
* 2026-10-14 (revised 2026-10-15 for the push-to-main workflow): the package is staged on npm by
  `.github/workflows/release.yml`, run on every push to main (when the Coach has merged the Version
  PR, and a version npm lacks is waiting), authenticating by npm's trusted publishing (OIDC, no
  stored token) from the `npm` environment, with provenance. The `pack` job runs `pnpm justify`
  (lint, typecheck, tests and the build) before `publish`, which runs no package's scripts. A
  maintainer's 2FA approval makes the staged version public; CI cannot give it.
* 2026-10-14: the npm trusted publisher allows `npm stage publish` and `npm dist-tag`, and not
  `npm publish`. A run of the release workflow can therefore repoint a dist-tag (`latest`,
  `next`) at any version already public, with no 2FA approval; the workflow does not run
  `npm dist-tag` today.
* 2026-10-14: `pnpm-workspace.yaml` allows one dependency's install script to run:
  `unrs-resolver` (a native module resolver, pulled in by `eslint-import-resolver-typescript`, a
  development dependency only).
* 2026-10-14: every action in `.github/workflows/` is pinned to a full commit SHA, with the
  release it was resolved from in a trailing comment (`@3d3c42e... # v7.0.1`). Dependabot's weekly
  `github-actions` group proposes new SHAs, and rewrites the comment with them.
* 2026-10-14: the cryptography landed, replacing the plaintext stub. The stub's stored formats
  (`byok-stub-vault-v0`, `byok-stub-unlock-v0`) are not read by the new code: they existed only
  in the demo and were never published.
* 2026-10-14: Argon2id (the pinned `argon2id_web_v1` spec) runs through `@noble/hashes` -- pure
  JS, no WASM; the library's one audit (Cure53, January 2022, at 1.0.0) left its `argon2` out of
  scope, as its README says, so the Argon2id itself is unaudited -- at about half a second per
  derivation in V8. AES-256-GCM encryption, key wrapping and randomness come from WebCrypto
  (`crypto.subtle`, `crypto.getRandomValues`).
* 2026-10-14: the key deriver is a seam (`OpenVaultOpts.keyDeriver`): the pinned Argon2id deriver
  was the default until 2026-10-15 (below), tests substitute a cheap SHA-256 deriver, and a
  stored vault records its deriver's label and refuses to unlock under any other.
* 2026-10-15: `openVault` has no default key deriver: `keyDeriver` is required, and
  `browserOpts()` (the `safebyok/browser` entry) supplies the pinned Argon2id one. An app that
  passes none is refused with `bad_option`, never quietly given one. `openVault` imports no
  Argon2id and the main entry nothing from `safebyok/browser`, but the main entry still
  re-exports `argon2idWebV1Deriver`: Argon2id stays out of an app only where a bundler
  tree-shakes it (the package is `sideEffects: false`), not under a plain `require('safebyok')`
  or an unbundled import. Substituting a deriver still commits every vault made under it to its
  label, as above.
* 2026-10-14: every encryption binds its context as AES-GCM additional data
  (`cipherAdditionalData`): format, applabel, user_id, vaultlabel, vaultId, plus unlockEpoch
  for key wraps (since 2026-10-15, the device record's only: an unlock envelope binds its own
  header instead, below) and boxlabel + revisionId for lockboxes, encoded as a JSON array. Ciphertext
  moved between users, vaults, boxes or revisions refuses to open. (Widened 2026-10-15 to every
  field each record writes: the sweep entry below.)
* 2026-10-14: a wrong passphrase is learned from the vaultKey envelope's AEAD failure, never a
  comparison; there is no separate passphrase verifier field.
* 2026-10-14: the localUnlockKey is a non-extractable WebCrypto key persisted only by structured
  clone (IndexedDB, `safebyok/idb`); the vaultKey handle a vault holds between operations is also
  non-extractable. The operations that must wrap the vaultKey (device-remember at unlock, the
  re-wrap in changePassphrase) unwrap a separate extractable transient from the same envelope and
  drop it on return; the remembered-unlock path makes no extractable handle at all.
* 2026-10-14: a stored record that fails validation or AEAD verification is refused with kind
  `corrupt_record` and left in place -- remote data is never auto-deleted. A device-local
  remembered unlock that fails is the one exception: it is dropped, and the user asks again.
* 2026-10-14: the demo app calls Anthropic directly from the browser with the user's own key
  (`dangerouslyAllowBrowser: true` on the SDK client), by design: the key is decrypted on-device
  inside `vault.use(...)` and sent only to `api.anthropic.com`.
* 2026-10-14: `safe-stable-stringify` is a runtime dependency: `stableJsonify`
  (`src/stable-jsonify.ts`) is a thin alias of it, backing snapshot change detection and the
  comparison that decides whether a lockbox's `changed_at` moves (below).
* 2026-10-14: `zod` moved from a regular dependency to a peer dependency (`^4.0.0`): the host app
  supplies it, so safebyok validates with whatever zod instance that app ships.
* 2026-10-15: storage writes are versioned updates (`VaultDB.updateBundle`, `updateBox`). A
  bundle update carries the `vault_id` and `unlock_epoch` it was proven against, and lands
  only while the standing bundle has both. A lockbox update carries the `vault_id` its whisper
  was sealed for and the `revision_id` it read (or null for none), and lands only while the
  scope's standing bundle has that `vault_id` and the standing lockbox that `revision_id` (or
  there is none); a scope with no bundle refuses. A failed expectation refuses with kind
  `stale_write`, writes nothing, and `store()` / `changePassphrase()` / `erase()` / `destroy()`
  surface it on the first failure, with no retry. Erases (`eraseBox`, `eraseVault`) carry a
  `vault_id`-only expectation (the Coach's ruling): they land only while the scope's standing
  bundle has that `vault_id`, refuse where no bundle stands, and expect no revision, so within
  its vault an erase wins over a concurrent update; erasing an absent lockbox is quiet. The
  atomicity of check-and-write is each adapter's: `localVaultDB` checks and saves in one
  synchronous step; the Convex component checks inside the transaction of the mutation that
  writes (below).
* 2026-10-15: `idbVaultDB` performs its versioned updates, its erases and `createBundle` as a
  read, then a separate write, in separate IndexedDB transactions: another tab writing in
  between can still be buried, two tabs can each create a bundle, and a vault another tab
  destroys and makes anew in between can still lose a lockbox (`eraseBox`) or be erased whole
  (`eraseVault`). Its `eraseVault` also lists the vault's rows in one transaction and deletes
  them in another: a lockbox another tab writes in between survives the erase, orphaned without
  a bundle. Doing these inside one IndexedDB transaction is a ruled TODO, not yet built. (Built
  when the store moved to `safebyok-indexeddb`: see the entry on it below.)
* 2026-10-14: a lockbox's ciphertext length reveals its whisper's length to the backend: there is
  no padding yet (TODO). `store()` refuses a whisper over `maxWhisperBytes` of JSON, an
  `openVault` option defaulting to `MaxWhisperBytes` (40444), checked on write only.
* 2026-10-14: `changePassphrase` re-wraps the vaultKey under the new passphrase but does not
  rotate it, so a superseded bundle plus its old passphrase still yields the current vaultKey,
  with no expiry. The Convex adapter (`packages/safebyok-convex`) keeps no bundle history, but
  Convex's own backups and snapshot exports retain superseded bundles for as long as they are
  kept.
* 2026-10-14: `pnpm-workspace.yaml` denies `esbuild`'s install script (`esbuild: false`); esbuild
  arrives with `convex` and vite, and runs from its platform binary package without it.
* 2026-10-15: a session holding keys for a vault since destroyed or recreated elsewhere cannot
  write a lockbox into the successor, erase one of its lockboxes, or destroy it: `store()`,
  `erase()` and `destroy()` no longer look at the bundle first, and rely on the `vault_id`
  expectation, checked by the backend, to refuse. A refused `destroy()` has already forgotten
  this device's remembered unlock; a second `destroy()`, now holding the successor's `vault_id`,
  erases the successor. On a vault the handle has never seen created, `destroy()` erases only
  the device-local record: lockboxes orphaned without a bundle are not reached.
  `changePassphrase()` and `unlock()` re-read the bundle first, as they must to prove the
  passphrase against it. An unlock changed elsewhere (a passphrase or passkey added, removed or changed) does not stop a stale session's
  `store()` or `erase()` (their expectations carry no epoch); the session relocks on its next
  look at the bundle.
* 2026-10-14 (the option was named `rememberForMs` until its rename on 2026-10-15): the unlock
  window (`forcePassphraseReentryHours`) is chosen by the app at each `openVault`, so two devices on
  one vault may hold different windows. It is client-side politeness, not a vault-wide synced
  policy: nothing stored enforces it across devices, and a modified client could choose any window
  it likes. The real bounds stay the passphrase and the device-bound localUnlockKey.
* 2026-10-15 (revised the same day by clean_times; the cap and the timer since 2026-10-16, by
  locks_and_expiry, below): a host may let a device stay unlocked
  indefinitely, by passing `forcePassphraseReentryHours: Infinity` (or any huge number); that is the
  host's choice, with no upper cap. `openVault` turns it, as it parses the option, into a finite
  window of `FarFuture - FarPast` ms, so the deadline it sets from any in-bounds clock reading is
  `FarFuture` (see the next entry), and the stored `ask_passphrase_at` is a finite number; no schema
  past that parse, and no stored field, accepts `Infinity`. What still ends such an unlock: `lock()`
  (memory and device record), a change to the unlocks on another device (the next look at the bundle
  sees a new epoch), and the vault being destroyed or made anew (a new `vault_id`). Nothing else
  does: no timer, and no idle detection. Two consequences: an open handle sees that new epoch only
  when it next reads the bundle (an unlock, a write, or a change the vaultDB pushes), so a handle
  that only reads whispers, on storage that pushes nothing, keeps its vaultKey in memory until then;
  and lowering the option later ends an unlock a device already remembers only at its next open (see
  the entry below).
* 2026-10-15 (revised the same day by clean_times): every time the package stores is an
  `EpochMillis`: epoch ms from `FarPast` (1981-01-01T00:00:00Z) to `FarFuture`, the microsecond
  epochalypse (`Math.floor(Number.MAX_SAFE_INTEGER / 1000)`, 2255-06-05T23:47:34.740Z) -- the
  device record's `ask_passphrase_at` (named `expires_at` until then), and the lockbox's and
  bundle's `registered_at` and the lockbox's `changed_at`: whole ms, so a stored record with a
  fraction of a millisecond fails its schema as one out of bounds does. A device record that
  fails the schema reads as "no remembered unlock", and is erased; it is not clamped on read. That
  includes records written by 0.1.0 and 0.2.0 under a window above about two million hours (some
  229 years), which capped the window only at `MAX_SAFE_INTEGER` ms and stored `now + window`
  unclamped. **The host's `Clock` is checked**: `openVault` reads it once and refuses a reading
  outside those bounds (seconds, microseconds, `NaN`, `Infinity`, a non-number), or a `now()` that
  throws (its error kept as the cause, unquoted), as `bad_option`, before touching storage. Every
  later reading is checked the same way and floored to whole ms (a fraction is fine in a
  reading), and one that fails **fails closed**: the vaultKey is dropped before the call throws
  `bad_option`, so a clock gone wrong never mints a deadline or a stored time, and leaves the vault
  locked in memory (the device record stays). A lock never waits on the clock: `lock()` reads
  none, and `lockSoon()`, unable to time its grace, locks at once and returns normally, with a
  warning to the vault's logger (below). A clock that goes wrong in the middle of a `store()`,
  `erase()` or `changePassphrase()` lets the write land, then throws `bad_option` from the refresh
  after it. A clock in bounds but wrong (set a year ahead, say) is not detected.
* 2026-10-15: `openVault` takes a host's `logger` (`log`, `warn`, `error`, each
  `(message?, story?, err?)`), checked at the door (`bad_option`) and wrapped so that whatever it
  throws or rejects with is dropped. The vault calls it in four places: `lockSoon()` locking
  without its grace on a bad clock; a remembered unlock that fails its schema or will not unwrap,
  erased; a background refresh that fails; and an adapter's unsubscribe throwing while a failed
  open cleans up. Messages are fixed text; a story is `{ call }` alone, naming the vault call, so
  no scope, label, `userId` or other option value goes to the logger; an `err` is the
  `VaultError` the vault would otherwise have thrown (its `cause` the host's own clock or adapter
  error, as `VaultError` already carries it) or the adapter's own error, never a record or a
  validator's issues. A host's own error goes as the host made it, unread and unscrubbed, and the
  default console logger prints it, though a storage client's error may quote the request it
  failed. A test sweeps every call for the fake passphrase, whisper, note, stored
  ciphertexts and salts, down through each error's causes.
* 2026-10-15: with no `logger`, the vault logs to the console: `src/console-logger.ts` is the one
  module in `src/` that touches it, under a file-wide `eslint-disable no-console` (the Coach's
  approval: "yes with no logger console is the fallback"); the lint rule itself is unchanged
  everywhere else. A host silences it by passing a logger whose calls do nothing.
* 2026-10-15: a lockbox keeps two times, `registered_at` (first stored, carried forward) and
  `changed_at`, which moves only when the whisper's serialized form (`stableJsonify`) differs from
  the one it replaces. To know, `store()` deciphers the previous record it already reads and
  compares the two serialized whispers with plain string equality, in memory on the client; the
  comparison is not constant-time. A previous record that will not open counts as changed and is
  written over, as before. The backend learns one bit it did not before: a `changed_at` that
  stands still across a new `revision_id` says the host stored the same whisper again. The bundle
  keeps `registered_at`; `created_at` and `updated_at` are gone from both records. None of the
  times is in the cipherAdditionalData (the binding is still the positional list), so a backend
  can alter them undetected; binding the whole header is TODO.md's roadmap 3, not yet built.
  (Built since: the sweep entry below binds both times and the note.)
* 2026-10-15: until 1.0.0 a stored-shape change carries no migration (the Coach's ruling). A
  lockbox or bundle written with `created_at`/`updated_at`, or a device record with
  `expires_at`, fails its schema: the vault refuses it as `corrupt_record` and leaves it as it
  is (a device record is erased, and the user enters the passphrase again). A Convex deployment
  holding such rows refuses the new component schema at deploy until those rows are deleted.
* 2026-10-15: lowering `forcePassphraseReentryHours` reaches devices already remembered. At each
  open, a remembered unlock whose deadline lies past now plus that open's setting was remembered
  under a longer one, and is treated as a record that does not fit: erased, and the vault opens
  locked. Raising the option lengthens no remembered unlock; an unchanged setting never trips it
  (the deadline set at unlock is always within now plus the setting), so it fires only when the
  host lowered the setting, or the clock went backward. There is deliberately no write-back of a
  shortened deadline: a blind write of the record read at the start of the open would bring back
  a remembered unlock that another tab's `lock()` erased in between, and later opens would come
  up unlocked against the user's last act. Doing it safely would need an atomic "shorten if still
  present" on `DeviceDB`, an interface hosts implement. An erase cannot resurrect anything and
  cannot slide; racing another tab's fresh unlock, it only makes that device ask again. A stored
  deadline past `FarFuture` never reaches this check: it fails the record's `EpochMillis` bounds
  and is erased first (the entry above). A handle already open keeps the deadline it opened
  with: the option is read at `openVault`.
* 2026-10-14: the package was renamed `byok` → `safebyok` before any release, and its stored
  format tags with it (`safebyok-vault-v1`, `safebyok-lockbox-v1`, `safebyok-unlock-v1`). The
  tags are also the first element of every encryption's additional data, so a record written
  under a `byok-*-v1` tag would neither validate nor decrypt. No reader for the old tags is
  kept: they existed only in development and demo storage, never in a published version.
* 2026-10-15: `VaultDB`'s public verbs turn any failure from an adapter that is not already a
  `VaultError` into kind `storage_unavailable`, with the adapter's own error attached as the
  standard `cause`. Adapters see only ciphertext and public record fields, but that cause is
  whatever the backend's client threw, unfiltered.
* 2026-10-15: `localVaultDB` and `idbVaultDB` key rows by `applabel:user_id:vaultlabel`, and
  `user_id` may hold a colon, so one user's rows can share another scope's ckey prefix. Listing
  and erasing a vault now take only ckeys whose remainder after the prefix is a bare boxlabel
  (no colon); before, a prefix match alone listed a colon-holding user's lockboxes in another
  user's vault. Exact ckeys cannot collide.
* 2026-10-15: the string-keyed adapters (`localVaultDB`, `idbVaultDB`, `idbDeviceDB`,
  `memoryDeviceDB`) file rows under the JSON text of a tuple -- the row's kind, the applabel,
  `user_id` and vaultlabel, and a lockbox's boxlabel -- from one module, `Ckeys`, now exported for
  adapter authors. This replaces the colon-joined ckeys of the entry above. `JSON.stringify`
  quotes and escapes every string, so two different tuples never share a ckey whatever their
  names hold, and a vault's box prefix (its tuple's JSON up to the comma before the boxlabel)
  begins no other vault's ckeys; tests cover every split of a string of separators into four names.
  A name is encoded as given, never normalized: two Unicode spellings of one name are two vaults,
  as they are two cipher bindings. Rows under the old ckeys are never read or moved: a vault
  stored before reads as absent, and its rows, ciphertext only, stay in storage. An old remembered
  unlock (a localUnlockKey and the vaultKey wrapped under it) would otherwise linger in IndexedDB
  beyond the reach of `lock()` and of any expiry, so `idbDeviceDB` sweeps it: `readUnlock` and
  `eraseUnlock` list the device shelf's ckeys and delete, unread, every one that is not an unlock
  tuple (`Ckeys.isUnlock`). An open that finds the vault does it, and so does every lock; under
  `idbVaultDB` or `localVaultDB`, whose first open after an upgrade finds no vault (so reads no
  unlock), the old row waits for the first lock or the next open after an unlock. A test proves
  no old value is fetched. `eraseAll()` clears the whole shelf. `memoryDeviceDB` keeps nothing past the
  page, so it needs no sweep.
* 2026-10-15: the Convex component (`packages/safebyok-convex`) authenticates in the host app,
  not inside the component (where `ctx.auth` does not exist): `SafebyokComponent.api({ getUserId })`
  builds the nine public functions the host re-exports, and each refuses unless the host's
  `getUserId(ctx)` returns a non-empty id equal to the scope's or bundle's `user_id`. The
  component's own functions check no caller and trust their `user_id` argument; Convex lets only
  the host app call them, so a host that wraps them itself, without this check, exposes every
  user's rows.
* 2026-10-15: the Convex component validates records structurally only (fields, types,
  optionality, the `format` literal); the label grammar, non-empty ids, a positive whole
  `unlock_epoch` and a note's length are checked by the client's Zod records, not on the
  server. A signed-in user can therefore store malformed rows in their own vaults, which their
  own clients then refuse as `corrupt_record`.
* 2026-10-15: the Convex component checks each update's and erase's expectation by reading the
  standing rows inside the same mutation that writes, relying on Convex's serializable
  transactions; a failed expectation resolves `false` rather than throwing. `createBundle` is a
  find-or-insert in one mutation; the indexes are not unique, and a second bundle row for one
  scope would make every later call on that vault fail (`.unique()` throws) rather than pick one.
* 2026-10-15: the Convex component's refusals carry `ConvexError` data of a fixed `kind`
  (`not_permitted`, `vault_full`) and a fixed message; neither names the user or quotes a record.
  Its functions log nothing.
* 2026-10-15: Convex's own argument and return validation errors quote the value they refused.
  A malformed call to one of the Convex component's functions therefore writes its arguments --
  `user_id`, scope, notes, ciphertext, never plaintext or keys -- into the host's Convex logs,
  and on a dev deployment back to the calling client as well. safebyok's own refusals
  (`not_permitted`, `vault_full`) quote nothing.
* 2026-10-15: `convexVaultDB`, the Convex client adapter, turns a `ConvexError` whose data has a
  safebyok `kind` and a string `message` into a `VaultError` of that kind carrying that message as
  sent by the server (the component's own are fixed text). Any other error becomes
  `storage_unavailable` with Convex's error as `cause`; on a dev deployment that error's message
  may quote the arguments Convex refused (scope, notes, ciphertext; never plaintext or keys).
* 2026-10-15: `convexVaultDB` sets no timeout. Offline, a Convex query or mutation waits for the
  socket, and Convex resends an unacknowledged mutation on reconnect, so a write can land after
  its caller stopped waiting; a vault call waits as long as the connection is down.
* 2026-10-15: signing out of Convex does not lock a vault opened over `convexVaultDB`: its calls
  are refused `not_permitted` from then on, and its failing `watchVault` subscription is ignored,
  but the unlocked vaultKey stays in memory until the vault locks, expires or is closed. The
  README tells apps to close the vault on sign-out; nothing enforces it. *Superseded 2026-10-16*: a sign-out now locks the vault
  (`identity_revoked`, below).
* 2026-10-15: a vault's lockbox count is capped on the client (`maxLockboxes`, `store()`
  refusing `vault_full`), counted from the handle's last look at storage, so stores of new
  lockboxes running at once -- on several devices, or on one handle, since nothing serializes
  them -- can overshoot it. Neither local backend (`idbVaultDB`, `localVaultDB`) enforces a count
  or a size per vault; the Convex component does (next entry).
* 2026-10-15: the Convex component holds every vault to 8,000 lockboxes and 7 MiB less 1 KiB of
  lockbox rows (as `getDocumentSize` from `convex/values` weighs them), constants in
  `src/component/tallies.ts` derived from Convex's per-transaction limits so that `eraseVault`
  (reading every row twice, beside a bundle of up to one 1 MiB document) always fits; neither the
  client nor the host can change them. `updateBox` checks them against a per-vault tally row
  (`safebyok_vault_tallies`, keyed by the bundle's row `_id`) updated in the same transaction as
  each lockbox write and erase, and refuses, writing nothing, a write that leaves the vault over a
  limit and larger than before, with `ConvexError` kind `vault_full` and fixed text. Replacements
  no heavier and all erases are never refused. A vault with no tally (written before tallies) is
  counted at its next `updateBox`, reading its rows only until a limit is passed; an over-limit
  vault keeps no tally and refuses all growth until erases bring it back. The tally is trusted as
  kept: a rollback to a component version without tallies, followed by a roll forward, leaves
  tallies stale for vaults written meanwhile (deleting the table's rows makes every vault
  recount). Before this, a vault grown past the client's cap (by a modified client, or many
  overshoots) could become impossible to erase whole: the vault half of deleting an account.
* 2026-10-15: records crossing into the core are checked where they cross, and trusted past it.
  A host's `store()` note is checked against the stored lockbox's own schema before anything is
  written (an unchecked over-long note once made every later `openVault` refuse the vault as
  `corrupt_record`). Whatever a `DeviceDB` hands back -- the host may supply its own -- is checked
  against `DeviceUnlock` by the vault, and one that does not pass is erased and reads as no
  remembered unlock. `VaultDB`'s write verbs check labels and scope only, not the records the
  vault builds. A remembered unlock's `ask_passphrase_at` is not bound into its encryption, so
  whoever can write this device's IndexedDB can extend it (to any finite number of milliseconds).
  (Bound since: the sweep entry below.)
* 2026-10-14: releases run from `.github/workflows/release.yml` on every push to main, in jobs
  that each hold only what they need. Only `publish` (in the `npm` environment) may mint an npm
  OIDC token, and it runs no package's scripts (`pnpm install --ignore-scripts`): it stages the
  tarballs the `pack` job built, linted and tested without that token. The trusted publisher
  allows `npm stage publish` only, so every version still waits for the Coach's 2FA approval.
  `scripts/release.ts` refuses a tarball whose `package.json` still holds a `workspace:` range,
  and quotes only npm's error code and summary, never the rest of what npm printed. No release
  job caches dependencies or persists git credentials.
* 2026-10-15: the release workflow's `version` job opens and updates the Version PR with an
  installation token from a GitHub App, minted by `actions/create-github-app-token` from a
  private key held as a secret of the `releasing` environment, which only `main` may deploy to.
  The token is narrowed to contents and pull requests (write) on this repository; the job's own
  GITHUB_TOKEN reads only. Its commits go through the GitHub API, signed by GitHub and attributed
  to the App.
* 2026-10-15: the GitHub App's private key (`RELEASE_APP_PRIVATE_KEY`, with `RELEASE_APP_ID` as a
  variable) is a secret of the `releasing` environment, which only `main` may use
  (#27, eed83f0). Whoever holds the key can mint installation tokens for the App with every
  permission the App was granted, however narrowly `release.yml` asks for its own; the key never
  expires, and revoking it means generating a new one in the App's settings. In the workflow only
  the `create-github-app-token` step receives the key. The token it mints (contents and pull
  requests write on this repository, short-lived) goes to the changesets action, which also runs
  `pnpm release:version`, repository code from main's tip, in the same job: so what merges to main
  can use that token when it next runs. The token can create branches and tags and open, edit and
  close pull requests; whether it can also push to or merge into `main` depends on the branch
  protection's allowances for the App, which this repository's files do not record.
* 2026-10-15: the `publish` job, the only one that can mint an npm token, installs npm 12.2.0
  from a tarball checked against the sha512 `dist.integrity` recorded in `release.yml`, offline
  (npm bundles its dependencies), so a changed tarball on the registry stops the job instead of
  running beside the token. Moving npm means recording the new version's integrity by hand.
* 2026-10-15: `store()` retries a write storage refused as stale, up to three attempts in all.
  Every attempt reads the box afresh and seals the whisper anew, under its own lockboxKey and
  `revision_id`: a refused attempt's ciphertext is never reused, so no two ciphertexts share a
  binding. The retry's first act is to require unlocked, so a refusal that caught the device up
  with a vault reborn elsewhere (or its ways in changed) relocks it and ends the retry as
  `vault_locked` before any whisper is sealed for the new vault. A retry overwrites what the
  other device wrote (last writer wins), as a host's own retry did, except that a box erased
  elsewhere is not brought back (an erase wins: `stale_write` at once); `erase()` is never retried.
* 2026-10-15: the published package has a `safebyok/testing` entry point of test helpers
  (the `TH` namespace of its tests), among them `testDeriver`, a KeyDeriver that is one SHA-256
  of passphrase and salt, labelled `test_digest_v0`. `openVault` accepts any KeyDeriver, so
  nothing stops a host passing it to a real vault; a bundle records the label of the deriver that
  sealed it. The entry imports vitest, an optional peer, and is not imported by `safebyok`,
  `safebyok/browser`, `safebyok/idb` or `safebyok/utils`.
* 2026-10-15: the public packages' `exports` carry a `@safebyok/source` condition pointing at
  `src/`, for the workspace's own tooling; `pnpm pack` ships `publishConfig.exports` (dist only)
  instead. `scripts/release.ts` refuses a tarball that still carries the condition, and each
  public package's `prepublishOnly` refuses a publish not run by pnpm.
* 2026-10-15 (across tabs and on `close()`, revised 2026-10-16 by locks_and_expiry, below): a
  `lock()` (or `destroy()`) called while an `unlock()` or `changePassphrase()` is
  still under way wins. Each lock moves a per-handle counter; the unlock reads it at its start
  and again after each wait (the bundle read, the key derivation, the device record's write),
  and on finding it moved takes up no vaultKey, erases a device record it had already written,
  and throws `vault_locked`. A vault that unlock was creating stays created, locked. A passphrase
  change still lands in storage (its proof is the old passphrase, not the unlock), and only its
  unlock is dropped. The counter is per handle: a lock in one tab does not reach an unlock under
  way in another, beyond both writing the one device record. The undoing erase is
  unconditional, so it can also erase a record written by a second unlock begun after the lock
  on the same handle; that device then asks for the passphrase at its next open. An unlock (or
  the unlock after a passphrase change) also takes up nothing, and throws `vault_locked`, when the
  bundle standing at its end is not the one its passphrase was proven against, by `vault_id` and
  `unlock_epoch`: a vault destroyed, remade, or re-keyed elsewhere while the passphrase was
  being checked. Without that, the old vault's vaultKey was taken up against the new bundle, and a
  `store()` sealed boxes into the new vault that its owner could never open.
* 2026-10-15 (`close()` and the timer revised 2026-10-16 by locks_and_expiry, below):
  `lockSoon(graceSeconds = 5)`, at most 60 seconds, closes the entry gate at once
  (`askPassphraseAt` cleared, so the snapshot reads `locked` and every operation started
  afterwards throws `vault_locked`; cleared rather than set to now, which a wall clock stepped
  back would reopen), erases the device record at once, and moves the shut counter
  (an unlock under way loses); a `setTimeout` drops the in-memory vaultKey after the grace. In the
  grace, `store()`'s retries and `erase()`'s second look check only that the key is still held,
  not `askPassphraseAt`, so an operation begun before the gate closed finishes; under natural
  expiry too, an operation begun before `askPassphraseAt` now finishes past it. An `unlock()`
  that lands in the grace cancels the timer, including one begun in the grace and still deriving
  when it would have fired: the timer does not move the counter. A second `lockSoon()` never
  lengthens a grace, only shortens it. `close()` now moves the counter and drops the key from
  memory (clearing the timer) but leaves the device record: an unlock under way on a closed
  handle writes no record (erasing one it already wrote) and throws `vault_closed`. The timer is
  per handle and per tab, like the counter.
* 2026-10-15: `VaultProvider` hands a stored record that fails verification at open
  (`corrupt_record`; since 2026-10-16, `damaged_bundle`) to the app in place, as `openError`, rather than throwing it to the error
  boundary: it is a condition, as are `storage_unavailable` and `not_permitted`. A tampered or
  damaged bundle therefore reaches the app's own UI, beside a `retryOpen` that cannot mend it; the
  React README tells hosts to branch on `openError.kind`, and the error's message carries no
  secret material. Misuse still goes to the boundary.
* 2026-10-15: every validator in the core is `zod/mini` (`import * as Z from 'zod/mini'`; the
  core's lint refuses classic `zod` in `src/`). Same checks, limits and messages as before; mini
  shares classic's parsing core, and the test suite passes against zod 4.0.0, the peer range's
  floor, as against the current 4.6. Mini loads no locale, so a zod issue's default message is
  generic, but no zod message reaches a caller of the vault or its VaultDB: every refusal there
  is a VaultError of our own wording. A host calling an exported schema's `.safeParse` itself
  gets zod's issues, which name paths and limits but carry no input (zod's `reportInput` is
  off). The build keeps each module its own file in `dist/` (`unbundle`), so a host's bundle
  carries only the modules its imports reach.
* 2026-10-15: every `VaultDB` write verb validates its record and its expectation against the
  schemas its reads use, before the adapter's half sees them, so the core never writes a record
  its own read would refuse (an over-long note once did, and the vault could not be opened again);
  Zod strips a field it does not know, so none reaches storage. `updateBundle` refuses a bundle
  whose `vault_id` differs from the expected one. Listing still validates only what a listing
  shows: a lockbox whose ciphered fields are damaged lists, and is refused at `read()`, so one
  damaged box never makes the vault fail to open; such a box cannot be stored over or erased
  either (both read it first), only destroyed with its vault. A remembered unlock naming another
  scope is forgotten before any unwrap; its `vault_key_local_wrapped` binding would refuse it
  anyway. The vault-size check counts each lockbox at twice `maxWhisperBytes` plus 2 KiB for its
  other fields against the adapter's whole `maxVaultBytes`: the same outcomes as half the limit
  with 1 KiB, with the fields' allowance now covering them (a test builds the heaviest row) while
  `user_id`, which nothing bounds, is at most 512 bytes; a longer one, or a note a JSON-text
  backend escapes, eats into the room the doubled whisper leaves.
* 2026-10-15: a host may choose its key derivation. `argon2idDeriver(spec)` takes a whole
  Argon2id parameter set and a label of the host's own, and runs it through `@noble/hashes` as
  the supplied deriver does: parameters, not a new construction. `Argon2idWebV1` stays the one
  supplied spec and what `browserOpts()` uses; no other was added (RFC 9106's first recommended
  option needs 2 GiB, past what `@noble/hashes` allocates; its second differs from ours only in
  four lanes, which a single-threaded JavaScript deriver runs one after another; OWASP's figures
  are server minimums, below ours). **Refused** (`bad_option`), as what cannot run: a salt under
  8 bytes (`@noble/hashes` and Argon2's reference code refuse it, so a 1-byte salt is refused
  here) or over 65536 (`getRandomValues`' most), memory under 8 KiB a lane or over 1 GiB, no
  passes or lanes, a key other than 32 bytes. **Allowed**, as foolish but workable: anything
  weaker within those bounds -- 8 KiB of memory, one pass. Any `keyDeriver` openVault takes needs
  a `salt_bytes` from 1 to 65536 (a non-Argon2 deriver, such as `testDeriver`, may take a 1-byte
  salt), and the vault refuses a `deriveKeyBytes` that hands back anything but 32 bytes, before
  wrapping anything: WebCrypto would otherwise accept 16 or 24 as a weaker AES key. **Enforced**:
  a deriver now carries its spec's fields beside its function, and openVault and
  `argon2idDeriver` refuse one wearing a supplied spec's label (`argon2id_web_v1`) without
  carrying exactly that spec's parameters, so a WebAssembly or native stand-in cannot quietly
  derive under others and strand vaults across devices. This checks what a deriver declares, not
  the bytes it derives: a stand-in is the host's to test against `argon2idWebV1Deriver`. A host's
  own label is not checked against anything, since a vault stores only the label; the host must
  never change a label's parameters. The stored format is unchanged.
* 2026-10-15: a bundle holds its ways in as `unlocks`, a list of one to `MaxUnlocks` (8) unlock
  envelopes, each the one vaultKey wrapped under its own key. A passphrase envelope has its own
  random `salt_b64` (never shared between envelopes) and its own `unlock_id`, and its wrap's
  additional data is the format, scope, `vault_id`, a purpose per method
  (`vault_key_passphrase_wrapped`), and the envelope's whole public header (`method`,
  `unlock_id`, `unlocklabel`, `key_deriver_label`, `salt_b64`) as key-sorted JSON (and, since
  the sweep entry below, the bundle's `registered_at`). The
  `unlock_epoch` is no longer in it, since a change to one envelope bumps the epoch and the
  others, whose passphrases the device does not hold, must still open: a backend can therefore
  splice an envelope from an older bundle of the same vault (a removed passphrase's, or one from
  before a change) into the current one, and that old passphrase opens the vault again, as it
  always opens the older bundle itself. The list's order and length, and the bundle's other
  fields, are not bound.
* 2026-10-15: removing an unlock envelope (`removeUnlock`) is not revocation. Whoever knew the
  removed passphrase and kept any earlier bundle holds the vaultKey, which never rotates; the
  removal bumps `unlock_epoch`, so devices unlocked under it lock at their next look, and the
  vault refuses to remove its last envelope (`last_unlock`). Every change to the envelopes
  (`addPassphrase`, `removeUnlock`, `changePassphrase`) asks for a passphrase that opens one,
  even on an unlocked vault: the session's vaultKey handle is non-extractable, so wrapping it
  anew needs the extractable transient that a proof unwraps.
* 2026-10-15: an `unlock()` or a proof not aimed at one envelope (`unlockId`) tries each
  passphrase envelope in the bundle's order, one key derivation apiece, and stops at the first
  that opens: a wrong passphrase costs as many derivations as there are envelopes, at most
  `MaxUnlocks` (8, about 4.8 s with the noble deriver in Node 24), a bound enforced on read, so a
  backend cannot make one unlock derive more. Which envelope opened shows in how long the unlock
  took, on the device only. Envelopes made by a key deriver the vault was not opened with are
  passed over, and refused as `unknown_key_deriver` only when no envelope is left to try.
* 2026-10-15: a way in may be a passkey (WebAuthn PRF extension; a security key's `hmac-secret`).
  Its envelope holds `credential_id` and `prf_salt_b64` (32 random bytes, minted by the React
  binding's `createPasskey` with `crypto.getRandomValues`, checked for length by the core). The
  passkeyKey is HKDF-SHA256 over the 32-byte PRF answer, with an empty salt and `info` =
  `["safebyok-vault-v1", "vault_key_passkey_wrapped", credential_id]` as JSON (since the sweep
  entry below, the wrap's whole additional data); the wrap's additional
  data is the format, scope, `vault_id`, purpose `vault_key_passkey_wrapped` and the envelope's
  public header, as for a passphrase envelope. A stored salt that is not base64url of 32 bytes
  refuses as `corrupt_record` (since 2026-10-16, `damaged_unlock`: see that entry), checked at unlock rather than in the schema (the size budget, as for
  passphrase salts). The core never calls WebAuthn and never stores the answer; the answer passes
  through host JavaScript as a `Uint8Array` the vault does not wipe.
* 2026-10-15: what a passkey way in rests on. The PRF answer is a long-term secret as strong as a
  passphrase for that vault, and needs no key derivation to try, so a captured answer opens the
  vault (and every copy of its bundle) for good. The authenticator gives it only after user
  verification (`userVerification: 'required'` on every call, which also keeps the answer stable:
  hmac-secret answers differently with and without UV). A platform passkey synced by iCloud
  Keychain or Google Password Manager answers on any device signed in to that account, so the vault
  then rests on that account's security too. Any script running on a page under the passkey's RP
  ID can ask the authenticator for the answer (with the user's touch), as it could read a typed
  passphrase. The credential's challenge is random and never verified, and no attestation is
  checked: the authenticator is the user's to trust.
* 2026-10-15: **every field a record writes is bound, unless a reason below says not** (the
  Coach: "make everything verifiable unless there's a good reason not to"). A passkey envelope's
  HKDF `info` is now its wrap's whole additional data -- format, scope, `vault_id`, the bundle's
  `registered_at`, purpose, and the envelope's public header (`method`, `unlock_id`,
  `unlocklabel`, `credential_id`, `prf_salt_b64`) -- so the passkeyKey itself, not only the wrap, belongs to one vault
  and one envelope; HKDF info and AES-GCM additional data are the same bytes, fed to different
  primitives. Every unlock envelope's wrap binds the bundle's `registered_at`. A lockbox's two
  encryptions bind its whole public header (`format`, `boxlabel`, `revision_id`, `note`,
  `registered_at`, `changed_at`: every field but the two ciphered ones, as Zod's parse leaves the
  record; an absent or undefined note is left out alike), so a backend that alters a note or a time
  makes `read()` refuse `corrupt_record`; a future field is bound the day it is added to the
  schema. While the vault is locked, the listing still shows these fields unverified: nothing
  checks them before a box is opened. The device record binds `ask_passphrase_at`, under its own
  format tag (`safebyok-unlock-v1`, formerly the bundle's); a deadline moved on the device now
  fails to open and is erased, so the forgetting is logged. No compatibility: every passkey
  envelope, lockbox and remembered unlock written before refuses to open (`wrong_passkey`,
  `corrupt_record`, a fresh passphrase prompt), and a passphrase envelope refuses its passphrase.
  **Left unbound, and why**: the bundle's `unlock_epoch` and the list of `unlocks` (order, length,
  membership), because each envelope's key is held only by its own way in, and a change to one
  must not rewrap the others (the 2026-10-15 envelope entry above: an old envelope can be spliced
  back); the passphraseKey's derivation, which takes no context: its salt is fresh for every
  envelope and bound in the wrap, so the key wraps exactly one thing, and binding it further would
  put Argon2's associated data into the host-pluggable `KeyDeriver` seam and every stand-in
  behind a label, for no added check; the PRF salt, which is random and already bound; and the
  stored ciphertexts and IVs, which the AEAD tag covers. An adapter's own columns are never in a
  record, so never bound. Were an Argon2 setting ever to go in, it would be as a difficulty
  measure -- a floor on the cost a vault accepts from its stored deriver label -- not as a binding
  (the Coach, 2026-10-16).
* 2026-10-15: any way in proves any change. A passkey's answer is accepted as proof by
  `addPassphrase`, `addPasskey` and `removeUnlock`, so whoever holds one passkey can set a new
  passphrase and remove the user's others: the vault is as strong as its weakest way in. A vault
  always keeps one passphrase envelope (`last_unlock` refuses removing the last), and is created
  with one. `createPasskey` registers each passkey under a random user handle, so it cannot replace
  a sign-in passkey on the same RP; removing a passkey from the vault does not delete it from the
  authenticator, and (as for passphrases) is not revocation.
* 2026-10-15: `addPasskey` proves first and asks the authenticator after, so a refused proof
  leaves no orphaned passkey; the cost is that the proven vaultKey's extractable transient handle
  (`wrapKey` usage only) is held from the proof until the new envelope is sealed, across the
  WebAuthn prompt: human time, not one derivation. Acceptable because the handle lives only in a
  closure inside `reviseUnlocks`, never in the snapshot, a field or an error, so no host script
  can reach it, and a script able to hook SubtleCrypto already sees every unwrap; while unlocked
  the session's non-extractable handle opens every lockbox anyway, and extractability adds only
  the export of the raw bytes. It is bounded by the prompt: the WebAuthn `timeout`
  (`createPasskey`'s option, or the browser's default, minutes) ends it, a dismissal or a refusal
  drops the reference, and the change then writes nothing. A `lock()` during the prompt does not
  cut it short: the passkey still lands and the vault stays locked, as for any change to the ways
  in.
* 2026-10-15: `safebyok-postgres` authorizes on the server, per request: `postgresVaultDB` is
  made with the `userId` the host's auth verified, and refuses (`not_permitted`) any other user's
  scope, or any while signed out, before querying; that check is the whole of the authorization.
  Row-level security is on with no policy (the owner role bypasses it; every other role,
  Supabase's Data API roles among them, reaches no row). The NOTIFY payload is the scope, which
  any role able to connect may LISTEN for. The server holds a vault to a lockbox count of its own
  (see the `maxLockboxes` entry below), and to no size in bytes. Past
  scope and boxlabel, a route's bundles, lockboxes and expectations are validated only as the
  core's VaultDB validates them. A driver's error rides as `cause` and may quote key columns, or
  (a malformed record refused by a NOT NULL) the whole failing row, its ciphertext included; the
  README's route recipe sends the browser only a refusal's kind and message.
* 2026-10-15: `safebyok-graphql` carries the verbs over GraphQL and authorizes nothing itself:
  each resolver calls the VaultDB `vaultDBFor(context)` makes for the request, so the rule is
  `postgresVaultDB`'s (or the host's own ServedVaultDB's), fed the user the host's auth verified.
  A refusal crosses as a fresh GraphQLError holding only the VaultError's message and
  `extensions.kind`; the VaultError (and through it the driver's error) is kept as that error's
  unenumerable `cause`, set after construction, never as its `originalError`: Yoga masks an error
  whose original is not a GraphQLError, and in development mode sends the original's message,
  stack and `cause` to the browser. Anything a VaultDB throws that is not a VaultError crosses as
  `storage_unavailable`. Unlock envelopes cross as opaque JSON that GraphQL does not check; only
  the core's VaultDB validation does, so a user can write a malformed envelope into their own
  vault and no one else's. The browser's urql Client may keep vault records (ciphertext and public
  fields) in its document cache, though every vault query is `network-only` and never answered
  from it. A subscription's user is fixed when it starts (over a websocket, when the connection
  opened), so a session revoked meanwhile keeps hearing the vault's scope -- never a record --
  until the subscription ends.
* 2026-10-15: **a second implementation behind one label.** `safebyok-fastkey` runs Argon2id
  through `hash-wasm` (4.12.0, MIT, no dependencies; its Argon2 is C written for it after Go's
  `x/crypto/argon2`, compiled to WebAssembly and embedded in its JavaScript; widely used, but
  with no published audit, as the core's `@noble/hashes` Argon2id has none: its README says its
  one audit left `argon2` out of scope), under the same specs and
  labels as the core's `@noble/hashes` deriver, `argon2id_web_v1` included. It checks a spec with
  the core's own `parseKeyDeriverSpec`, so its bounds are the core's by construction; hash-wasm's
  own limits (a salt of at least 8 bytes, memory of at least 8 KiB a lane, below 4 GiB) are no
  narrower. That the two derive the same bytes is a test, not a claim: both are held to Argon2id's
  reference test vector, and to each other byte for byte across the supplied spec and cheap specs
  that press on lane counts, memory not divisible into segments, the shortest and longest salts,
  and non-ASCII passphrases; a vault made under each opens under the other. A difference would
  strand vaults across devices rather than weaken them. Its derivation runs in one synchronous
  WebAssembly call (about 130 ms at `argon2id_web_v1` in Node, against the core's 580 ms), so it
  holds the thread rather than yielding as the core's does. It needs `'wasm-unsafe-eval'` in a
  page's Content-Security-Policy, and refuses (`bad_option`) where WebAssembly will not compile
  or is missing (Hermes): it never falls back to another deriver on its own. Unlike
  `@noble/hashes`, which zeroes its Argon2 blocks and H0 when a derivation ends, hash-wasm leaves
  its working memory (the spec's whole memory_kib, in a fresh WebAssembly instance, and in Node
  the passphrase's UTF-8 bytes in a pooled Buffer) as it is, for the garbage collector: material
  from which the passphraseKey follows stays in the heap until then.
* 2026-10-15: **Dependencies: hash-wasm has no published audit.** `safebyok-fastkey`'s one
  runtime dependency, `hash-wasm`, derives the passphraseKey for every vault made or opened
  through it, and no audit of it, or of the C its WebAssembly is compiled from, has been
  published. Nor has one of the core's Argon2id: `@noble/hashes`'s one audit (Cure53, January
  2022, at 1.0.0) left its `argon2` out of scope. hash-wasm's working memory is never zeroed
  (the entry above).
* 2026-10-15: the IndexedDB vault store moved to a package of its own, `safebyok-indexeddb`, and
  each of its write verbs (`createBundle`, `updateBundle`, `updateBox`, `eraseBox`, `eraseVault`)
  is now one readwrite IndexedDB transaction, which reads the standing rows, compares them with
  the expectation, and writes; a failure anywhere in it aborts it, writing nothing. IndexedDB runs
  readwrite transactions over one store one after another, across the origin's tabs, so the
  windows the `idbVaultDB` entry above records are closed: no write lands over a row another tab
  changed meanwhile, two tabs creating a vault settle on one, and no lockbox outlives an erased
  vault. The guarantee rests on the work inside awaiting only IndexedDB's own requests (awaiting
  anything else lets the browser commit the transaction early, and the next request throws);
  `src/shelf.ts`'s `inOneTransaction` says so. Its rows, ckeys and database name are unchanged,
  and its change bell, a BroadcastChannel per database, still carries no scope and no record.
* 2026-10-15: every `VaultDB` declares a `maxLockboxes`, the most lockboxes its backend holds in
  one vault (`Infinity` for none), and `openVault` refuses (`bad_option`) a `maxLockboxes` above
  it, defaulting to the smaller of it and `MaxLockboxes`. The core offers no "unlimited" constant:
  each store sets its own. `localVaultDB` and `idbVaultDB` declare `Infinity` and enforce nothing;
  `convexVaultDB` declares the component's 8,000; `graphqlVaultDB` declares what its host says the
  server enforces (default 1000), which only moves `openVault`'s check: the server's own refusal
  is the limit. `postgresVaultDB` enforces its `maxLockboxes` (default 1000; a host wanting none
  passes a large safe integer) as a best effort, inside the one statement that inserts a new
  lockbox (see the 2026-10-16 entry below, which replaced a counter column and a row lock). The
  refusal's message names the limit, never a boxlabel or a record.
* 2026-10-15: a host's own checks replace ours for every name and the note
  (`openVault({ validators })`, any Zod 4 schema), with no floor beneath them, since the ckeys
  (JSON tuples) and the cipher binding (a JSON array) take any text. What holds: **a check only
  checks** -- what the host passed is what is stored and bound, never the schema's output, so a
  trimming or lowercasing schema cannot move a user to another vault or strand ciphertext; **the
  refusal is ours**, `bad_label` or `bad_option`, naming the field and never quoting the name or
  the schema's issues; a schema that is async or throws is refused as misuse, never taken as a
  pass, and the refusal carries nothing of what it threw (no `cause`), as a refine that throws
  may quote the name or note, and any text, a pasted key among it, may now be one.
  **Every name is checked everywhere**: the vault and every `VaultDB` verb check with the same
  bag, records read back included, so a stored row whose name or note the vault's checks refuse
  is `corrupt_record`, not trusted; the bag never reaches storage or the Convex server, which take
  any text. The stored records (`Lockbox`, `VaultBundle`, `DeviceUnlock`, `VaultScope`) now check
  names only as text, as does an unlock envelope's `unlocklabel`: the `Label` grammar holds when a
  way in is added (`addPassphrase`, `addPasskey`), and a stored envelope under another label still
  opens, since the host's validators have no slot for it. A host's schema runs on names and the note only, never on a whisper or a
  passphrase. A host that admits any text (`AnyTextValidators`) shows its users labels that may
  carry bidirectional or invisible characters, a spoofing risk in its UI that is the host's to
  mind. **Sizes**: with names and notes unbounded, the static 2 KiB allowance no longer bounds a
  lockbox's other fields. It stays only as openVault's plan for `maxLockboxes` at the default
  checks; `updateBox` now weighs each lockbox with its scope as the UTF-8 bytes of its JSON and
  refuses one over the adapter's `maxRecordBytes` (`lockbox_too_large`), and each `store()`
  refuses a lockbox heavier than the one it replaces when the vault, each lockbox counted at twice
  `maxWhisperBytes`, 512 bytes for its fixed-size fields and its measured names and note, would
  pass `maxVaultBytes` (`vault_full`). The vault's total is reckoned from the snapshot's listing,
  so a vault another device filled meanwhile is caught by the backend's own limit, as before.
* 2026-10-15: `PassphraseModal` and `PasskeyUnlockButton` (`safebyok-react`) catch, in an error
  boundary of their own, every failure that is not a condition (misuse, or anything that is no
  `VaultError`, whatever its value), and show the user fixed copy, never the error's message. React
  hands the very thrown value to the host root's `onCaughtError` (the console by default), as it
  would any error a boundary catches; before, it went to the host's boundary instead. The dialog's
  form, and the passphrase typed into its state, unmount with the failure.
* 2026-10-16 (revised the same day by refusals_and_catchup, below: `whenIdentityRevoked` is gone, and `rolled_back` locks too): **a sign-out locks the vault.** An adapter whose backend knows who is signed in
  refuses a vault whose `user_id` is not that user -- signed out, or another user signed in --
  with kind `identity_revoked`, distinct from `not_permitted` (the vault's own user refused one
  call). Convex, Postgres (and so GraphQL over it) refuse both of their old `not_permitted` cases
  this way now; IndexedDB and `localVaultDB` never do. Every storage verb's refusal passes through
  one policy (`src/refusal-policy.ts`) on its way out of the vault, whichever call made it,
  a background refresh's included; for `identity_revoked` it locks at once, as `lock()` does:
  the vaultKey dropped, the remembered unlock erased, a `lockSoon()` grace cut short, an unlock
  under way defeated. It never erases the vault or a lockbox. `convexVaultDB`'s `ConvexClient`
  watch now calls `onChange` on a failed `watchVault` (as a `ConvexReactClient`'s watch already
  did), so an idle vault locks on a sign-out in another tab. **For review**: (1) the default is
  `'lock'`, but `openVault`'s `whenIdentityRevoked: 'stay'` lets a host keep the vault unlocked
  after a sign-out, as before; (2) the mismatched-user case is also `identity_revoked`, since a
  server cannot tell "the user changed" from "a host opened the wrong user's vault", and locking
  is the safe answer to both; (3) a vault opened before its backend's auth is ready meets
  `identity_revoked` and erases its remembered unlock -- safe, but a host that races its auth
  makes its users retype the passphrase (the READMEs say to open only once signed in);
  (4) an adapter that says `identity_revoked` for a passing fault locks the vault needlessly --
  the `VaultDB` contract says to use `storage_unavailable` for those.
* 2026-10-16: **a damaged vault is said only as far as the vault can know it** (the Coach:
  "fine-grained error messages"). AES-GCM fails alike for a wrong key and for altered
  additional data or ciphertext, so a passphrase that opens no envelope is still
  `wrong_passphrase`, and a passkey's answer for its envelope's own salt that does not open it is
  still `wrong_passkey`, even when the bundle was altered in storage: each message now says the
  stored vault may be damaged, and claims no tampering. Told apart, each its own kind: a bundle
  that fails its schema or names another scope (`damaged_bundle`, mapped by the vault from
  storage's `corrupt_record`, which stays `VaultDB`'s word, the original as `cause`); an envelope
  whose salt its deriver could not have made (`damaged_unlock`); and a lockbox that fails its
  schema, or will not open under the vault's vaultKey, or opens to no whisper (`damaged_lockbox`)
  -- knowable because that vaultKey was proven by the way in that gave it. **A damaged envelope
  is passed over, no longer refused for the whole vault**: the others are tried as ever (no
  derivation is spent on it, and the outcome still does not hang on order), and
  `safebyok-react`'s `askPasskey` likewise offers only the passkeys it can ask. Considered and
  refused: telling a wrong passphrase from an altered envelope by re-encrypting a held vaultKey
  under the derived key with the stored IV and comparing ciphertexts -- it works only against
  GCM's structure, needs the vaultKey's bytes, and is a construction of our own. A bundle that
  fails its checks cannot be destroyed through a vault handle (`openVault` refuses it, and `destroy()`
  needs a handle); it is left in place, as every damaged remote record is, until the host calls
  `eraseDamagedVault` (the entry below).
* 2026-10-16: `postgresVaultDB`'s lockbox limit is a best effort (VaultDB contract, lines 4.2 to
  4.5), not a guarantee: the insert counts the vault's lockboxes in a `count(*)` over its own
  statement's snapshot, with no lock and no counter, so writers racing for the last places under
  READ COMMITTED may each find room and all land, by at most one less than the number of racers.
  A client that bypasses the library can add lockboxes without bound, which makes the limit an
  alarm bell and a guard against a runaway loop, not an abuse quota: the host meters that, like
  its request rates, and the README offers a trigger for a host that wants a hard cap. This
  replaced the `lockbox_count` column, its trigger and a `FOR UPDATE` row lock, reasoned about
  in `whiteboard/20261015-matters/thread-11-postgres_verdict.md`; what to check: that a refused
  write inserted nothing (the `WHERE` of one atomic statement), that no lockbox lands in a vault
  but its own (the foreign key, re-read against the bundle that stands now, whose violation
  `23503` is mapped to `stale_write`), and that every lockbox that landed stays readable and
  erasable. Above READ COMMITTED some races fail with `40001`, refused as `storage_unavailable`.
  The notify trigger is no longer installed by `VaultTablesSql`: a host opts in with
  `VaultNotifySql`, and without it nothing is pushed (the vault refreshes after its own writes).
  Not run against concurrent connections: the tests are on PGlite, one statement at a time.
* 2026-10-16 (revised the same day by refusals_and_catchup, below: a vault that may be newer is `newer_format`): **`eraseDamagedVault`, the one way to erase a vault without a handle** (the Coach:
  "yes"). `destroy()` deliberately needs no unlock ("owning the account is enough"), but needs a
  handle the vault's own reading made; a bundle that fails its checks gave none. The new call
  erases a vault `openVault` refuses as `damaged_bundle` and no other: it refuses (`bad_option`,
  nothing erased) a bundle that reads back sound, so it cannot become a way round `destroy()`'s
  care, and it erases through `VaultDB.eraseDamagedVault`, which reads the record as stored,
  takes its `vault_id`, and aims the adapter's `doEraseVault` at that one vault, so a vault made
  anew meanwhile survives as `stale_write`. Like `destroy()` it needs no passphrase, and it is as
  strong as the backend's own authorization of who may erase that user's rows (the contract's
  5.4): a user can already erase their own vault by `destroy()`, so it widens nothing for them,
  and widens nothing for anyone else. It also erases the remembered unlock, on this device only.
  **For review**: (1) the erase's expectation is the `vault_id` read from a record that is, by
  definition, untrusted; it can only aim the erase at the row it read, in the caller's own
  scope, so a forged `vault_id` in a damaged row erases that row and nothing else; (2) `localVaultDB`
  and `idbVaultDB` now erase a whole vault on the `vault_id` alone (the contract's line 3.5 always
  said so), where they had also required a readable `unlock_epoch`, which kept exactly the
  damaged vaults from being erased; lockbox writes and `eraseBox` still need the epoch.
  **Newer is not damaged** (review of the above): a bundle that fails this build's checks may be
  one a *later* build writes and opens, and offering "erase" for it would erase, from a device
  on an old build, a vault every up-to-date device opens. So the hatch refuses (kind
  `damaged_bundle`, a message to update the app, nothing erased) a record with a `format` this
  build does not know (of any type), an unlock `method` it does not know, or more unlocks than
  `MaxUnlocks`, and erases only what fails otherwise. **The rule this rests on, which the Coach
  has ruled (2026-10-16): any change to what a stored record may hold -- a field, a shape, or a
  range a check accepts -- bumps `format`**, so that an older build can tell newer from damaged. Where it cannot tell, it refuses: the hatch fails safe. Not routed through
  `RefusalPolicy.heed`: there is no handle to lock and no key in memory, so `whenIdentityRevoked`
  has nothing to act on, and the hatch's own last step is erasing the remembered unlock.
* 2026-10-16: **the checks tightened, and a forgotten bag made harmless.** Every default check,
  `AnyTextValidators` included, refuses text that is not well-formed Unicode (a lone surrogate),
  and the default note check refuses control characters but tab and newline; a host's own schema
  is untouched. A refusal by one of our checks now passes on that check's message, which quotes
  nothing; a host schema's issues are still never passed on. **A `VaultDB` verb handed no
  validators now admits any well-formed text** (`AnyTextValidators`), where it used to apply the
  defaults: a wrapper that forgets to forward the vault's bag can no longer refuse a well-formed
  name the vault's own checks passed. The vault passes its bag to every verb (a test spies each
  one); it had left it off `updateBundle`, so a host with a wider `userId` check could not change
  a passphrase. Before the change, a server calling the verbs bare got the default checks; it now
  gets text-only checks, which is what the shipped server recipes already passed. The same holds
  for `eraseDamagedVault` and its verb. A `damaged_lockbox` refusal no longer quotes the boxlabel,
  as `absent_box` already did not.
* 2026-10-16: **a foreign error that may quote stays behind.** `Sanitizer.refusalFor`
  (`src/sanitizer.ts`, exported as `Sanitizer`) is the one place that decides what of a foreign
  error rides along on the refusal thrown in its place: today, nothing -- no `cause`, no text, no
  property. Two callers: a host's schema that throws (`bad_option`, as since #95), and
  `convexVaultDB`, which now throws every Convex failure that is not one of safebyok's own
  refusals as `storage_unavailable` carrying nothing of Convex's error. That error is a plain
  `Error` whose text, on a dev deployment, quotes the call's arguments (scope, names, notes,
  ciphertext; never plaintext or keys), and the client cannot tell a validator's refusal from any
  other server error but by its text, so all of them are dropped. The cost is debugging: the
  deployment's logs keep the full error. The other adapters still carry their client's error as
  `cause`, as above.
* 2026-10-16: **`validators.unlocklabel`**, a sixth slot, checks the label of each way in a host
  adds (`addPassphrase`, `addPasskey`), `Label` by default, refused as `bad_label` without
  quoting it, as the other names are. It is checked only there: a stored unlock envelope's
  `unlocklabel` is still read as plain text, so a way in stored under a label a narrowed check
  refuses still opens the vault and lists as it is. Refusing it on read would make the bundle
  `corrupt_record` and lock the user out of their own vault, or hide a way in they rely on. The
  first way in, named `passphrase` by the vault itself, is not checked.
* 2026-10-16: **ckeys are joined on `^`, and a name holding it is refused** (push_to_100_a, thread
  1). The key-value stores (`localVaultDB`, `idbVaultDB`, `idbDeviceDB`, `memoryDeviceDB`) file
  rows under `kind^applabel^user_id^vaultlabel[^boxlabel]` (`Ckeys`), replacing the JSON-tuple
  ckeys of the entry above. The join is injective only because no part holds `^`, so that is
  enforced twice and cannot be turned off: `^` is in the name floor (`NameFloor`), which every
  `VaultDB` verb, every record schema and the vault's entry hold every name to, whatever the
  host's validators and whatever the store; and `Ckeys` itself refuses one as it composes, which
  also guards the device shelves, which have no base class. Were either missing, `a^b` + `c` and
  `a` + `b^c` would share a ckey: one user's lockbox under another's scope. The delimiter is fixed:
  no host sets another (the Coach's ruling), and every store refuses `^` alike, so a host
  never meets a refusal from one store (the browser's device shelf, say) that its vault store
  never raised. A hash was not chosen:
  it hides nothing (each name is plaintext in the row, and an indexed column in Convex and
  Postgres) and loses the name of a damaged row, which the listing needs to offer `erase()`. Rows
  under the JSON ckeys read as absent; the device shelf sweeps them as strays.
* 2026-10-16: **a floor beneath every name and note, and the host's validators at entry only**
  (thread 1). `NameFloor` and `NoteFloor` (well-formed Unicode, NFC, no control character but tab
  and newline in a note, 1 KiB a name, 4 KiB a note) now run beneath whatever schema a host
  passes, at the vault's entry, in every `VaultDB` verb, and in every record schema, so a stored
  name or note below it reads back as damaged and never reaches `snapshot.boxes` unchecked (a row
  stored under a name below it is not listed at all). This bounds what storage can put in front
  of a host's UI whatever its validators: no control characters, no 1 MB label. The host's
  `validators`, by contrast, now run only where a name enters the vault (`openVault`, `store`,
  `addPassphrase`, `addPasskey`) and never on a record read back: a lockbox stored under a name or
  note they refuse lists, reads and erases as sound, as an unlocklabel already did. They are an
  alarm for the host's own use, not a promise about storage, which a server serving several
  clients cannot keep. `VaultDB` verbs no longer take a validators bag at all, so no server or
  wrapper can be handed the wrong one. Each adapter declares `maxNameBytes` (Postgres: 640, so a
  lockbox's four-name primary key fits a btree entry) and the base class refuses a longer name.
* 2026-10-16: **a lockbox's note becomes a public bag of any JSON, bound; its whisper's codec
  and schema version are reserved, bound too** (push_to_100_a, thread 2; G023, G025, G040). The
  lockbox (`safebyok-lockbox-v3`) holds `public_json`, the host's bag as stable-serialized JSON
  text, always written (`{}` when the host gave none, so an absent bag and an empty one are one
  record and one binding), and `whisper_codec` (`json_v1`) and `whisper_schema_version` (`1`).
  All three join the header both of the lockbox's encryptions bind, so a bag swapped between
  boxes, emptied, or merely respaced in storage makes `read()` refuse it (`damaged_lockbox`);
  the bound value is the stored text itself, never a re-serialization, so a store must keep it
  byte for byte (Postgres keeps it as `text`, never `jsonb`). The record's check also requires
  that text to be its own stable re-serialization, inside a try: a bag respaced, reordered, or
  nested too deep to serialize (which once overflowed the stack in the snapshot's comparison and
  stopped the vault opening with a bare `RangeError`) lists as damaged and reads as
  `damaged_lockbox`, so one bad record never hides the rest. A `store()` carries the standing
  bag and `registered_at` forward only from a record that deciphers: over one that will not, its
  bag becomes `{}` unless one is given, and its `registered_at` is now, so a bag planted in
  storage is never sealed into a fresh revision that reads clean (found in review). What the bag reveals: everything in
  it, in the clear, to anyone who reads storage, and its size; the vault never interprets it,
  checks only that it is JSON, and the snapshot shows it unverified until the box is opened, as
  every public field is. Its size is capped only with the whisper's (`maxWhisperBytes` counts
  both), so a host cannot put a bag of megabytes in front of the listing through the vault.
  Reserving the codec fields now means a later codec (padding, G026) or a whisper shape version
  changes no bound field set and re-encrypts nothing. Two binding fixes ride along: the lockbox's
  format is bound once, as the leading tag (it was also in the header), and `cipherBinding`
  refuses a record part holding a field set to `undefined` (`bad_option`) instead of dropping it
  as JSON would, so a field gone missing by mistake can never bind as if it were absent. The
  note's control-character floor (G177) goes with the note: the bag is the host's, and a host
  that shows it checks what it shows.
* 2026-10-16 (locks_and_expiry): **the unlock window has a hard edge, and a timer.** The
  threshold is the truth: every call that starts work checks `askPassphraseAt` against the host's
  clock, and past it throws `vault_locked`. A `setTimeout` enforces it: armed at each take-up of a
  key (an unlock, a remembered unlock at open, a change to the ways in), it rings at
  `askPassphraseAt`, so the snapshot says `locked`, and 60 s later, the grace work in hand gets,
  drops the vaultKey with no call made. Every look at the key
  (`ensureUnlocked`, and the second look of work in hand) also drops it once that shut time has
  passed by the clock, so a timer that runs late, on a device asleep, is not depended on. A shut
  time only moves earlier: `lockSoon()` takes the lesser of its grace and what the window has
  left, and on a key already past its shut time drops it at once. To make one timer always reach,
  `forcePassphraseReentryHours` is now at most 588 hours (24.5 days; 588 h + 60 s is under
  `setTimeout`'s 2^31 - 1 ms) or `Infinity`, which arms no timer; a finite number past 588 is
  refused (`bad_option`), where it used to be clamped to "forever" -- a host that meant "very
  long" now says `Infinity` and means it. The timer is `unref`'d where the platform has it
  (Node, Bun), so an open vault never holds a process alive; that costs nothing, since a process
  that exits drops the key with it. **The window renews only on a typed passphrase that proves**
  (the Coach, 2026-10-16: "if I type in a password for any reason and prove I am mrflip, ... no
  need to type that password again for seven days"): `unlock()`, `changePassphrase()`, and any
  change to the ways in proved by a passphrase. An `unlock()` by passkey also sets it, as it did.
  A passkey proving a change on an unlocked vault keeps the deadline standing (on a locked one it
  sets one, as `unlock()` by passkey would). Reads, stores, erases and refreshes never move it.
  One place decides (`deadlineFor` in `vault.ts`), so a new kind of proof cannot slip past it.
  Expiry is a soft lock (the strawman's two locks): the window running out while an `unlock()` or
  `changePassphrase()` is under way does not defeat it; only a lock the user (or a sign-out)
  makes does. For review: a passkey's proof keeping, not renewing, the deadline is the weaker
  reading of "proves I am mrflip" (G530 asks the deeper question, NOT YET).
* 2026-10-16 (locks_and_expiry; revised the same day by refusals_and_catchup, below: `lockSoon()` raises nothing, and the generation outlives a destroy): **a lock reaches every tab's unlock under way: the versioned
  erase.** The device mark gains `lock_generation` (format `safebyok-mark-v2`). Every lock that
  forgets the remembered unlock -- `lock()`, `lockSoon()`, a sign-out's lock, `destroy()`'s --
  raises it before erasing the record. An unlock (or a change to the ways in) reads it as it
  starts, and `DeviceDB.writeUnlock(unlock, expected)` writes the remembered record only while
  the mark still stands at that generation, comparing and writing in one step (one IndexedDB
  transaction in `idbDeviceDB`), else refusing `stale_write`, which the vault takes as "a lock
  won": it takes nothing up and throws `vault_locked`. A record written before the raise is
  erased by the lock's own erase, which follows it. `writeMark` never lowers the generation (the
  higher of the mark written and the mark replaced is kept, in the same step), so a mark written
  from an older read -- a rollback mark raised by another tab -- cannot undo a lock. Limits: a
  host's own `DeviceDB` that ignores the expectation is back to per-handle locking (the
  `describeDeviceDB` battery checks it); a lock on a device with no mark for the vault (one that
  never read it, or whose mark would not read) has nothing to raise; and `destroy()` erases the
  mark, so its generation starts again from 0, and an unlock under way in another tab that began
  at 0 may write a record of the destroyed vault, which opens nothing and is erased at the next
  open of a vault under the scope. `close()` is no lock: it erases nothing, raises nothing, and a
  record an unlock under way wrote before the close stays (G126). The undoing erase of a losing
  unlock now runs only for a lock in its own handle (which may have erased before the record
  landed); a record of a bundle no longer standing is left, since its wrap is bound to that
  bundle's `vault_id` and `unlock_epoch` and opens nothing. **For review**: a mark written before
  this reads as none (the format moved), so on its first open after upgrading a device restarts
  its rollback check from the copy storage holds then, once; before 1.0 that is the stated cost
  of a format change.
* 2026-10-16 (refusals_and_catchup; the Coach: "lockSoon is a soft lock"): **two locks, hard and
  soft.** `lock()`, `destroy()` and a lock for untrusted storage are hard: the key goes at once,
  the device mark's lock generation rises, an unlock or change under way anywhere on the device
  takes nothing up, and a `read()` or `use()` under way refuses `vault_locked` after its last
  await, dropping the whisper it deciphered (one monotonic compare of the handle's shut count,
  which can only turn a success into a refusal). `lockSoon()` and expiry are soft: the door closes
  at once and the remembered unlock is forgotten, but work in hand finishes -- an unlock or change
  under way, in any tab, completes and leaves the vault unlocked -- and the generation is not
  raised. **For review**: a soft lock no longer stops another tab's unlock; a host wanting that
  calls `lock()`.
* 2026-10-16 (refusals_and_catchup; the Coach on G119 and G516): **one rule for storage the vault
  cannot trust.** `identity_revoked` and `rolled_back` both lock the vault, hard, wherever they are
  met -- a call, a catch-up, a background refresh, the open itself (which forgets the remembered
  unlock) -- decided in `refusal-policy.ts`'s `decide`, with no host option: `whenIdentityRevoked`
  and its `'stay'` are gone. An adapter that says `identity_revoked` for a passing fault breaks
  VAULTDB.md 5.5. After a deliberate restore, the README's `eraseMark` recipe stays the only way
  out (G513): no verb puts forgetting the newer copy one call away. **For review**: a storage
  replica that briefly serves an older copy now makes every device that saw the newer one ask for
  the passphrase again.
* 2026-10-16 (refusals_and_catchup): **the lock generation outlives `destroy()`, and a lock with
  no mark still counts.** The device mark (now `safebyok-mark-v3`) holds what it has `seen` of the
  scope's vault, or null; `destroy()` writes it with nothing seen at its raised generation, rather
  than erasing it, and a lock on a scope with no readable mark writes one at generation 1. So an
  unlock under way elsewhere at generation 0 loses to a destroy, and a vault-creating first unlock
  loses to another tab's lock. `eraseMark` (the restore recipe, `eraseDamagedVault`) still resets
  the generation; neither runs with a handle that could be unlocking that vault.
* 2026-10-16 (refusals_and_catchup): **one catch-up before a kind is named.** A write storage
  refuses as stale, or a lockbox that will not open, gets one refresh before the vault names it: a
  vault destroyed and made anew, or its ways in changed, elsewhere relocks the device (P4: never on
  no evidence), so a successor vault's lockbox reads as `vault_locked`, not `damaged_lockbox`. A
  catch-up that fails is thrown as `stale_write` with the failure as cause, never retried blind,
  and the snapshot says `syncing: false`. Refreshes are serialized per handle (one in flight, one
  queued), so two reads never interleave their snapshot updates. Only `store()` retries; a change
  to the ways in, an erase and a destroy refuse once. There is no conflict hook: an erase wins.
* 2026-10-16 (refusals_and_catchup, G498): **a damaged lockbox is replaced in one conditional
  write.** The listing keeps a damaged record's `revision_id` when it holds one as text, and
  `store()` writes over that revision under contract line 3.3, so a sound lockbox another device
  wrote meanwhile refuses the write and is never erased; the store then retries over it, last
  writer wins. The revision is untrusted text used only as an expectation storage compares. Only
  a record naming no revision is erased first, which leaves a gap P6 accepts. A lockbox under a
  vaultKey epoch neither the bundle's nor the prior's lists as damaged from its epoch alone (G063);
  the listing still never opens ciphertext (G121).
* 2026-10-16 (refusals_and_catchup): **`openVault` takes only a `VaultDB`** (G122): a duck-typed
  object would skip the base class's checks of every record and expectation. `instanceof` holds
  within one copy of the package, as `VaultError`'s does; the peer dependency keeps it one. And a
  vault a newer safebyok may have written is `newer_format`, never `damaged_bundle`, so no UI
  offers to erase it (G120).
* 2026-10-16 (epoch_expectation, G065, G138): **every in-tree adapter now compares the
  `vault_key_epoch` expectation** (line 3.8), and the battery holds every adapter to it, with no
  opt-out (`describeVaultDB` no longer takes `comparesVaultKeyEpoch`). IndexedDB compares in the
  write's transaction; the Convex component in `updateBox`'s mutation; Postgres in the write's one
  statement, reading the bundle row `FOR SHARE` -- without the lock, READ COMMITTED would compare
  the epoch in the statement's snapshot, and a rotation committed after it would go unseen; GraphQL
  passes the expectation whole to the VaultDB it serves. So "no look before writing" (G138) holds:
  storage alone refuses a stale vaultKey's write, atomically. The `FOR SHARE` lock is new: a bundle
  update now waits for lockbox writes in flight, and the README's hard-cap trigger takes a
  per-vault advisory lock rather than `FOR UPDATE` on the bundle, which would deadlock two writers
  each holding the shared lock. The real-Postgres race that proves the lock waits on thread 11's
  container suite. The 2026-10-16 entry above that says IndexedDB, Convex and Postgres "do not yet"
  is superseded.
* 2026-10-16 (epoch_expectation, the Coach's ruling on thread 4's review): **`close()` and a key
  outlived by a refresh are hard locks for a read in flight.** A `read()` or `use()` notes a
  per-handle count of hard locks when it starts (every shut, a `close()`, a refresh that drops the
  key because the ways in changed or the vault went) and hands back nothing if it moved meanwhile:
  the deciphered whisper is dropped, never returned. It is a separate count from the one unlocks
  race against, so a refresh an `unlock()` makes for itself does not defeat that unlock. Not hard
  locks, by design: a `lockSoon()` grace running out, and a clock that cannot be read.
* 2026-10-16 (secure_floor, G032): **an all-zero passphraseKey is refused.** `passphraseKeyOf`
  (`envelope.ts`), the one place the core receives any key deriver's output, refuses 32 zero
  bytes as `bad_option`, at create, unlock and every change to the ways in alike. No derivation
  makes them; a host deriver that kept its output and handed back bytes since wiped would, and
  the vault would seal under a key anyone can rebuild. The check reads every byte, OR-ing them
  together as libsodium's `sodium_is_zero` does, with no early exit; no JavaScript JIT promises
  constant time, and nothing secret rides on its timing, as an all-zero output is refused. No
  dependency offers the check, and `@noble/ciphers`' `equalBytes` would be a new one for one line.
* 2026-10-16 (secure_floor): **`openVault` refuses an insecure context** (`isSecureContext ===
  false`) first of all, as `insecure_context` (misuse): a browser withholds WebCrypto from plain
  http, which otherwise failed later as a `TypeError` with no kind. A runtime with no notion of
  one (Node, Bun, React Native: the global is absent) passes.
* 2026-10-16 (secure_floor): **a new passphrase must pass `passphraseStrengthTest`** before any key
  derivation: the one a vault is created with, and each one `addPassphrase` or `changePassphrase`
  sets; never at `unlock`, so no user is locked out of a vault that stands by a test made
  stricter later. The default is NIST SP 800-63B's length and no composition rules, at 12 code
  points (the Coach's floor; SP 800-63B rev. 4 asks 15 of a password that is the only factor,
  which a vault passphrase is). The refusal's message is the host test's own reason, a host
  string: the doc tells hosts never to quote the passphrase in it, and the core cannot check.
  `safebyok/browser` offers `zxcvbnPassphraseTest` on `@zxcvbn-ts/core` and
  `@zxcvbn-ts/language-common` (runtime dependencies at the Coach's yes): the length floor, then a
  zxcvbn score of at least 3, which is its blocklist of common passwords (NIST's other ask) and its
  pattern matchers. It keeps nothing of a passphrase between calls.
