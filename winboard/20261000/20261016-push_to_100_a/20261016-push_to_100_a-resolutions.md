# Sprint push_to_100_a: resolutions

Every open matter the Coach has resolved in this sprint, with the question in full as it was put
and the Coach's reply in full, word for word. The orchestrator keeps this file; the newest batch
comes first. A brief restatement of each ruling also sits beside the question wherever it was
raised (the PR body, the thread file, the `human/` entry), and the plan's *Coach rulings during the
sprint* holds the one-line version. "(empty: took the Rec)" means the Coach flipped the row to
`proceed` without writing, which accepts the recommendation.

## Fifth batch, 2026-10-16 (doc rev 7737)

### `store()` opens the old box to compare (thread 4)

* **Raised by**: thread 4 ([#132](https://github.com/mrflip/safebyok/pull/132)).
* **Question**: Does a store decipher the old whisper, and can a hard lock stop it? (thread 4, #132)
  Yes, store() deciphers: when a box already stands under that label it opens it (two quick AES-GCM
  steps, no passphrase work) and compares the plain whispers, only so that storing the same whisper
  again keeps its changed_at. It cannot compare ciphertexts: every seal draws a fresh random IV and
  a fresh lockbox key, so identical whispers never encrypt alike, and changing that would be new
  cryptography and a format change. Today a store checks the key once, after its last look at
  storage, and uses that key for the compare, the sealing and the send; a hard lock landing after
  that check does not stop it, and the write lands, as you said it should. A retry after another
  device's write checks again. Rec: keep the compare and the behaviour, and say both in the docs:
  store() opens the old box to compare, and lock() lets a write past its last check land.
* **Coach's reply**: "have a thread remove the changed_at guarantee and make it written_at, with no
  information about whether a change happened. Even if it's safe it raises too many questions for a
  library with this much to think about" -- `proceed`.
* **Where it went**: thread 17, `written_at`, new: `store()` stops opening the old box, and
  `changed_at` becomes `written_at`, stamped on every write, with no claim about whether anything
  changed -- in the stored record, every adapter, the docs and the demo. Before 1.0, so no
  migration; the changeset says what a host sees.

### "Passphrase must contain a capital letter"? (thread 14)

* **Raised by**: thread 14 ([#134](https://github.com/mrflip/safebyok/pull/134)).
* **Question**: "Passphrase must contain a capital letter"? (thread 14, #134) You asked about
  validations like this beside the passphrase field. The field now has room for a message of the
  host's (passphraseAdvice), shown as the user types and announced politely; thread 10's strength
  test fills it by default once the line is restacked. NIST SP 800-63B advises against composition
  rules (capitals, digits, symbols): they push people to Password1! without making guessing harder.
  Rec: no composition rules of ours; length and a strength estimate, and the slot stays open for a
  host that insists.
* **Coach's reply**: "if these principles are met by end of sprint I'm happy:1. we do not offer a
  weaksauce strength estimator (eg just length)2. the batteries-included safebyok/browser gives a
  good strength estimator3. optional: the customer can override or tweak the strength estimator" --
  `proceed`.
* **Where it went**: no composition rules of ours. The Coach's three principles (no weak estimator
  such as length alone; `safebyok/browser` gives a good one; the host can override or tweak it) go
  to thread 16, `strength_principles`, new, which must meet them by the end of the sprint.

### 12 characters, or NIST's 15? (thread 10)

* **Raised by**: thread 10 ([#136](https://github.com/mrflip/safebyok/pull/136)).
* **Question**: 12 characters, or NIST's 15? (thread 10, #136) The default passphrase test asks for
  at least 12 characters, as ruled. NIST SP 800-63B revision 4 asks for 15 when the password is the
  only thing protecting the account, which a vault passphrase is. It is one constant,
  MinPassphraseChars. Rec: raise it to 15 now, before 1.0, since the vault has no second factor
  behind it.
* **Coach's reply**: "1. we do not offer a weaksauce strength estimator (eg just length)2. the
  batteries-included safebyok/browser gives a good strength estimator3. the customer can override or
  tweak the strength estimator" -- `proceed`.
* **Where it went**: answered with the same three principles; thread 16 meets them. No length-only
  test is offered, so the 12-or-15 question becomes the floor inside the good estimator; thread 16
  keeps 12 unless it finds cause, and says so as a row.

### Spaces count toward the 12-character floor (thread 10's review)

* **Raised by**: thread 10's review ([#136](https://github.com/mrflip/safebyok/pull/136)).
* **Question**: Spaces count toward the 12-character floor (thread 10's review, #136). 'a' followed
  by 11 spaces passes the default length test, as the ruling (12 characters, no composition rules)
  has it; zxcvbnPassphraseTest catches it. Collapsing runs of whitespace before counting would close
  it. Rec: leave as ruled.
* **Coach's reply**: "this is why we are not implementing the length test" -- `proceed`.
* **Where it went**: no length test is offered on its own (thread 16 removes it), so the gap closes
  with it.

### Should the strength test know the user's names? (thread 10)

* **Raised by**: thread 10 ([#136](https://github.com/mrflip/safebyok/pull/136)).
* **Question**: Should the strength test know the user's names? (thread 10, #136) zxcvbn can mark
  down a passphrase built from the user's own words (their id, the vault's label) if it is handed
  them. Ours takes only the passphrase; passing names would add a second argument to every host's
  test. Rec: not now; keep the one-argument test.
* **Coach's reply**: "this doesn't seem hard, pass a bag including their id, vault label" --
  `proceed`.
* **Where it went**: thread 16: the strength test takes a second argument, a bag carrying the user's
  id and the vault's label (and the app label), and the zxcvbn test hands them to zxcvbn as user
  inputs.

### An inline strength test reopens the vault (thread 10's review)

* **Raised by**: thread 10's review ([#136](https://github.com/mrflip/safebyok/pull/136)).
* **Question**: An inline strength test reopens the vault: taken in YOLO (thread 10's review, #136).
  An arrow written inline as VaultProvider's passphraseStrengthTest gets a new identity on every
  parent render, and each one closed and reopened the vault, ending any open dialog. The test plays
  no part in opening, so I sent it back: a ref and one stable wrapper, with tests. The all-zero
  check's "constant time" wording is softened at the same time. Rec: proceed as taken.
* **Coach's reply**: "can we do the same thing as we do for logger?" -- `proceed`.
* **Where it went**: YOLO 17: the strength test becomes an option like `logger`: the vault takes it
  at open and keeps it, and a new identity reopens the vault, as every other option does; the README
  says to build it once. Thread 16 removes the ref wrapper. The context bag (above) removes the
  usual reason to write it inline. A row in the doc lets the Coach object.

### The provider repeats the core's not-a-function check (thread 10)

* **Raised by**: thread 10 ([#136](https://github.com/mrflip/safebyok/pull/136)).
* **Question**: The provider repeats the core's not-a-function check (thread 10, #136). To refuse a
  passphraseStrengthTest that is not a function at render, VaultProvider now writes its own
  bad_option check and message, and its own ?? passphraseLengthTest default, the same as the core's,
  rather than the core exporting its parseStrengthTest. The two could drift. Rec: the worker: keep,
  so the public surface stays narrow; the second reviewer: export a checkStrengthTest beside
  checkValidators in a later thread, and have the provider call it.
* **Coach's reply**: ""at render" -- we should be validating these at the earliest opportunity and
  leaving them immutable, is that the case?" -- `proceed`.
* **Where it went**: thread 16: the core exports `checkStrengthTest` beside `checkValidators` and
  the provider calls it at render, the earliest the prop exists; with YOLO 17 the vault holds the
  test unchanged for its life. The Coach's question ("is that the case?") is answered by a row in
  the doc: not today (the ref reads the latest), yes after thread 16.

### zxcvbn as hard dependencies of the core (thread 10's review)

* **Raised by**: thread 10's review ([#136](https://github.com/mrflip/safebyok/pull/136)).
* **Question**: zxcvbn as hard dependencies of the core (thread 10's review, #136). @zxcvbn-ts/core
  and @zxcvbn-ts/language-common are dependencies of safebyok itself, so every host installs about
  1.3 MB of dictionary even if it never uses zxcvbnPassphraseTest, and an unbundled safebyok/browser
  import (Node SSR, Vite dev) loads it. Bundled apps are unaffected; a test keeps it out of
  browserOpts. Rec: make them optional peers, needed only by the hosts that import the zxcvbn test,
  in thread 9.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 16 (moved from thread 9, since it bears on the principles):
  `@zxcvbn-ts/core` and `@zxcvbn-ts/language-common` become optional peers, needed only by hosts
  that import the zxcvbn test.

### Thread 10's strength test as thread 14's passphrase advice (threads 10 and 14)

* **Raised by**: threads 10 and 14 ([#134](https://github.com/mrflip/safebyok/pull/134)).
* **Question**: Thread 10's strength test as thread 14's passphrase advice (threads 10 and 14).
  Thread 14 gives the passphrase field a message slot fed by a host's passphraseAdvice; thread 10
  gives the vault a passphraseStrengthTest. They stand on different branches, so neither feeds the
  other yet. At the restack, the provider would show the strength test's reason as the advice when
  the host gives no passphraseAdvice, so the user hears why a passphrase is weak before pressing
  Create. Rec: yes, at the restack.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 16, which stands on both: the provider shows the strength test's reason
  as the advice when the host gives no `passphraseAdvice`.

### A second zxcvbn dependency (thread 10)

* **Raised by**: thread 10 ([#136](https://github.com/mrflip/safebyok/pull/136)).
* **Question**: A second zxcvbn dependency (thread 10, #136). Beside @zxcvbn-ts/core (your yes),
  thread 10 added @zxcvbn-ts/language-common, its word lists: without them zxcvbn catches only
  repeats and sequences, and scores password1234 a perfect 4. Both ship only in the separate
  safebyok/browser export (216 kB), never in openVault or browserOpts. Rec: yes, keep it: the test
  is worthless without its dictionaries.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: kept: `@zxcvbn-ts/language-common` stays beside `@zxcvbn-ts/core`.

### zxcvbn's passing score (thread 10)

* **Raised by**: thread 10 ([#136](https://github.com/mrflip/safebyok/pull/136)).
* **Question**: zxcvbn's passing score (thread 10, #136). The zxcvbn test passes a passphrase that
  scores at least 3 of 4, after the length floor. zxcvbn's own guidance treats 3 as "safely
  unguessable" for an online attack. Rec: keep 3.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: kept at 3 of 4.

### A weak passphrase while another device creates the vault (thread 10)

* **Raised by**: thread 10 ([#136](https://github.com/mrflip/safebyok/pull/136)).
* **Question**: A weak passphrase while another device creates the vault (thread 10, #136). If this
  device tries to create the vault with a weak passphrase at the very moment another device creates
  it, this one is refused as weak_passphrase, though its passphrase might have been meant to unlock
  the other's vault. Rec: accept: a retry finds the vault and unlocks it.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: accepted as built.

### A host's strength test that throws (thread 10)

* **Raised by**: thread 10 ([#136](https://github.com/mrflip/safebyok/pull/136)).
* **Question**: A host's strength test that throws (thread 10, #136). If a host's own test throws,
  the error passes through as it came, without a kind, as a throwing makePasskey already does. Rec:
  keep: it is the host's bug, and wrapping it would hide its message.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: kept: the host's error passes through as it came.

### A hand-written all-zero check (thread 10)

* **Raised by**: thread 10 ([#136](https://github.com/mrflip/safebyok/pull/136)).
* **Question**: A hand-written all-zero check (thread 10, #136). Refusing an all-zero derived key
  takes one line that ORs every byte together, the shape of libsodium's sodium_is_zero, rather than
  a new dependency (@noble/ciphers) for it. CLAUDE.md asks for your yes before anything is
  hand-rolled, and for no home-made comparisons in crypto; thread 10's reviewer is checking it. Rec:
  yes, keep the one line.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: the Coach's yes to the one hand-written line, as built.

### A device store that never opens (thread 13)

* **Raised by**: thread 13 ([#137](https://github.com/mrflip/safebyok/pull/137)).
* **Question**: A device store that never opens (thread 13, #137). When the browser's storage is
  blocked outright (a private window, storage turned off), the device store fails as
  storage_unavailable, the same kind as a passing failure, though a retry will not help. Per your
  ruling, the message now says exactly which read or write failed and what to check. A kind of its
  own would let a host stop offering a retry. Rec: keep the one kind; the message carries the
  difference.
* **Coach's reply**: "What does it cost to have the extra kind? it's fundamentally important to know
  "this cannot succeed, and we know wny" vs "this cannot succeed, and we know why, but it might
  succeed later"" -- `proceed`.
* **Where it went**: YOLO 18: a kind of its own for a device store that cannot succeed until
  something outside the vault changes (storage blocked, a private window), beside
  `storage_unavailable` for a failure a retry may mend. Thread 17 builds it and names it by
  VOCABULARY.md. The Coach's question ("What does it cost?") is answered by a row: one more member
  of the kinds union, its docs, and one branch where the device store opens.

### The Postgres hard-cap recipe takes an advisory lock (thread 13)

* **Raised by**: thread 13 ([#137](https://github.com/mrflip/safebyok/pull/137)).
* **Question**: The Postgres hard-cap recipe now takes an advisory lock (thread 13, #137). Every
  Postgres write now reads the vault's bundle row FOR SHARE to compare the epoch, so the README's
  optional hard-cap trigger, which took the same row FOR UPDATE, would deadlock two first writes. It
  now serializes on an advisory lock keyed by a hash of the vault's scope, so two vaults may share a
  key and wait on each other needlessly; the changeset tells hosts who installed it to replace it.
  Rec: as built; the recipe is an unsupported extra.
* **Coach's reply**: "delete the recipe. Provide a very short prompt for the customer to paste to an
  agent: it will download our library and write the recipe for them, explaining the tradeoffs" --
  `proceed`.
* **Where it went**: thread 9: the recipe leaves the Postgres README; in its place, a short prompt a
  host pastes to an agent, which reads the library and writes the recipe for them, explaining the
  trade-offs. The changeset says so.

### The epoch check under real Postgres concurrency (thread 13)

* **Raised by**: thread 13 ([#137](https://github.com/mrflip/safebyok/pull/137)).
* **Question**: The epoch check under real Postgres concurrency (thread 13, #137). Thread 13's FOR
  SHARE read is tested only on PGlite, which runs one statement at a time, so a write racing an
  epoch change is not exercised. Thread 11's container suites are where it belongs. Rec: add a race
  to e2e/tests/postgres/races.test.ts in thread 9, once the line has both.
* **Coach's reply**: "please explain the FOR SHARE stuff, I missed a memo" -- `explain`.
* **Where it went**: `explain`: the fuller explanation of `FOR SHARE` is in the doc's row, back at
  `drafting` for the Coach; the race test waits on it.

### Is every `lockSoon()` a hard lock? (thread 4)

* **Raised by**: thread 4 ([#132](https://github.com/mrflip/safebyok/pull/132)).
* **Question**: Is every lockSoon() a hard lock? No (thread 4, #132). lockSoon() turns new work away
  at once: a fresh read, store or unlock gets vault_locked, and the snapshot reads locked. But work
  already in hand (a read, a retried store, an unlock or passphrase change under way, even in
  another tab) finishes, and the key is truly dropped only at shut time, 5 seconds later by default.
  A hard lock() refuses even the work in flight. The "remembered unlock" is the copy this device
  keeps in its own storage so a reload or a new tab opens without the passphrase; lockSoon() erases
  that copy at once, so a tab opened during the grace must ask for the passphrase. That only shuts
  the back door for new tabs: the open handle keeps its key in memory until shut time. Rec: keep it.
* **Coach's reply**: "I don't understand, are you saying that every call to lockSoon is a hard
  lock?" -- `proceed`.
* **Where it went**: kept as built: no, `lockSoon()` turns new work away at once, lets work in hand
  finish, and drops the key at shut time; the Matter's explanation answered the Coach's earlier
  question.

### `erase()` into a reborn vault says `stale_write` (thread 4)

* **Raised by**: thread 4 ([#132](https://github.com/mrflip/safebyok/pull/132)).
* **Question**: erase() into a reborn vault says stale_write (thread 4, #132). If the vault was
  destroyed and made anew on another device, a store or a read here says vault_locked (the old key
  opens nothing). An erase says stale_write instead: the user asked for something to be gone, and
  what they meant to erase is not what stands, which is news they must hear; destroy and ways-in
  changes do the same. It makes the kinds a little uneven, so the docs say it plainly. Rec: keep.
* **Coach's reply**: "as long as the message says what happens "the contents of <box> could not be
  erased because its vault is inaccessable" or whatever" -- `proceed`.
* **Where it went**: the kind stays; thread 17 makes the message say what happened, in the Coach's
  spirit: the box's contents could not be erased because its vault is no longer the one this device
  opened.

### A failed catch-up hides the real kind (thread 4's review)

* **Raised by**: thread 4's review ([#132](https://github.com/mrflip/safebyok/pull/132)).
* **Question**: A failed catch-up hides the real kind (thread 4's review, #132). When a store's
  catch-up is refused because the user signed out (identity_revoked), the vault was rolled back, or
  a newer build wrote it (newer_format), the caller hears stale_write, and the real kind hides in
  its cause; read() already passes the real kind through. The vault has locked meanwhile, so the
  caller's next move differs. Rec: pass those kinds through unchanged, in thread 13.
* **Coach's reply**: (empty: took the Rec) -- `proceed`.
* **Where it went**: the Rec, taken: thread 17 passes `identity_revoked`, `rolled_back` and
  `newer_format` through a store's catch-up unchanged, unless thread 13 already did.

### The demo's whisper editor stays controlled (thread 14)

* **Raised by**: thread 14 ([#134](https://github.com/mrflip/safebyok/pull/134)).
* **Question**: The demo's whisper editor stays controlled (thread 14, #134). The demo dashboard's
  edit form shows whispers in plain text by design and fills with the stored whisper, so it stays a
  controlled textarea. It is the demo, not the package. Rec: leave it.
* **Coach's reply**: "yes, the never-used-for-real maintenance dashboard in the demo can be a plain
  text box" -- `proceed`.
* **Where it went**: left as is: the demo's maintenance form stays a plain text box.

### The demo's WaysIn passphrase field (thread 14's review)

* **Raised by**: thread 14's review ([#134](https://github.com/mrflip/safebyok/pull/134)).
* **Question**: The demo's WaysIn passphrase field (thread 14's review, #134). It now invites
  password managers with current-password, but has no form or username field, and it reads the
  passphrase only from onChange, so an autofill that sends no input event leaves it empty. Rec: wrap
  it in a form with a hidden username and read it by ref at submit, in a later demo pass.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 9: a form with a hidden username around it, read by ref at submit.

### The name a password manager files the passphrase under (thread 14)

* **Raised by**: thread 14 ([#134](https://github.com/mrflip/safebyok/pull/134)).
* **Question**: The name a password manager files the passphrase under (thread 14, #134). The
  passphrase field carries a hidden username, so a manager saves the passphrase as its own entry: by
  default "<user_id> (<vaultlabel> vault)", unlike the sign-in name, so the manager never offers to
  overwrite the user's login password. A host with readable names passes passphraseUsername. Rec:
  keep the default.
* **Coach's reply**: "let's try out The passphrase field carries a hidden username, so a manager
  saves the passphrase as its own entry: by default "<user_id> (<vaultlabel> vault)", unlike the
  sign-in name, so the manager never offers to overwrite the user's login password. A host with
  readable names passes passphraseUsername" -- `proceed`.
* **Where it went**: kept as built, to try out: the default `<user_id> (<vaultlabel> vault)`, and
  `passphraseUsername` for a host with readable names.

### Thread 14's changeset reads as a migration (thread 14's review)

* **Raised by**: thread 14's review ([#134](https://github.com/mrflip/safebyok/pull/134)).
* **Question**: Thread 14's changeset reads as a migration (thread 14's review, #134). WhisperField
  and WhisperFieldAttributes have never been released, so "a host drops value" describes surface no
  host has used. Rec: the reviewer: rewrite it at the restack to describe the fields as they now
  stand; the worker: keep the how-to, since a host must drop value.
* **Coach's reply**: "don't waste time on a migration nobody needs" -- `proceed`.
* **Where it went**: at the restack: thread 14's changeset describes the fields as they now stand,
  with no migration how-to.

### The demo's App tests depend on order (thread 14's review)

* **Raised by**: thread 14's review ([#134](https://github.com/mrflip/safebyok/pull/134)).
* **Question**: The demo's App tests depend on order (thread 14's review, #134). Under
  --sequence.shuffle, two App tests fail whenever they run after the click-through test, because its
  fake user stays signed in. In order they pass, so CI is green; it predates the thread. Rec: in
  thread 9, reset the fake sign-in in afterEach (the reviewer), or give each test a fresh fake
  IndexedDB (the worker).
* **Coach's reply**: "leave, file under RAGEBAIT" -- `proceed`.
* **Where it went**: left as is; filed under RAGEBAIT in `TODO.md`. Struck from thread 9.

### Host CSS can un-hide the hidden username field (thread 14's review)

* **Raised by**: thread 14's review ([#134](https://github.com/mrflip/safebyok/pull/134)).
* **Question**: Host CSS can un-hide the hidden username field (thread 14's review, #134). A host
  rule such as input { display: block } overrides [hidden], and would show the username field the
  dialog adds for password managers. Rec: add an inline display: none beside hidden, in thread 9.
* **Coach's reply**: "I am at peace with eventually making it optionally editable, but sure let's
  hide it for now" -- `proceed`.
* **Where it went**: thread 9: an inline `display: none` beside `hidden`. Making the field
  optionally editable may come later.

### Storing without a public bag keeps the old one (thread 2)

* **Raised by**: thread 2 ([#133](https://github.com/mrflip/safebyok/pull/133)).
* **Question**: Storing without a public bag keeps the old one (thread 2, #133). When a host stores
  a new whisper under an existing label and passes no public bag, the lockbox keeps the bag it
  already had; passing {} empties it. That was the note's rule, and the demo's "leave the note blank
  to keep it" relies on it. The alternative, an omitted bag meaning empty, is one line. Rec: keep:
  replacing a key should not make the host re-send its metadata.
* **Coach's reply**: "I hate optional fields but we can wait for it to bug me again, go ahead as you
  propose" -- `proceed`.
* **Where it went**: kept as built; filed under RAGEBAIT in `TODO.md` (optional fields), to fix if
  it bugs the Coach again.

### The empty bag counts toward the size limit (thread 2)

* **Raised by**: thread 2 ([#133](https://github.com/mrflip/safebyok/pull/133)).
* **Question**: The empty bag counts toward the size limit (thread 2, #133). maxWhisperBytes now
  counts the whisper and its public bag together, as ruled, and an empty bag is the two bytes {}. So
  a whisper of exactly the limit no longer fits, by two bytes. Rec: keep; the limit is about what is
  stored, and the README says so.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: kept as built.

### Room set aside per lockbox could halve (thread 2)

* **Raised by**: thread 2 ([#133](https://github.com/mrflip/safebyok/pull/133)).
* **Question**: Room set aside per lockbox could halve (thread 2, #133). When openVault weighs a
  vault against storage's limit, it allows 2,048 bytes per lockbox for the fields beside the
  whisper. With the note gone they need under 1,000, so 1,024 would do; lowering it lets more
  lockboxes fit under the same limit. Rec: lower it to 1,024 in thread 9, which re-derives the
  limits at the end.
* **Coach's reply**: "we can always be more generous later, as long as we don't increase the number
  of allowed vaults by too much" -- `proceed`.
* **Where it went**: thread 9 lowers it to 1,024 bytes, and says in its report how many more
  lockboxes fit under the same limit, so the allowance does not grow by much.

### Unknown `store()` options (thread 2's review)

* **Raised by**: thread 2's review ([#133](https://github.com/mrflip/safebyok/pull/133)).
* **Question**: Unknown store() options (thread 2's review, #133). A JavaScript caller still passing
  store(…, { note }) is silently ignored now that note is gone, since store()'s options are not
  checked strictly. Refusing unknown keys with bad_option, as validators does, would tell the host
  at once. Rec: yes, in thread 9.
* **Coach's reply**: "please do this with a helper that serves both if that's possible" --
  `proceed`.
* **Where it went**: thread 9: `store()` refuses unknown keys with `bad_option`, through one helper
  shared with `validators`' strict check, if one serves both.

### `cipherBinding`'s part guard (thread 2's review)

* **Raised by**: thread 2's review ([#133](https://github.com/mrflip/safebyok/pull/133)).
* **Question**: cipherBinding's part guard (thread 2's review, #133). cipherBinding refuses an
  undefined field inside a record part, but a top-level undefined part binds as null, and a null
  part throws a bare TypeError. The types exclude both, and every caller is internal. Rec: extend
  the guard in thread 9; low priority.
* **Coach's reply**: "y" -- `proceed`.
* **Where it went**: thread 9, as recommended.

### Lockbox in a module of its own (thread 2's second review)

* **Raised by**: thread 2's second review ([#133](https://github.com/mrflip/safebyok/pull/133)).
* **Question**: Lockbox in a module of its own, to save 2 kB (thread 2's second review, #133).
  Thread 2's canonical-text check pulls safe-stable-stringify into every entry that imports
  types.ts, so idbDeviceDB and browserOpts each grew about 2 kB, though they never touch a lockbox.
  Moving Lockbox and its check into their own module would let them drop it; the check stays at the
  boundary. Rec: yes, in thread 9, before it lowers the budgets.
* **Coach's reply**: "module meaning file? yes, or else explain" -- `proceed`.
* **Where it went**: thread 9: yes, a file of its own (`src/lockbox.ts` or the like), before it
  lowers the budgets.

### `__proto__` keys silently dropped (thread 2's second review)

* **Raised by**: thread 2's second review ([#133](https://github.com/mrflip/safebyok/pull/133)).
* **Question**: __proto__ keys silently dropped (thread 2's second review, #133). A bag or whisper
  with an own __proto__ key loses it on the way in, because Zod's record assigns it as the
  prototype. Nothing leaks, but the host gets back less than it stored, with no word why. Older than
  thread 2. Rec: refuse it, as bad_option for a bag and bad_whisper for a whisper, in thread 9.
* **Coach's reply**: "it sounds like your proposal is "we check for a crazy edge case used by people
  who know exactly what they're doing or have nfid what they're doing, so we can make them drop the
  weird field we would have dropped anyway". We already don't serialize undefined or functions. Note
  it in WONTFIX as undefined behavior" -- `proceed`.
* **Where it went**: no refusal: thread 9 writes a `notes/wontfix.md` entry -- an own `__proto__`
  key in a bag or whisper is undefined behaviour, as `undefined` and functions already are.

### `node:crypto` in a Postgres test helper (thread 11's review)

* **Raised by**: thread 11's review ([#131](https://github.com/mrflip/safebyok/pull/131)).
* **Question**: node:crypto in a Postgres test helper (thread 11's review, #131). The Postgres e2e
  tests give each scratch database a random name, made with Node's own crypto module (randomBytes).
  The minimal one is the web-standard crypto.getRandomValues: on Node it is the same WebCrypto
  global the browser has, and src/ already uses only that. Nothing needs to choose between them; the
  helper took Node's by habit, in a test file that also uses Node's file module. Exporting a shared
  piece from a tree-shakeable file is not worth it for one line of a test helper. Rec: switch it to
  crypto.getRandomValues in thread 9, with the other leftovers.
* **Coach's reply**: "gotcha. yes export" -- `proceed`.
* **Where it went**: thread 9: the helper switches to `crypto.getRandomValues`. Read in YOLO (19):
  "yes export" means export that helper from the e2e Postgres helpers, so the suites share one; a
  row lets the Coach correct it.


## Fourth batch, 2026-10-16 (doc rev 4547)

### Every device-store failure is `storage_unavailable` (thread 4, thread 13)

* **Raised by**: thread 4 ([#132](https://github.com/mrflip/safebyok/pull/132)).
* **Question**: **Every device-store failure is storage_unavailable (thread 4, #132).** Thread 3's
  leftover asked for this kind only when the device's own storage fails at open. Thread 4 widened
  it: any failure of this device's own store (reading or writing the remembered unlock or the
  device mark) throws storage_unavailable with the cause attached, even from lock(), which still
  locks. A kind for every condition lets a host say "your browser's storage is unavailable" and
  offer a retry. Rec: keep.
* **Coach's reply**: "failure messages should be as fine-grained as reasonable; we can assign
  contextual groupings if needed" -- `proceed`.
* **Where it went**: thread 13 keeps the kind (the grouping a host branches on) and makes each
  message say exactly which read or write of the device store failed; a case that deserves a kind
  of its own comes back as an open matter.

### G499, the conflict hook: sweep it or shelve it? (thread 4)

* **Raised by**: thread 4 ([#132](https://github.com/mrflip/safebyok/pull/132)).
* **Question**: **G499, the conflict hook: sweep it or shelve it? (thread 4, #132)** G499 asked
  for a pluggable handler for odd conflicts, like a lockbox too damaged to name its epoch meeting a
  healthy store. Thread 4 settled it with one sentence in VAULTDB.md: no conflict hook; an erase
  wins, the last writer wins, and the vault never clears damage on its own, so store() over the box
  is the handler. The Gripefest doc still files G499 on its NOT YET shelf. Rec: sweep it: the doc
  line states the settled design.
* **Coach's reply**: "Leave conflict handler as NOTYET, so that when the idea keeps coming up
  there's some place to point to" -- `proceed`.
* **Where it went**: `NOTYET.md`, "A conflict handler"; G499 stays on the Gripefest doc's NOT YET
  shelf.

### Key drops that are not hard locks (thread 4's review, thread 13)

* **Raised by**: thread 4's reviewer ([#132](https://github.com/mrflip/safebyok/pull/132)).
* **Question**: **Key drops that are not hard locks (thread 4's review, #132).** close(), a clock
  that cannot be read, a key outlived by a refresh, and lockSoon() past its shut time all drop the
  key without counting as a hard lock, so a read in flight across one still returns its whisper.
  None is a hard lock as lock()'s doc defines one. Rec: count close() and the outlived key as hard
  locks, in thread 13, and say in lock()'s doc that the clock and soft cases are not (thread 4's
  worker suggests the same).
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 13, as recommended, with tests.

### Chrome may still offer a saved password on the whisper field (thread 14)

* **Raised by**: thread 14 ([#134](https://github.com/mrflip/safebyok/pull/134)).
* **Question**: **Chrome may still offer a saved password on the whisper field (thread 14, #134).**
  Chrome ignores autocomplete="off" on a password-type field, so the whisper field may still be
  offered a saved password despite the password managers' ignore flags. Avoiding it means a plain
  text field masked by a non-standard CSS property (-webkit-text-security), which not every browser
  honours. Rec: accept, as ruled.
* **Coach's reply**: "put as WONTFIX" -- `proceed`.
* **Where it went**: thread 9 enters it in `notes/wontfix.md` (born in thread 3, so thread 14's
  branch does not have it).

## Third batch, 2026-10-16 (doc rev 4104)

### The `KeyDeriver` union becomes a shim (thread 6, thread 15)

* **Raised by**: thread 6 ([#126](https://github.com/mrflip/safebyok/pull/126)); explained at the Coach's asking.
* **Question**: **Why KeyDeriver is a union, explained (thread 6, #126).** You asked: "Why is the
  KeyDeriver interface not uniform? I'd likely prefer a thin shim over Argon2 that speaks our
  language." The core already calls every deriver one way, deriveKeyBytes(passphrase, salt). The
  union (Argon2idKeyDeriver or CustomKeyDeriver) exists so the compiler insists an Argon2id
  deriver states every parameter or none, and openVault checks them against the floors (salt
  length, memory, passes, lanes, a 32-byte key), so a lookalike or unrunnable spec fails calmly at
  open rather than at first unlock. It costs what you saw: a class cannot implement a union, and
  the types cannot fully stop a custom deriver half-claiming Argon2id (the runtime check still
  does). Your shim would have the core own the Argon2id spec and its floor check, with a host
  supplying only a runner of (passphrase, salt, params): simpler to teach and review, and a host
  could not misreport its parameters. It gives up a first-class route for non-Argon algorithms
  (deferred anyway), and reshapes a surface #126 has just reshaped. Rec: adopt the shim, as its
  own thread after #126, not blocking it.
* **Coach's reply**: "yes, shim. Why does it give up a first-class route for non-Argon
  algorithms? I'd have an abstract class presenting a facade that our two different derivers and
  any conjectured other ones subclass" -- `proceed`.
* **Where it went**: thread 15, `deriver_shim`, on 6. To the Coach's question: with an abstract
  base class it gives up nothing -- another algorithm is another subclass with its own spec check.

### The hand-rolled refresh queue (thread 4, thread 13)

* **Raised by**: thread 4 ([#132](https://github.com/mrflip/safebyok/pull/132)), and its reviewer.
* **Question**: **A hand-rolled refresh queue (thread 4, #132).** Refreshes now run one at a time,
  and a request made meanwhile shares one more run: about 20 lines in vault.ts. No boring library
  does exactly this (p-limit serializes but does not merge waiting requests; debounces are
  time-based), and CLAUDE.md wants your yes before anything is hand-rolled. Thread 4's reviewer is
  checking it now. Rec: yes, keep the 20 lines.
* **Coach's reply**: "yes, but can it live outside vault, which is jumbo jumbo context mojo" --
  `proceed`.
* **Where it went**: thread 13: the queue moves to a module of its own with its own tests.

### A device can trip over its own passphrase change (thread 4)

* **Raised by**: thread 4 ([#132](https://github.com/mrflip/safebyok/pull/132)).
* **Question**: **A device can trip over its own passphrase change (thread 4, #132).** Already on
  main: while this device changes its ways in, its own refresh can judge its key outlived and
  forget the remembered unlock just as the new one is written, so the next open asks for the
  passphrase. It fails in the safe direction. Rec: a TODO for a small later thread: never judge
  the key outlived against a bundle this handle wrote itself.
* **Coach's reply**: "Add this next to "Are we doing people any favors by allowing multiple
  passphrases" in the TODO" -- `proceed`.
* **Where it went**: `TODO.md`, *Soonish*, "A device can trip over its own passphrase change".

### Thread 11's review leftovers (thread 11, thread 9)

* **Raised by**: thread 11's reviewer ([#131](https://github.com/mrflip/safebyok/pull/131)).
* **Question**: **Thread 11's six review leftovers (#131).** Two Postgres tests claim to test the
  lockbox limit but pass with it removed (retitle them to what they prove). The helper that waits
  for a blocked write accepts any lock wait. The test pools have no 'error' listener, so a dropped
  server crashes the run. The CI database listens on all interfaces (127.0.0.1 would match
  compose). And the image digest is written twice, with Dependabot moving only one. Rec: fold the
  first four into thread 9 (sweep_small); for the digest, a CI step that fails when the two differ
  (the Coach split the node:crypto item into a row of its own).
* **Coach's reply**: "yes fix in a later thread" -- `proceed`.
* **Where it went**: thread 9, all five.

### The Postgres adapter's own tests on the container (thread 11)

* **Raised by**: thread 11 ([#131](https://github.com/mrflip/safebyok/pull/131)).
* **Question**: **The Postgres adapter's own tests on the real server (thread 11, #131).** The new
  container runs only the e2e suites; the adapter's own tests (packages/safebyok-postgres/tests/)
  still run on PGlite in-process, because they are written against PGlite's interface. A small
  PGlite-shaped wrapper over a pg pool would let them run on the container too, so 'every
  Postgres test, one line' holds. Rec: a TODO, to be weighed with your row on what runs against
  real Postgres.
* **Coach's reply**: "NOTYET" -- `proceed`.
* **Where it went**: `NOTYET.md`, "The Postgres adapter's own tests on a real server".

### One row per matter (the process)

* **Raised by**: the Coach, in *Coach notes*.
* **Question**: (the Coach's own note)
* **Coach's reply**: "please take the rolled up end-of-thread notes and expand each into a row so
  that I can address them individually." -- `proceed`.
* **Where it went**: the rolled-up rows are split, one matter each; the `turbochat` and `sprint`
  skills now say one row per decision, never a report's leftovers rolled together.

## Second batch, 2026-10-16 (doc rev 3282)

### Uncontrolled whisper and passphrase fields (thread 14)

* **Raised by**: the orchestrator, from thread 7's review ([#129](https://github.com/mrflip/safebyok/pull/129)).
* **Question**: **WhisperField writes the secret into the page.** React 19 copies a controlled
  input's value into its `value` attribute, so the whisper (and the passphrase) sit in the DOM
  where an extension or a DOM dump can read them. Rec: proceed with thread 14, making both fields
  uncontrolled.
* **Coach's reply**: "does this still let me have an eyeball to see the password? Pleasant
  validations next to it? ("passphrase must contain a capital letter"?)" -- `proceed`.
* **Where it went**: thread 14, with the eyeball kept, and a message beside the passphrase field fed by a
  host callback (thread 10's `passphraseStrengthTest()` at the restack); no composition rules of
  our own; the capital-letter question returns as a matter.

### Should a second unsubscribe warn? (thread 5b)

* **Raised by**: the orchestrator, from the store base design (thread 5a).
* **Question**: **Should a second unsubscribe warn?** Calling an unsubscribe twice is harmless.
  Rec: no warning; React's `useSyncExternalStore` calls it once per subscribe, StrictMode
  included, and `removeEventListener`, Redux and RxJS are all silent no-ops.
* **Coach's reply**: "agree, no warning, thanks for the explanation" -- `proceed`.
* **Where it went**: thread 5b builds it silent, as designed.

### `autocomplete="new-password"` on the whisper field (thread 7, thread 14)

* **Raised by**: thread 7 ([#129](https://github.com/mrflip/safebyok/pull/129)), its open questions.
* **Question**: `autocomplete="new-password"` (your list) stops autofill of saved passwords, but
  Chrome may offer its password generator on such a field. Keep it, or drop that one attribute?
* **Coach's reply**: "we need to offer two different things: 1) a field for entering a secret to
  store; this is best NOT offered to a password generator to complete or for a generator to
  manufacture; 2) a field for entering a passphrase tied to this URL -- that should be in every
  way the bestest most bestpractices compliant and password manager friendly field there is" --
  `proceed`.
* **Where it went**: thread 14: the whisper field turns autofill and generators away; the passphrase field
  invites password managers (a real form, `new-password` / `current-password`, a username).

### The provider and a `bad_option` refusal (thread 7)

* **Raised by**: thread 7 ([#129](https://github.com/mrflip/safebyok/pull/129)), its open questions.
* **Question**: The provider no longer reopens on `bad_option` per the ruling, though from the
  provider a "reads sound now" refusal is a race, not misuse; `retryOpen()` mends it.
* **Coach's reply**: (empty: took it as it stands) -- `proceed`.
* **Where it went**: no change; thread 7 stands as filed.

### Not done: real screen reader, shadow DOM, real browser (thread 7)

* **Raised by**: thread 7 ([#129](https://github.com/mrflip/safebyok/pull/129)), its open questions.
* **Question**: Not done: a real screen reader, real shadow-DOM hosting, a real browser (G356
  stays).
* **Coach's reply**: "add NOTYET --" -- `proceed`.
* **Where it went**: `NOTYET.md`, "The React binding under real assistive technology and real hosts".

### `postgres` as a required check (thread 11)

* **Raised by**: thread 11 ([#131](https://github.com/mrflip/safebyok/pull/131)), its open questions.
* **Question**: Is `postgres` to become a required check, once it has run a while?
* **Coach's reply**: "add TODO --" -- `proceed`.
* **Where it went**: `TODO.md`, *Sand in the sandals*: "`postgres` a required check, once it has run a
  while". The ruleset is the Coach's to change.

### `node-compat (22)` as a required check (thread 8)

* **Raised by**: thread 8 ([#130](https://github.com/mrflip/safebyok/pull/130)), its hands-only items.
* **Question**: Add `node-compat (22)` to the main ruleset's required checks. CI's node-compat job
  now gates on Node 22 (the platform floor) and only reports on the newest Node
  (`continue-on-error` for the rest of the matrix). A workflow cannot make a check required; the
  ruleset is yours.
* **Coach's reply**: "add TODO --" -- `proceed`.
* **Where it went**: `TODO.md`, *Sand in the sandals*: "`node-compat (22)` a required check".

### Answers to the Coach's side questions (thread 11)

* **Raised by**: thread 11 ([#131](https://github.com/mrflip/safebyok/pull/131)).
* **Question**: Answers to the Coach's side questions: the other backends go on the same compose
  file, one service each; Playwright gets its own job, written in `e2e/README.md`.
* **Coach's reply**: "thanks, noted —" -- `proceed`.
* **Where it went**: no change.

### Two release paths unproven until they run (thread 8)

* **Raised by**: thread 8 ([#130](https://github.com/mrflip/safebyok/pull/130)), its open questions.
* **Question**: The release workflow's retry (`publish` re-reports a tag whose GitHub release is
  missing) reads the release with `gh` using the token the changesets action gives the script.
  Unproven until a release fails between tag and release; the logic is tested with a fake `gh`.
  If `gh` cannot authenticate there, the run fails calmly (`could not tell what is left to do`)
  rather than guess. Also: watch the first Dependabot runtime-dependency PR after merge.
  `dependabot-changeset.yml` was written and its script tested here (against a scratch
  repository, and the CI gate's shell block run by hand), but it cannot run until it is on main.
  Unproven: that the `releasing` environment's `RELEASE_APP_PRIVATE_KEY` reaches a
  `pull_request_target` run Dependabot started (if the `app-token` step fails for want of a key,
  add the same key as a Dependabot secret in the repository's settings); that the App's push of
  `.changeset/dependabot-<n>.md` re-runs CI on the branch; and that Dependabot's later behaviour
  on a branch with a bot commit is as expected (it stops rebasing, as it did for your
  hand-written ones).
* **Coach's reply**: "Noted, will watch for these both —" -- `proceed`.
* **Where it went**: no change; the Coach watches the first failed release and the first Dependabot
  runtime-dependency PR.

### CLAUDE.md's stale *Commands* lines (thread 8)

* **Raised by**: thread 8 ([#130](https://github.com/mrflip/safebyok/pull/130)), its hands-only items.
* **Question**: CLAUDE.md's *Commands* is a line stale (I did not edit it): `pnpm justify` now
  also runs the size budgets, and `pnpm size` now builds once; `pnpm size:check` measures what is
  already built.
* **Coach's reply**: "fixed in my branch" -- `proceed`.
* **Where it went**: the Coach's own branch; nothing for the sprint.

### Resolutions beside their questions, and every worker matter in the doc (the process)

* **Raised by**: the Coach, in *Coach notes* and in chat.
* **Question**: (the Coach's own note)
* **Coach's reply**: "update the turbochat and sprint (and/or worker) skill -- when I give a
  resolution to an open matter raised in the pr and/or whiteboard or human file, deposit the same
  brief restatement next to it; also maintain a
  whiteboard/YYYMMDD-sprintname/YYYMMDD-sprintname-resolutions.md file that has the full question
  and the full reply. * make sure that every new open matter from the workers is cycled back -- by
  orchestrator or by them -- to the doc" -- `proceed`.
* **Where it went**: this file; the `turbochat` and `sprint` skills and the `thread-worker` and
  `thread-reviewer` agents (on the sprint PR); every worker and reviewer now ends its report with
  an *Open matters* list, which the orchestrator puts in the tab.

### The CI failures (thread 14)

* **Raised by**: the Coach, in *Coach notes*.
* **Question**: (the Coach's own note)
* **Coach's reply**: "There is a test failure currently on CI, as well as an over-budget size
  test" with the log of `packages/safebyok-react` `tests/vault-provider.test.tsx` > VaultProvider >
  when openVault rejects > eraseDamagedVault > "opens again, and still rejects, when the erase
  finds storage changed: it reads sound now" (`AssertionError: promise resolved "undefined"
  instead of rejecting`, at `tests/vault-provider.test.tsx:774:55`) -- `proceed`.
* **Where it went**: the `vault-provider` flake is on main (it fails on the documents-only sprint PR
  too) and the demo's `App.test.tsx` fails on #129. Both went to thread 14, first. The size
  overrun is thread 4's `openVault` budget, 1.7 kB over on its draft, and thread 4 raises that
  line (YOLO 10, 11).

### Why is the `KeyDeriver` interface not uniform? (thread 6) -- explained, not yet resolved

* **Raised by**: thread 6 ([#126](https://github.com/mrflip/safebyok/pull/126)), and the Coach's note on it.
* **Question**: `class X implements KeyDeriver` no longer compiles (a class cannot implement a
  union): a host writes `implements CustomKeyDeriver` or `Argon2idKeyDeriver`. One test of ours
  did exactly that.
* **Coach's reply**: "Why is the KeyDeriver interface not uniform? I'd likely prefer a thin shim
  over Argon2 that speaks our language. Explain, but don't take further action yet" -- `explain`.
* **Where it went**: explained in a new *Open Matters* row, set back to `drafting` for the Coach.

## First batch, 2026-10-16 (doc revs 126 to 1998)

Ruled before this file existed, and recovered from the session's record of the tab, oldest first.
Where the Coach typed in front of the agent's text in a *Coach notes* row, the Coach's words are
the reply and the agent's text is the question. The Store base design's highlighted comments are
in the plan's thread 5 entry, not repeated here.

### `user_id` characters (thread 1)

* **Raised by**: thread 1
* **Question**: **`user_id` characters (thread 1).** The default `user_id` check becomes letters, digits and `-_.:@+|`, 1 to 100 characters, with no `^` or `/`. **Rec:** keep this set; it covers provider ids (Clerk, Auth0, Convex) and emails.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 1 (#128): letters, digits and `-_.:@+|`, 1 to 100.

### Standard Schema (G497)

* **Raised by**: G497
* **Question**: **Standard Schema (G497).** Once thread 1 binds validators once at `openVault`, accepting any Standard Schema validator (Valibot, ArkType) instead of Zod's becomes a small change. **Rec:** leave it NOT YET; nothing in this sprint needs it.
* **Coach's reply**: "NOTYET" -- `proceed`.
* **Where it went**: stays NOT YET.

### Relative-time polyfill (thread 7)

* **Raised by**: thread 7
* **Question**: **Relative-time polyfill (thread 7).** The dialog's "locks in 3 hours" uses `Intl.RelativeTimeFormat`, which some runtimes (React Native's Hermes) lack. **Rec:** document only: the React README names `@formatjs/intl-relativetimeformat` for a host to import, and we add no dependency.
* **Coach's reply**: "yes. If i understand right, we implement nothing but `Intl.RelativeTimeFormat` code, assume it's there, and tell people how to make sure it's 100% always there" -- `proceed`.
* **Where it went**: thread 7 (#129): no presence check and no fallback; the React README says how a host makes sure it is there (`@formatjs/intl-relativetimeformat`); no dependency.

### The adapters' logger option (thread 5)

* **Raised by**: thread 5
* **Question**: **The adapters' logger option (thread 5).** Every storage adapter will take a logger when it is built, with the console as the fallback. **Rec:** call it `logger` everywhere, the same name `openVault` uses.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 5b: `logger` in every adapter, in one options bag.

### A hint on the whisper field (thread 7)

* **Raised by**: thread 7
* **Question**: **A hint on the whisper field (thread 7).** Your push_to_100 note asks "do we offer a hint?" for the field where a user pastes an API key. **Rec:** a `placeholder` the host passes (`sk-…`), none by default, and never anything taken from a stored whisper.
* **Coach's reply**: "yes
Add a NOTYET "Option to let user add a hint on their passphrase"" -- `proceed`.
* **Where it went**: thread 7 (#129): a host `placeholder`, none by default; NOTYET: "Option to let the user add a hint on their passphrase".

### Password strength meter (thread 10)

* **Raised by**: thread 10
* **Question**: **Password strength meter (thread 10).** Thread 10 requires 12 characters at least (NIST's rule: length, no composition rules). A real strength meter (`@zxcvbn-ts/core` and its dictionaries, hundreds of kB) would be a dependency. **Rec:** no: the host adds one if it wants.
* **Coach's reply**: "The "don't let customers shoot themselves in the foot" rule says we should not offer a bullshit password meter. Add a pluggable callback passphraseStrengthTest() to the entry point. Have safebyok/browser export `@zxcvbn-ts/core` as a tree-shakeable default. 
Add a NOTYET "Break out dependencies including the -fastkey into a  -utils or -bestpractices package"" -- `proceed`.
* **Where it went**: thread 10: `passphraseStrengthTest()` on the entry point, `@zxcvbn-ts/core` from `safebyok/browser` as a tree-shakeable default (the Coach's yes to the dependency); NOTYET: break dependencies out into a -utils or -bestpractices package.

### Where the password-manager attributes live (thread 7)

* **Raised by**: thread 7
* **Question**: **Where the password-manager attributes live (thread 7).** Your note asks to export the field's ignore attributes, and whether we need a /utils package. **Rec:** no new package: export them from `safebyok/utils`, beside `mask`, since they are framework-neutral.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 7 (#129): exported from `safebyok/utils` beside `mask`.

### PostgresVaultDB type (thread 5)

* **Raised by**: thread 5
* **Question**: **PostgresVaultDB type (thread 5).** Once every VaultDB can list whole records for a server, the exported PostgresVaultDB type means nothing more than VaultDB. **Rec:** drop it (before 1.0, no alias).
* **Coach's reply**: "if the question is "we used to export a certain type, but we found out we don't need to, can we stop exporting it possibly breaking two people in the entire world's code" the answer is yes drop it; else explain" -- `proceed`.
* **Where it went**: thread 5b: the type is dropped.

### Store base design (thread 5)

* **Raised by**: thread 5
* **Question**: **Store base design (thread 5).** Thread 5 builds a shared base class for every storage adapter; the preplan says you read its design before it is built. The design is written: the Store base design tab, about ten minutes' read. **Rec:** read it, then `proceed`; until then thread 5's build waits and the rest of the sprint carries on.
* **Coach's reply**: "yes, see comments (highlighted)" -- `proceed`.
* **Where it went**: thread 5b proceeds with the comments highlighted in the Store base design tab: one options bag per adapter factory; openVault hands its logger to the adapter; `reportError` checked at call time, with a TODO; no bindValidators; no ShelfVaultDB.

### One-character key joiner (thread 1)

* **Raised by**: thread 1
* **Question**: **One-character key joiner (thread 1).** The preplan let a host swap the key-value adapters' key join and split functions. Thread 1 offers only a different delimiter character (^ by default): prefix scans and IndexedDB key ranges need a prefix that is exact, which a free-form join cannot promise. A host whose names allow any text can pick NUL, which no name may hold. **Rec:** accept, as built.
* **Coach's reply**: "don't let a host set the key join and split., or specify a different character" -- `proceed`.
* **Where it went**: thread 1 (#128), rebuilt: `^` fixed, no host delimiter, and `^` refused by the name floor everywhere (YOLO 7).

### No bindValidators (thread 1)

* **Raised by**: thread 1
* **Question**: **No bindValidators (thread 1).** The preplan had openVault bind its validators onto the storage adapter once. Thread 1 (#128) found that, with host validators run only where the vault takes input, storage never needs them: every verb lost its validators argument and no binding was added. A binding would also forbid two vaults with different rules on one adapter; it can be added later without breaking anyone. **Rec:** accept, as built.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 1 (#128), as built.

### Is lockSoon() a soft lock? (thread 3)

* **Raised by**: thread 3
* **Question**: **Is lockSoon() a soft lock? (thread 3)** As built (#127), lockSoon() wins against an unlock already under way in another tab, like lock(), and forgets the remembered unlock at once. Fable's strawman made it soft: an unlock under way would finish. Flipping it is two lines and two tests. **Rec:** keep it hard as built: a user who asked to lock soon expects nothing new to open meanwhile.
* **Coach's reply**: "lockSoon is a a soft lock" -- `proceed`.
* **Where it went**: thread 4 (#132): `lockSoon()` is soft.

### Refuse an all-zero derived key (thread 6, G032)

* **Raised by**: thread 6, G032
* **Question**: **Refuse an all-zero derived key (thread 6, G032).** We now wipe the deriver's output bytes after use. A host deriver that caches its output would hand back zeros next time, and the vault would seal under a key anyone can rebuild; today only the docs forbid that. **Rec:** yes, refuse an all-zero result as bad_option: one check, added on top of #126.
* **Coach's reply**: "yes" -- `proceed`.
* **Where it went**: thread 10: refused as `bad_option`.

### Passkey changing a passphrase (thread 6, G072)

* **Raised by**: thread 6, G072
* **Question**: **Passkey changing a passphrase (thread 6, G072).** changePassphrase now takes any proof, a passkey's included. When a vault has several passphrases and the proof is a passkey, the caller must name which passphrase to replace (unlockId), or the call is refused rather than guessing. **Rec:** keep as built (#126).
* **Coach's reply**: "keep as built, but this is too complicated for a user to tolerate or a customer to implement UX for. add this under a todo item (or create that todo item) "Are we doing anyone a favore by accepting multiple passphrases"" -- `proceed`.
* **Where it went**: kept as built (#126); TODO.md *Soonish*: "Are we doing anyone a favor by accepting multiple passphrases?"

### ShelfVaultDB (thread 5)

* **Raised by**: thread 5
* **Question**: **ShelfVaultDB (thread 5).** The design offers a further base for key-value stores: a connector writes one atomic step, and the base writes every verb on top of it, folding localVaultDB and idbVaultDB into it. It needs a three-line promise chain we would hand-roll. **Rec:** not this sprint; the shared expectation checks are built now, and this waits for a later design.
* **Coach's reply**: "agree, add as a TODO" -- `proceed`.
* **Where it went**: TODO.md *Side quests*: "`ShelfVaultDB`, a base for key-value stores".

### A todo on identity and the backing database

* **Raised by**: the Coach, in *Coach notes*
* **Question**: (the Coach's own note)
* **Coach's reply**: "Add a todo: "Identity should not be tied to the backing database"" -- `proceed`.
* **Where it went**: TODO.md *Soonish*: "Identity should not be tied to the backing database".

### A read overtaken by a hard lock (G119, part two)

* **Raised by**: the orchestrator, in a *Coach notes* row the Coach answered in place
* **Question**: G119, part two: a `read()` in flight when a hard lock lands. Today `read()` checks the lock at its door, then awaits storage, then decrypts and returns. If `lock()` lands during the await, the whisper still comes back, because G022 settled that work already started finishes. That is right for the soft lock, which has a grace. For a hard lock it means the goons can get one more whisper. The proposal: each handle already keeps a counter that every lock bumps. `read()` notes the counter at its door and, after its last await, compares once. If it moved, it refuses `vault_locked` instead of decrypting. Your worry was that this sounds like its own race. It is not, for one reason: the counter only ever goes up, so the compare can only turn a would-be success into a refusal, never the reverse, and there is no window in which two outcomes become possible that were not possible before. A whisper that was already returned before the lock cannot be clawed back, and that is correct, the lock came after. A soft lock does not bump the counter until its timer drops the key, so a read inside the grace still finishes. One integer compare per read, no new state, no timer.
* **Coach's reply**: "agree, no more reading if the goons are at the door" -- `proceed`.
* **Where it went**: thread 4 (#132): a hard lock landing during a read refuses it and drops the whisper.

### A refresh that meets rolled_back (G516)

* **Raised by**: the orchestrator, in a *Coach notes* row the Coach answered in place
* **Question**: G516, first bullet: a refresh that meets `rolled_back`. Since #120 each device remembers the highest epochs it has seen, and refuses a copy of the vault older than that as `rolled_back`, so storage cannot quietly bring back a removed way in. At open and at unlock that refusal stops you. But when a background refresh, a push from storage, meets it on an already unlocked vault, #120 chose in YOLO to log a line and leave the vault unlocked. The proposal is that this joins the sign-out case in `refusal-policy.ts`: an untrustworthy copy of the vault drops the key, now. I should be honest about what it buys. The exposure is small, because every write already carries epoch expectations that an older storage would refuse, so a device staying unlocked over rolled-back storage can read its own lockboxes and cannot write anything harmful. What locking adds is that the user hears about it at once, through the snapshot and the dialog, rather than through a log line nobody reads, and that "storage I cannot trust" becomes one rule for both signals instead of two behaviours.
* **Coach's reply**: "Agree, one rule" -- `proceed`.
* **Where it went**: thread 4 (#132): `rolled_back` on a refresh locks the vault, by the same rule as `identity_revoked`.

### Remove 'stay' (G119, part one)

* **Raised by**: the orchestrator, in a *Coach notes* row the Coach answered in place
* **Question**: G119, part one: drop `whenIdentityRevoked: 'stay'`. Since #106, when storage answers that the signed-in user is gone or someone else signed in, the vault locks itself, as `lock()` would. The option `'stay'` turns that off: the refusal is thrown, and the key stays in memory. It was kept for a host whose auth blips, a token refresh that briefly looks like a sign-out, so users are not locked out every few minutes. My objection is that a blip is not a sign-out. Contract line 5.5 says an adapter raises `identity_revoked` only when the user really is not the scope's user, so a backend that raises it on a blip is breaking the contract, and `'stay'` papers over that bug by keeping keys past a sign-out. The strawman's P8 says a sign-out is one of the few things that hard-locks. Dropping `'stay'` is one enum value and a README paragraph. The cost is that a host with a blipping backend has to fix the adapter, which is where the fault is.
* **Coach's reply**: "Remove 'stay' please" -- `proceed`.
* **Where it went**: thread 4 (#132): `whenIdentityRevoked` is removed, from the core and from `VaultProvider`.

### One rule, no knob, for sign-out and rolled_back

* **Raised by**: the orchestrator, in a *Coach notes* row the Coach answered in place
* **Question**: The strawman says `rolled_back` gets "the same host knob" as the sign-out case, and G119 says to drop that knob. My recommendation is one rule and no knob for either: both hard-lock, and the host's way out after a deliberate restore is the README's `eraseMark` recipe, which G513 keeps. If you want a knob anywhere, keep it for `rolled_back` alone, since restoring from a backup is something a host does on purpose while a sign-out blip is a backend bug.
* **Coach's reply**: "agree, one rule, simple to reason about" -- `proceed`.
* **Where it went**: thread 4 (#132): one rule in `RefusalPolicy.decide`, no knob; a host's way out after a deliberate restore is the README's `eraseMark` recipe.
