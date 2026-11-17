# 2026-10-16: push_to_100_a -- preplan

Written by Fable for the Coach and for the `/sprint` orchestrator that will turn it into
`push_to_100_a-plan.md`. It stands on `main` after
[#123](https://github.com/mrflip/safebyok/pull/123) (`f63bd915`), on the Gripefest matters doc
(https://claude.ai/code/artifact/db860eaa-e42b-4b34-99e0-bb9b68256f9c, every tab, read in full on
2026-10-16), and on its *Races, locks and validation: Fable's strawman* tab, whose principles
P1 to P12 the threads below cite. The sibling note `whiteboard/20261015-push_to_100/` is folded
in where its items are two-way.

## The rule this sprint is cut by

**Only two-way doors.** A thread is in this preplan when, if the Coach wakes up and disagrees
with it, reverting it costs one PR and nothing stored, published or paid for is lost. Before
1.0.0 a stored shape is such a door (no compatibility, no migration: CLAUDE.md, *What the
package promises*), and so is any exported name. Not two-way, and so left out or listed under
*For the Coach*: a new runtime dependency (a supply-chain decision needing the Coach's yes),
anything only the Coach's hands can do (npm, repo settings, real devices, real deployments),
anything the Coach has ruled NOT YET, and any design whose first step is a question.

**Close more than it opens.** Every thread ends by sweeping the doc rows it settles, and the
ledger at the end counts them. Rows are swept by the orchestrator or a worker with the
turbochat skill: the row leaves the table, and what it settled is written where it usually
goes (code, a doc block, `notes/security.md`, `notes/wontfix.md`, VAULTDB.md). Seven questions
are opened, each named in its thread under *Opens*, each a yes-or-no with a default picked.

## Rulings these rest on

From the Coach, in the doc's *Your answer* cells and in chat on 2026-10-16. Workers do not
re-litigate them.

* **Names and keys** (chat): the default validators are strict and delimiter-safe; the
  key-value adapters join on `^`; the escape hatch is the host's deliberate choice and the
  store still refuses what it cannot hold (strawman P12 and *Names and keys, derived*).
* **Expiry** (G115, G124, and chat on 2026-10-16): "never depend on a timer: set a threshold,
  check when relevant, and also set a timer to force it"; the window is `Infinity` or at most
  24.5 days (under `setTimeout`'s 2^31 - 1 ms), anything between refused; "a timer lock during
  changePassphrase would leave it unlocked, as the passphrase resets; hard lock locks; both let
  the store succeed". **Withdrawn**: "operations should refresh the timer". In its place: "if I
  type in a password for any reason and prove I am mrflip, the user mrflip does not need to
  type that password again for seven days". Reads, stores and passkey assertions never move the
  deadline. The deeper question that wrote itself while saying so is filed NOT YET as G530.
* **Cross-tab lock** (G131): "yes, implement versioned erase".
* **Undefined behaviour** (G129): "make a file WONTFIX", first entry: opening the same vault
  with different settings on the same device is undefined behaviour.
* **The note** (G023): "kill note, only the public bag".
* **Derivers** (G024): "your crypto function should refuse bad data".
* **Dialog wording** (G324): find a polyfill for `Intl.RelativeTimeFormat`, else timeago.js;
  never compare for equality against `FarFuture`, compare against "far future minus one
  minute"; standardize `Ms` to `Millis`.
* **Provider guard** (G322): if an inline logger or clock can be detected once, at launch or
  so, do so. **i18n** (G323): consolidate phrases per framework practice now; real locales
  later.
* **Releases** (G435, G437, G436): let changesets bump minor; a README-only change carries
  an empty changeset; the Version PR uses `pr-draft: create`.
* **Postgres container** (G203): "yes, make a container for pg"; the Coach asks whether the
  other databases and Playwright belong on it too (answered in thread 11).
* **Store base class** (G207, G208, G214): "follow through with whatever remains"; design
  first, then build; `listBoxRecords` in the base; no-op defaults only for truly optional verbs.
* **Sweeps the Coach already answered** (G204, G205, G206, G478, G215, G235, G400, G440,
  G443, G445, T01): see *Rows that close with no code*.

## Ground rules for every thread

Each thread: its own worktree cut per PROCESS.md, one PR, `pnpm justify` green, a changeset
(`minor` for anything that touches a stored shape or an exported name, per G435), a
`notes/security.md` entry wherever a reviewer should look, and the doc rows it closes swept in
its last step. Secret material never reaches a message, a key, a log or a test fixture. The
strawman tab is read before threads 1 to 5. Threads that change a stored shape (2, and 1's
ckey) bump the record's `format`; thread 2 builds the test that enforces that first.

**Size budgets.** Thread 1 shrinks `validators` and `DefaultValidators`; thread 2 grows
`types`; thread 5 grows `VaultDB`. Per the sprint skill, the root thread of the stack sets every
`.size-limit.json` line to a rounded generous guess, and the last thread (9, the sweep) lowers
them to the written rule (G520).

## The threads

Run 1, 3, 6, 7, 8, 11 first (independent, from `main`). 2 stacks on 1; 4 stacks on 3; 5 stacks
on 1 and 4 once both are filed; 10 and 13 stack on 4; 9 and 12 go last, on the top of the line.
Review level `medium` throughout; `sonnet` where a thread says so.

### 1. `names_and_keys` -- strict names, `^`-joined keys, validators deposited once

**Why.** The tuple-encoded ckey defends against text the default validators already refuse,
and its reverse direction is where the drama lives. Every open row in the Validators tab is a
shadow of one missing sentence: what each check guarantees, for whom, and where. The strawman
tab now holds that sentence (P9, P11, P12, the *Validation: four jobs, six moments* table and
*Names and keys, derived*); this thread makes the code say it.

**Decisions already made.**
* `UserId`: letters, digits and `-_.:@+|`, 1 to 100 characters, well-formed. `Label` stays
  as it is for `applabel`, `vaultlabel`, `boxlabel` and `unlocklabel`. `^` and `/` are in no
  default charset.
* Four jobs. **Floor** (well-formed Unicode, NFC, no control characters but tab and newline in
  a note, a fixed ceiling: 1 KiB label, 4 KiB note): not configurable, runs beneath any host
  schema, failing it on read is damage. **Canary** (`Label` grammar, note length,
  `maxWhisperBytes`, the vault's `maxLockboxes`): host-configurable, **entry only**; a stored
  record that fails a canary lists, reads and erases as sound (P7; this changes T02 and makes
  G061's exception the rule). **Integrity** (record shape, scope and boxlabel match, AEAD,
  expectations): at send and at read, never configurable. **Store limit** (declared by the
  adapter under VAULTDB.md 7.x: `maxRecordBytes`, `maxVaultBytes`, `maxLockboxes`, and now
  `maxNameBytes` and `reservedNameChars`): measured at send.
* Validators are deposited once: `openVault` binds its bag onto the adapter
  (`vaultDB.bindValidators(bag)`, refused `bad_option` if already bound to another bag), and
  the nine `VaultDB` verbs lose their last argument. A verb called before binding (the server
  case) admits any text that passes the floor. The host's check runs once per verb, at entry;
  the base class re-checks only records read back (G476).
* `Ckeys` becomes `kind^applabel^user_id^vaultlabel[^boxlabel]`. `boxlabelOf` is the last
  segment; `boxPrefix` is the first four segments and a trailing `^`. The key-value adapters
  (`localVaultDB`, `idbVaultDB`, `idbDeviceDB`, `memoryDeviceDB`) take an optional joiner at
  construction (`{ ckey: { join, split } }`), default the `^` pair; VaultDB refuses at send any
  name part containing the adapter's declared delimiter or longer than its declared byte limit,
  with a kind that names the part and the rule. This check cannot be turned off.
* The scope is checked at `openVault`, the boxlabel at `store()`; nothing waits for the
  backend to refuse.
* `listBoxes` sorts by code point (G181). No refusal groups several failures (G118). The
  `salt_b64` decode check stays at unlock (G074). `maxWhisperBytes` on write only is intended
  (G123). The server checks authorization, atomicity and structural shape, nothing more (G176,
  G289); write that down in VAULTDB.md and the Postgres and GraphQL READMEs (G179).

**Steps.**
1. `validators.ts`: the new `UserId`; the floor as its own exported schemas, run by
   `Names.check` beneath whatever the host passed; `AnyTextValidators` admits the floor and no
   less (G175). Property regexes that the floor does not need go.
2. `vault-db.ts`: `bindValidators`; drop the bag argument from the nine verbs and from every
   adapter's `do*` hook signature; the delimiter and name-byte checks against the adapter's
   declared limits; `listedOrDamaged` lists a canary failure as sound.
3. `ckeys.ts` rewritten as above; the IndexedDB range in `safebyok-indexeddb/src/ckeys.ts`
   follows. `idbVaultDB`, `localVaultDB` and the device shelves take the joiner option.
4. VAULTDB.md: lines 7.x gain `maxNameBytes` and `reservedNameChars`; a short *Names* section
   states P12 and the delimiter rule; the battery gets one line per new fact.
5. Docs: the `VaultValidators` doc block carries the four-jobs table, the NFC caution and the
   upgrade-clients-first caution (G182), and says `userId` is the provider's stable opaque id,
   not an email or handle. `notes/security.md` records the key change and why a hash was not
   chosen.
6. Sweep the rows below.

**Acceptance.** The battery passes on every in-tree adapter; a test per new fact (a name
holding `^` refused at `openVault` and at `store()`; a 101-character `user_id` refused at open;
a stored boxlabel the host's `Label` refuses lists as sound and erases by name; a custom joiner
round-trips; a lone surrogate under a host `z.string()` refused by the floor). `pnpm size`
shows `validators` smaller than before.

**Closes.** G172, G061, G074, G118, G123, G173, G174, G175, G176, G177 (the control-character
half), G179, G181, G182, G183, G184, G185, G476, G289, G232, G474, G475, T02, T03. (23)

**Opens.** Whether `-_.:@+|` is the `user_id` set the Coach wants (my pick, from the identity
survey in chat); where the Standard Schema question (G497, NOT YET) lands once validators are
bound, if ever.

**Who.** Opus. It touches every adapter's hook signature and the stored key.

### 2. `public_bag` -- drop `note`, add the bound `public` bag, reserve the two codec fields

**Why.** The Coach ruled it (G023) and it is a reservation before the first release: a bound
field cannot be added after 1.0 without re-encrypting every lockbox. Today it is free.

**Decisions already made.** `note` goes. `public` is any JSON, default `{}`, always written
(an omitted bag and an empty one would bind differently), stored stable-serialized and
unpadded, bound into the lockbox header, never interpreted by the library, with the same "never
secret material here" warning; `maxWhisperBytes` measures the serialized whisper plus the
serialized bag (G020, ruled). `whisper_codec` (`'json_v1'`) and `whisper_schema_version` (`1`)
are reserved beside it (G025). The lockbox format becomes `safebyok-lockbox-v3`; the format
tag is bound once, not twice, and a `CipherBindingPart` field set to `undefined` is refused,
not dropped (G040). The validators' `note` slot goes with the note; a host validates its bag
itself before `store()`.

**Steps.**
1. First, the format-snapshot test (G482): render each stored-record schema with Zod's
   `toJSONSchema`, keyed by its `format` literal, failing with "bump format" when one changes
   unbumped. Land it before the shape changes so it is seen to catch them.
2. `types.ts`, `vault.ts` (`boxBinding`, `store()`, the summary), `crypto.ts`; every adapter's
   schema, column list or SDL (`safebyok-convex/src/component/{schema,validators}.ts`,
   `safebyok-postgres/src/{columns,vault-tables}.ts`, `safebyok-graphql/src/{fields,vault-schema}.ts`);
   the battery; the React demo moves its note into `public.note` and stops clearing it on a
   blank entry (G357's last bullet).
3. VOCABULARY.md and `notes/security.md` (what the bag binds, what it reveals: its size).
4. Sweep.

**Acceptance.** A lockbox written with `public: {}` and one written with `public` omitted at
the API bind the same (the library always writes it); a swapped bag fails the AEAD; the
snapshot test fails on an unbumped change and passes after the bump; the demo stores and shows
a note through the bag.

**Closes.** G023, G025, G040, G482, G177 (the note half). (5)

**Opens.** None. (The bag's cap is ruled: none of its own.)

**Who.** Opus. Stacked on 1 (both rewrite `validators.ts` and the adapters' schemas).

### 3. `locks_and_expiry` -- the soft lock as ruled, versioned device erase, `Millis`

**Why.** G124's timer is the soft lock's hard edge, and the Coach's answers on G115 and G124
settle how it works. G131's cross-tab gap is the one piece of the lock model the device store
cannot yet deliver, and the Coach said to build it. The hard-lock questions (G119's re-check,
dropping `whenIdentityRevoked: 'stay'`, `rolled_back` locking from a refresh) are **not** in
this thread: see *For the Coach*.

**Decisions already made.**
* The threshold is the truth, the timer the enforcement: every operation checks
  `askPassphraseAt` first; the timer only drops a key the threshold already condemned.
  `shutVaultAt` is `min(askPassphraseAt + 60 s, lockSoon's now + grace)`, and **a shut time
  only ever moves earlier** (so `lockSoon()` on an expired key gets no extra grace: G125).
* `forcePassphraseReentryHours` is `Infinity` or at most 24.5 days (588 hours, a named
  constant `MaxReentryHours`, chosen to sit under `setTimeout`'s 2^31 - 1 ms); anything between
  is refused `bad_option` saying so. One `setTimeout` then always reaches, and is armed once.
* A typed passphrase renews the window. As built, an unlock of either kind fixes
  `askPassphraseAt` at now plus the window; the change is that every other call in which the
  user types the passphrase and it proves (`changePassphrase`, an `addPassphrase` or
  `addPasskey` proved by passphrase) renews it too, and re-arms the timer. Nothing else moves
  it: reads, stores, refreshes and passkey assertions never do. The promise is per device,
  since the key never leaves one; the Coach's phrasing ("the user mrflip") is the intent, the
  device record is the mechanism. `ensureUnlocked()` past the deadline refuses new work and
  leaves key-dropping to the timer.
* So a soft lock falling due during a successful `changePassphrase()` leaves the vault
  unlocked with the new deadline; a hard lock during it locks the device; the storage change
  lands either way (P3).
* Versioned erase: the device mark carries a lock generation, bumped by every hard lock; an
  unlock's record write compares it; `DeviceDB` gains one conditional write (compare-and-erase
  / compare-and-write). `close()` is not a lock: it erases no device record (G126).
* `rememberedUnlock`'s failure at open wraps as `storage_unavailable` with the cause (G130).
* `Ms` becomes `Millis` everywhere: `ForeverMs` to `ForeverMillis`, `reentryWindowMs` to
  `reentryWindowMillis`, and the private `graceMs`, `WriteRetryBaseMs`, `retryDelayMs`,
  `delayMs`, `nowMs`, `windowMs`, `hoursToMs`, `secondsToMs` likewise. `EpochMillis` already
  reads so. The far-future test is `>= FarFuture - MinuteMillis`, never equality.
* `notes/wontfix.md` is born beside `notes/security.md`, its first entry G129's ruling (one
  device, one setting; two tabs with different settings are the same case). G127 and G128 get
  one README line each and stay as built (the safe direction).
* The README's screen-lock recipe narrows its `.catch` to the `vault_closed` race and lets a
  failed `eraseUnlock` be logged (G490).

**Steps.** `vault.ts` (`shutAfter`, `ensureUnlocked`, `takeUpUnlock`, `changePassphrase`,
`rememberedUnlock`), `types.ts` (the mark's generation, `DeviceMark` format bump),
`device-db.ts` and `idb.ts` (the conditional write), `safebyok-react` where it reads
`reentryWindowMs`, the README, `notes/wontfix.md`, `notes/security.md` (the timer, the
generation). Sweep.

**Acceptance.** Tests: a window of 25 days refused, `Infinity` and 7 days accepted; the key
drops at the shut time with no call made; a call past the deadline refuses and the key is still
dropped by the timer; `lockSoon()` after expiry drops at once; a lock in one handle makes an
unlock under way in another handle fail its record write; `changePassphrase` during a pending
soft lock leaves the vault unlocked with the new deadline; `close()` leaves the device record.

**Closes.** G115, G124, G125, G131, G126, G130, G132, G509, G127, G128, G129, G490, and the
`Millis` half of G324. (13)

**Opens.** None.

**Who.** Opus.

### 4. `refusals_and_catchup` -- one catch-up before a kind is named, damage quarantined

**Why.** The strawman's *Races and corrupt records, derived* section answers fourteen rows
with four small changes to `vault.ts` and `vault-db.ts` and no new contract line.

**Decisions already made.**
* Refreshes are serialized: one in flight, a second request coalesces into "run again after"
  (G136).
* One catch-up before a kind is named: a stale refusal or a lockbox that will not open gets one
  refresh. If the bundle moved (another `vault_id` or epoch), the device relocks and the caller
  hears `vault_locked`; otherwise `stale_write` or `damaged_lockbox` (G140, G117). A catch-up
  that itself fails is reported as `stale_write` with the failure as cause, and the snapshot
  gains `syncing: boolean`, false until the next refresh succeeds (G137, G212). Never relock on
  no evidence (P4). The logger says "catch-up after a stale write failed", not "a background
  refresh", and warns once per failing streak of a storage watch, once on recovery (G134).
* Lockbox writes retry; `changePassphrase()` and `destroy()` refuse once (G139, P1, P2). The
  conflict handler is `store()`: an erase wins, and a host that disagrees stores again; no
  hook, no option (G141, G499 stays NOT YET and the VAULTDB.md *Who does what* says so).
* `destroy()` on a handle that never saw a bundle refreshes first and erases what stands; the
  docs say a retry after a refusal destroys the vault the handle now shows (G116, per the
  strawman; reverse by flipping the row).
* `newer_format` is a new kind for "may be newer than this build" (`eraseDamagedVault` and
  `openVault`); "sound vault" stays `bad_option` (G120). Erase-wins and retry-exhausted share
  `stale_write` (G117).
* `DamagedLockbox` carries `revision_id` when the record has one as text, and `store()` over
  it is one conditional write; only a record with no readable revision takes erase-then-write
  (G498; 3.3 already compares it).
* `openVault` checks `instanceof VaultDB` (G122). The listing marks a lockbox damaged from its
  `vault_key_epoch` alone when that epoch is neither the bundle's nor the prior's (G063). A
  device-mark write that fails after a ways-in change landed is logged, not thrown (G514). One
  test pins that a synchronously throwing adapter still maps to `damaged_*` (G147).
* Left as built, each the safe direction, closed by a doc line: G145 (3.5 stands), G146,
  G148, G144, G142, G143, G522, G513 (the README's `eraseMark` recipe is the way out for
  1.0), G489's one `notes/security.md` phrase.

**Steps.** `vault.ts` (`refresh`, `quietRefresh`, `refreshOnStale`, `openBox`, `store`,
`destroy`, `damagedAs`, `raiseMark`), `vault-db.ts` (`DamagedLockbox`, `listedOrDamaged`,
`eraseDamagedVault`, `mayBeNewer`), `errors.ts` (`newer_format`), `types.ts` (`syncing`,
`DamagedLockbox.revision_id`), `safebyok-react` (`VaultProvider` reopens on `stale_write` only,
rethrows `bad_option`: G333), VAULTDB.md *Who does what*, the READMEs, `notes/security.md`.
Sweep.

**Acceptance.** Tests for each bullet, with the race helper where a second device is
involved: a box rewritten by a successor vault refuses `vault_locked` after one catch-up; a
damaged box with a readable revision is replaced in one write and a sound replacement another
device wrote meanwhile survives; two refreshes requested at once run one after the other; a
bundle in an unknown format refuses `newer_format`.

**Closes.** G140, G137, G134, G136, G139, G117, G120, G121, G141, G499, G498, G122, G116,
G145, G146, G147, G148, G144, G142, G143, G063, G514, G513, G522, G212, G333, G489. (27)

**Opens.** None.

**Who.** Opus. Stacked on 3 (both rewrite `vault.ts`).

### 5. `store_base` -- the base class, the logger everywhere, and the adapters' leftovers

**Why.** The Coach's ruling on G207: stores share a base; design first, then build. Most of the
Storage and Convex tabs' leftovers fall out of it.

**Decisions already made.** `listBoxRecords` in the base, built from the verbs every store has
and overridden where one query does it (G208). One catch per listener in `VaultDB.subscribe`,
reported through the adapter's logger and `reportError` where the platform has it (G209,
G511). Every VaultDB takes a `logger` at construction, console fallback; `openVault`'s logger
does not reach into the adapter (G210, G211). Shared refusal constructors for
`storage_unavailable`, `stale_write`, `not_permitted`, `vault_full`, each with a cause that is
never null (G213). No-op defaults only for truly optional verbs (G214). Postgres and GraphQL
declare `maxLockboxes` as `Infinity` (a large whole number where `Infinity` cannot cross the
wire); the 1000 default goes (G285). GraphQL maps `BAD_USER_INPUT` and
`GRAPHQL_VALIDATION_FAILED` to `bad_option` (G303) and replaces a server-side setup error's
message with a generic one at the wire (G304). The Convex component checks `vault_id`
constancy and `unlock_epoch` increase on `updateBundle` (G247), and safebyok's own Convex
refusals drop the `ConvexError` cause too (G257). The core's device-store bell takes the
IndexedDB package's behaviour (G270); `checkOutgoing`/`checkRecord` duplication is tidied
(G149). Convex's and Postgres's test leftovers trimmed to what the battery does not cover
(G240, G519, G523). Closed by a doc line, as built: G268, G286, G300, G305, G272 (a
`localVaultDB` doc block saying "one tab"), G491, G258, G252, G246, G236, G233, G248, G254,
G250 (a test pinning the convex version the fake socket follows), G290, G292.

**Steps.** (a) `whiteboard/20261016-push_to_100_a/store-base-design.md`: what the base
carries, the logger's path, the constructors, the optional verbs; the orchestrator mirrors it
to the sprint doc and the Coach reads it before (b). (b) Build it, adapter by adapter, the
battery green at each. Sweep.

**Acceptance.** Every in-tree adapter is shorter than before; the battery passes everywhere; a
throwing listener is caught and logged in every adapter; a rejected Postgres `listen` and a
failed GraphQL subscription reach the logger; the Convex component refuses a changed
`vault_id` and a non-increasing epoch.

**Closes.** G207, G208, G209, G210, G211, G213, G214, G270, G149, G511, G285, G303, G304,
G305, G247, G257, G240, G519, G523, G268, G286, G300, G272, G491, G258, G252, G246, G236,
G233, G248, G254, G250, G290, G292. (34)

**Opens.** The name and shape of each adapter's logger option (one name for all; the design
doc proposes it, the Coach may rename it).

**Who.** Opus. Stacked on 1 and 4. The biggest thread; the orchestrator may split (a) and (b).

### 6. `crypto_small` -- refusals with a kind, the KDF tidy-ups, two ways-in verbs

**Why.** Small, ruled or obvious, all in `envelope.ts`, `key-deriver.ts` and the ways-in half
of `vault.ts`.

**Decisions already made.** `deriveKeyBytes` refuses a salt whose length differs from the
spec's, with a kind (G024, both derivers). The passphraseKey bytes are zeroed after
`importKey` (G032). A `SharedArrayBuffer`-backed result is refused `bad_option` (G034). Host
labels matching `argon2id_web_*` are refused (G029). A hand-built deriver declaring
`algorithm: 'argon2id'` runs the Argon2id schema at `openVault` (G030). `KeyDeriver` is split
by algorithm before 1.0 (G031). `changePassphrase` takes any proof, a passkey's included
(G072: "any way in proves any change"). A `wrong_passphrase` beside envelopes another deriver
made says how many were skipped and that opening the vault where it was made may help (G073).
`UnlockSummary` shows `device_id` and `registered_at` (G515). `openVault` warns through the
logger when the deriver's label starts with `test_` (G374). The envelope and vault helper
cleanups (G075). Closed by a note: G062 (keep `removeUnlock` and `rotateVaultKey` apart),
G070 (a lock during the passkey prompt lands the passkey; the orphaned passkey after
`stale_write` is documented), G037 (done).

**Steps.** As listed; `notes/security.md` for the zeroing and the `test_` warning. Sweep.

**Acceptance.** One test per bullet.

**Closes.** G024, G032, G034, G029, G030, G031, G072, G073, G075, G515, G374, G062, G070,
G037. (14)

**Opens.** None. (G028's menu of shipped KDF configurations waits on the Coach's picks.)

**Who.** Sonnet, except G031 and G072 which an Opus pass reviews.

### 7. `react_tidy` -- the dialog's words, its races, and the demo

**Why.** Eleven rows in the React tab are ruled or one-line; the Coach's `push_to_100` note
adds the whisper entry field.

**Decisions already made.**
* One messages module per package (`safebyok-react/src/messages.ts`), every user-facing string
  in it, sentence frames whole; locale still one constant (G323). `Intl.RelativeTimeFormat`:
  the standard polyfill is `@formatjs/intl-relativetimeformat`; the thread wires a presence
  check and names the polyfill in the README as the host's to import; **adding it as a
  dependency of `safebyok-react` needs the Coach's yes** (G324; see *Opens*). The far-future
  comparison follows thread 3's rule.
* `VaultProvider` warns once, through the logger, when a `logger` or `clock` prop changes
  identity between renders (G322).
* Each dialog is keyed by the vault handle it was opened for, and reads the snapshot's state
  when it opens, not only on later changes (G329, G328). The `Boundary` is keyed on the vault
  prop (G331). The provider reopens only on `stale_write` (G333, built in thread 4 where the
  kinds change; this thread adds the test). A late unlock closing a dialog is right as built
  (G330). `PasskeyUnlockButton` and `PassphraseModal` subscribe through `useSyncExternalStore`
  (G332).
* Accessibility: a live region that stays mounted for the error line; Escape on the notice
  stops propagation; the focus check walks shadow roots; the passphrase form gets dialog
  semantics; a passkey gripe clears when a later press is dismissed (G326, G327).
* From the Coach's `push_to_100` note: the entry field is named `whisper_…`, carries the
  password-manager ignore attributes the note lists, and has a show/hide toggle; the passkey
  button is offered first when a passkey exists.
* Demo: `keepStorage()` after a gesture, an "only in this browser" line, a path to start a
  new vault from the dialog, an error boundary (G357); `LockChip` says "never" at
  `FarFuture` (G358); the saved label flashes "saved" then relaxes to the changed date (G359);
  `createAuth` checks its clock (G360). The React README says what revealing a whisper puts in
  state (G334). Every window unit tested in both wordings (G325). G321: no `onError` prop.

**Steps.** As listed. Sweep.

**Acceptance.** Tests for each race case and each accessibility change; the demo clicked
through under jsdom; `pnpm size` for the React package within budget.

**Closes.** G321, G322, G323, G324 (the wording half), G325, G326, G327, G328, G329, G330,
G331, G332, G333 (its test), G334, G357, G358, G359, G360, and the entry-field items of
`whiteboard/20261015-push_to_100/`. (19)

**Opens.** The `@formatjs/intl-relativetimeformat` dependency (a yes, or "document only"), and
the note's "do we offer a hint?" question.

**Who.** Sonnet for the demo and messages module; Opus for the provider's dialog keying.

### 8. `ci_release` -- the release workflow's ruled changes and the CI leftovers

**Why.** The Release tab is nearly all `proceed` with answers; the Tests tab's CI rows are
config.

**Decisions already made.** `pr-draft: create` (G436). PROCESS.md: changesets bump minor
before 1.0 (G435); a README-only change takes an empty changeset (G437); the size rule may
lower a budget (G401, "it may"). A failed GitHub release creation is retried on a re-run, with
a test (G442). The changeset skip checks the release App's bot login, read from the Version
PR's author (G446). The Dependabot gate requires every commit on the branch to be Dependabot's
(G447). A workflow writes `.changeset/dependabot-<n>.md` (patch) on a Dependabot runtime-dep
PR and pushes it; patch is the level before 1.0 for a dependency bump (G448; the push uses the
release App's token, which re-triggers CI). `runtime-deps.ts` also compares a removed or
made-private package, `peerDependenciesMeta` and `bundledDependencies` (G449). `pnpm size`
folds into `justify` (G404); the `size` script builds once (G405, G414); the ci.yml comment is
fixed (G406); `safebyok-indexeddb` gets a size-limit entry (G269); actionlint runs in CI,
pinned by hash (G416); `unicorn/prefer-iterator-to-array` off until the lib target moves, and
the three `prefer-promise-with-resolvers` suppressions noted beside it (G399, G521); tsdown's
`root` flattens `dist/src/`, the published helpers get `src/`'s lint rules, `makeGate`'s
disable goes (G408); eslint plugin peers raised where a release supporting eslint 10 exists,
else left with a dated comment (G410); `pnpm changeset` takes `--package` and `--bump` flags so
an agent needs no terminal (G412); `scripts/git-survey.sh` skips any worktree whose branch has
an open PR or unpushed commits (G512); `vaultDBTimingChecks` handles renamed camelCase (G510);
the race-driver leftovers (G517) and the leak test's constant leaves (G381); a
`notes/release-checklist.md` naming the by-hand passes before each release (G373; real
authenticators, real browsers, the Convex README walk, Supabase). Platform floor stated in the
READMEs and `engines` (Node 22, evergreen browsers with WebCrypto, IndexedDB,
`Intl.RelativeTimeFormat`; Hermes untested), CI's `node-compat` gating on 22 (G417). Closed
by a note: G440, G443, G445 (granted, unused, nothing needs it), G444, G465, G376, G293, G400,
G235, G464, G178.

**Steps.** As listed; `.github/workflows/`, `scripts/`, PROCESS.md, `.size-limit.json`,
`eslint.config.mjs` files, READMEs. Sweep.

**Acceptance.** `pnpm justify` green, the workflows pass actionlint, `scripts/` tests cover
the new branches (release retry, runtime-deps fields, git-survey skip).

**Closes.** G436, G435, G437, G401, G442, G446, G447, G448, G449, G404, G405, G414, G406,
G269, G416, G399, G521, G408, G410, G412, G512, G510, G517, G381, G373, G417, G440, G443,
G445, G444, G465, G376, G293, G400, G235, G464, G178. (37)

**Opens.** None.

**Who.** Sonnet.

### 9. `sweep_small` -- the small tab, last, on top of the line

**Why.** Each is a few lines and conflicts with everyone; it goes last.

**Decisions already made.** The passphrase-modal helpers move to the React
`tests/test-helpers.ts` (G379); the adapters' `refusalOf`, `eventually`, `changeCounter`,
`aWhile` move into `safebyok/testing` where two packages share them, stay local otherwise
(G380); `beforeNextCall` restores with `Object.defineProperty` only when it replaced an own
property (G377); `perUser`'s example and `servingOnly`'s blank `user_id` (G483); #102's four
minors (G255); `inspectIdbVaultDB` through `settle` (G274); the Convex `design.md` header
(G259); VOCABULARY's damaged row names all three kinds (G466); `VaultOperations` exported from
`safebyok-graphql` (G301); README lines for `unlock_epoch`'s 32-bit bound and client/server
version lockstep (G302, G306); a `notes/security.md` entry stating the non-extractable-key
caveat on its own (G039); the mask review (G343: read `mask.ts` and its tests as they stand,
fix what a reviewer would, no new behaviour); the three post-review changes reviewed the same
way (G488); the size budgets lowered to the written rule (G520, last). Closed by a note,
as built: G135, G253, G238, G254, G375 (keep), G378 (keep), G409 (not worth the noise), G413
(keep the trade), G344 (needs real terminals; see *For the Coach*), G508 (drop: `revision_id`
already orders writes to one box).

**Closes.** G379, G380, G377, G483, G255, G274, G259, G466, G301, G302, G306, G039, G343,
G488, G520, G135, G253, G238, G254, G375, G378, G409, G413, G508. (24)

**Opens.** None.

**Who.** Sonnet.

### 10. `secure_floor` -- the Coach's three Soonish lines

**Why.** The Coach wrote three new lines at the top of the Soonish tab on 2026-10-16: *refuse
to work over http*, *Passkey requiring passcode value*, *Password strength*. None is a matter
row yet; this thread makes them so, builds the two that are two-way, and files the third.

**Decisions already made.** `openVault` refuses in an insecure context (`globalThis.isSecureContext === false`;
localhost is secure) with a new kind, `insecure_context`, saying to serve over https; WebCrypto
is absent there anyway, so today the failure is a `TypeError` with no kind. Passkeys already
ask `userVerification: 'required'` at creation and at every assertion
(`safebyok-react/src/passkey.ts`), so a PIN, fingerprint or face is already required; the Coach
confirmed on 2026-10-16 that this is what the line meant, so the thread only says so in the
React README and sweeps the line. A
passphrase minimum: `openVault({ minPassphraseChars })`, default 12 (NIST SP 800-63B: length,
no composition rules), refused `weak_passphrase` at `create` and `addPassphrase`, never at
`unlock`; a strength meter (zxcvbn and its dictionaries) is a dependency and stays the host's,
noted in the row for the Coach.

**Closes.** The Coach's three Soonish lines, as three new rows swept the same day. (3)

**Opens.** Whether a strength library (`@zxcvbn-ts/core`) is wanted in `safebyok-react`.

**Who.** Sonnet. Stacked on 4 (`vault.ts`).

### 11. `pg_container` -- the Postgres battery under real concurrency

**Why.** G203 is `proceed`; VAULTDB.md's *Proving the races* says what PGlite cannot prove.

**Decisions already made.** A `postgres:17` service container in CI, a `pg` Pool per device,
the existing battery and race lines run against it from `e2e/`; `pnpm justify` still needs no
Docker; the README's optional hard-cap trigger and the `23503` case run there too (G288). The
Coach's question: yes, the other backends belong on the same compose file, later, one service
each (Convex's local backend next), and Playwright is a different animal (a browser, not a
database) that gets its own `e2e/` job when G356 and G271 are built; this thread writes the
compose file with one service and leaves the slots.

**Closes.** G203, G288, and the Postgres half of G524. (3)

**Opens.** Which suites run against the container in CI and which stay in-process (the
thread proposes: battery and races there, everything else in-process).

**Who.** Sonnet.

### 12. `floors_forward` -- time-gated, after 2026-10-17

**Decisions already made.** Delete the `convex-test@0.0.61` `minimumReleaseAgeExclude`, pin
back to `^0.0.61`, strike the `notes/security.md` line (G402); raise the direct-dependency
floors to the newest releases that have aged, tsdown 0.23.1 included, so the `@yuku-*`
warnings go (G403); check `dist/` is byte-identical across the tsdown move (G415).

**Closes.** G402, G403, G415. (3)

**Who.** Sonnet, last, after the date passes.

### 13. `epoch_expectation` -- VAULTDB.md 3.8 in every adapter

**Why.** Rotation's contract line is built in `localVaultDB` only; the other four run the
battery with `comparesVaultKeyEpoch: false`. It is what makes "no look before writing" (G138)
true, and it is code the rotation design already specifies.

**Decisions already made.** IndexedDB compares inside its transaction; Convex inside the
component's mutations; Postgres with one more term in the `WHERE` and the insert's first CTE
reading the bundle row `FOR SHARE`; GraphQL in the resolver recipe and README. The battery
flag flips to true for all; the 3.8 todo goes.

**Closes.** G065, G138. (2)

**Opens.** None.

**Who.** Opus. Stacked on 4.

## Rows that close with no code

Swept at the sprint's start by the orchestrator, each already answered by the Coach or settled
by a merged PR: G204 (keep 6.1), G205 (no count), G206 (ships), G478 (`do*` stays), G215
(ok), T01 (#119), G440, G443, G445, G444, G465, G376, G293, G400, G235, G474, G475, G238,
G253, G135, G064, G291, G359's history, G321. These are counted once, in the threads above
that name them.

## For the Coach

**Your word first** (the strawman proposes, the thread would be small, but each changes what
a lock promises): G119 (drop `whenIdentityRevoked: 'stay'` before 1.0; a `read()` re-checks the
shut counter after its last await and refuses `vault_locked`), G516's first bullet (a refresh
meeting `rolled_back` drops the key, decided in `refusal-policy.ts` beside `identity_revoked`
with the same host knob). Say yes and they join thread 3.

**Only your hands**: G438 (approve 0.2.0, land #56), G439 (deprecate `0.0.0`), G467 (delete
head branches), G469 (devcontainer volumes), G506 (worktree directories), G234 (a Convex
deployment and auth story for the demo), G242 (walk the Convex README), G287 (Supabase), G355
(the demo's erase wording), the `push_to_100` note's "how do we approach that everyone should
use fastkey out of the box but it's not included".

**Real devices and deployments** (a checklist lives in `notes/release-checklist.md` after
thread 8): G036, G038, G069, G180, G243, G244, G245, G251, G256, G307, G271, G356, G344.

**Filed NOT YET at your word, 2026-10-16**: G530, should we really be collecting more than
one password and then making the user refresh a password? Thread 3 builds the window as it
stands; G530 asks whether a periodic passphrase re-entry is the right demand once a vault has a
passkey, and later a recovery key.

**Design first, not this sprint**: G026/G027 (padding and the payload survey), G028 (which
KDF configurations ship), G066/G067 (`rotateVaultKey` and its docs: the rotation whiteboard's
own threads), G071 (relabel), G241, G411, G407, G468 (the compare-and-swap race path), G336,
G507, G497. **NOT YET, untouched**: G492, G493, G494, G495, G496, G500 to G505, G133, G335.
**Explain-chipped, for a turbochat pass**: G033, G035.

## Ledger

| Thread | Closes | Opens |
|---|---|---|
| 1 names_and_keys | 23 | 2 |
| 2 public_bag | 5 | 0 |
| 3 locks_and_expiry | 13 | 0 |
| 4 refusals_and_catchup | 27 | 0 |
| 5 store_base | 34 | 1 |
| 6 crypto_small | 14 | 0 |
| 7 react_tidy | 19 | 2 |
| 8 ci_release | 37 | 0 |
| 9 sweep_small | 24 | 0 |
| 10 secure_floor | 3 | 1 |
| 11 pg_container | 3 | 1 |
| 12 floors_forward | 3 | 0 |
| 13 epoch_expectation | 2 | 0 |
| **Total** | **207** | **7** |

Of the roughly 250 rows in the doc, about forty stay: the Coach's hands, real devices, designs
that start with a question, and the NOT YET shelf. The seven opened are each a yes-or-no with
a default already picked. G530 joined the NOT YET shelf at the Coach's word on 2026-10-16 and
is not the sprint's to open or close.
