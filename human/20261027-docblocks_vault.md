# 2026-10-27: vault.ts doc blocks rewritten, uncommitted -- 732 to 596 lines, four questions

Documentarian run on `packages/safebyok/src/vault.ts`, in the main checkout on `20261027-fixup`,
left uncommitted for `git diff`. Doc blocks only. `pnpm --filter safebyok lint` and `typecheck`
are green. No `@ts-expect-error` or `eslint-disable-line` added.

Doc-block lines: 732 in 155 blocks before, 596 in 160 after. The five new blocks are field docs
on `BirthRead`.

| member | before | after |
|---|---|---|
| `VaultSnapshot` (type doc) | 18 | 17 |
| `Vault` (class doc) | 67 | 57 |
| `hello` | 25 | 20 |
| `ensureUnlocked` | 29 | 21 |
| `demandConsistentWith` | 17 | 14 |
| `lock` | 27 | 19 |
| `checkStrength` | 17 | 13 |
| `putWayin` | 30 | 24 |
| `delWayin` | 12 | 13 |
| `putBox` | 48 | 36 |
| `getBox` | 16 | 12 |
| `delBox` | 17 | 13 |
| `del` | 18 | 15 |

## Changes, member by member

* **`VaultSnapshot`**: "Fixed for the Vault object's life" moved off five fields into the
  type doc. "The same array/object until it changes" moved off four fields: the type doc already
  said it. The two-field screen choice ("gate === null, set a passphrase...") is now comments on
  the example. Field docs now link `BoxSparse` and `BoxDamaged` instead of listing their fields.
  `ask_passphrase_at` loses the `Intl` advice. `format` loses the literal `safebyok-vault-v6`.
* **`Vault` class doc**:
  * New shared rule, taken from the code: a call that reaches a box or a way in first runs
    `hello()` within `staleMinutes`, and refuses as it does. This replaces "it awaits a hello
    first" on each member.
  * The gone rule now also exempts `consistentWith()`.
  * The rule about functions that hear the passphrase is now its own bullet.
  * The device-record paragraph is down to its contract.
  * The race paragraph is down to 'stale_write' and the four moved-on kinds.
  * The two-forms paragraph now names `demandConsistentWith()` as throwing-only.
* **Stamp fields** (`format`, `applabel`, ...): "Fixed for the Vault object's life" is cut.
  The class doc says it.
* **`getSnapshot`, `subscribe`**: "bound, one identity" is cut. The class doc says it.
* **`hello`**: cut the shared in-flight read (kept on `refresh`), the ignored older read, and the
  device-record raise. The lease paragraph is cut to: hello takes no lease up, and it locks once
  another tab locked or the ways in changed.
* **`refresh`**: rephrased. Cut "refuses as hello() does".
* **`ensureUnlocked`**: now in three paragraphs: the contract, then joining or raising a gating,
  then refusals. Cut the join/wait-out loop, the take-up fit conditions (they stay on
  `#fitsTakeUp`), and the gone/remade refusals (class doc).
* **`demandConsistentWith`**: the first line no longer says how other calls use it. Cut
  'bad_option' for a missing `vault_tok` (class doc). The example comments drop "the vault half".
* **`consistentWith`**: says how it differs from the demand, and that it still throws
  'bad_option'.
* **`lock`**: replaced the per-call walk (getWhisper, putBox, delBox, del) with one rule: a call
  under way refuses at its next step, and a sent write lands as storage decides. Del's
  sent-write case moved to `del`.
* **`checkStrength`**: cut what the class doc says (bad_option for non-text, nothing kept of a
  throw).
* **`putWayin`**: the contract (in storage, other devices lock, this one stays unlocked) now
  comes first. Cut the bad_option slotlabel (class doc), the cost note, and "the snapshot's
  passkey says which".
* **`delWayin`**: written in the same shape as putWayin.
* **`putBox`**: five paragraphs:
  * contract
  * reads
  * limits
  * staleness
  * damage

  Cut the lock walk (lock and class doc) and bad_scope (class doc). The `@param props` is
  shorter, and keeps the cleartext-sidecar warning.
* **`getBox`, `getWhisper`, `useWhisper`, `delBox`**: cut what the class doc covers (locks,
  gone/remade mid-call, bad_scope) and the logger note on 'deleted_other'.
* **`del`**: the contract comes first. 'absent_vault' is named up front. The sent-write
  'vault_locked' case now reads correctly (from gating.ts).
* **`[bear]`, `[letGo]`, `[goneBy]`, constructor**: shortened. `[bear]` now names
  `VaultDB.subscribe`.
* **Private members**: each lost its rationale, its step narration and its list of callers (see
  below). Kept: security facts (the `leaseHours` cap in `#fitsTakeUp`, erase ordering in
  `#lockNow`, a missed record raise in `#raiseRecordAfter`), and when to call (`#checkStanding`,
  `#freshen`, `#takeUpFromPantry`).
* **`BirthRead`**: its parent-doc field tour moved onto the fields.
* **`DeletedBox`**: the tour is cut to the one field that needs words (`outcome`).
* **`UntrustedStorageKinds`, `UnlockingKinds`, `checkHelloOpts`, `checkEnsureUnlockedOpts`,
  `isFarFuture`, `unrefTimeout`**: shortened.

## Dropped facts that *Cut* does not plainly cover

For a Coach to put back what matters:

1. Class doc and `hello`: any other read older than the picture (served before this device's own
   write) is ignored, taking and refusing nothing. Kept only on `isOlderPicture` and `#judgeRead`.
2. Class doc: a box that will not open under the lease in hand is 'damaged_box' at once, with no
   read of storage first.
3. Class doc: the device record is raised at each read and each own write. `clearCachedVault`
   "erases the record".
4. `hello`: another tab's unlock or renewal leaves this tab's lease standing until it ends.
5. `ensureUnlocked`: the call raises at most one gating of its own. A joined gating's success
   that leaves no lease past `renewMinutes` is waited out, and the call asks again.
   'vault_locked' when the lease is gone by the time the gating settles.
6. `lock`: a `getWhisper()` that met a lock still succeeds if a gating put a lease back in hand
   meanwhile. `delBox()` is stopped only while it waits on a gating.
7. `putWayin`: after `change_passphrase` the user adds a passkey again under the new passphrase.
   The call costs the same however many boxes there are.
8. `putBox`: a whole store keeps the listed box's `registered_at`. A vault made anew while the
   write is under way refuses 'vault_remade' after the write landed (in the deleted vault).
9. `del`: this device raises its record to the tombstone's epoch. The write expects the vault and
   the ways in it proved. A gating of another kind standing is waited out first.
10. `#damagedBase`: storage refuses a new-box store while a damaged one stands, and the next hello
    lists it with a revision for the next store.
11. `#takeUpFromPantry`: a record that is no lease of this scope is warned of and left. A lock,
    decline or going-gone while the store is read lands the gating.
12. `#lockNow`: a pantry consult under way takes nothing up, for the same ordering reason.
13. `#dropLease`: an attempt made as the lease ends still completes.
14. Maintainer invariants: "the one place the snapshot is swapped" (`#replaceSnapshot`) and
    "every lock goes through here" (`#lockNow`). I did not move these to running comments,
    because the brief says running comments stay as they are.

## Open questions (code against prose)

1. `#boxReadRefusal` turns storage's 'vault_mismatch' into 'vault_gone' even when the vault was
   made anew. The class rule says 'vault_remade' for a vault made anew. `getBox` now says
   'vault_gone' either way, as the code does. Should this be distinguishable?
2. The old class doc said only `subscribe()` and `useWhisper()` are throwing-only. In the code,
   `demandConsistentWith()` is throwing-only too. Fixed in prose.
3. The old gone rule did not exempt `consistentWith()`. In the code it answers false, never
   refuses. Fixed in prose.
4. `useWhisper`'s 'bad_option' message says "use needs a callback function". The method is
   `useWhisper`. This is a message, so I left it.
5. The `hello({ staleMinutes: 0 })` example says "read now, whatever was read a moment ago". A
   read under way is shared, so it may have begun before the call. `refresh` says this; the
   example comment does not.
6. `del`: once its write is sent, a lock or decline that lands means storage's own refusal of
   the deletion reaches the caller as 'vault_locked', not as storage refused it (gating.ts
   `#lateLanding`). This is documented as the code does. Is it intended?

## On the two candidate rules

**Narrating how other functions use a member** (16 found): mostly private. A list of callers
or a maintainer invariant I cut. "When to call it" I kept, phrased to the caller. Neither the
brief nor STYLE.md says this outright. I had to judge from "the reader is the code that calls
it" against "when it may be called".

**Field tours in a parent doc** (about 7 found): `BirthRead` I moved onto its fields.
`VaultSnapshot` and the class doc I cut to links. `DeletedBox` I cut to its one field: its
literal is inline, and adding field docs would mean reformatting code. No rule covers this. The
nearest is the `@param`/`@returns` rule, applied by analogy.
