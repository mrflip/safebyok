# gripeoween: security nitpicks

Entries of the old `notes/security.md` that are still true of the code but too fine to earn a
security reviewer's minute, moved out when the file became `notes/security_flags.md` (2026-10-28,
thread security_flags). Each is one line of what holds today; the dated reasoning is in git
(`git log -p -- notes/security.md`). Nothing here is a bug or an open question; an item that grows
teeth goes back into the flags file through the subagent route its header gives.

Not here, and not in the flags file either: the entries that only narrated what once stood (the
soft lock and its grace, the three lock counters, the device mark's lock generation,
`vault_key_epoch` and the rotation schema, `Ask` and `getProof`, `Proof`, `BoxHolder`, the
double-load check, the ckey tuples, every stored-format and purpose-string rename, each "amended:
no longer holds" chain). The file is an advisory, not a history (the Coach, 2026-10-19).

## Validation and refusals

* `cipherCtx` refuses a top-level `undefined` or `null` part, and a record part holding an
  `undefined` field, as `bad_option`; a non-finite number part would encode as `null` and is not
  guarded, every caller passing validated integers.
* `Refusals.storageUnavailable` turns a null or undefined cause into an `Error` saying the backend
  gave none, so no refusal carries a null cause.
* `hello()` and `ensureUnlocked()` refuse anything in place of their options that is not a plain
  object (an event, above all) as `bad_option`, the message saying how to wrap them as an event
  handler; before, an event was silently ignored.
* An options bag's unknown field is counted and the fields the bag takes are listed; nothing of the
  bag is quoted. No secret material reaches these bags.
* The `Validator` factory wraps each schema as `schema.clone()` with its own `parse`, not
  `Object.create(schema)`, because Zod binds methods such as its JSON Schema processors to the
  original instance; `safeParse` stays Zod's own.
* `vault_tok` and `revision_tok` are plain strings, since a host's adapter handles them; an empty one
  is refused with a fixed sentence ("A token is minted by safebyok, so it can't be empty").
* `mask` (`safebyok/utils`) shows a whisper's head and tail (two and four characters by default) and,
  up to `maxLen`, its length; it normalizes and strips the input, then checks the result through the
  same stripping, so a mask is one plain line free of combining marks, controls, format, surrogate,
  private-use and unassigned code points, bidirectional controls and blank-drawn symbols. Right-to-left
  letters and digits are kept (the Coach: strip the direction markers, not the scripts), so a mask may
  reorder neighbouring neutral characters in a display. `head`, `tail` and `minStars` are capped at
  1000. It refuses `bad_option` or `bad_whisper` without quoting its input.
* `Bank.make` refuses an insecure context (`isSecureContext === false`) first of all, as
  `insecure_context`, where a browser would otherwise fail later with a bare `TypeError`; a runtime
  with no notion of one (Node, Bun, React Native) passes.
* `Bank.make` refuses a `KeyDeriver` or strength checker `load` that is not a function; a failing
  deriver `load` refuses `unexpected_error` with the throw as `cause`, since `load` hears no
  passphrase.
* `KeyDeriver.deriveKeyBytes` takes a plain string, not the branded `PassphraseCleartext`; the brand
  stops at the seam.

## Records and stores

* A device record is handed out frozen and built from the scope's parsed names alone
  (`deviceRecordOf(scope, device_id, highest_vault_epoch)`), so nothing else a holder carries is
  stored; the first `device_id` stored stays.
* `Box.seal` takes the new box's scope and `vault_tok` from the vault it seals in and reads only the
  epochs from `madeUnder`, dropping a scope or `vault_tok` in `madeUnder` unread.
* `delBox` no longer reads the box before deleting; storage's own `absent` answer is `absent_box`.
* `getWhisper`, `useWhisper` and `delBox` on a locked vault refuse `absent_box` from the listing in
  hand, reading nothing, before any prompt; the listing is as fresh as `staleMinutes` keeps it, so a
  box another device stored since is `absent_box` until the next read. `putBox` validates its
  whisper, boxlabel and sidecar before it asks: a call that cannot land never prompts.
* A `putBox` that leaves out the whisper costs a read first, since the listing carries no
  ciphertext; ergonomics to reconsider.
* `isStorageBlocked` is duck-typed on the error's `name`, never `instanceof`; `InvalidStateError`
  stays `storage_unavailable`. `idbDeviceDB` throws a `NotSupportedError` `DOMException` at first
  use where the context has no `indexedDB`.
* `postgresVaultDB`'s `maxNameBytes` is 640, so a box's four-name primary key fits a btree entry.
* The Convex component's indexes are not unique: a second vault record row for one scope would make
  every later call on that vault throw (`.unique()`) rather than pick one.
* `graphqlVaultDB`'s `maxBoxes` only moves the client's own check; the server's refusal is the
  limit. GraphQL's subscription payload is the scope alone.
* `BoxFieldsBytes` (1 KiB) is the per-box allowance beside whisper and sidecar in the
  `maxVaultBytes` reckoning; the fields measure under 1,000 bytes at the longest names, and each
  `putBox` still weighs its box's real names. On Convex's 8 MiB about 102 boxes of the default
  40,444-byte whisper fit.
* `Scopepath`'s kind tests (`isLease`, `isDevice`, `isBox`) are full parses, never prefix tests,
  and answer false rather than throwing; a listing passes over a row under the vault's prefix that
  `isBox` rejects rather than failing the read.

## Timers, clocks and React

* The expiry timer is `unref`'d where the platform has it (Node, Bun), so an open vault never holds
  a process alive; a process that exits drops the key with it.
* `leaseHours` above 588 (24.5 days, the most one `setTimeout` reaches) is refused `bad_option`;
  `Infinity` arms no timer. A host that meant "very long" says `Infinity` and means it.
* `zxcvbnStrengthChecker` passes the scope's three names, whole and split into runs of letters and
  digits, to zxcvbn as user inputs.
* `WhisperField` sets `value` and `defaultValue` undefined after the host's props, so a value slipped
  past the types cannot make it controlled; the reveal toggle flips only the input's `type`.
* `GatingModal` runs one submit at a time (a ref guard), so one press never makes two passkeys.

## Build and CI

* `scripts/release.ts` quotes only npm's error code and summary, never the rest of what npm printed;
  no release job caches dependencies or persists git credentials.
* actionlint's version and sha256 are recorded in `scripts/actionlint.sh`; the e2e Postgres image
  digest is written in both `e2e/compose.yaml` and `ci.yml`, Dependabot moving the first and the
  second moved by hand with it. `pg` is a dev dependency of the private e2e package only.
* Dependabot's `cooldown` is seven days, matching `minimumReleaseAge`.
* The `safebyok/testing` entry imports vitest, an optional peer, and is imported by no other entry.
