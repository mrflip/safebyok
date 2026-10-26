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

* **The vault** (a Vault object, from `bank.ensureVault`) decides what to write. It seals a new
  revision over the one it read or listed, and writes with an expectation of it. When storage
  refuses the write as stale, it refuses the store as `stale_write`, as it came, reading nothing
  after and never trying again; one storage refuses as `vault_mismatch` it refuses `stale_write`
  too, as the vault it read is gone: what the other device wrote or deleted stands, and the host
  hears that its write lost. A box read that storage refuses as `vault_mismatch` (line 2.5) is
  `vault_gone` to the host, and the Vault object goes with it. It also holds the app's own box limit (`maxBoxes`, 100 by default): the alarm bell for an
  app that is storing far more than it meant to.
* **The base class** (`VaultDB`'s public verbs) checks every name, record and expectation on the
  way in and every record on the way out -- the box a write hands back among them, and what a
  box deletion reports, what a stale box write or a stale update of the vault props says stands,
  the tombstone a vault deletion leaves, and how full a `vault_full` says the vault is -- refuses what is malformed
  before your code sees it, turns a `false` from you (from a box deletion, a `null`) into
  `stale_write`, and turns
  anything you throw that is not a
  `VaultError` into `storage_unavailable`, your error as its cause. Every verb resolves an
  `Outcome` and never rejects: `{ ok: true, val }`, or `{ ok: false, err }` with the refusal as
  a `VaultError`, whether the base class refused or your code threw. It holds every name to the
  floor and to what your adapter declares (*Names*, below), never to a host's own validators.
  It guards `subscribe`: each listener is called so that nothing it throws, and no promise it
  hands back that rejects, escapes -- each goes to the logger as an error -- and your unsubscribe
  runs once, however often the host calls it. It hands a vault's records on, whole but for their
  ciphertext, for a server to serve (`getVaultRecords`, `ensureVaultRecords`), from your
  `doGetVault` and `doEnsureVault`. It keeps the `logger`, as `this.logger`:
  your adapter's own, else the one `Bank.make` hands it, else the console; and
  `this.watchTrouble(message)` warns once for each failing streak of a live watch.
* **Your adapter** (the `do*` methods) stores and returns records, and makes each write
  conditional: it checks the expectation and writes in one atomic step. It never resolves a
  conflict itself, never merges two writes, and never retries one: a write whose expectation
  failed resolves `false` (a box write or deletion, `null`), and the vault decides what
  happens next. A write that lands resolves what you now hold, read back in the same atomic
  step as the write: the box for a box write, the vault props for an update of them (line 3.2),
  the tombstone for a deletion of the vault (line 3.5); a box deletion that lands, what it
  removed (line 3.4).

A server that serves these verbs to browsers -- the Convex component, the Postgres route recipe,
the GraphQL resolvers -- checks who may reach which vault (line 5.4), makes each write atomic, and
holds each record to its shape and each name to its check and its storage's limits, through these
same verbs: the same checks a browser's vault makes, as the name rules are the package's own. A
stored record holding a name that fails its check is damage.

So the versioned update is split: the adapter owns the atomic compare-and-write (lines 3.1 to
3.5), and the vault owns the read before it and the refusal after it. "The first write
wins, and the second hears of it" is the vault's policy over the adapter's guarantee, not something
an adapter implements.

Nothing is retried. A box write, a change to the ways in, a `del()` or a `delBox()` that
meets someone else's is news the user must hear, refused once as `stale_write`, as storage
answered it: the vault reads nothing after a refusal, and a gate write refused after this device
heard of another device's change is `gate_moved`. It names a box that will not open `damaged_box`
at once, reading nothing more: the host reads again (`hello()`) to see what stands. There is no conflict handler beyond this, and no hook for one: whatever landed first
stands, and a host that disagrees calls `putBox()` or `delBox()` again. The vault never clears
a damaged record on its own; the user's `delBox()` on its boxlabel does, or a `putBox()` over
one that names its revision, in its one `putBox`: a store never deletes. A `delBox()` that
storage says removed another revision than the one the vault showed stands too, as a deletion
within its vault does (line 3.4): the vault warns through its logger, naming neither revision.

The base class turns anything your code throws that is not a `VaultError` into
`storage_unavailable` -- a bug in your adapter among it, which it cannot tell from a driver's
failure (a `fetch` says the network failed with a `TypeError`): the `cause` carries your error, and
an adapter that means a kind throws a `VaultError` of it. Whatever your code throws reaches the
caller as a bad `Outcome`'s `err`, never as a rejection. A throw from the base class's own code
that is not a `VaultError` is a bug in safebyok, not an outage: `unexpected_error`, never to be
retried. An adapter that hands its calls on to another VaultDB unwraps each answer with `valOf`,
returning its `val` and throwing its `err`: an answer handed back still wrapped as an `Outcome` is
refused as `bad_option`, never read as a record. `subscribe`, which answers at once with the
unsubscribe, is the one verb that throws its refusal rather than resolving it.

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
  the one thing the contract asks of a backend beyond storing JSON. A vault's deletion, its boxes
  and the tombstone it leaves among them; a vault's creation over a tombstone, and the tombstone's
  going: each is one such step.

A stronger guarantee that would cost the host more -- operational work or upkeep, failures or
retries the baseline does not have, or speed in normal or edge cases -- is opt-in, and the
adapter's README says what it costs. An adapter may also offer, unsupported, instructions for a
host who wants more than it ships (a hard limit enforced in the database, say): plainly labelled,
and never needed for any line here.

**A backend with no atomic step at all** cannot keep this contract: line 3.3 compares the
vault's props and the box's revision before writing, and nothing short of an atomic step
makes that comparison and the write one event. A backend with single-record conditional writes
but nothing spanning two records (a plain key-value store with compare-and-set) keeps lines 3.1
and 3.2 where they touch the vault props alone, and no more: lines 3.3 and 3.4 check the vault props
and write a box, 3.5 removes the vault props with every box, and 2.4 reads the vault props with
every box, and it can make none of them one event.
Every adapter in this repository has an atomic step that spans a vault: a statement and a foreign key
(Postgres), a transaction (Convex, IndexedDB), or one synchronous turn of a single tab
(`localVaultDB`).

## Names

A vault is named by its scope -- applabel, user id and vaultlabel -- and a box by its boxlabel
within it. Every name a verb is handed passes, before the adapter sees it:

* **Its check**: an applabel, a vaultlabel and a boxlabel are each a `label` (lowercase words of
  letters and digits joined by single underscores, 2 to 40 characters), and a user id a `user_id`
  (1 to 100 ASCII letters, digits and `-_.~:@+|%`, never dots alone). Nothing turns them off. A
  stored record holding a name that fails reads back as damaged. Neither may hold `^`, which a
  key-value store joins a row's names into one ckey on (`Ckeys`): a name holding it could make two
  rows' ckeys one, another user's box under this one's name. Every store refuses it alike, whether
  it joins names or keeps each in a column of its own, so a name that one store holds every other
  does too.
* **What the adapter declares** (line 7.3): no more bytes than `maxNameBytes`.

A name handed to a verb on its own or in a scope, and a name that passes its check but is over
`maxNameBytes` wherever it is, is refused as `bad_scope`, naming which name and which rule, and
quoting none of it. A name failing its check inside a record -- the vault props' scope, a box's
boxlabel -- makes that record one this package does not build, refused whole as `bad_record`
(a box, as `invalid_box`), naming the record and quoting none of it.

## 1. Records

**1.1. What is stored reads back whole.** A record reads back exactly as it was written, field
for field, and nothing is added. Text comes back as the exact text written. A structured value
-- an encrypted value, a way in, a box's `sidecar` -- comes back as the same JSON value, though a
store that keeps JSON its own way (Postgres's `jsonb`, say) may hand back its object keys in
another order: the vault binds each by its fields, a sidecar as its JSON with keys sorted, so
that order changes nothing. A box's `sidecar` is always a JSON object, `{}` for none, and
comes back as that object. Before anything is written, a read finds nothing: `null`, never a
default.

**1.2. Each vault keeps to itself.** Two scopes that differ anywhere, by however little (a
colon, an underscore, a digit), never share a record, a listing or a deletion, whatever names
that pass their checks and fit the adapter's declared limits they hold (*Names*, above).

**1.3. Nothing is repaired, and nothing is dropped.** An adapter hands up every record as it is
stored, damaged or not; the base class decides what is damaged, and the vault lists a damaged
box so that the user can delete it. *Proven by the base class's own tests* (the core's
`vault-db.test.ts`), which can plant a damaged record; the battery cannot, through public verbs
that refuse to write one.

## 2. Reads

**2.1. A write that resolved is seen by every read after it.** Once a write's promise resolves,
every read that starts afterwards -- `getVault`, `getBox`, on any device -- sees
it, and once a deletion resolves, none sees what it deleted. Normal use gives the same answer from
every device.

**2.2. Every box stored can be read by its boxlabel.** `getBox` reaches each box the
vault holds, however many it holds -- even a vault that racing writers took past its limit (line
4.2).

**2.3. A listing is whole.** The listing `getVault` hands back holds every box in the vault: never a
page, a sample, or the first so many. Asked twice with nothing written between, it gives the same
listing, sorted by boxlabel. There is no limit to ask for; a listing that takes one would also say
which boxes it keeps, and none does. Within the limits the adapter declares (section 7 and
line 4.1) a listing succeeds; past them, a backend that cannot read so many boxes at once
refuses the listing with an error rather than return part of it, and once deletions bring the vault
back within its limits, the listing is whole again.

**2.4. A vault is read in one step, its props and listing together.** `getVault` hands back the
scope's vault props and its box listing (line 2.3) of the vault those props name, read in one atomic
step, or null where no vault props stand -- a scope holding only a tombstone (line 3.5) among them. `ensureVault` reads the
same, in the same step that creates the vault where none stands (line 3.1). No write lands between
the two reads, so what is handed back is the vault as it stood at one moment: never one vault's
props beside another's boxes, never a box deleted beside the props of the write that followed.
Nothing more is promised, and nothing more is checked: the base class does not compare the props
with the listing, nor does the vault, and an adapter neither repairs nor refuses a disagreement
it might find (line 1.3). The step is one statement (Postgres, whose listing is a subquery of
the statement that reads or writes the vault row), one query or mutation (Convex, and over GraphQL
the server's own step), one IndexedDB transaction, or one synchronous turn (`localVaultDB`).
`getVaultRecords` and `ensureVaultRecords` read as these do, the boxes as stored but for their two
ciphered fields: what a server serves a browser's VaultDB, whose own step is then that one request.

Postgres's `ensureVault` over vault props another device created after its statement began
finds them by its `ON CONFLICT`, which reads the row as it stands then, while its listing reads as
of the statement's start, filtered to those props' `vault_tok`: in that race the listing may lag
the props by the boxes written meanwhile, and never names another vault.

**2.5. A box is read only in the vault it lies in.** `getBox` names the vault its reader holds a
key for, by its `vault_tok`, and hands back the box under the boxlabel, or null where none stands,
only while the scope's standing vault props have that `vault_tok`. Where they do not -- none stand,
a tombstone does (line 3.5), or another `vault_tok`'s, the vault deleted and made anew -- it refuses
as `vault_mismatch`, reading nothing more and carrying nothing of the vault props that stand. So a
box from another life of the scope never reaches a reader holding the key of this one, where it
would fail to open and look damaged: the reader hears instead that its vault is gone. The vault
props and the box are read in one atomic step, as a box write compares them (line 3.3): one
statement (Postgres, the vault row joined to the box), one query (Convex, and over GraphQL the
server's own step), one IndexedDB transaction, or one synchronous turn (`localVaultDB`). The
adapter throws `Refusals.vaultMismatch()` from that step, and a key-value store reads both rows
and asks `Expectations.vaultMeets`.

## 3. Versioned writes

**3.1. Vault props are created once.** `ensureVault` stores the vault props only where the scope
holds none, and returns whichever vault props stand afterwards, with the listing beside them (line
2.4): the draft's, or, when the vault already exists, the ones standing, exactly as stored and under
their own `vault_tok` -- another device's, perhaps created in the same moment. Two devices
creating at once settle on one vault, and get one `vault_tok` back. It takes one argument, a
gateless draft (`gate_epoch` 0, no way in, `vault_epoch` 0), which names the scope itself; a draft
of another shape, or claiming a counter, the base class refuses as `bad_record`.

Over a **tombstone** (line 3.5) the scope holds no vault, and the draft starts a new life: stored
under the draft's own, fresh `vault_tok`, with its `vault_epoch` set to the tombstone's rather than
0, and the tombstone gone, all in the one atomic step. The counter, which only goes up, so carries
on past a vault's deletion.

**3.2. An update of the vault props lands only over the props it read.** `putVaultProps`
writes only while the standing vault props have the expected `vault_tok` and `gate_epoch`, and
refuses as `stale_write` otherwise, including where no vault props stand, or only a tombstone does:
an update never creates, and never revives. It resolves the vault props as stored, read in the same
atomic step as the write, and the store has set their `vault_epoch` to the standing one plus one,
whatever the writer sent: a counter that moves on every write of the gate, and only there. (No box
write moves it, so a restored backup that rolls back boxes alone shows no sign of it; the README
says what a host that restores one does.) The refusal carries what stands as
`err.meta.vault_props_stored`, read in the same atomic
step: the winner's vault props, whole, or null for none, so the caller takes them up with no second
read. The adapter throws `Refusals.staleVaultProps(standing)` with the row exactly as stored, and
a key-value store asks `Expectations.vaultPropsRefusalOf`; the base class checks what stands as
`getVault` checks a record, so vault props standing that fail that check refuse as a read of
them does (`damaged_vault`, `newer_format`), and a stale write that names nothing standing is the
adapter's bug, `corrupt_record`. A landed write's answer is held to the same: vault props of the
scope, the same `vault_tok` at the `gate_epoch` written, else `corrupt_record`, saying the write
may have landed. A vault's first gate is such an update: written over its
gateless props at `gate_epoch` 1, expecting 0, so of two devices setting it at once one lands and
the other hears whose won. A server-side adapter, which a client of another version's may reach, also enforces what
every update carries: it lands only vault props that keep the standing `vault_tok` and move
`gate_epoch` forward, and refuses any other as `stale_write` (Convex's component and Postgres
do). The core always sends the standing
`gate_epoch` plus one, so none of its own writes meets this refusal.

**3.3. A box write lands only over the box it read, in the vault it was sealed for.**
`putBox` writes only while the scope's standing vault props have the expected `vault_tok` and the
standing box has the expected `revision_tok` -- or, for a null revision, no box stands
under that boxlabel. Where the vault props are not the expected ones -- none stand, or another
`vault_tok`'s, a vault deleted and made anew even where no box stands in either -- it refuses as
`vault_mismatch`, carrying nothing of the vault props that stand. Where they are, and the box is
not the one expected -- a revision it never read, a box since deleted, a box where it expected
none -- it refuses as `stale_write`, with what stands under the boxlabel as `err.meta.box_stored`.
A write sent again after it landed -- a retry after its answer was lost, say -- is no exception:
what it expected no longer stands, so it refuses as `stale_write`, naming the box it wrote. A write
lands, and says so, only where its own comparison passed, never because the box standing happens
to be the one it sent.

A write that lands resolves the box as storage now holds it, field for field the one written
(line 1.1), and the adapter hands it back from the same atomic step as the write: a `RETURNING`
(Postgres), the mutation's return value (Convex, and over GraphQL its payload), a read in the
write's transaction (IndexedDB) or synchronous turn (`localVaultDB`), never a second call. A
write that misses resolves no record, and the adapter reports why from that same step: it throws
`Refusals.vaultMismatch()`, or `Refusals.staleBox(standing)` with the record standing exactly as
stored (or null for none), and a key-value store reads both rows in the step and asks
`Expectations.boxRefusalOf` which. The base class checks what stands as `getBox` checks a
record, and the refusal carries it as a read would hand it back: the box, whole -- its wrapped
boxKey and ciphered whisper among it, so the caller can open it, or merge and write over it, with
no second read -- a `DamagedBox` naming the revision it holds when it does not read back as a
box, or null. A write over it names that revision. A stale write that
names nothing standing is the adapter's bug, refused as `corrupt_record`. The base class holds
what a landed write hands back to the check a `getBox` makes, at the revision written, and
refuses one that fails it as `corrupt_record`, saying the write may have landed: the adapter
wrote something it cannot read back.

*That refusal is proven by the base class's own
tests* (the core's `vault-db.test.ts`), which can have an adapter answer with a malformed record;
the battery, through an adapter that keeps this line, cannot.

**3.4. A deletion wins, within its vault, and says what it removed.** `delBox` removes the
box under its boxlabel, whatever revision stands, while the scope's standing vault props have
the expected `vault_tok`, and resolves what it found there, reported from the same atomic step as
the removal: `deleted` for the revision its expectation names (its `revision_tok`, the one the
deleting device read; for null, which names a damaged box listed with none, a record holding
none that reads as one), `deleted_other` for any other record -- one written over the revision
named, or holding one where none was named -- and `absent` where no box stands. The revision
only reports, and never refuses: a deletion naming another revision removes what stands all the
same, and the vault decides what to tell its user. A write over a revision deleted meanwhile
refuses, and the box stays gone. A deletion aimed at a vault since deleted and made anew
refuses as `stale_write`, whatever revision it names -- its adapter resolves `null` -- and the new
vault keeps its box. Nothing of what is deleted is kept: no tombstone.

An adapter that keeps a typed revision column reports from its delete (Postgres's `RETURNING`, the
row a Convex mutation deletes); a key-value store reads the row in the step that removes it. Each
compares the revision as the listing reads it: Postgres and the key-value stores through
`Expectations.deletionOf`, and the Convex component, which runs on Convex's servers apart from
the core, in its own mutation. The base class refuses an answer
in any other shape as `corrupt_record`, saying the deletion may have landed. *That refusal, and
`deleted` for a damaged record holding no revision, are proven by the base class's own tests* (the
core's `vault-db.test.ts` and `expectations.test.ts`), which can have an adapter answer badly and
plant a damaged record; the battery, through public verbs that do neither, cannot.

**3.5. A vault is deleted whole, and alone, and leaves a tombstone.** `delVault` removes the vault
props and every box of its scope, and nothing of any other scope, while the standing vault props have
the expected `vault_tok` **and** `gate_epoch`; otherwise it refuses as `stale_write` and removes
nothing, so a vault made anew survives a device that missed its predecessor's end, and a delete
proven against a gate another device has since changed -- an old passphrase in a stale tab -- does
not delete the vault. In the same atomic step it leaves a **tombstone** in the scope, the vault's
place, and resolves it: the scope and a `vault_epoch` one past the vault's (format
`safebyok-tombstone-v1`). The tombstone holds no `vault_tok`, so it meets no expectation: every
write over it refuses as over no vault (`stale_write` for the vault props and the vault, `vault_mismatch`
for a box, as does a box read), a second `delVault` of the vault already deleted included, and `getVault` reads it as
no vault. Only `ensureVault` (line 3.1) replaces it, with a new life that carries its counter on. A
key-value adapter keeps it in the row the vault props were in, so a scope holds one or the other;
a typed one in a table of its own, moved in the same step. `Expectations.tombstoneOf` and
`Expectations.newLifeOf` make the records.

It compares the `vault_tok` and the `gate_epoch` and nothing else, so a vault whose props are
damaged in any other field is still deleted, and vault props rewritten under the same `vault_tok`
and gate between a read and the deletion are deleted with them: it is the same vault. A typed backend (Convex, Postgres) cannot
hold damaged vault props, so there the hatch below has nothing to do: the vault's
`delDamagedVault`, the one way to clear a vault whose `hello()` refuses it as `damaged_vault`, reads
the vault through `doGetVault` as stored, takes the props' `vault_tok`, and aims this
deletion at it with a `gate_epoch` of null: the props fail their checks and show none to name, so it
expects the `vault_tok` alone, and counts a counter it cannot read from zero. An adapter that hands each call on to another VaultDB's public verbs hands
`delDamagedVault` on too. Proven by the base class's own tests for a damaged record, which the
battery cannot plant, and by the battery for a sound vault, which it refuses to delete.

**3.6. A refused write wrote nothing.** Whatever the refusal -- `stale_write`, `vault_mismatch`,
`vault_full`, `box_too_large`, a malformed record -- the vault stands afterwards exactly as it stood before:
its vault props, its boxes, its listing. When storage is unreachable or fails partway
(`storage_unavailable`), an adapter's own atomic step decides: the write landed whole or not at
all, and the vault's next read shows which.

**3.7. Writes that do not collide all land.** Writes to different boxes in one vault, made at
once from different devices, all land: none refuses as `stale_write`, none fails for contention,
and no host retries. Only writes to one box -- or a deletion of the vault -- can collide, and
then line 3.3 or 3.4 says which wins.

## 4. The box limit

**4.1. An adapter declares the most boxes it holds in one vault.** `maxBoxes` is a whole
number above zero, or `Infinity` for a backend that sets no such limit; a limit that crosses a
wire or is stored, where `Infinity` cannot go, is a large whole number instead. A vault refuses to
open with a larger `maxBoxes` of its own.

**4.2. A new box past the limit is refused, on a best effort.** An adapter with a finite limit
refuses a new box in a vault already holding that many, with kind `vault_full`. Its check is
a best effort: writes made one after another never take a vault past the limit, but writers racing
for the last places may each find room and all land, taking it a few past. That is the limit's
job -- to stop a runaway loop, and to keep a vault inside what its backend can list and delete --
not to hold off a determined client, which is the host's to meter like any other abuse.

**4.3. A replacement is never refused for the count.** A box written over one already there
is never refused as `vault_full`, however full the vault. A first write under a boxlabel that is
already taken missed a box it would replace, and refuses as `stale_write` with that box as
`meta.box_stored`, never as `vault_full`, so a store over it replaces it.

**4.4. Under the limit, a new box lands.** Once a vault holds fewer boxes than its
limit -- deletions having made room, or brought back under it a vault that racing writers took past
-- a new one lands.

**4.5. Past the limit, nothing is lost.** A vault taken past its limit by racing writers keeps
every box that landed, each readable by its boxlabel (line 2.2), and every write refused as
`vault_full` left nothing behind (line 3.6). Deletions bring it back under the limit, and its listing
is whole again (line 2.3).

**4.6. A hard limit is the backend's, or opt-in.** A backend that cannot hold more than some
amount in a vault -- Convex, whose transactions read and write a bounded number of documents --
refuses at that limit as `vault_full`, and declares a `maxBoxes` well inside it. An adapter
for a backend with no such limit enforces none beyond line 4.2's best effort, unless the host
opts in to one and pays what it costs. *Not tested by the battery*: each adapter tests its own.

**4.7. An adapter says how full a vault is.** `getCapacity(scope)` answers a `Capacity`, `{
boxes: { used, max }, bytes: { used, max } }`, read in one step: the vault's boxes, counted, and
the bytes they take, weighed as the backend weighs them, each against the most the backend holds
of one vault (`Infinity` for a limit it does not keep, which the base class answers as the largest
safe integer). A scope holding no vault answers nothing used. It is an estimate for a host to warn
its user by: the count is exact as of its step, and the bytes are the backend's own measure, which
need not be the vault's (the vault weighs each box at the room it reserves, twice
`maxWhisperBytes`, against `maxVaultBytes`). Each adapter's README says how it weighs. A
`vault_full` from storage carries the same reckoning, made in the step that refused the write, as
`err.meta.capacity`: the adapter throws `Refusals.vaultFull(capacity)`, and the base class checks
it as it checks `getCapacity`'s answer, refusing a `vault_full` without a sound one as
`corrupt_record`. An adapter that enforces a limit says, in its README, what its count is as of:
the start of the write's statement, say, or its commit.

## 5. Errors

**5.1. Every refusal is a VaultError whose kind says what to do.** An adapter refuses with a
`VaultError`: `stale_write` (by resolving `null` from a deletion of a box or a vault, the base
class refusing with it; a box write throws `Refusals.staleBox(standing)`, and an update of the
vault props `Refusals.staleVaultProps(standing)`), `vault_mismatch`
(a box write or read, `Refusals.vaultMismatch()`), `vault_full`,
`identity_revoked`, `not_permitted`, or anything it throws otherwise, which becomes
`storage_unavailable`. The base
class refuses `bad_scope`, `bad_record`, `invalid_box`, `bad_option`, `box_too_large`, `damaged_vault`,
`damaged_box` and `corrupt_record` itself, before the adapter is asked or after it answers.

A record that fails its checks is named for who is at fault. One the caller hands in is
`bad_record` (a box handed to `putBox`, `invalid_box`). One read from storage is damaged:
`damaged_vault` for vault props (from `getVault` and `ensureVault`,
and a stale `putVaultProps`'s `meta.vault_props_stored`), `damaged_box` for a
box (from `getBox`; a listing shows it as a `DamagedBox` instead, and a stale write's
`meta.box_stored` likewise), Zod's own error its `cause` where a check failed. An answer the
adapter owes in the protocol's shape that comes in another -- a box write's echo that fails a
box's checks or holds another boxlabel or revision, a `Refusals.staleBox`, `Refusals.staleVaultProps`
or `Refusals.vaultFull` missing what it must carry, a deletion's report, a tombstone or the vault props an update stored, or a capacity, in another shape -- is
`corrupt_record`: the adapter's bug, and the one thing that kind means. An adapter does not
refuse a damaged record itself (line 1.3): it hands it up, and the base class names it. Each message says calmly what went wrong and what to do
about it, and a caller branches on the kind, never the message. Every verb resolves an `Outcome`
and never rejects: the refusal is its `err`, whoever made it.

**5.2. A stale write means an expectation failed, and nothing else.** `stale_write` says the vault
changed under the writer, and the writer should read it again. Contention is never dressed up as
one: a lock timeout or a serialization failure is `storage_unavailable`, and under the baseline,
at the backend's default settings, there is none to report. Its test is line 3.7's.

**5.3. A refusal quotes nothing it was handed.** No refusal's message or properties carry a
record's ciphertext, a boxlabel or a sidecar it was handed: the base class never quotes what it
refuses, and an adapter's own messages name the vault's limits, never its contents. A stale box
write carries the box that stands under its boxlabel as `meta.box_stored`, whole, as a `getBox`
by the same user would hand it back: ciphertext under keys only the vault holds. A `storage_unavailable`
refusal's `cause` is the backend's own error, passed up as it came for debugging; it holds only
what the backend holds, which is ciphertext and unencrypted fields.

**5.4. Only the signed-in user reaches their vaults.** An adapter whose backend knows who is
signed in (a server's, made per request) refuses every verb on a scope whose `user_id` is not the
signed-in user's -- including every scope while no one is signed in -- with kind
`identity_revoked`, before the backend is asked anything: it reads nothing of that scope and
writes nothing to it. A server cannot tell "the user changed" from "the host opened another
user's vault", and to the vault both mean the same: its user is not the one signed in.
Who is signed in is the backend's own seam, never the core's: the Convex component asks the
host's `getUserId(ctx)`, Postgres and the GraphQL resolvers take the user from the host's request
context, and every adapter compares it with the scope's `user_id`, which the vault already carries.

**5.5. identity_revoked means the user is gone.** The vault locks itself on `identity_revoked`,
dropping its key, always -- no host option turns it off -- so an adapter says it only when the
signed-in identity really is gone or changed. A passing fault -- a token expired mid-refresh, a network error, a backend that could
not say who is signed in -- is `storage_unavailable`, which locks nothing. *Tested per adapter*:
the battery cannot make a fault.

**5.6. not_permitted refuses one call, and locks nothing.** The scope's own user, still signed
in, whom the host's backend refuses this call by a rule of its own, is refused with kind
`not_permitted`; signing in again would not help. No adapter in this repository has such a rule
of its own: the kind is a host backend's, and each passes its host's through, its error as the
`cause` -- Postgres's `42501` (a privilege, or a row-level security policy), a Convex host's
`getUserId`, a GraphQL server's `FORBIDDEN` or its `vaultDBFor`. *Tested per adapter*.

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
class refuses a heavier box (`box_too_large`) before the adapter sees it, and a vault
refuses to open with a `maxWhisperBytes` over half of it.

**7.2. The most it holds of one vault.** `maxVaultBytes`, no less than one record, or `Infinity`:
what the backend can still list and delete whole. A vault refuses to open when its `maxBoxes`
boxes might not fit in it.

**7.3. The most it holds in one name.** `maxNameBytes`, a whole number above zero, or `Infinity`
for a backend that holds any name the checks admit: the bytes of UTF-8 its keys and indexes hold
of one name. Postgres, whose box key is a btree entry of four names together, declares 640.
The base class refuses a longer name (`bad_scope`) before the adapter sees it, in every verb.

A backend that does not hold to the limits it declares, or a vault opened with limits that
disagree with its backend's, is outside this contract: not a bug we will fix, and not one whose
outcome we promise.

## Proving the races

Lines 2.4, 3.1 to 3.5, 3.7 and 4.5 are promises about writes made at once, and a test that makes two
writes at once through one adapter, over a backend that runs one call at a time, proves only how
they came out, not that they raced. So `describeVaultDB` races them.

**What the battery runs, for every adapter.** Each race -- two creates of one vault, a read of a vault against its deletion and remaking, two
updates of one vault, two first gates of a gateless one, two first writes or two replacements of one box, one first write sent twice, a deletion against a write, two
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
once, each over its own snapshot, and PGlite cannot show that. So `safebyok-postgres` is also run
against a real server: `e2e/tests/postgres/` runs this battery, with a pool and a listening
connection to each device, against `postgres:18` (a CI job, and `e2e/compose.yaml` on a contributor's
machine; `pnpm justify` needs neither and skips those tests where `SAFEBYOK_PG_URL` is unset). Its
other files race what the battery's turnstile cannot hold: writers for a vault's last places, with no
turnstile and no PGlite to take turns; a foreign key violation (`23503`) from a vault deleted while
an insert waited on the foreign key. Of the one-statement writes -- a conditional `UPDATE`
re-checking the row it waited on, `INSERT ... ON CONFLICT`, the foreign key read against the vault
row that stands -- the races and that run show how they came out on that server and no other; which
suites run there is one list in `e2e/tests/postgres/test-helpers.ts`.
Nor can the battery see a lock shared by devices whose turnstile is left unwired; and the devices of
`localVaultDB` and `idbVaultDB`, in one page, share what two tabs would not (the store, the bell, a
connection), so their races show one tab's devices, and IndexedDB's own rule shows the rest.

**Push.** Line 6.1's tests know a watch is live by hearing a write, rather than by waiting, and need
a read on some call to `onChange` to find each write: a push that comes before its write is
readable, or never, fails. A watch whose start is a round trip is held there while a write lands,
so one that starts late and never calls once live fails too.
