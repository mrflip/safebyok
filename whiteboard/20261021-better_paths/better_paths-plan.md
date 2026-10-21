# better_paths: the plan

**No back-compat layer, no migrations, no format bumps, no catering to vestigial names or
methods.** A stored field that is renamed or reshaped is changed in place, under the format
string its record carries today (`safebyok-vault-v6` stays `safebyok-vault-v6`): no `-v7`, no
reader for the old shape, no shim that answers to the old name, no field kept because a record
somewhere still has it. An old record fails today's validation and fails safe (reads as absent
or damaged), and each changeset says what a host will see. This holds for every thread below,
the renames of `unlock_epoch` and `vault_id` first.

Branch `20261021-better_paths`, on [#240](https://github.com/mrflip/safebyok/pull/240)
(`20261021-fault_kinds`), which sits on [#239](https://github.com/mrflip/safebyok/pull/239)
(`20261021-trust_lines`). This is the one plan for the work; nothing below has commenced.
`20261018-reformx` and its `vault2.ts` spike never merge: read the spike for intent, take nothing
from it. Where a directive gives latitude it says so; take the default unless the code gives a
reason not to, and say the reason in the PR.

**What the base already has.** From trust_lines: `vault_key_epoch` gone from every record,
expectation and ctx; the vaultKey held only by an opened `Lease`, which owns `wrapBoxKey` and
`unwrapBoxKey`; Box, Wayin and Lease holding their stored record once and taking the vault they
are of; a way in's ctx binding scope and `vault_id`. From fault_kinds: a stored record that fails
its checks is `damaged_box` or `damaged_vault` from the VaultDB and the vault alike;
`corrupt_record` is only an adapter's answer in the wrong shape, a misuse; `getWhisper()` refuses
`damaged_box` at once, with no catch-up read (`#decipherOrCatchUp` is gone). Still in, and out
by this plan: `#refreshOnStale`, `#catchUp`, `#refuseCreatedElsewhere`'s re-read, and every
`#refresh()` inside a call.

## The rules

- **Crypto gravity.** Everything that smells of a secret, or of key and wrap, lives in Proving or
  Lease, even at the price of feature envy. Lease wraps and unwraps boxKeys and ciphers the
  whisper; Box keeps its fields. A Lease keeps a key in a field; a Proving holds its derived key
  only for its gating, and does the grant's work. The naked vaultKey never crosses a class
  boundary: the Proving unwraps it, makes the leaseKey, wraps the vaultKey under it, and pours
  the leaseKey and the wrapped vaultKey into the new Lease.
- **`unlock_epoch` becomes `gate_epoch`**: bumped on every addition, removal or change of a
  wayin; what voids every other device's lease.
- **`vault_id` becomes `vault_tok`**: the random token minted when a vault is made for its scope,
  bound into every box, wayin and lease, compared in every expectation, and never what anything
  is found by. The scope is the vault's identity; the token tells one life of that scope from
  the next. Not a revision: a box's `revision_tok` turns on each write of the box, `gate_epoch`
  on each change of the gate, `vault_tok` on each birth of a vault for the scope.
- **Names:** `Bank`, `Gate`, `Gating`, `Proving` (was Proof). Gatingkinds `unlock_vault`,
  `new_vault`, `change_passphrase`, `add_passkey`, `del_passkey`. The app's callback that shows a
  dialog and gets the user's secret is **`requestCleartext`**: `hostRequestCleartext` as the app
  gave it, `guardedRequestCleartext` ours around it (catching throws, one at a time). A Vault the
  bank has let go refuses `vault_gone` (was `vault_closed`).
- **No renew kind.** A lease that ends within the staleness window counts as locked: the call
  raises an `unlock_vault`, and declining cancels the call. `lease_ending` and `carry_on` go.
- **The Gating controls the flow.** The dialog calls `gating.attempt(...)` and
  `gating.decline()`; the gating settles itself. A landed lock makes it drop its provings.
- **No capability split**: no gatingkind encodes whether a device supports passkeys.
- **Never store a passphrase**, wrapped or not. The lease is the stored capability.
- **Hello defines timely.** "Timely" is hello's word and nobody else's: the picture was read
  within `staleMinutes`, or it is read now. A call's precondition is hello; if the picture was
  timely when the call began, the call is good, with at most one asterisk at its end. A call that
  needs more asks hello for `staleMinutes: 0`, and that is the only knob. No call reads on its
  own, re-reads after a prompt, or re-checks the lock after its work.
- **One turn at a time per vault** is the one concurrency mechanism; a store's expectation (a
  conditional write) the one other. No abort controller, wait state, flag, signal, counter,
  re-read, re-check, retry or fallback in the core. `lockLanded` stays as a promise the dialog
  awaits.
- **A lock lands after the turn in flight: last writer wins**, for every call. No era counter.
  This closes the lock-timing TODO.
- **A Vault is born of one read**, by the bank; nothing holds a Vault before its props are read
  and its lease judged. `Vault.make` and the first-hello memo go.
- **The bank refuses to open without its parts.** The deriver, the strength checker and the
  device store load and answer at `bank.hello()`; one that fails refuses the hello, no vault is
  born, and the host shows it. `hello` is idempotent: the bank's state is sound and timely once
  it resolves, a later call resolves at once, and one that failed is tried again by the next. Nothing loads lazily at first use, and nothing runs in a missing
  part's place.
- **The vaultDB is the ground truth.** What is in hand is a cache. A fundamentally inconsistent
  state -- a `vault_tok` that has drifted from its scope, props and boxes that name different
  vaults, the same `vault_tok` at a lower `gate_epoch` than in hand -- means a reload: the Vault
  is gone, the lease erased, and the bank reloads the scope from storage as it stands. Nothing
  in storage is touched, nothing is repaired, and no durable record of what was seen is kept:
  the device mark's `vault_tok` and epoch go, and `rolled_back` with them. Distinct from that is
  a data-integrity failure, met in a consistent, timely state: a record known to be irrecoverable
  in part or whole (`damaged_box`, `damaged_vault`), which is reported, and may later get a hook
  for the host to resolve from local state. Not this sprint.
- **The VaultDB reads one vault as one consistent picture.** `VaultDB.ensureVault(scope, draft)`
  (fetch or create) and `VaultDB.getVault(scope)` hand back the vault props and the box listing
  from one transaction (or one query), so the two can never disagree at the time of return; the
  vault does not look for trouble between them, and trouble found anyway is a reload, not a
  repair. A box call does not refresh the vault.
- **A vault is ensured, never created by a gating.** `bank.ensureVault(scope)` fetches or
  creates the vault's props, gateless when new, and a Vault is born of that: **novel** (no gate
  yet, no lease), **locked** or **unlocked**. Its first `unlock` makes the gate. A Vault always
  has its `vault_tok` and `registered_at`; nothing on it is optional but by meaning.
- **Stores live on the Vault.** `vault.vaultDB` and `vault.deviceDB` are the Vault's own, given
  at its birth; the bank holds the defaults every vault gets unless `bank.vault(scope, opts)`
  says otherwise, so one app can keep different vaults on different backends.
- **State words**, cross-cutting, each defined once in VOCABULARY: **made** (static props held,
  the async preconditions not started), **starting** (preconditions under way), **timely** (up to
  date and consistent), **aged** (consistent, a refresh due), **refused** (the last attempt to
  get or stay timely failed, `err` says why), **gone** (let go; every call refuses). The bank is
  made, starting, timely or refused. A scope's entry is starting, timely or refused. A Vault's
  freshness is timely, aged or refused, crossed with its state: novel, locked or unlocked. A
  lease ending soon is not a state: it is `lease.endsBy(now + staleMillis)`, which reads as
  locked, and `askPassphraseAt` for a UI that wants a countdown.
- **`p-limit`** is approved as a dependency of `safebyok`, for the turn queue. Hand-rolls a
  thread touches are replaced in that thread, by a library where one fits; thread 10 sweeps
  the rest.
- **Refusalkinds are granular and specific**, named for what was observed, in the user's
  language for a condition or an edge-case misuse and the customer's for a misuse that will be
  caught. A new kind over a stretched one; grouping across kinds is added later if wanted. Each
  goes in the Contract.
- **Pantry**: the part of this device's store that holds what the vault may use but never see
  (VOCABULARY).

## The model

| Class | Lifetime | Owns | Secret held |
|---|---|---|---|
| `Bank` | the app | the shared libraries (key deriver, strength checker), logger, clock, limits, and the default vaultDB and deviceDB; one Vault per scope and its lifecycle | none |
| `Vault` | from its birth of one read until the bank lets it go | one stored vault: its `vault_tok`, `registered_at`, gate, listing, capacity and lease, as of one read; its vaultDB and deviceDB; one turn at a time | none (the Lease's) |
| `Proving` | one gating | one entered secret, turned into a non-extractable wayinKey at once; opens a wayin, seals a new one, grants a lease | its wayinKey |
| `Gating` | one dialog | the provings of one attempt to get in, matched against the gate; `gatingkind`, `attempt`, `decline`, `lockLanded`, one at a time | its provings, until it settles |
| `Wayin` | durable (VaultDB) | one stored way in: fields, header, ctx, `isDamaged`, summary | none (the wrap) |
| `Gate` | durable (VaultDB) | the gathering of one identity's wayins: the passphrase and passkey slots, the policy (one passphrase, at most one passkey, passphrase first, the last one stays), `gate_epoch` | none |
| `Lease` | durable (pantry) | the leaseKey and the vaultKey wrapped under it, `ask_passphrase_at`; the one holder of the vaultKey; box key wrap and unwrap, whisper cipher | leaseKey, opened vaultKey |
| `Box` | durable (VaultDB) | its fields, sidecar, ctx | none |

Success of a gating earns a new or changed wayin, or a lease.

### Provings: the cleartext's life is one call

- **Passphrase.** The salt is always known when the user types: the passphrase wayin's own for
  `unlock_vault` and as the current passphrase, a fresh one for a chosen passphrase. Derive at
  once (key deriver, then a non-extractable import, bytes zeroed, as `passphraseKeyOf` does
  today); the Proving holds the wayinKey, never the string. A chosen passphrase goes to the
  strength checker in the same call.
- **Passkey.** Import the PRF answer as a non-extractable HKDF key at parse, and zero the bytes.
  The wayinCtx is the `info` at `deriveKey`, as now.
- **Still seeing the cleartext, by their nature:** `KeyDeriver.deriveKeyBytes`,
  `StrengthChecker.check`, and the app's own dialog. JS strings cannot be wiped: shrink our
  copies, not the app's.
- **A proving is bound to the salt it was derived over.** A gate changed between derive and use
  opens nothing: refuse it as `gate_changed_during`, telling the user the vault's ways in changed
  while this one was being verified and to verify again; never `wrong_passphrase`.
- Wayin's `tryOpen` and `seal` move to the Proving; `VaultKeyPair` goes.
- Default: the Proving pours only the leaseKey and the wrap into the Lease, and the Lease opens
  its own vaultKey through the unwrap a stored lease uses, so fresh and stored leases share one
  path. Pour a key handle instead only if the unwrap proves a problem, and say so.
- Default: every cleartext enters through `gating.attempt`, so `putWayin('passphrase')` raises a
  `change_passphrase` gating to `requestCleartext`, `putWayin('passkey')` an `add_passkey`,
  `delWayin('passkey')` a `del_passkey`; the vault's calls take no cleartext. Take provings the
  app made instead only if the one door proves unworkable for a settings page, and say so.
- The gate's fields stay flat in the vault props (`passphrase`, `passkey`, `gate_epoch`); `Gate`
  is the class over them.
- `new_vault` with a passkey: the passkey is optional to the user; a create that comes back
  without the PRF answer is refused for that passkey and the vault is made on the passphrase
  alone. One gating or `new_vault` then `add_passkey`: thread 7 decides and says which.

## Birth: the bank and the Vault

- `Bank.make(opts)` is synchronous and touches nothing: **made**.
- `bank.hello()` loads the deriver and the strength checker and answers the default device
  store, once: **starting**, then **timely**; **refused** with a retry if any fails, and no vault
  is born until it succeeds. Idempotent: a later call resolves at once; one that failed is tried
  again by the next.
- `bank.ensureVault(scope, opts?)` births the Vault for a scope, one turn: in parallel,
  `vaultDB.ensureVault(scope, draft)` (fetch the props and listing, or create the props from a
  gateless draft -- `gate_epoch: 0`, no way in -- in one transaction) and the device store's
  lease and device record; then one judgment of the two against each other (a lease of this
  `vault_tok` at this `gate_epoch`, not ended, within `leaseHours`, that opens: unlocked; a lease
  of another vault or epoch, or that will not open: with certainty an old copy, discarded;
  neither: locked; no gate: novel). The scope's entry is **starting**, then **timely** holding
  the Vault, or **refused** with a retry (storage unreachable, damaged, newer format, the user
  signed out). `opts` may name a `vaultDB` or `deviceDB` for this vault; the bank's are the
  defaults. Idempotent: the Vault held is handed back while it stands.
- A **novel** Vault has its `vault_tok` and `registered_at`, a consistent, timely presence in the
  vaultDB and the device store, and no gate: `unlock(proof)` on it makes the gate (seals the way
  in, writes the props at `gate_epoch` 1 expecting 0) and moves it to unlocked. Two devices
  ensuring the same new scope get one `vault_tok`; the first to write a gate wins by the
  expectation, and the other's unlock refuses `gate_made_elsewhere` (another device set this
  vault's passphrase first: unlock with it), the Vault reloading as locked under that gate. The
  `new_vault` gatingkind is this unlock, raised when a call needs a novel vault unlocked.
- So on a Vault nothing is optional but by meaning: `gate` is empty while novel (`gate_epoch`
  0, no way in), `lease` is null unless unlocked (`askPassphraseAt` lives on the lease),
  `gate.passkey` is null by policy, `trouble` null when none.
- `bank.reopenVault(scope)` lets the Vault go and ensures the scope anew, as if first seen.
  `bank.closeVault(scope)` lets it go: no lock, no erase, the lease stays. `bank.closeVaults()`
  at sign-out. A bank verb that makes, finds or lets go a vault names the vault; a verb on a
  thing (`vault.del()`, `box.put`) acts on that thing. A Vault let go is **gone**: every call on it refuses `vault_gone`.
- A Vault is of one `vault_tok`. A read that finds another, or none, or storage that no longer
  serves the user, makes it gone, and the bank ensures the scope again: `vaultDB.ensureVault`
  finds nothing and creates gateless props under a fresh `vault_tok`, and a new Vault object is
  born novel of that read, taking the gone one's place in the scope's entry. So a vault deleted
  elsewhere comes back novel on a device still open: the host's `useVault` yields the new
  object, sees `novel`, and offers the passphrase choice. Nothing carries over from the gone
  object; its lease, bound to the old token, was erased.
- The bank's snapshot, for `useSyncExternalStore`: `{ status: 'made' | 'starting' | 'timely' |
  'refused', err?, vaults: { [scopeKey]: { status: 'starting' | 'timely' | 'refused', vault?, err? } } }`,
  each entry frozen and kept until it changes. Default names; say what they became.
- `safebyok-react`: `<BankProvider bank={bank}>` made once at module level, `useBank()`, and
  `useVault(vaultlabel)` for the signed-in user, which ensures the scope and selects its entry.
  The provider's "new vault when a prop changes" logic goes: the bank is made once, and the user
  is a scope argument. `openError` and `retryOpen` go; the entry carries the refusal and the
  retry.
- The device store is a precondition of the bank: one the browser withholds
  (`storage_blocked`) refuses `bank.hello()`. A host that wants to run without one passes an
  in-memory deviceDB from batteries, as a choice of its own.

## The states

A Vault's picture has two axes, each derived at every look and nowhere stored:

| axis | word | derived from |
|---|---|---|
| state | `novel` | `gate_epoch` 0: no way in yet; the first unlock makes the gate |
| state | `unlocked` | a lease held whose `ask_passphrase_at` is past now, by the vault's clock |
| state | `locked` | otherwise |
| freshness | `timely` | the last read succeeded within `staleMillis` |
| freshness | `aged` | the last read succeeded, `staleMillis` ago or more; the next call reads |
| freshness | `refused` | the last read failed; `trouble` says why |

`freshness` replaces `syncing`. Default: it is in the snapshot, and one timer at
`#readAt + staleMillis` settles so it flips to `aged` (a timer that settles and reads nothing, as
the expiry's is one that queues a lock). Keep it private to hello instead only if the timer
proves a nuisance, and say so. `trouble` stays beside it. Not in the snapshot: gone, and a gating
up. A lease held past its deadline shows `locked` from the derivation alone; its drop is a turn
the expiry timer queues.

## Turns

A turn is one call's work against the vault's fields: it awaits its I/O in one parallel round,
judges synchronously, and commits synchronously -- assigns the fields and settles. Everything
that touches `#vaultProps`, `#boxes`, `#lease` or `#readAt` is a turn: a read, an unlock (prove
and grant), a gate change, `del`, `lock`, and the expiry. Between a turn's awaits nothing else
moves those fields, so nothing asks whether the world moved since the last await. Storage
changing under a turn is caught by data at the next read -- `vault_tok`, `gate_epoch`, a box's
`revision_tok` -- never by a signal.

The queue is `p-limit(1)`. `oneAtATime` goes: a second hello queued behind a read finds the
picture timely and does nothing, which is all its twist bought.

`lock()` is a turn, and lands after the turn in flight; a lock asked during a read waits for it,
bounded by the host's storage timeout, and the snapshot says `locked` when the lock's turn runs.
A whisper the app asked for before `lock()` is handed to it. The expiry is a timer that queues a
lock turn at `ask_passphrase_at`.

## Each call

Each is: await its precondition, then one turn. A refusal changes nothing.

- **`hello(opts)`**. Precondition: none. If `#readAt` is within `staleMillis`: settle, resolve.
  Otherwise the read turn: `Promise.all([vaultDB.getVault(scope), deviceDB.getLease(scope)])`,
  the first handing back props and listing from one transaction. Judge: damaged vault props
  refuse `damaged_vault`, a newer format `newer_format`. Props at
  a `gate_epoch` above the one in hand revoke: the lease is dropped and the listing replaced.
  Props of another `vault_tok`, or none, or at a `gate_epoch` below the one in hand, make the
  Vault gone (*Birth*). The lease is taken up when its `vault_tok` and `gate_epoch` match the
  props, its deadline fits `leaseHours` from now and has not passed, and it opens; default: open
  it in the turn, so `unlocked` means the key is in hand. Commit: props, listing, lease,
  `#readAt`, freshness `timely`; settle; tell the listing's and ways-in's bad news. After the
  commit, logged if it fails: `delLease` for a lease dropped or discarded.
- **`ensureLease()`**. Precondition: hello. Unlocked: resolve. Otherwise raise the gating (the one
  up, or one now) and await its settlement; its attempts are unlock turns. Then: unlocked
  resolves, anything else refuses `vault_locked`. No second hello, no read after the answer.
- **`unlock(proof)`** and a gating's `attempt`. Precondition: hello, at the vault's default
  staleness. Turn, on `locked`: open the way in, grant the lease (wrap), `putLease` inside the
  turn (a device store that refuses it refuses the unlock); commit the lease. Turn, on `novel`
  (the `new_vault` gating): strength check, seal the way in, `putVaultProps` at `gate_epoch` 1
  expecting 0 (a stale write is `gate_made_elsewhere`, and the Vault reloads locked under the
  other device's gate), grant, `putLease`; commit the gate and the lease.
- **`putWayin` / `delWayin`** (a gate change). Precondition: hello. Turn: open the standing
  passphrase, revise, `putVaultProps` under the standing `gate_epoch`, grant, commit. A stale write
  refuses `stale_write` with what won in `meta`; no catch-up read.
- **`getBox`, `getWhisper`, `decryptWhisper`**. Precondition: ensureLease. Turn: `getBox`,
  decipher under the lease, resolve; a box that will not open is `damaged_box` at once. No look at
  the lock afterwards.
- **`putBox`, `delBox`**. Precondition: ensureLease. Turn: the write under its `revision_tok`;
  stale refuses as it came, with `meta.box_stored`; the read after `delBox` goes.
- **`del()`**. Precondition: hello. Turn: `delVault`, `delLease`; the Vault is gone, and the
  bank ensures the scope again when next asked, landing novel.

## The lifecycle

Three places hold information: the user (the passphrase, the passkey), the pantry on this device
(the lease, the device id; readable by anyone with the device), and central storage (the gate
and the boxes; ciphertext and visible fields). Other devices, tabs and timers change two of them
at any moment. One read turn sees storage and the pantry together and judges them against each
other; the user is asked only when the two cannot open the vault alone. Every row is by this
plan, not by the code as it stands.

**The bank**

| # | happens | the bank's entry |
|---|---|---|
| B1 | `Bank.make` | `made`; nothing loaded, nothing read |
| B2 | `bank.hello()`: the deriver and the checker load, the device store answers | `starting`, then `timely`; or `refused` with `err` and a retry, and no vault can be born |
| B3 | `bank.ensureVault(scope)`: one turn, fetch-or-create beside the device store's read | `starting`, then `timely` with its Vault, born in a row below; or `refused` (storage unreachable, damaged, newer format, the user signed out) with a retry |

**A Vault's birth**, from one read of storage and the pantry together

| # | storage holds | pantry holds | the read judges | born as |
|---|---|---|---|---|
| V1 | no vault | nothing, or a lease of a vault that is gone (erased after) | gateless props are created; nothing to open | `novel` |
| V2 | a vault | nothing (never on this device, or its lease erased by a lock) | | `locked` |
| V3 | a vault | a lease of that `vault_tok` and `gate_epoch`, not ended, within `leaseHours` | the lease opens | `unlocked` |
| V4 | a vault | a lease ended, or at another epoch, or of another `vault_tok`, or longer than `leaseHours`, or that will not open | discarded (erased after) | `locked` |

**A Vault alive**, each a turn

| # | happens | becomes |
|---|---|---|
| A1 | `unlock` on `novel` (the `new_vault` gating): strength check, the way in sealed, the gate written at epoch 1 expecting 0 | `unlocked`, the gate made here |
| A2 | `unlock` on `novel`, but another device (or a second browser on this machine) wrote the gate first | the write is stale: `gate_made_elsewhere`; the Vault reloads `locked` under that gate, and the user unlocks with the passphrase chosen there |
| A3 | a proving, on `locked`: the way in opens, a lease is granted and written | `unlocked` |
| A4 | a gate change: the standing passphrase opens, the gate is rewritten under its epoch, a lease regranted | `unlocked` under the new epoch; a stale write refuses with what won, and nothing is reread |
| A5 | `lock()`, or the expiry turn at `ask_passphrase_at` | `locked`; the lease erased |
| A6 | a read (hello past `staleMinutes`, or the ring): a box changed elsewhere | the listing replaced; state unchanged |
| A7 | a read: the gate's epoch moved up elsewhere | `locked`; the lease dropped and erased |
| A8 | a read: another `vault_tok`, or none, or the same `vault_tok` at a lower `gate_epoch` than in hand, or props and listing that disagree | **gone**, the lease erased; the bank reloads the scope, landing V1 or V2 |
| A9 | a read: the user signed out (`identity_revoked`) | **gone**, the lease erased; the scope's entry `refused` |
| A10 | a read refused: storage unreachable | as it was, freshness `refused` |
| A11 | a read refused: damaged props, newer format | as it was, with `trouble` |
| A12 | `del()`: storage emptied, the lease erased | **gone**; the next `ensureVault` lands `novel` |
| A13 | `bank.closeVault(scope)`, `bank.reopenVault(scope)`, `bank.closeVaults()` | **gone**; the lease stays |

A lock lands after the turn in flight, in every row.

A lease tombstone in the pantry is not built: every row is judged by data the lease and the
props already carry. A lock in one tab reaching another tab at once (the pantry rings no bell),
and a `locked_at` stamp a grant compares to, are later, in batteries.

## The device id

The device mark becomes a **device record**, one per scope, minted at first need and kept in
the device store: `{ format: 'safebyok-device-v1', ...scope, device_id }` and nothing else
(`getDevice`/`putDevice`; say what the names became), holding no `vault_tok` and no epoch, which
the props and the lease already carry. Every way
in this device seals carries it. A vault made anew under the same scope keeps it. Out with the
mark: `heedMark`, `keptMark`, `raiseMark`, `raiseMarkAfter`, `markSeeing`, `#drafted`,
`deviceIdFor`'s `stale_write`, the `rolled_back` arm of `heedRefusal`, `forgetVaultProps`, the
README's *A vault rolled back*, VOCABULARY's rows for the mark and *rolled back* (to
`notes/old_vocabulary.md`), and `delMark`. The security note for thread 4: storage is the ground
truth; the Vault compares an epoch only against what it holds in memory, and answers a
disagreement by reload; nothing durable records what was seen.

## Libraries

- `p-limit` for the turn queue.
- TanStack `query-core` is not in the core; the react entry point and batteries may use it, as
  ruled on 2026-10-19.
- Candidates for a library, each decided in the thread that touches it or in thread 10:
  `stable-jsonify.ts` (`safe-stable-stringify`, or es-toolkit), `adorn.ts`, `mask.ts`,
  `sanitizer.ts`, `string-store.ts`, `utils.ts`, `report-error.ts`, `change-bell.ts`, `idb.ts`
  (`idb-keyval` or `idb`). `outcome.ts`'s `outcomeOf` stays: it is the Outcome contract.

## Trust, checks and races: for the agents building this

The code as it stands is paranoid, and an agent that reads it learns paranoia: a check after
every await, a second look at a record because it can be looked at again, a branch for a case
the door already refused "to show the path exists". Each thread is held to these, and the
reviewer reads with them in hand.

1. **Validate once, at the door.** A value is checked where it enters: a call's arguments at its
   entry point, a stored record in its class's `make`, the app's answer where it is heard. Past
   the door it is what its type says. No second check, no defensive branch, no "impossible case"
   handled for completeness, and no test for an input the door refuses, except at the door. If a
   state cannot arise, there is no code for it: TypeScript's exhaustiveness (`never`) is the whole
   of the check.
2. **A record vouches for itself.** It was validated, frozen through, and where it carries a
   secret, bound by its ctx. A field read from it needs no second look. That it could be checked
   again is not a reason to.
3. **Records are judged against each other in one place, a turn's judgment**, by their data
   (`vault_tok`, `gate_epoch`, `revision_tok`, a deadline), between its I/O and its commit. Not
   before an await, not after one, and not before a result is handed back.
4. **Flag races; do not solve them.** A scenario that seems to need anything beyond the turn and
   a store's expectation -- a wait, a flag, a signal, a counter, an abort, a re-read, a re-check,
   a retry, a fallback -- is written up as the scenario and what the user would see, in the PR's
   open questions and in `human/`, and nothing is built for it. Most are already decided: a lock
   during work lands after it; a picture within `staleMinutes` is what hello promises, not a
   bug, and goes nowhere, not even `notes/wontfix.md`; storage that disagrees with what is in
   hand is reloaded, never argued with or repaired.
5. **Tests pin the rule, not the race.** A test that interleaves a lock and a read asserts the
   one order turns give. It does not assert that a late result is suppressed, and does not pin an
   annoyance.
6. **A rule that looks wrong for the case at hand is said so**, in chat and the PR, with the
   case. It is not routed around.

## Review

Per thread: the `thread-reviewer` on sonnet, medium. Its brief is *Trust, checks and races* and
three questions: did the thread remove what its line says and add no guard; do its tests pin
rules, not races; do its doc blocks and tests follow STYLE.md. It fixes style, doc blocks and
test titles. Anything in control flow it reports and does not fix; a race it notices is a
scenario in its report.

End of sprint: one opus, high pass with the same brief, over the whole line: vestiges of the
removed machinery (a grep list from threads 3 and 5's "out" lines), the security notes, the
Contract. Its findings are matters for the Coach, not fixes.

## Threads

Each is one PR, stacked on the one before, every PR's base `main`. Tests follow STYLE.md;
`tests/vault/` keeps a theme per file. Each security decision goes to `notes/security.md` in its
own thread's PR, through the subagent. Each PR's open questions name what the thread could not
decide and, for every "say so" above, what it chose.

1. **renames**: `unlock_epoch` becomes `gate_epoch` and `vault_id` becomes `vault_tok`, in
   core, every adapter (Postgres columns, Convex validators, GraphQL schema, IndexedDB), records,
   ctx, expectations, tests and fixtures, VOCABULARY (the `vaultId` row, and the `_id`/`_tok`
   rule, which lists `vault_id` as an `_id` today), the README, and CLAUDE.md's ground-truth
   paragraph. No format string changes. Rename only, no behaviour.
2. **get_vault**: `VaultDB.getVault(scope)` and `VaultDB.ensureVault(scope, draft)` hand back
   the vault props and the box listing from one transaction (Postgres), one query or mutation
   (Convex, GraphQL), one IndexedDB transaction over both stores, or trivially (local); the
   props schema allows the gateless draft (`gate_epoch` 0, no way in); `getVaultProps`,
   `ensureVaultProps` and `listBoxes` stay for their own callers or go if none remain, and
   VAULTDB.md and the conformance suite say what consistency it promises.
3. **turns**: `p-limit(1)` as the queue; `#read()` as read, judge, commit; `hello` as
   settle-if-timely-else-read; the watch's ring a forced hello; `lock`, `del` and the expiry as
   turns; `ensureLease` with one hello and no read after the answer; every `#refresh()` inside a
   call, `#refreshOnStale`, `#catchUp`, `#refuseCreatedElsewhere`'s re-read and the after-wait
   `#checkUnlocked()`s out; `#greeting`, `#greeted`, `#forgetHello`, `#takeUp`,
   `#createsStandDown`, `oneAtATime` and every `isOvertaken`-shaped predicate out; the
   lock-timing TODO closed with the one-sentence policy; the mark read once, in parallel, and
   raised after the commit. Adds `vault-turns.test.ts`: lock during a read, unlock during a read,
   a ring during an unlock, expiry during a getWhisper, each one deterministic order. `make` and
   `hello` keep their surface until thread 4.
4. **bank**: `Bank` with `make`, `hello`, `ensureVault`, `reopenVault`, `closeVault`, `closeVaults`, its snapshot and
   `subscribe`; the libraries load at `hello`; `Vault.make` and the first-hello memo go, a Vault
   born of one read; `opening`, `UnreadVaultProps`, `currentVaultProps`, `close()` and
   `vault_closed` go (`vault_gone`); a Vault of one `vault_tok`, novel when gateless, never
   absent; `created_elsewhere` becomes `gate_made_elsewhere`; `syncing` becomes
   `freshness`; the stores on the Vault with the bank's defaults; `safebyok-react`'s provider
   becomes `BankProvider`, `useBank`, `useVault(vaultlabel)`, and `openError`/`retryOpen` go.
5. **device_id**: the mark becomes the device id; `rolled_back` and the list under *The device
   id* out; the security note.
6. **proving**: `Proof` becomes `Proving`, derived at the door; passkey bytes imported and zeroed
   at parse; `tryOpen` and `seal` move off Wayin; the Proving grants the lease; `VaultKeyPair`
   goes. Wayin is record only.
7. **gate**: the slots and the policy come off Vault into `Gate`; changes return a new Gate with
   `gate_epoch` bumped.
8. **gating**: `Ask` becomes `Gating` with `gatingkind`, `attempt`, `decline`, `lockLanded`;
   `getProof` becomes `requestCleartext`; `lease_ending`, `carry_on` and the renew path go; Ask's
   `#over` and `#landed` controllers go (`attempt` is an unlock turn, and one after the gating
   settled refuses `vault_locked` from the gating's own state; `lockLanded` stays a promise);
   vault calls stop taking cleartext.
9. **react**: the dialogs dispatch on `gatingkind`, one per kind; `passphrase-modal`,
   `passkey-unlock-button`, `attempt-refusals`, `messages` follow.
10. **docs**: README, VOCABULARY (Bank, Gate, Gating, Proving, gatingkind, gate_epoch, turn,
   the state words made, starting, timely, aged, refused, gone, novel, freshness,
   requestCleartext, the device record), the Contract (`hello`, `ensureLease`, `lock`, the (*)
   convention, the lock-timing sentence), `notes/old_vocabulary.md` (Proof, Ask, AskWhy,
   ProofAnswer, getProof, unlock_epoch, vault_id, lease_ending, carry_on, device mark, rolled back,
   vault_closed, opening), and the hand-roll sweep with its verdicts.

## Later, not here

- One-time recovery, once the five gatingkinds stand.
- A device-capability split, only if a certain signal exists.
- Per-device invalidation.
- Argon2id in SubtleCrypto, once it ships: a passphrase as a non-extractable key from the input
  handler on.
- A host hook for resolving a data-integrity failure from local state.
- A `locked_at` stamp in the pantry, and the change bell carrying a lock between tabs.
