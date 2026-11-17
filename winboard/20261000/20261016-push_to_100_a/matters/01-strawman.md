<!-- Exported from the Gripefest matters doc (https://claude.ai/code/artifact/db860eaa-e42b-4b34-99e0-bb9b68256f9c), tab "Fable's strawman: races, locks, validation", 2026-10-16, before the sprint's sweeps. A snapshot: the doc is the live copy. -->

# Races, locks and validation: Fable's strawman

Written by Fable on 2026-10-16 for the Coach, from every tab of this doc, `packages/safebyok/VAULTDB.md`, and the core's `vault.ts`, `vault-db.ts`, `types.ts` and `validators.ts`. It does what the VaultDB contract did: states principles first, then derives the decisions. Every *(Fable: …)* note in the other tabs points back to a principle here. Nothing in it is built.

## What the open rows have in common

Three decisions are missing, and most of the timing, damage and validation rows are their shadows.

1. **What a lock promises.** G115, G119, G124, G125, G131, G132, G328, G509 each ask "does work in flight finish?" without saying which lock they mean.
2. **Who clears a damaged record, and when.** G121, G140, G145, G146, G498, G499, G063 and T02 are one question: the vault may quarantine and the user may clear, but may anything clear on its own?
3. **What each validator guarantees.** The Validators tab (G172 and its rows), with G181, G285, G476 and G491: nobody has yet said which checks are promises and which are alarms.

The contract already settles the races themselves: the adapter is the only arbiter and compares the expectation in the same atomic step as the write (lines 3.1 to 3.8); the vault owns the read before and the retry after. What is left is what the *client* does with a refusal, and the answer below is mostly "less than it does today".

## Principles

**P1. Storage is the only arbiter of a race.** The client never settles a race from its cache, never adds a round trip to look first, and never resolves a collision for the user beyond the retry the contract names.

**P2. We are a secret store, not a performant distributed database.** Where a choice trades a record against the risk of exposing one, lose the record. Where it trades speed against a clear rule, take the rule. A round trip spent on correctness is fine; one spent on consistency theatre is not.

**P3. A lock is a promise about keys on this device, not about storage.** Locking drops what this device holds and remembers. It never erases or rewrites a record; a write already sent lands.

**P4. Nothing in the background decides.** A refresh, a push or a catch-up after a refusal may update the snapshot, and may drop this device's key when storage says the user is gone or hands back a copy the device cannot trust. It never writes, erases, repairs or retries.

**P5. Damage is quarantined under its name, never repaired, and cleared only by an explicit act on that name.** A record that fails integrity lists as damaged; `read()` and `use()` refuse it; `erase(boxlabel)` removes it; `store(boxlabel)` replaces it. Nothing clears it on its own: the vault cannot tell damage from a newer version or from a plant, and a store that quietly evicts is how a secret disappears.

**P6. An unrecoverable record is reported, and never blocks re-entry.** However broken the record under a boxlabel, `store()` there lands a fresh lockbox and `erase()` removes what stands. One level up, a bundle that cannot be read is `damaged_bundle`, and `eraseDamagedVault` clears the way.

**P7. Damage that hides nothing is absence.** A record that fails any integrity check (not JSON, wrong shape, scope or boxlabel mismatch, a cipher field that will not open, an epoch the vault holds no key for) is treated as missing: it lists as damaged with nothing of it trusted. A record that fails only a canary (a name or note the host's current validators refuse) is not damaged: it was stored under other rules, and it lists, reads and erases as sound. That makes G061's exception the rule, and changes T02.

**P8. Only the user or an integrity signal hard-locks; a timer only ever soft-locks.** The user's `lock()` or `destroy()`, a sign-out (`identity_revoked`) and an untrustworthy copy of the vault (`rolled_back`) drop the key now. Expiry and `lockSoon()` close the door to new work and let work in hand finish, then drop the key by timer.

**P9. A check is a promise, a floor, an alarm or a fact, and runs where that job needs it.** Promises (integrity) run at send and at read, alike on every client, never configurable. Floors (text sanity) run beneath any host schema. Alarms (canaries) run at entry only, and are the host's to set. Facts (store limits) are declared by the adapter and measured at send.

**P10. Kinds name the user's next move.** Two situations share a kind when the next move is the same, and get two kinds when it differs. Messages carry the detail; nothing quotes a secret or a name.

**P11. Normalize what the library owns; keep or refuse what the user owns.** Times, options and the whisper's serialization are normalized at the host-facing entry, before validation. A name or note is stored exactly as given or refused: never trimmed, stripped, case-folded or NFC-normalized, because it is bound into the ciphertext and names its row.

**P12. A name the library accepts is a name every store we ship can hold.** The default validators are the intersection of the stores' limits, not the union of what identity providers emit. A host may loosen a check, deliberately and by name, but never below what its own store declares, and the store refuses at send what the host let through. We do not let a customer shoot themselves in the foot: life with any-text names is fine until one customer has a 1001-character name and an S3 backing store.

## Races and corrupt records, derived

- **No look before writing** (G138). P1. A passphrase change leaves the vaultKey as it is, so a stale session's write is sound; only rotation revokes, and contract line 3.8's `vault_key_epoch` expectation refuses it atomically once every adapter compares it (G065).
- **Lockbox writes retry; everything else refuses once** (G139, G116). P1, P2. `store()` retries because its intent survives a concurrent write: this whisper under this label, last writer wins. A ways-in change, a `destroy()` or an erase that collides with someone else's is news the user must hear: `stale_write`, no retry. A `destroy()` on a handle that never saw a bundle refreshes first and erases what stands, since "delete my vault" must not report success over a standing vault.
- **One catch-up before a kind is named** (G117, G137, G140). P4, P10. A failure that could mean "the vault moved" (a stale refusal, a lockbox that will not open) gets one refresh before the vault names it. If the bundle moved, the device relocks and the caller hears `vault_locked`; if not, `stale_write` or `damaged_lockbox`. A catch-up that itself fails is reported as `stale_write` with the failure as cause, and the snapshot says it may be behind (`syncing: false`, G212). Never relock on no evidence: the `vault_id` expectation already refuses every write into a reborn vault.
- **The listing stays shape-only** (G121). P2, P5. Altered ciphertext shows at `read()`, where it is quarantined like any damage. A listing that opened every box would read and decrypt the vault on every refresh to catch a case only tampering produces.
- **Replace a damaged box in one write where it still has a revision** (G498). P5, P6. `DamagedLockbox` gains an optional `revision_id`, the stored string when there is one, and `store()` over it is one conditional write: line 3.3 already compares it, so no new contract line. Only a record with no readable revision takes today's erase-then-write. That closes the "sound replacement erased" race; the store-then-erase gap remains only for records too broken to name a revision, which P6 accepts.
- **Erasing a vault by `vault_id` alone stands** (G145, G146). P6. A bundle rewritten under the same `vault_id` between read and erase is the same vault, and the user asked to erase that vault. A typed backend cannot hold a damaged bundle, so the hatch has nothing to do there.
- **`rolled_back` joins `identity_revoked` in the refusal policy** (G516). P4, P8. A copy of the vault this device cannot trust is a reason to drop the key, decided in `refusal-policy.ts` beside the sign-out case, with the same host knob. The README's `eraseMark` recipe stays the way out (G513); a mark write that fails after a landed change is logged, not thrown (G514).
- **Kinds** (G117, G120). P10. Erase-wins and retry-exhausted share `stale_write`: the next move is the same (look, decide). "May be newer" gets its own kind, `newer_format`: its next move is "update the app", not "start over". Relocking during a retry throws `vault_locked`: the state the user is in. The sound-vault refusal from `eraseDamagedVault` stays `bad_option`: misuse.
- **The conflict handler is `store()`** (G141, G499). P1, P5. An erase wins, and a host that disagrees stores again. No hook, no option.

## The two locks

Today there is one lock with a grace bolted on. Name two.

|  | Hard lock: the goons are at the door | Soft lock: the bartender's stinkeye |
| --- | --- | --- |
| Triggered by | `lock()`, `destroy()`, `identity_revoked`, `rolled_back` (proposed) | `askPassphraseAt` passing; `lockSoon()` on a hidden or idle tab |
| What it means | This device holds no key and hands out no whisper, now | The passphrase is overdue: nothing new starts, work in hand finishes |
| New calls | refused `vault_locked` | refused `vault_locked` |
| A `read()` in flight | refuses unless it has already returned: a shut-counter compare after the last await, monotonic, so it can only turn a success into a refusal, never the reverse | finishes |
| A `store()` or `erase()` in flight | a write already sent lands (P3); one not yet sealed loses | finishes, within the grace |
| Key dropped | at once, before the promise returns | at the shut time, by timer |
| Shut time | now | min(`askPassphraseAt` + 60 s, `lockSoon`'s now + grace), grace at most 60 s. **A shut time only ever moves earlier.** |
| Device's remembered unlock | erased | erased at the shut time |
| Snapshot | `locked` at once | `locked` at once |
| An `unlock()` begun during it | starts over | wins over the timer |
| An `unlock()` or `changePassphrase()` already under way | the storage change lands; this device's key drops | finishes |
| Across tabs | the device record's erase is shared; another tab's in-memory key is not (G131: a lock generation in the device mark, bumped by every hard lock and compared when an unlock writes its record, closes it; `DeviceDB` gains one conditional write) | each tab keeps its own timer |

What this settles. G115: keep all four calls and `vault_locked` for a lost unlock. G119: `lock()` means now; the re-check after decryption is one monotonic compare, not a new race; `whenIdentityRevoked: 'stay'` goes before 1.0, since a host that needs it has an adapter breaking contract line 5.5. G124: build the expiry timer, it is the soft lock's hard edge; `ensureUnlocked()` past the deadline refuses new work and leaves key-dropping to the timer. G125: `lockSoon()` on an expired key gets no extra grace, by the only-earlier rule. G509: only the soft lock can race a user who is typing, and it has a grace; a hard lock is the user's own act and should win, so there is nothing to build. G328: a `lock()` between the shared unlock and its retries is the user's act, so `vault_locked` to every waiter is right. G070: a lock during the passkey prompt locks this device; the passkey's addition is a storage fact and lands (P3).

## Validation: four jobs, six moments

The Coach named three jobs; the code has a fourth hiding among them.

- **Canary**: a use-case alarm. Label grammar, note length, `maxWhisperBytes`, the vault's own `maxLockboxes`. Host-configurable, no promise, **entry only**. On read a record that fails a canary is not damaged (P7).
- **Floor**: what text must be for every client to agree on what is corrupt. Well-formed Unicode, NFC, no control characters (tab and newline allowed in a note), a fixed ceiling (1 KiB for a label, 4 KiB for a note, say). Not configurable; runs beneath any host schema (G174); failing it on read is damage.
- **Integrity**: what the design needs. Format tag, non-empty ids, positive epochs, time bounds, cipher shapes, scope and boxlabel match, the AEAD opening, the expectations. Not configurable; alike on every client; checked at send (misuse, since only the library builds a record) and at read (damage).
- **Store limit**: a fact about a backend. `maxRecordBytes`, `maxVaultBytes`, the backend's `maxLockboxes`. Declared by the adapter, measured at send, enforced by the backend where it can, never checked on read. Declare, don't guarantee: Postgres and GraphQL declare `Infinity` and drop the 1000 default (G285).

| Check | Job | Entry (verb argument) | Send (client to adapter) | Read (adapter to client) | Receipt (push, refresh) | Re-encrypt (rotation walk) |
| --- | --- | --- | --- | --- | --- | --- |
| Label grammar (`Label`), `unlocklabel` | canary | `bad_label` | – | lists as stored | – | – |
| Note at most 256 chars | canary | `bad_option` | – | lists as stored | – | – |
| `maxWhisperBytes` | canary | `whisper_too_large` | – | – | – | re-seals what stands |
| The vault's `maxLockboxes` | canary | `vault_full`, after one refresh | – | – | – | – |
| Well-formed, NFC, no control chars, length ceiling | floor | `bad_label` or `bad_option` | – | `corrupt_record`, so damaged | same | skipped, left damaged |
| Whisper is JSON: no `undefined`, no bare `null`, plain objects | integrity | `bad_whisper` | – | `damaged_lockbox` at `read()` | – | – |
| Record shape: format, ids, epochs, times, cipher fields, at most 8 distinct unlocks, prior fits | integrity | – | `bad_option` (a library bug) | `corrupt_record`, so `damaged_*` | same | skipped |
| Scope and boxlabel match the row | integrity | – | – | `corrupt_record` | same | skipped |
| AEAD opens under the vault's key | integrity | – | – | `damaged_lockbox`, after one catch-up | – | left damaged; an epoch neither current nor prior lists damaged from the epoch alone (G063) |
| Expectations: `vault_id`, `revision_id`, `vault_key_epoch`, `unlock_epoch` | integrity | – | compared atomically, else `stale_write` | – | – | every write carries them |
| Clock reading within 1981 to 2255 | floor | `bad_option`, key dropped | – | as `EpochMillis` | – | – |
| `maxRecordBytes` | store limit | – | measured bytes, else `lockbox_too_large` | – | – | – |
| `maxVaultBytes` | store limit | estimate before sealing, else `vault_full` | the backend's own cap is the authority | – | – | – |
| The backend's `maxLockboxes` | store limit | – | best effort, else `vault_full` | – | – | – |

**On the server** (the Convex component, the Postgres route, the GraphQL resolvers): authorization, atomicity and structural shape, nothing more (G176, G289). Names are any text there and the client decides; a host serving clients with different validators has chosen that. Two cheap courtesies belong beside the expectation compare: `vault_id` constancy and `unlock_epoch` increase on `updateBundle` (G247).

**On failure, by moment.** Entry: the verb throws and nothing was sent. Send: the adapter refuses and nothing was written (3.6). Read: the record is quarantined under its stored name and nothing is touched. Receipt: logged through the vault's logger, and the snapshot says `syncing: false`. Re-encrypt: the walk skips the record, finishes, and the listing still shows it damaged.

**Where the validators live** (G173): deposited once, not passed per verb. `openVault` binds its bag onto the adapter (`vaultDB.bindValidators(bag)`, refused if already bound to another), and the nine verbs lose their last argument. A verb called before binding, which is exactly the server-side case, admits any text that passes the floor.

### Normalization: almost none, and never of a name

| What | Where | Rule |
| --- | --- | --- |
| Whisper to canonical JSON (`stableJsonify`) | `store()`, inside the encryption | the one normalization of user data; reversible |
| Clock reading to whole milliseconds | every `clock.now()` | `Math.floor` |
| `forcePassphraseReentryHours: Infinity`, or at least `ForeverMs` | `openVault` | becomes `ForeverMs`; `askPassphraseAt` reads `FarFuture` |
| An adapter limit of `Infinity` | the adapter, where it crosses a wire | a large whole number (line 4.1) |
| `note: ''` | `store()` | no note (proposed) |
| Names and notes | nowhere | never trimmed, case-folded, stripped or NFC-normalized: refused instead (P11) |
| Control characters | nowhere | refused, never stripped |

## Names and keys, derived

Agreed with the Coach in chat on 2026-10-16. The tuple-encoded ckey (`["box","acme","u1","main","anthropic"]`) is paranoia past the boundary: it defends against text the default validators refuse anyway, and its reverse direction (`boxlabelOf` with its canonical re-encode check, `boxPrefix`, the IndexedDB range) is the drama. Under P12 the names are made safe once, at entry, and every key is a join.

- **Where composition lives.** The VaultDB contract never composes a key: every verb takes the scope and the boxlabel apart, Postgres has a compound primary key, Convex a compound index, GraphQL passes a scope object. Only the key-value adapters (`localVaultDB`, IndexedDB, the device shelves, a future S3 adapter) compose one, and the key's shape is the adapter's business.
- **Default charsets.** `user_id`: letters, digits and `-_.:@+|`, 1 to 100 characters. That fits every stable provider id (UUID, ULID, Auth0's `provider|id`, Clerk's `user_…`, Firebase, Okta, Apple's dotted `sub`, DIDs) and practical email. `applabel`, `vaultlabel`, `boxlabel`, `unlocklabel`: `Label` as it stands, lowercase words and underscores. The characters left out, `\ / = , ! % # $ ^` and space, belong to directory and legacy formats (LDAP DNs, `DOMAIN\user`, Kerberos, Matrix, UUCP); a host with those passes the UPN, SID or objectGUID it has anyway.
- **Reserve both delimiters.** `^` and `/` stay out of every default charset. The flat stores join on `^` (it appears only in full-RFC email local parts and IRC nicks); an S3 adapter joins on `/` and gets real folders; the same validators serve both.
- **The one hazard, and its cheap fix.** Validators and joiner are both pluggable and must agree, or `a^b` + `c` collides with `a` + `b^c`, and across user\_ids that is one tenant's lockbox under another's key (P2). So the adapter declares its delimiter and byte limits under contract line 7.x, and VaultDB refuses any part that contains the delimiter or exceeds the limit at send: an integrity check (P9), one `includes` per part, that no validator setting can turn off. The escape hatch is bounded.
- **Fail at the earliest moment the name is known.** The scope at `openVault`, once, on every store; the boxlabel at `store()`. Never on the backend's refusal six months later for one user. The refusal names the part and the rule.
- **Pluggable in one place.** Validators are deposited once (G173: `openVault` binds its bag onto the adapter), the floor runs beneath any host schema (G174, G175), and the host's check runs once per verb (G476). The KV adapter takes its joiner at construction. The host who wants any-text names chooses: an any-text validator with a JSON joiner, or a hash joiner and the caveat that a row too broken to read its own name lists as damaged under an opaque handle rather than its name (P5 weakened by their choice, not ours).
- **A one-way key is the wrong default.** A hash hides nothing (the boxlabel is plaintext in the row and an indexed column in Convex and Postgres) and loses the name of a damaged row, which P5 and P6 need. An injective encoding gives everything a hash would. Plain ASCII and a reserved delimiter is the simplest injective encoding there is.
- **What we reap.** `ckeys.ts` shrinks to join, split and prefix; `boxlabelOf` is `split('^').at(-1)`; the `u1` versus `u1","x` prefix trick disappears; a key's byte length is arithmetic (parts plus four), so size checks against S3's 1024 bytes or any store's limit are exact at entry; names reaching `snapshot.boxes` are ASCII under the defaults, so T02's rendering worry is the host's choice alone; `listBoxes` sorts by code point and two devices always agree (G181); the `validators` bundle loses its Unicode property regexes (G520 re-sets its budget); G185's missing runtime checks are moot; G182's NFC caution applies only to a host who widened.
- **user\_id is a key, not a handle.** The scope's `user_id` can never change without orphaning the vault. Emails change, handles get renamed, DNs move between OUs. The docs for `userId` say: pass the provider's stable opaque id. The narrow default charset nudges toward it.
- **Decide before 1.0.** The ckey is part of what is stored, so after 1.0 the default joiner is a stored contract and a host changing theirs orphans every row. Today it is free: no compatibility, no migration (CLAUDE.md, *What the package promises*).

## What I did in the other tabs

- Added an italic *(Fable: …)* note after your words, or in the empty answer cell, on the rows I had an answer for. No chip flipped, none of your words changed, no row deleted except by moving it.
- Moved rows so that correlated matters sit together: G509, G138, G140, G498, G499 and G130 into Vault core (beside G119, G117, G121, G141 and G144), and G476 and G181 into Validators (beside G184 and G182). Each says which tab it came from.

## Coach thoughts

-
