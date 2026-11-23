# Thread 3: dojo_backdoor (2026-11-23)

Branch `20261123-dojo_backdoor`, PR #861, stacked on #860 (`20261123-dojo_table`). Proved after the second rework:
`pnpm justify` green at 50fbfd45c, 7,571 tests (core 1,464, react-lean 308, dojo 17, e2e 576).

The Coach: "inspection panel: mask the keys as they come out of the back door, but do include a taste of them for the
dev to understand how the library works. This is for experimentation, not to be installed in a real app." The review
and the Coach's rulings since then reshaped it (see *Rework*).

* **Built**:
  * **`device.maskedView()`** (`packages/safebyok/src/models/device.ts`), "The bank TSQ, the vault TSQ and the lease,
    masked for a devtool.": `{ bankTSQ, vaultTSQ, lease }`, a `MaskedView` (`shapes/shapes-minder.ts`). Each TSQ is a
    list of `MaskedRow`: the query's key, `status`, `fetchStatus`, `dataUpdatedAt`, `isInvalidated`,
    `lastRefusalkind`, and `val`, a copy of its record, null or listing with every `ciphertext_b64` masked to its last
    3 characters and its length, `…xyz(64)`. Before `signIn` it answers **`EmptyMaskedView`**, defined once in the core
    and used by the giver too.
  * **The lease**: `MaskedViewLease`, `{ active: false }`, or the lease's **loggable** with `active: true` and
    `ends_at`. **`lease.loggable`** (`LeaseLoggable`, `shapes/shapes-stamps.ts`) is new: `fmt, userid, banklabel,
    labelpath, wayinkind, born_at, proved_at, gate_labelpath, gate_lifeseq, gate_revtok, bank_lifeseq, bank_born_at,
    bank_lifetok, isEvicted`, frozen, the two tokens cut short by `maskUuid`; `lease.toJSON()` answers it. **`Gate#leaseLoggable`** shows it, or null while locked, so the gate still hands out no lease. The stamp is
    untouched.
  * **`minder.maskedRows()`** (`minding/minder.ts`): one minder's half, reading only the rows under its own key
    head (`bankKeyHeadOf(scope)`), so what a host keeps in the vault TSQ is left out. The cut is `maskedOf`
    (es-toolkit `cloneDeepWith`) over `maskedCiphertextOf`.
  * **`SOK.maskedView()`** (react-lean's giver): hands on the mounted provider's device's masked view; no hook, no
    device. react-lean re-exports the types and `EmptyMaskedView`.
  * **Thing's doc block** now promises that `{ ...thing }` shows its Thing fields alone, nothing secret and nothing
    opaque; bank and gate tests hold it (Bank and Gate are the only concrete Things; BaseBox is abstract).
  * **STYLE.md** (*Crossings, spreading and logging*): a model's spread shows only what belongs in a log; what a log
    wants is its `loggable`; a stamp is what a ctx binds, a different thing. **VOCABULARY.md**: **bank TSQ**, **vault
    TSQ**, **masked view**, and a **loggable** row in *Shapes*.
  * **The dojo's TSQ panel** reads `SOK.maskedView()` on its 1-second re-read; ckeys lead with `bankTSQ` or `vaultTSQ`,
    and a Lease group shows the loggable. README and `dojo-findings.md` item 3 follow.
* **Decisions made**:
  * **The cut rule**: one fieldname, `ciphertext_b64`, the ciphertext of every `Ciphered`. The IV shows whole.
  * **Why the end**: it lies in the GCM tag, which depends on the whole ciphertext and so on the wrapped key; with the
    bankKey unknown, 18 bits of a function of 256 unknown bits check no guess. Ciphertexts are base64url without
    padding, so the last characters are always the ciphertext's own. In `notes/security.md` as an amendment to this
    PR's entry; it wants a cryptographer's confirmation before use outside the dojo.
  * **The loggable's fields**: `fmt` and `bank_born_at` in, by the Coach's ruling. `bank_lifetok` and `gate_revtok` are in: UUIDs stored in plaintext in every
    record and shown whole by the dojo's VaultDB panel, no credential; in a log they tell a stale lease from its gate's
    revision, and one birth of the bank from another. `labelpath` and `isEvicted` are in: a log wants to know which
    lease and whether its keys are gone.
  * **`MaskedRow`** (first `MaskedEntry`, over the suggested `MaskedQuery`; the Coach: "so is entry").
* **Deviations**:
  * No `=` padding strip: none ever occurs (big's `toB64` is base64url without padding), so it would be dead code.
  * The **loggable** row in VOCABULARY's *Shapes*: `isEvicted` is no record field, unlike the table's other shapes.
  * The TSQ panel re-reads each second, not live: the back door is a plain call with no subscription.
* **Discoveries**:
  * Read-only spread audit (`{ ...model }` against the rule): **Device** breaks it (its own `vaultDB`, `keyDeriver`,
    `strengthChecker`, `logger` are objects with behaviour); **Wayin** breaks it (it tattoos its whole record:
    `bank_key_wayin_wrapped`, `salt_b64`, `prf_salt_b64`, `credential_id`); **Proving** mildly (`header` carries salts
    and `credential_id`, opaque if not secret). **Bank, Gate, Vault, Gating** keep it. None changed.
  * `pickle()` on Bank, Gate and Wayin answers the whole record (the gate's with its wayins' wrapped bankKeys): a
    serialization, not a loggable, despite the old name's lineage.
  * `device.bankMinder` and `device.vaultTsqClient` (was `queryClient`) are public: a host holding a Device reaches the bank TSQ. The giver
    hands out no Device. Not changed here.

## Rework (after review, 2026-11-23)

The review found that two 8-character prefix cuts of the main wayin's wrapped bankKey, from either side of a passphrase
replace, XOR to keystream alone (a replace rewraps the same bankKey): 48 bits an offline guess can be checked
against. Narrower than a break (a wrap is made to be stored on the backend; each guess costs a key-deriver run), but a
masked view meant to show less than the whole wrap showed as much for checking a guess. Changed: the cut shows the
end; `tasteCaches`/`tasteQueries`/`QueryTaste`/`CachesTaste`/`LeaseTaste`/`leaseStamp` became the masked-view names
and `leaseLoggable`; roots/boxes became bank TSQ/vault TSQ; the empty answer moved to the core.

**Set aside**: the prefix (above); `mask()`, which hides length, where the view must show it; a suffix longer than 3
(the Coach: three is enough to say "same record here as there"); the stamp as the lease's answer (the Coach: a stamp
is what a ctx binds, not what a log wants); "taste" (the Coach chose "masked view", less exciting but accurate).

## Second rework (the Coach's rulings, 2026-11-23)

Seven commits on 8ce192513, nothing pushed rewritten (`dojo_forms`, #862, stacks on this branch).

* **`maskUuid`** (`helpers/mask-uuid.ts`, exported from `safebyok/utils` and the root): a UUID's first 10 characters,
  `…`, its last 2; anything else refuses `bad_record` (zod's `uuid`, which takes the nil UUID). Spelled camelCase by
  STYLE.md *Naming* ("a verb (`getUserId`)"; only name/kind/label/path/bag smush). The core's own, not big's, so
  `tests/utils.test.ts` leaves it out of "the very values safebyok-big/utils defines". Revtoks and lifetoks are
  `crypto.randomUUID()` (v4, random throughout); only `read_tc` is v7, whose first ten tell its time.
* **The loggable** gains `fmt` and `bank_born_at`, and shows `gate_revtok`, `bank_lifetok` through `maskUuid`.
  **`lease.toJSON()`** answers it; two tests relied on the stamp (`lease.test.ts`, `proving.test.ts`'s buildLease, now
  `lease.stamp`); no src log line passes a lease. The stamp is untouched.
* **Device** attaches `vaultDB`, `keyDeriver`, `strengthChecker`, `logger` by big's `Helpers.decorate`, as `declare
  readonly` fields: a spread shows `banklabel`, `device_tok`, `leaseMillis`. Nothing else on a Device breaks the rule.
* **Renames**: `MaskedEntry`/`maskedEntries()` to `MaskedRow`/`maskedRows()`; `Minder#queryClient` to `tsqClient`;
  `Device#queryClient` to `vaultTsqClient` (7 lines outside tests). The giver's own `Knock.queryClient()` keeps its
  name: outside the ruling.
* **Dojo**: a `revtok`, `lifetok` or `read_tc` cell shows through `maskUuid`; a non-UUID there shows as any value does
  (storage may hold anything).
* **Docs**: VOCABULARY's lease entry ("…; leaseLoggable views it safely"); STYLE.md *Stateful objects* ("its loggable
  fields").
* **"Entry" of TSQ rows, older than this thread, unchanged**: `EntrykindIdx` and the "entrykind segment" docs in
  `minder.ts`; STYLE.md's example "Remove every one of this minder's entries from the cache."
* **Left open**: `LeaseSparse` (= `LeaseStamp`) is exported and no longer answered by `toJSON`.
* **`notes/security.md`**: an amendment under this PR's entry (by a `sonnet` subagent) for the loggable's new fields,
  the cut tokens, `toJSON` and the `vaultTsqClient` rename.
