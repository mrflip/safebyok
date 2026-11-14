# Vault DB: one store for every Thing

Thread `20261114-vault_db`, stacked on [#697](https://github.com/mrflip/safebyok/pull/697). The new core gains
`safebyok/storage`: `vault-db.ts` (the interface), an adapter, and `memory-vault-db.ts`, with Postgres to follow. Each
is the analog of big's `bank-db.ts`, `adapter-bank-db.ts` and `memory-bank-db.ts`, but **table-agnostic**: the store
holds Things, and a Gate, a Bank and a Box are each a Thing. The Gate comes first. Bank and Gate are left
intertwingled for now.

Words used below: **proposed** is `ask.record`, the record the caller would store. **cited** is `ask.cited`, what the
caller cites of the record in hand, or the shell for none. **actual** is the record the store holds.

## The Thing

Every record the store holds carries these fields. The store reads only these, except where a storage policy reads
the body. Everything else in the record is the **body**, which the store carries but does not read.

| Field        |                                                                                                        | Gate today              |
| ------------ | ------------------------------------------------------------------------------------------------------ | ----------------------- |
| `userid`     | the user, smushed as the other scope fields are                                                        | `user_id`               |
| `banklabel`  | the bank, under the user                                                                               | `banklabel`             |
| `labelpath`  | where the Thing sits under the bank: its modelkind, then `/`-joined labels; the analog of `vaultlabel/boxlabel` | `gate/main` |
| `label`      | the last label of `labelpath`: the analog of `boxlabel`                                                | `gatelabel`             |
| `fmt`        | the kind and its format, as today (`GateFormat`, `BoxFormat`, ...)                                     | `fmt`                   |
| `lifepath`   | `/`, then the `lifeseq` of each Thing from the root down to its own, joined by `/`; the analog of `vault_tok/box_tok`, made sequential | `gate_tok` |
| `lifeseq`    | which life of the Thing at this scope: an integer, as 10 base-32 digits                                | `gate_tok`              |
| `revtok`     | the revision's token                                                                                   | `revision_tok`          |
| `revseq`     | the revision's number, up by one at every write                                                        | `revision_seq`          |
| `born_at`    | the `written_at` of this life's birth, kept by every later revision of it                              | `registered_at`         |
| `written_at` | when this revision was written; on a tombstone, when it was deleted                                    | `written_at`            |
| `am`         | `'a'` live, `'x'` gone                                                                                 | `am`                    |

* **A `labelpath` starts with its modelkind**: `bank/<label>`, `gate/main`, `box/<vaultlabel>/<boxlabel>`. No
  Thing is stored at a root. The bank owns its gates and boxes, but it is a Thing among them, not a node above them:
  it has no listing or lifecycle of theirs, and never ducks as a gate or a box.
* **Each bank has exactly one gate, labelled `main`**, which is never deleted and holds the passphrase wayin labelled
  `main`. More gates per bank come later. The bank's own `label` is open (below); the gate's `main` and the bank's
  label do not tie to each other.
* **`lifeseq`** is `n.toString(32).padStart(10, '0')`: digits `0-9a-v`, which sort as the numbers do, up to
  `32**10 - 1`, inside a safe integer. Because 32 is even, the even/odd parity of the number is the parity of its last digit,
  so a store can check it without decoding (Postgres: `right(lifeseq, 1) IN ('1','3',...,'v')`).
* **The shell**, the void sentinel for no Thing stored, is a tombstone at `revseq: -1` and `lifeseq: -1`, with `revtok`
  void. So the first Thing stored is at `revseq` 0 and `lifeseq` 0; its deletion is life 1, a rebirth life 2. Nothing
  is ever stored with a negative seq. The shell is never stored, so its `lifeseq` is the one that is not 10 digits:
  the string `'-1'`, odd like every tombstone's.
* **For now every Thing is written at depth 1**, so its `lifepath` is `/<its lifeseq>`. Deeper Things, whose
  `lifepath` carries the lifeseqs above them, come with the tree.
* **A `lifeseq` is not unique across devices, as a random life token was.** Two devices birthing at one scope both
  mint life 0. Only one write lands; the other is refused (`camped` or `stale`).
* **The body stays flat in the record**, as big's records are: a gate's `wayins`, `auth`, `sigs`, `meta`; a box's
  `sidecar`, `box_key_wrapped`, `whisper_ciphered`. In Postgres each kind has a table of its own, and each field of
  its body is a column there, as in big.

### Invariants

The adapter checks proposed against cited when the ask is parsed, before anything is fetched (`bad_record`):

* `proposed.revseq === cited.revseq + 1`.
* `proposed.revtok` is new: not `cited.revtok`, and not void.
* `proposed` is at the ask's scope, and its `label` is the last label of its `labelpath`.
* `proposed.lifepath` ends in `/` + `proposed.lifeseq`.
* `am: 'x'` exactly when `lifeseq` is odd, in both `proposed` and `cited`.
* Live over live keeps `lifeseq` and `born_at`. Gone over live is `lifeseq + 1`. Live over gone is `lifeseq + 1`
  too: a birth (over the shell) is 0, a rebirth is the tombstone's `lifeseq + 1`. Either has `born_at === written_at`.
* A tombstone never goes over a tombstone.

The store checks cited against actual, in the step that stores the record: the act tables below.

## The two verbs

```
vaultDB.tryGetThing(ask: GetThingAsk)     → Promise<Answer<Thing | null, GotAct>>   never throws
vaultDB.tryWriteThing(ask: WriteThingAsk) → Promise<Answer<Thing, OkAct>>           never throws
vaultDB.watch(scope, onNotice, onBadNews?) → unsubscribe
```

The vaultDB has only the `try` forms. Throwing forms, with a friendlier interface, can come back later as Bank
methods.

A delete is a `writeThing` whose proposed record is a tombstone (`am: 'x'`, the next odd `lifeseq`); a put is one
whose proposed record is live. One verb then holds one act table, and a store has one write to make. It is a bet that
the two stay alike, and the verb is named for both.

### `writeThing`

```
adapter.tryWriteThing(ask)
  try
    const checked     = checkedWriteThingAsk(ask)                 the invariants above; bad_record or bad_option
    const loggableAsk = loggableAskOf(checked)                    the scope, the policies, and each record cut to its header
    const actual      = await this.doWriteThing(checked)          the store's one atomic step
    actual.ok ? { ok, ask: loggableAsk, act, world, val: actual.record }
              : { ok, ask: loggableAsk, act, world, dbhas: actual.record, err: Refuse.actRefused(act, ...) }
  catch (thrown)
    return this.answerForThrown(thrown, 'writeThing', ask)

adapter.answerForThrown(thrown, oplabel, ask)                     never throws
  try:   a refusal as it is, anything else storage_unavailable, with the oplabel and what of the ask is loggable
  catch: a bare unexpected_error answer
```

Each `try` verb's body is the plain path; every throw in it lands in `answerForThrown`, which holds all the error
treatment and has its own try/catch, so it never throws either.

```

store.doWriteThing(ask)                                         one atomic step
  fetch the actual Thing at the ask's scope
  classify: the act tables, then the storage policies the ask names
  if isWriteAct(act): store proposed, and read back what was stored as `record`
  return { ok, act, world, record }
```

Postgres runs it the other way round, as big's functions do: one UPDATE stores the record only where the act tables
and policies allow, and on a refusal the classifier names the act from the rows and checks the function returns.

### `getThing`

```
adapter.tryGetThing(ask)
  try
    const checked = checkedGetThingAsk(ask)
    const actual  = await this.doGetThing(checked)
    actual.ok ? { ok, ask, act, world, val: actual.record } : { ok, ask, act, world, dbhas: actual.record, err }
  catch (thrown)
    return this.answerForThrown(thrown, 'getThing', ask)

store.doGetThing(ask)                                         one read
  fetch the actual Thing; classify: gotlive, gotgone or gotvoid, or void or gone under ifAbsent: 'fail'
```

### Acts

Big's act tables carry over unchanged. They already compare only a revision, an `am` and one life marker, which becomes
`lifepath` (`bank-classifier.ts`, `putActOf`, `delActOf`, `getActOf`; `notes/answer-contract.md`).

* **write of a live record**: `born` (over void), `reborn` (over a tombstone), `replaced`, `passed` (`ifPresent: 'get'`).
* **write of a tombstone**: `deleted`.
* **refused, the same for every kind**: `void`, `gone`, `camped`, `dubdel`, `stale`, `retcon`, `clash`, `forked`,
  `ahead`.
* **refused for the bank**: big's `bank_void`, `bank_gone`, `bank_reborn`, once the bank is a Thing the store checks.
  The `vault_*` family goes with the Vault.
* **refused by a storage policy**: `gate_issue`, as #698 has it.

**The lifeseq checks are big's life-tok checks, plus the step on a change of life.** Each place big read a life tok
has its lifeseq counterpart:

| Big read | of | Now |
|---|---|---|
| the ask's `isLifeTokPlaced`: the expected tok over a live row, a new one on a birth or deletion | `gate_tok`, `vault_tok`, `box_tok`, `bank_tok` | the ask's `lifeseq` check: the same lifeseq while `am` stays, one more when it flips |
| the classifier's `isLifeOff`: the expected life against the stored one | the row's own life tok | `lifepath` and `am`, cited against stored |
| Postgres's `gate_tok = expected.gate_tok` | the row's own life tok | `stored.lifepath = cited.lifepath` |
| the row above's life: `bank_reborn`, `vault_reborn`, a box keyed under its vault's life | `bank_tok`, `vault_tok` on the row below | the lifepath's leading lifeseqs: waits for depth 2 |
| the seal's binding of the box's life, and `nextRevisionOf` minting a new tok over a tombstone | `box_tok` | the box's `lifepath`: waits on `BoxRecord` taking it |

`lifeseq` is ordered, so the classifier could also tell a life that is behind from one that clashes. It is not
needed for these acts.

## Ask, Answer, Actual

```ts
/** Where a Thing is stored. */
type ThingScope = { userid, banklabel, labelpath }

/** What a write cites of the Thing it expects, which the store compares with actual. */
type ThingCited = Pick<Thing, 'revtok' | 'revseq' | 'am' | 'lifeseq' | 'lifepath' | 'born_at'>   // or the shell's

type GetThingAsk = ThingScope & { op: 'get', ifAbsent: 'fail' | 'nil' }

type WriteThingAsk<RecordT extends Thing> = ThingScope & {
  op:        'write'
  cited:     ThingCited & Partial<RecordT>   // plus what a named policy takes as testimony of the old version
  record:    RecordT                // proposed
  ifAbsent:  'add' | 'fail'
  ifPresent: 'repl' | 'fail' | 'get'
  options?:  { policies: StoragePolicy[] }
}

type Ask = GetThingAsk | WriteThingAsk

type GoodAnswer<ValT, ActT> = { ok: true,  ask: LoggableAsk, act: ActT,             world: BankThing | null, val: ValT }
type BadAnswer              = { ok: false, ask: LoggableAsk, act: BadAct | GoodAct, world: BankThing | null, dbhas: Thing | null, err: VaultError }
type Answer<ValT, ActT>     = GoodAnswer<ValT, ActT> | BadAnswer

/** What the store reports of one atomic step: the act, and the actual records. Big's `Stored`. */
type Actual<RecordT extends Thing> =
  | { ok: true,  act: OkAct,  world: BankThing | null, record: RecordT | null }
  | { ok: false, act: BadAct, world: BankThing | null, record: RecordT | null }

/** A change the store saw: the part of an answer a watcher needs. Big's `Notice`. */
type ThingNotice = Pick<GoodAnswer<Thing, 'gotlive' | 'gotgone'>, 'act' | 'val' | 'world'>
```

* **`cited` requires what is needed, and forgives extras that check.** It must carry what `ThingCited` names, and only
  that is compared with the Thing stored. Where a policy takes fields of the old version as testimony, it must carry
  those too: `replace_passphrase` reads `cited.wayins.main`, the wayin the gating proved against. Any other field of the record is allowed and unread,
  so the record in hand can be passed whole; a field that fails its kind's check refuses `bad_record`.
* **`world` is the bank's Thing**, read in the same step, as `{ world, boxes }` is in STYLE.md: null until the Bank
  is a Thing. Other fields earn their own place on the answer. "Parent" is kept for a Thing's parent in the tree.
* **Actual shares `ok`, `act` and `world` with Answer.** Its `record` is what the store holds, under the name
  `record` until the adapter places it on the answer: as `val` when good, as `dbhas` when refused.
* Big's `presence` and `capacity` are not on Actual. The act carries presence, and capacity comes back with the box
  cap.
* **No `Heard`.** A store's `doWatch` hands its `hear` callback a `Pick<Actual, 'record' | 'world'>`, and the
  adapter makes the `ThingNotice`.

## What each store implements

The adapter is shared TypeScript. A store implements the primitives under it.

| | Memory | Postgres |
|---|---|---|
| keying | one `Map`, `ckeyOf(userid, banklabel, labelpath)` → record, each a `structuredClone`; the labelpath's modelkind keeps the kinds apart | a table per kind (`safebyok_banks`, `safebyok_gates`, `safebyok_boxes`), each keyed `(userid, banklabel, labelpath)`, the Thing's fields and the kind's body as columns |
| `doGetThing(ask): Awaitable<Actual>` | read the map, classify | one SELECT from the kind's table, classify |
| `doWriteThing(ask): Awaitable<Actual>` | synchronous, so atomic: read, classify, apply the policies, write, read back | one call of the kind's write function, picked by the labelpath's modelkind: `safebyok_write_gate(proposed, cited, policies)` |
| `doWatch(scope, hear, onBadNews)` | `queueMicrotask` to each matching watcher | `pg_notify` from the write function; refetch when the payload is too big |
| atomicity | the step is synchronous | one UPDATE (or INSERT over the shell) inside the call's implicit transaction, as big's functions are |

### Postgres

Same general structure as big's `bank-tables.sql` and `bank-functions.sql`: a table per kind, a write function per
kind. What is new is that every table has the Thing's columns, and that each check is a named function, shared by the
write functions and returned with their result.

```sql
-- safebyok-postgres: the functions PostgresVaultDB calls to write a Thing.
--
-- Do not change the locking semantics: no transaction block (BEGIN ... COMMIT), no row lock (SELECT ... FOR UPDATE).
-- Discuss first.
--
-- Each write function stores its record in one statement, which waits only on a writer of the same row. It returns
-- whether it stored the record, the row as it now stands, and the verdict of each named check on that row.
```

#### A lifeseq's digits

```sql
-- The 10 base-32 digits (0-9a-v) of seq: a lifeseq. Raises unless seq is between 0 and 32^10 - 1.
CREATE OR REPLACE FUNCTION safebyok_base32_of_bigint(seq bigint) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
BEGIN
  IF ((seq < 0) OR (seq >= (1::bigint << 50))) THEN    -- 2^50 is 32^10
    RAISE EXCEPTION 'safebyok_base32_of_bigint: a lifeseq is a life from 0 to 32^10 - 1';
  END IF;
  RETURN (
    SELECT string_agg(substr('0123456789abcdefghijklmnopqrstuv', (((seq >> (5 * place)) & 31)::integer + 1), 1), '' ORDER BY place DESC)
    FROM   generate_series(0, 9) AS place
  );
END $$;

-- The number base-32 digits spell, either case. Raises for anything but base-32 digits.
CREATE OR REPLACE FUNCTION safebyok_bigint_of_base32(digits text) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
BEGIN
  IF (digits !~ '^[0-9a-vA-V]+$') THEN
    RAISE EXCEPTION 'safebyok_bigint_of_base32: a lifeseq is base-32 digits, 0-9 and a-v';
  END IF;
  RETURN (
    SELECT sum((strpos('0123456789abcdefghijklmnopqrstuv', substr(lower(digits), place, 1)) - 1)::bigint << (5 * (length(digits) - place)))::bigint
    FROM   generate_series(1, length(digits)) AS place
  );
END $$;
```

#### The checks, each a named function

Each returns true or false and takes plain values, so one function serves every kind's table. A rule about one row
alone is a CHECK on the table, never a clause in the write; a function holds only what compares the proposed record
with the stored row or the cited one.

```sql
-- Whether proposed_lifeseq follows stored_lifeseq: one past the stored when am flips, the same when not. A null stored
-- is the shell: life -1, gone. So a birth is life 0. The parity of each lifeseq is a CHECK on the row, not this.
CREATE OR REPLACE FUNCTION safebyok_lifeseq_ok(stored_lifeseq text, stored_am text, proposed_lifeseq text, proposed_am text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (
    proposed_lifeseq = safebyok_base32_of_bigint(
      (COALESCE(safebyok_bigint_of_base32(stored_lifeseq), -1))
      + (CASE WHEN (COALESCE(stored_am, 'x') <> proposed_am) THEN 1 ELSE 0 END)
    )
  )
$$;

-- The storage policies, one function each, as notes/storage-policies.md lists them: big's clauses, less their
-- registered_at check, as the write function checks born_at for every live-over-live write.

-- Whether a gate write replaces the passphrase wayin the gating proved against, and nothing else.
CREATE OR REPLACE FUNCTION safebyok_replace_passphrase_ok(stored_wayins jsonb, cited_wayins jsonb, proposed_wayins jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (
        ((stored_wayins -> 'main') = (cited_wayins -> 'main'))
    AND ((stored_wayins - 'main') = (proposed_wayins - 'main'))
  )
$$;

-- Whether a gate write adds a passkey wayin to a gate that has none, and changes nothing else.
CREATE OR REPLACE FUNCTION safebyok_add_passkey_ok(stored_wayins jsonb, proposed_wayins jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (
        (NOT (stored_wayins ? 'passkey0'))
    AND (proposed_wayins ? 'passkey0')
    AND ((stored_wayins - 'passkey0') = (proposed_wayins - 'passkey0'))
  )
$$;

-- Whether a gate write removes the gate's passkey wayin, and changes nothing else.
CREATE OR REPLACE FUNCTION safebyok_revoke_passkey_ok(stored_wayins jsonb, proposed_wayins jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (
        (stored_wayins ? 'passkey0')
    AND (NOT (proposed_wayins ? 'passkey0'))
    AND ((stored_wayins - 'passkey0') = (proposed_wayins - 'passkey0'))
  )
$$;

-- Whether a gate write keeps each storage policy it names.
CREATE OR REPLACE FUNCTION safebyok_gate_policies_ok(policies text[], stored_wayins jsonb, cited_wayins jsonb, proposed_wayins jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (
        ((NOT ('replace_passphrase' = ANY (policies))) OR safebyok_replace_passphrase_ok(stored_wayins, cited_wayins, proposed_wayins))
    AND ((NOT ('add_passkey'        = ANY (policies))) OR safebyok_add_passkey_ok(stored_wayins, proposed_wayins))
    AND ((NOT ('revoke_passkey'     = ANY (policies))) OR safebyok_revoke_passkey_ok(stored_wayins, proposed_wayins))
  )
$$;

-- Whether the boxes under labelpath_prefix leave room for one more live box. When boxes come.
-- STABLE, so it counts in the calling statement's snapshot. The count takes no lock, so the cap stays soft.
CREATE OR REPLACE FUNCTION safebyok_capacity_ok(of_userid text, of_banklabel text, labelpath_prefix text, cap integer) RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT (count(*) < cap)
  FROM   safebyok_boxes AS box
  WHERE  ((box.userid, box.banklabel) = (of_userid, of_banklabel))
    AND  (box.labelpath >= (labelpath_prefix || '/'))    -- the labelpaths under the prefix: '0' is the byte after '/'
    AND  (box.labelpath <  (labelpath_prefix || '0'))
    AND  (box.am = 'a')
$$;
```

#### The gate's table

```sql
-- wayins holds the bank's passphrase wayin under main, and its passkey wayin under passkey0 when it has one.
-- auth, sigs and meta are kept for later, and are always empty.
CREATE TABLE IF NOT EXISTS safebyok_gates (
  userid     text    COLLATE "C" NOT NULL,
  banklabel  text    COLLATE "C" NOT NULL,
  labelpath  text    COLLATE "C" NOT NULL,
  label      text    COLLATE "C" NOT NULL,
  fmt        integer NOT NULL,
  am         text    NOT NULL,
  lifepath   text    COLLATE "C" NOT NULL,
  lifeseq    text    COLLATE "C" NOT NULL,
  revtok     text    COLLATE "C" NOT NULL,
  revseq     integer NOT NULL,
  born_at    bigint  NOT NULL,
  written_at bigint  NOT NULL,
  wayins     jsonb   NOT NULL,
  auth       jsonb   NOT NULL,
  sigs       jsonb   NOT NULL,
  meta       jsonb   NOT NULL,
  PRIMARY KEY (userid, banklabel, labelpath),
  -- The Thing's CHECKs, the same in every kind's table:
  CHECK (am IN ('a', 'x') AND revseq >= 0 AND born_at <= written_at),
  CHECK (lifeseq ~ '^[0-9a-v]{10}$'),
  CHECK ((am = 'x') = (right(lifeseq, 1) IN ('1','3','5','7','9','b','d','f','h','j','l','n','p','r','t','v'))),
  CHECK (right(lifepath, 11) = '/' || lifeseq),
  CHECK (right(labelpath, length(label) + 1) = '/' || label),
  -- The gate's own:
  CHECK (labelpath = 'gate/' || label),
  CHECK (label <> 'main' OR am = 'a'),          -- the main gate is never deleted
  CHECK (lifepath = '/' || lifeseq),            -- depth 1, for now
  CHECK (COALESCE(
        jsonb_typeof(wayins->'main') = 'object'
    AND COALESCE(jsonb_typeof(wayins->'passkey0'), 'object') = 'object'
    AND jsonb_typeof(auth) = 'object' AND jsonb_typeof(sigs) = 'object' AND jsonb_typeof(meta) = 'object', false))
);
```

**Every text column is `COLLATE "C"`**, compared and sorted byte for byte. Nothing here sorts for a person, and every
name is compared byte for byte, as the TypeScript compares it. The database's default collation (libc's or ICU's) can
reorder strings when the operating system or ICU is upgraded: an index over such a column is then silently out of
order, and a lookup by primary key, or an `ON CONFLICT`, can miss the row that is there. A `userid` mixes case and
punctuation (`-_.~:@+|%`), which is just what such upgrades reorder. `"C"` also keeps `lifeseq` in the order of its
lives, and lets a prefix range on `labelpath` use the primary key.

The foreign key to `safebyok_banks` comes back when the bank's table takes the Thing's columns. Whatever the bank's
label, a bank's table holds one row per `(userid, banklabel)`, and declares that unique so the key can reference it.

#### The gate's write function

```sql
-- Store a writeThing ask's gate record over the gate row it cites, under the storage policies it names.
-- The adapter has made every check below already. They are made again here because this is the boundary that counts:
-- behind GraphQL, Postgres or Convex the adapter's TypeScript runs on the device, under the app's control, and only
-- what runs here holds against it. And only this statement sees the row it writes over.
CREATE OR REPLACE FUNCTION safebyok_write_gate(proposed_record jsonb, cited_record jsonb, policies text[])
RETURNS TABLE (ok boolean, gate jsonb, lifeseq_ok boolean, policies_ok boolean)
LANGUAGE plpgsql AS $$
DECLARE
  proposed safebyok_gates := jsonb_populate_record(NULL::safebyok_gates, proposed_record);
  cited    safebyok_gates := jsonb_populate_record(NULL::safebyok_gates, cited_record);
BEGIN
  UPDATE safebyok_gates AS stored
  SET    (fmt, am, lifepath, lifeseq, revtok, revseq, born_at, written_at, wayins, auth, sigs, meta)
       = (proposed.fmt, proposed.am, proposed.lifepath, proposed.lifeseq, proposed.revtok, proposed.revseq,
          proposed.born_at, proposed.written_at, proposed.wayins, proposed.auth, proposed.sigs, proposed.meta)
  WHERE  ((stored.userid, stored.banklabel, stored.labelpath) = (proposed.userid, proposed.banklabel, proposed.labelpath))
    AND  (stored.revtok   = cited.revtok)
    AND  (stored.am       = cited.am)
    AND  (stored.lifepath = cited.lifepath)
    AND  (stored.revseq   = (proposed.revseq - 1))
    AND  (stored.fmt      = proposed.fmt)
    AND  ((stored.am = 'a') OR (proposed.am = 'a'))
    AND  ((stored.am <> proposed.am) OR (stored.born_at = proposed.born_at))
    AND  safebyok_lifeseq_ok(stored.lifeseq, stored.am, proposed.lifeseq, proposed.am)
    AND  safebyok_gate_policies_ok(policies, stored.wayins, cited.wayins, proposed.wayins)
  RETURNING safebyok_record(to_jsonb(stored)) INTO gate;    -- the row as now stored
  -- Over the shell (cited.revseq = -1): INSERT ... SELECT proposed.* WHERE safebyok_lifeseq_ok(NULL, NULL, ...)
  -- ON CONFLICT DO NOTHING, in place of the UPDATE.

  IF FOUND THEN
    ok := true;  lifeseq_ok := true;  policies_ok := true;
    PERFORM safebyok_tell(...);
    RETURN NEXT;  RETURN;
  END IF;

  ok := false;
  SELECT safebyok_record(to_jsonb(stored)),
         safebyok_lifeseq_ok(stored.lifeseq, stored.am, proposed.lifeseq, proposed.am),
         safebyok_gate_policies_ok(policies, stored.wayins, cited.wayins, proposed.wayins)
  INTO   gate, lifeseq_ok, policies_ok
  FROM   safebyok_gates AS stored
  WHERE  (stored.userid, stored.banklabel, stored.labelpath) = (proposed.userid, proposed.banklabel, proposed.labelpath);
  RETURN NEXT;
END $$;
```

The adapter's classifier names the act from the row, as big's does, and from the checks: a false `policies_ok` on a
row that otherwise matches is `gate_issue`. A box's write function returns `capacity_ok` the same way.

#### What the named checks cost

Nothing in how the statement runs, and the result gets cleaner.

* **The plan.** A SQL function whose body is one expression, with no FROM, that is not STRICT and is IMMUTABLE or
  STABLE, is inlined by the planner. `safebyok_lifeseq_ok`, `safebyok_gate_policies_ok` and each policy's function
  then plan as the clauses they hold. Even without inlining, the UPDATE finds one row by its primary key, so a call per row is one call.
* **The locks.** The checks read only their arguments and take no lock. The UPDATE takes the row lock it took before,
  and nothing else. `safebyok_capacity_ok` reads the box table with no row lock, as big's count does. It is STABLE
  because a VOLATILE function would take a fresh snapshot of its own.
* **A concurrent writer.** The checks sit in the UPDATE's WHERE, not in a SELECT run before it. So when the UPDATE
  waits on another writer of the row, Postgres checks the WHERE again against the row as that writer left it, and
  the named checks run on the row actually written over.
* **The verdicts on a refusal** come from the SELECT that reads the row back. They are of the row returned, so they
  always agree with `dbhas`, though that row may be newer than the one the UPDATE refused, as it may be in big now.
  On success every verdict is true, so the classifier need not consult it.

## What table-agnostic costs

The interface and the adapter are table-agnostic. Postgres keeps a table per kind, with the Thing's columns in common.

**Gained**

* One verb pair, one act table, one classify function, one `doWriteThing` per store, in place of seven classify
  functions, thirteen `do*` calls and four write helpers. A new kind costs the adapter a `fmt` entry, and Postgres a
  table and a write function.
* Every table shares the Thing's columns and CHECKs, and every write function the named checks. Kinds differ in their
  columns and their policies.
* Once Things nest, a delete needs no cascade. Things under an old life no longer match its `lifepath`, and a
  generic tidy sweeps them.
* IndexedDB (one store, tagged keys) and Convex (opaque `v.any()` rows) are already near this shape.

**Kept**, by the per-kind tables

* Postgres's per-kind checks: typed columns, and CHECKs over each kind's jsonb.
* The bank's foreign key, once the bank's table is a Thing's.

**Moved**

* **The adapter needs a map from modelkind to the check of each kind's record**, so that it never stores what its own
  models would refuse. It is keyed by the modelkind at the base of the `labelpath`, which a get has too; each check
  pins its kind's `fmt`. That map is the one place the adapter names kinds; Postgres names them in its tables.
* **Storage policies** become named functions over the kind's columns, one per policy (`safebyok_add_passkey_ok`),
  gathered by `safebyok_gate_policies_ok`.
* **The box cap** becomes `safebyok_capacity_ok`, a count of live boxes under a `labelpath` prefix. It stays soft.
* **The compound write.** Big's `buildBank` stores a bank and its main gate in one step. A `writeThing` stores one Thing.
  That is the Bank–Gate intertwingling, left for later.

## Gate first

* The `Gate` model's record maps to a Thing as the table above shows. `gate_tok` and `bank_tok` give way to
  `lifeseq` and `lifepath`, and `registered_at` to `born_at`. This is a change to `BX.GateRecord`, so the gate's
  shapes come over into the new core rather than staying big's.
* `gate.put({ policies })` is a `writeThing` with `options.policies`, under #698's policies, applied as above.
* The main gate is never deleted: the adapter refuses its tombstone, and the table's CHECK repeats it. A later gate
  can take one without a change to the store.
* The gate is written at depth 1: its `lifepath` is `/<lifeseq>`, and its write checks the gate alone.
* For now the store takes only the main gate: `label` `main`, always live. Its Thing has a `fmt` of its own, 4101,
  so that it is never read as big's gate row (4001).

## Open questions

* **The bank's `label`**: its banklabel, so `bank/<banklabel>`, or `main`, so `bank/main`?

## Where things stand

* Built in `packages/safebyok`, exported as `safebyok/storage`: the Thing's shapes (`shapes-thing.ts`), the classifier
  (`thing-classifier.ts`), `vault-db.ts`, `adapter-vault-db.ts` and `memory-vault-db.ts`, for the main gate.
* Postgres is the design above, not built.
* The Gate model still holds big's `GateRecord`: moving it onto the gate's Thing, and the lease's stamp off `gate_tok`,
  is the next step.
