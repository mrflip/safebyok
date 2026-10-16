# The VaultDB contract

What every storage adapter promises the vault that runs over it, and what it may leave undone.
It is written for three readers: the author of an adapter, the security reviewer reading one,
and the vault's own code, which relies on nothing that is not said here.

The guarantees are numbered. `describeVaultDB`, from `safebyok/testing`, runs one group of tests
per numbered line, and each group's title names its line (`postgresVaultDB, as a VaultDB, 3.3:
...`), so a failing test points at the promise it caught being broken. A line no battery test can
reach says so, and says where it is proven instead.

## Who does what

Three layers share the work, and each guarantee below belongs to one of them.

* **The vault** (`openVault`) decides what to write. It reads a lockbox, seals a new revision over
  it, and writes with an expectation of what it read. When storage refuses the write as stale, it
  catches up and tries again over what the other device wrote -- three attempts in all, a random
  wait before each retry -- so that between two devices storing into one lockbox, *the last
  writer wins*; and when it finds the lockbox erased meanwhile, it stops, so *an erase wins*. It
  also holds the app's own lockbox limit (`maxLockboxes`, 100 by default): the alarm bell for an
  app that is storing far more than it meant to.
* **The base class** (`VaultDB`'s public verbs) checks every name, record and expectation on the
  way in and every record on the way out, refuses what is malformed before your code sees it,
  turns a `false` from you into `stale_write`, and turns anything you throw that is not a
  `VaultError` into `storage_unavailable`, your error as its cause. It holds every name to the
  floor and to what your adapter declares (*Names*, below), never to a host's own validators.
* **Your adapter** (the `do*` methods) stores and returns records, and makes each write
  conditional: it checks the expectation and writes in one atomic step. It never resolves a
  conflict itself, never merges two writes, and never retries one: a write whose expectation
  failed resolves `false`, and the vault decides what happens next.

A server that serves these verbs to browsers -- the Convex component, the Postgres route recipe,
the GraphQL resolvers -- checks who may reach which vault (line 5.4), makes each write atomic, and
holds each record to its shape and each name to the floor and its storage's limits, through these
same verbs. Nothing more: what text a name may be beyond that is each browser vault's own
`validators`, checked where a name enters the vault, and a host whose clients run different
validators has chosen that. A record a client's validators would refuse reads back as any other
(the vault never takes a name or note it would not have written for damage); one below the floor
is damage.

So the versioned update is split: the adapter owns the atomic compare-and-write (lines 3.1 to
3.5, and 3.8), and the vault owns the read before it and the retry after it. "Last write wins" is the
vault's policy over the adapter's guarantee, not something an adapter implements.

## The baseline

An adapter as it ships, with no options, keeps every numbered line below and asks nothing more of
the host than this:

* **Operational work is tables and indexes.** A host creates the tables or collections the
  adapter names, with their columns and indexes, or points it at a key-value store. The baseline
  needs no trigger, stored procedure, counter kept in step, scheduled job, or extra table; push
  (line 6.1) that needs one, such as a trigger that notifies listeners, is opt-in.
* **Each verb is cheap.** It costs a small, fixed number of round trips -- one, where the backend
  allows -- and touches only the rows of the vault it names, found through an index on the
  vault's scope. Nothing reads another vault, and nothing grows with the number of vaults.
* **Nothing waits, and nothing needs retrying.** No lock is held from one round trip to the next,
  no isolation level above the backend's default is asked for, and in normal use no verb fails
  for contention: the host writes no retry loop.
* **Each write is atomic on its own.** One conditional statement, a condition expression, or a
  transaction the backend runs by itself (Convex's mutations, IndexedDB's transactions). This is
  the one thing the contract asks of a backend beyond storing JSON.

A stronger guarantee that would cost the host more -- operational work or upkeep, failures or
retries the baseline does not have, or speed in normal or edge cases -- is opt-in, and the
adapter's README says what it costs. An adapter may also offer, unsupported, instructions for a
host who wants more than it ships (a hard limit enforced in the database, say): plainly labelled,
and never needed for any line here.

**A backend with no atomic step at all** cannot keep this contract: line 3.3 compares the
vault's bundle and the lockbox's revision before writing, and nothing short of an atomic step
makes that comparison and the write one event. A backend with single-record conditional writes
but nothing spanning two records (a plain key-value store with compare-and-set) keeps lines 3.1
and 3.2, which touch the bundle alone, and no more: lines 3.3 and 3.4 check the bundle and write
a lockbox, and 3.5 removes the bundle with every lockbox, and it can make neither one event.
Every adapter in this repository has an atomic step that spans a vault: a statement and a foreign key
(Postgres), a transaction (Convex, IndexedDB), or one synchronous turn of a single tab
(`localVaultDB`).

## Names

A vault is named by its scope -- applabel, user id and vaultlabel -- and a lockbox by its boxlabel
within it. Every name a verb is handed passes, before the adapter sees it:

* **The floor** (`NameFloor`): one character to 1 KiB of UTF-8, well-formed Unicode, in its
  composed form (NFC), with no control character and no `^`. Nothing turns it off, and no host's
  validators widen it. A stored record holding a name or note below it reads back as damaged.
  `^` is there because a key-value store joins a row's names into one ckey on it (`Ckeys`): a
  name holding it could make two rows' ckeys one, another user's lockbox under this one's name.
  Every store refuses it alike, whether it joins names or keeps each in a column of its own, so a
  name that one store holds every other does too.
* **What the adapter declares** (line 7.3): no more bytes than `maxNameBytes`.

Each refusal is `bad_label`, naming which name and which rule, and quoting none of it.

## 1. Records

**1.1. What is stored reads back whole.** A record reads back exactly as it was written, field
for field: a field left out stays out (a lockbox with no note has no `note` field, not a null
one), and nothing is added. Before anything is written, a read finds nothing: `null`, never a
default.

**1.2. Each vault keeps to itself.** Two scopes that differ anywhere, by however little (a
colon, a quote, a bracket, a script), never share a record, a listing or an erase, whatever names
above the floor and within the adapter's declared limits they hold (*Names*, above).

**1.3. Nothing is repaired, and nothing is dropped.** An adapter hands up every record as it is
stored, damaged or not; the base class decides what is damaged, and the vault lists a damaged
lockbox so that the user can erase it. *Proven by the base class's own tests* (the core's
`vault-db.test.ts`), which can plant a damaged record; the battery cannot, through public verbs
that refuse to write one.

## 2. Reads

**2.1. A write that resolved is seen by every read after it.** Once a write's promise resolves,
every read that starts afterwards -- `readBundle`, `readBox`, `listBoxes`, on any device -- sees
it, and once an erase resolves, none sees what it erased. Normal use gives the same answer from
every device.

**2.2. Every lockbox stored can be read by its boxlabel.** `readBox` reaches each lockbox the
vault holds, however many it holds -- even a vault that racing writers took past its limit (line
4.2).

**2.3. A listing is whole.** `listBoxes` returns every lockbox in the vault: never a page, a
sample, or the first so many. Asked twice with nothing written between, it gives the same
listing, sorted by boxlabel. There is no limit to ask for; a listing that takes one would also say
which lockboxes it keeps, and none does. Within the limits the adapter declares (section 7 and
line 4.1) a listing succeeds; past them, a backend that cannot read so many lockboxes at once
refuses the listing with an error rather than return part of it, and once erases bring the vault
back within its limits, the listing is whole again.

## 3. Versioned writes

**3.1. A bundle is created once.** `createBundle` stores the bundle only where the scope holds
none, and returns whichever bundle stands afterwards: its own, or the one another device created
first. Two devices creating at once settle on one bundle.

**3.2. A bundle update lands only over the bundle it read.** `updateBundle` writes only while the
standing bundle has the expected `vault_id` and `unlock_epoch`, and refuses as `stale_write`
otherwise, including where no bundle stands: an update never creates.

**3.3. A lockbox write lands only over the lockbox it read, in the vault it was sealed for.**
`updateBox` writes only while the scope's standing bundle has the expected `vault_id` and the
standing lockbox has the expected `revision_id` -- or, for a null revision, no lockbox stands
under that boxlabel. Otherwise it refuses as `stale_write`: over a revision it never read, in a
scope with no bundle, or into a vault destroyed and made anew under another `vault_id`, even where
no lockbox stands in either.

**3.4. An erase wins, within its vault.** `eraseBox` removes the lockbox under its boxlabel,
whatever revision stands, while the scope's standing bundle has the expected `vault_id`; it is
quiet when there is no such lockbox. A write over a revision erased meanwhile refuses, and the
lockbox stays gone. An erase aimed at a vault since destroyed and made anew refuses as
`stale_write`, and the new vault keeps its lockbox.

**3.5. A vault is erased whole, and alone.** `eraseVault` removes the bundle and every lockbox of
its scope, and nothing of any other scope, while the standing bundle has the expected `vault_id`;
otherwise it refuses as `stale_write` and erases nothing, so a vault made anew survives a device
that missed its predecessor's end.

It compares the `vault_id` and nothing else, so a vault whose bundle is damaged in any other field
is still erased: the vault's `eraseDamagedVault`, the one way to clear a vault `openVault` refuses
as `damaged_bundle`, reads the bundle through `doReadBundle` as stored, takes its `vault_id`, and
aims this erase at it. An adapter that hands each call on to another VaultDB's public verbs hands
`eraseDamagedVault` on too. Proven by the base class's own tests for a damaged record, which the
battery cannot plant, and by the battery for a sound vault, which it refuses to erase.

**3.6. A refused write wrote nothing.** Whatever the refusal -- `stale_write`, `vault_full`,
`lockbox_too_large`, a malformed record -- the vault stands afterwards exactly as it stood before:
its bundle, its lockboxes, its listing. When storage is unreachable or fails partway
(`storage_unavailable`), an adapter's own atomic step decides: the write landed whole or not at
all, and the vault's next read shows which.

**3.7. Writes that do not collide all land.** Writes to different lockboxes in one vault, made at
once from different devices, all land: none refuses as `stale_write`, none fails for contention,
and no host retries. Only writes to one lockbox -- or an erase of the vault -- can collide, and
then line 3.3 or 3.4 says which wins.

**3.8. A lockbox write lands only under the vaultKey that stands.** A lockbox carries the
`vault_key_epoch` of the vaultKey its lockboxKey is wrapped under, and its write's expectation
names the same one (the base class refuses a lockbox whose epoch is not the expected one, as
`bad_option`, before the adapter sees it). `updateBox` writes only while the scope's standing
bundle has that `vault_key_epoch`, as well as the `vault_id` and revision of line 3.3, compared in
the same atomic step as the write; otherwise it refuses as `stale_write` and writes nothing. So a
lockbox only ever lands sealed under the vaultKey its bundle stands for. The vault does not read
the bundle before each write, so only storage can refuse a device that still holds a vaultKey
since replaced and has not looked at the bundle meanwhile: an adapter that skips this comparison
lets that device seal a new whisper that whoever held the replaced vaultKey can open. Erases name
no `vault_key_epoch` (line 3.4): an erase reveals nothing.

## 4. The lockbox limit

**4.1. An adapter declares the most lockboxes it holds in one vault.** `maxLockboxes` is a whole
number above zero, or `Infinity` for a backend that sets no such limit; a limit that crosses a
wire or is stored, where `Infinity` cannot go, is a large whole number instead. A vault refuses to
open with a larger `maxLockboxes` of its own.

**4.2. A new lockbox past the limit is refused, on a best effort.** An adapter with a finite limit
refuses a new lockbox in a vault already holding that many, with kind `vault_full`. Its check is
a best effort: writes made one after another never take a vault past the limit, but writers racing
for the last places may each find room and all land, taking it a few past. That is the limit's
job -- to stop a runaway loop, and to keep a vault inside what its backend can list and erase --
not to hold off a determined client, which is the host's to meter like any other abuse.

**4.3. A replacement is never refused for the count.** A lockbox written over one already there
is never refused as `vault_full`, however full the vault. A first write under a boxlabel that is
already taken missed a lockbox it would replace, and refuses as `stale_write`, never as
`vault_full`, so the vault's retry replaces it.

**4.4. Under the limit, a new lockbox lands.** Once a vault holds fewer lockboxes than its
limit -- erases having made room, or brought back under it a vault that racing writers took past
-- a new one lands.

**4.5. Past the limit, nothing is lost.** A vault taken past its limit by racing writers keeps
every lockbox that landed, each readable by its boxlabel (line 2.2), and every write refused as
`vault_full` left nothing behind (line 3.6). Erases bring it back under the limit, and its listing
is whole again (line 2.3).

**4.6. A hard limit is the backend's, or opt-in.** A backend that cannot hold more than some
amount in a vault -- Convex, whose transactions read and write a bounded number of documents --
refuses at that limit as `vault_full`, and declares a `maxLockboxes` well inside it. An adapter
for a backend with no such limit enforces none beyond line 4.2's best effort, unless the host
opts in to one and pays what it costs. *Not tested by the battery*: each adapter tests its own.

A write that lands resolves with nothing: it reports no count of the vault's lockboxes. The vault
already learns the count from the listing it reads after every write, and asking every adapter for
one would put a count into every adapter's write path. An adapter that enforces a limit says, in
its README, what its count is as of: the start of the write's statement, say, or its commit.

## 5. Errors

**5.1. Every refusal is a VaultError whose kind says what to do.** An adapter refuses with a
`VaultError`: `stale_write` (by resolving `false`; the base class throws it), `vault_full`,
`identity_revoked`, `not_permitted`, or anything it throws otherwise, which becomes
`storage_unavailable`. The base
class refuses `bad_label`, `bad_option`, `lockbox_too_large` and `corrupt_record` itself, before
the adapter is asked or after it answers. Each message says calmly what went wrong and what to do
about it, and a caller branches on the kind, never the message.

**5.2. A stale write means an expectation failed, and nothing else.** `stale_write` says the vault
changed under the writer, and the writer should read it again. Contention is never dressed up as
one: a lock timeout or a serialization failure is `storage_unavailable`, and under the baseline,
at the backend's default settings, there is none to report. Its test is line 3.7's.

**5.3. A refusal quotes nothing it was handed.** No refusal's message or properties carry a
record's ciphertext, a boxlabel or a note: the base class never quotes what it refuses, and an
adapter's own messages name the vault's limits, never its contents. A `storage_unavailable`
refusal's `cause` is the backend's own error, passed up as it came for debugging; it holds only
what the backend holds, which is ciphertext and public fields.

**5.4. Only the signed-in user reaches their vaults.** An adapter whose backend knows who is
signed in (a server's, made per request) refuses every verb on a scope whose `user_id` is not the
signed-in user's -- including every scope while no one is signed in -- with kind
`identity_revoked`, before the backend is asked anything: it reads nothing of that scope and
writes nothing to it. A server cannot tell "the user changed" from "the host opened another
user's vault", and to the vault both mean the same: its user is not the one signed in.

**5.5. identity_revoked means the user is gone.** The vault locks itself on `identity_revoked`,
dropping its key, so an adapter says it only when the signed-in identity really is gone or
changed. A passing fault -- a token expired mid-refresh, a network error, a backend that could
not say who is signed in -- is `storage_unavailable`, which locks nothing. *Tested per adapter*:
the battery cannot make a fault.

**5.6. not_permitted refuses one call, and locks nothing.** The scope's own user, still signed
in, whom the host's backend refuses this call by a rule of its own, is refused with kind
`not_permitted`; signing in again would not help. No adapter in this repository has such a rule:
the kind is a host backend's. *Tested per adapter*.

**5.7. An adapter with no notion of identity says neither.** One that serves whoever holds it --
`localVaultDB`, IndexedDB -- never refuses `identity_revoked` or `not_permitted`. *Tested per
adapter*: the battery cannot tell such an adapter from one that serves its signed-in user.

## 6. Push

**6.1. subscribe hands back an unsubscribe, and calls when the vault may have changed.**
`subscribe` returns a function that ends the watch, and calls `onChange` after every write
touching the scope, from this device or another. A call with nothing changed costs the vault only
a needless read, so a backend that cannot tell one scope's writes from another's may call more
often (`localVaultDB` calls after every write to its store); a backend with no push never calls,
and the vault, which reads afresh after its own writes regardless, loses only news of other
devices' writes.

A watch is live once `subscribe` returns, or else calls `onChange` once it is: a watch that starts
on its own time -- a listen on a connection, a subscription over a wire -- would never hear a write
that landed while it was starting, and the vault, which subscribes and then reads, could read the
vault before that write and miss it until the next one. Calling once live has it read again.
`postgresVaultDB` calls as its listen begins (and through it `safebyok-graphql` as its subscription
starts); Convex's watch delivers a first result; `localVaultDB` and `idbVaultDB` are live at once.

**6.2. A watch that fails calls onChange.** When a live watch fails -- its user signed out, say --
the adapter calls `onChange`, so the vault reads again and meets the refusal itself, rather than
sit idle and unlocked. *Tested per adapter*: the battery cannot fail a watch.

## 7. What an adapter declares

**7.1. The most it holds in one record.** `maxRecordBytes`, above zero, or `Infinity`. The base
class refuses a heavier lockbox (`lockbox_too_large`) before the adapter sees it, and a vault
refuses to open with a `maxWhisperBytes` over half of it.

**7.2. The most it holds of one vault.** `maxVaultBytes`, no less than one record, or `Infinity`:
what the backend can still list and erase whole. A vault refuses to open when its `maxLockboxes`
lockboxes might not fit in it.

**7.3. The most it holds in one name.** `maxNameBytes`, a whole number above zero, or `Infinity`
for a backend that holds any name the floor admits: the bytes of UTF-8 its keys and indexes hold
of one name. Postgres, whose lockbox key is a btree entry of four names together, declares 640.
The base class refuses a longer name (`bad_label`) before the adapter sees it, in every verb.

A backend that does not hold to the limits it declares, or a vault opened with limits that
disagree with its backend's, is outside this contract: not a bug we will fix, and not one whose
outcome we promise.

## Proving the races

Lines 3.1 to 3.5, 3.7 and 4.5 are promises about writes made at once, and a test that makes two
writes at once through one adapter, over a backend that runs one call at a time, proves only how
they came out, not that they raced. So `describeVaultDB` races them.

**What the battery runs, for every adapter.** Each race -- two creates of one vault, two updates
of one bundle, two first writes or two replacements of one lockbox, an erase against a write, two
writes that do not collide, four writers for a vault's last place -- runs under every schedule
`raceEveryWay` makes, each over a fresh backend, and its outcome is checked after each: the two
moves made together; one started one to three microtasks, then one and two ticks, after the other,
each way round; and one held just before each of its round trips to the backend while the other
moves to its end, each way round (the four writers each held midway, then let go together). A move
that cannot finish while another device waits before a round trip fails the race, as nothing in
the baseline waits: the two devices share a lock or a queue that two real devices would not, or the
adapter holds a lock from one round trip to the next.

**What the adapter gives it.** Only what the battery cannot know: `makeDevices(turnstile)`, a
fresh backend and a way to make devices over it, each an adapter of its own sharing nothing but
the backend, and each passing the `turnstile` before every round trip it makes -- a statement, a
request, a transaction, a watch's start. `throughTurnstile` wraps a client's methods in it, and
`expectRoundTripsThroughTurnstile` shows, in the adapter's own tests, that every write passes it:
a race cannot tell a turnstile left unwired from an adapter that makes no round trips. The adapter
does not mark where its check ends and its write begins. Its check and its write should be one
round trip, so there is no such place to mark, and asking for one would assume what the race is
there to find; holding it before every round trip finds a gap wherever an adapter left one. With
the same two, an adapter's own races -- of something it does beyond this contract -- run under the
same schedules.

**What it proves, and what it cannot.** It finds a check and its write split across two round
trips, or across an await in the adapter's own code, and a lock or queue in this process that
makes the devices take turns. It cannot split a round trip: that one statement, one transaction or
one mutation is atomic is the backend's to keep, and every backend in this repository's tests runs
one call at a time. Of Convex and IndexedDB, that is what the real backend promises too -- Convex's
mutations are serializable, and IndexedDB runs transactions that write one store one after
another, across tabs and connections. Of Postgres it is not: under READ COMMITTED, statements run at
once, each over its own snapshot, and PGlite cannot show that. That the adapter's one-statement
writes still hold -- a conditional `UPDATE` re-checking the row it waited on, `INSERT ... ON CONFLICT`,
the foreign key read against the bundle that stands -- rests on Postgres's documented behaviour, not
on a test here; only a run against a real server, with a connection to each device, would show it.
Nor can the battery see a lock shared by devices whose turnstile is left unwired; and the devices of
`localVaultDB` and `idbVaultDB`, in one page, share what two tabs would not (the store, the bell, a
connection), so their races show one tab's devices, and IndexedDB's own rule shows the rest.

**Push.** Line 6.1's tests know a watch is live by hearing a write, rather than by waiting, and need
a read on some call to `onChange` to find each write: a push that comes before its write is
readable, or never, fails. A watch whose start is a round trip is held there while a write lands,
so one that starts late and never calls once live fails too.
