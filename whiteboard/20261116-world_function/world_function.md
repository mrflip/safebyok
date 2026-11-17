# The world function: the root records, `banktok`, and `track`

Whiteboarded 2026-11-16 in the lean_buttonup workshop (`whiteboard/20261115-lean_buttonup/`), and not yet a step there:
a later thread. Each item is marked settled (by the Coach), proposed, or open. `notes/transaction-levels.md` has the
handles (*#one-statement*, *#claim-the-key*) used below.

**Settled.**

* **The bank is not stored: it is a function of the main gate.** The bank row has no column the gate lacks. The
  function projects the main gate to the bank's fields (its scope, the constants, `lifeseq`, `born_at`), never its
  wayins. Today's `world` already sends a bank and a gate, and `tracked` takes them apart.
* **The gate is the anchor.** It bears the bankKey, under which every box part's key is wrapped, so a root box sealed
  by a birth that lost cannot be opened under the winner's gate.
* **A birth is an ensure of two records, the main gate and the root box.** Where the gate is absent it writes both in
  one step; otherwise it writes nothing and answers both as stored. A repeated birth is never refused: the loser
  answers what the winner stored.
* **A void root box is legal, but nothing handles it yet.** A birth that meets a stored main gate without its root box
  refuses `storage_issue`, as `BankRootsMissing` throws today, until the tree's parent ensure (a box put proposing its
  parentage, with ensures of an empty box at each parent's cited version) gives it an owner.
* **The bank does not embed its main gate and root box.** Copies need keeping in sync, and a lasting copy of a gate
  keeps the wayins it was born with: after a passphrase change or a passkey's revocation, it still unwraps the bankKey.
* **A state that is unreachable, or nearly so, gets a `notes/wontfix.md` row before it gets logic in the common case.**
* **How recoverable a stored state is**, best first:
  1. *ensurable*: the ensure repairs it, by what its query does at birth;
  2. *retriable*: the exact same operation, sent again, repairs it, by its idempotence;
  3. (no rung) another operation repairs it: no interaction with a store answering a broken-state error is safe;
  4. *irrecoverable*: the customer must delete records.

**Proposed.**

* **`banktok`**, a random token minted with the bankKey and bound into the seals, is part of the scope prefix
  (`userid`, `banklabel`, `banktok`). Every read restricts to the cited `banktok`, so once a bank is born again or
  deleted, every row of another `banktok` is absent.
* **The world is the bank and the gate the caller came in through**: the main gate for its owner, a restricted,
  expirable gate for a script ("doppler-lite"). A caller through a restricted gate never receives the main gate, whose
  wayins could be attacked offline; the bank function gives it the bank's fields.
* **`track` becomes a list:** `track: [{ fn: 'world', stats: true }, { labelpath: 'gate', ... }, { labelpath: 'box',
  ... }]`. An `fn` entry names a function from a closed dictionary in the adapter, as a storage policy does, so no host
  code reaches the query.
* **`stats`** (the boxes' count and total size, the gates' count and total size) is asked for, never sent by default:
  an aggregate on every answer would cost every read a listing. A store gives it observed at or after the end of the
  step, never inside the step's snapshot.

**Open.**

* `banktok` in the row key (absence is then literal, and a dead bank's rows are garbage), or compared in each write's
  precondition. Leaning: the row key.
* A root box write lands only where the stored main gate has the same `banktok`: a condition on a record the step does
  not write. In Postgres the birth fits one statement (*#one-statement*, *#claim-the-key* on the gate, the box inserted
  from the gate's `RETURNING`; `notes/transaction-levels.md`). Under the ruling above, a gate stored without its root
  box refuses, so a store that cannot write two records in one step must keep the two together, or cannot birth.
* A bank delete that cannot remove all of a `banktok`'s rows in one step leaves rows behind, absent to every read. A
  leftover `gate/<label>` still wraps the dead bank's bankKey, so the gates go first. For `notes/security.md` once
  decided.
* How a `track` entry naming a function is told from one naming a Thing: a discriminant, if STYLE.md's *Shapes and
  duck typing* asks for one.
