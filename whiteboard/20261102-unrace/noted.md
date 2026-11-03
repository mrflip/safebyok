## Decided

Rulings and their reasons, where `unrace-gating.md` and `models-invariants.md` draw the result and not the why.

* **`bank.hello` is a forced reset** (the Coach, 2026-11-02, as the system is too hard to reason about otherwise). It
  loads every vault of the bank from the vaultDB and refuses with no network. Vault and box records are not cached on the device for this
  sprint. A cache comes back after the rework, when hosts may also specify a timeliness for `hello`. Called twice, it just runs twice, with no join.
* **A gate change locks no session anywhere**, as the vaultKey never changes. Another device's session runs to its lock or
  its next `bank.tidy`. Its cached lease is of the older `gate_epoch`, which `lease.peek` forgets next session. That is
  `gate_epoch`'s one job, so nothing tells a vault's own gate change from another device's, and `adopt` never locks on a
  move. Revoking is a refusal by honest code. A row for `notes/wontfix.md`.
* **One gating open per bank, one attempt at a time on it.** The host owns the one dialog, dedupes, and disables its button
  meanwhile. More can come if people complain; offering a little of it would own us.
* **Lock wins, and the enter key is the line.** Before it, a `lock()` settles the open gating. Past it, nothing turns back
  midway and leaves a half-done run. An unlock crossed by a lock ends unlocked, as we hold proof that this user intends
  and is permitted to have the vault unlocked, and the next `lock()` ends that session. A gate change still lands and
  takes no new lease, as its proof asked for a change and not for a session. A `del_vault` ignores a lock, as a lock does
  not stop a delete, and a lock does nothing to a birth.
* **No lock counter.** The window is very small, so the effect on a user can be discounted, not that the case does not
  matter; and one rule stated plainly costs less to explain and reason through than cases.
* **A cancel past the enter key aborts nothing** (the Coach, 2026-11-02). By default a `decline` or the dialog closing has no
  effect on an attempt under way, and its outcome settles the gating. The system is being asked to lock and unlock at the
  same time and we have no opinion (the Coach, 2026-11-03), so the implementer takes whatever is cleanest to reason about.
* **Before the dialog goes only what decides whether to ask.** After the enter key goes everything that ends up in the
  record: the stamp, the gate, the clock, the lease held. Minutes or more can pass between the two. A check before launch
  saves asking for nothing; past the enter key, the store's refusal of the put is what counts.
* **`replace_passphrase` keeps the passkey** (the Coach, 2026-11-02). Dropping it is less of a hard rule than it seemed:
  Apple asks for the passphrase on the next login after a change, but also has recovery mechanisms, which we do not, and a
  user would find it annoying. A vault must always have a passphrase; the passkey is optional.
* **A record of another life is a replacement of the Vault, not an error.** The listing routes each record by scope and
  `vault_tok`, so it never reaches the old Vault's `receive`. The old Vault's `vacate` is garbage collection, and nothing
  depends on it, as its every box verb already refuses `vault_mismatch`.
* **The gating holds the clears.** It calls the provings' statics, then hands `run` the provings. `run` is written in the
  Vault or the Bank, and never hears a clear. A gate is made from wayins, so a clear passphrase never goes through one.
* **A cached lease is taken up in `ensureUnlocked` alone.** `hello` and `fetch` take up nothing.
* **Nothing is committed until `vaultListing.ensureVault`, or a gate change's put.** `send` does not hydrate.
* **A vault has no `send`** (the Coach, 2026-11-03), provided its tests go with it: tests kept for something nobody wants
  would go on constraining the design. Nothing about a vault record changes but its gate, which has its own verbs.
* **A gate change is its params, with no client-side next gate** (the Coach, 2026-11-03). `gate.with*` and `adoptWayins` go.
  The params spread the record the attempt read, as a next gate no longer carries that revision.
* **A damaged record is set aside, and nothing acts on it** (the Coach, 2026-11-02). The likeliest cause of damage is our
  own code, so our code never decides to delete or examine one. Beyond the one check that finds it, nothing looks at it. An
  answer lists it in `damaged_records`, a side channel of tombstones in the one shape, with sentinel values where the row
  cannot be read. The Vault drops it from its list, an exception to "we don't gc objects". It leaves the vaultDB only when
  the customer names it: asked to delete vault a/bob/b @ 1234-5566, we delete that record.
