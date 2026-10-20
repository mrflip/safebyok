# Thread B5: where each method lives, re-done from the code (2026-10-20)

For the Coach's coin flips, and for pass 3 at the end of phase D, which repeats this check over
phase C's calls. Replaces the preplan's *Where each method lives: first guesses* as the table to
work from. Thread file: [`thread-B5-placement.md`](thread-B5-placement.md).

The rule the guesses lean on (preplan): a method lives on the class whose fields it reads and
writes most; crypto bound to a `*Ctx` lives on the class whose fields make up that ctx; a secret
never leaves its class; orchestration that touches storage, the clock, the device store or the
state machine lives on `Vault`. Each row below gives the arguments from the code as built at
B4's tip plus this thread, then the lean. *Settled* means every argument points one way and the
code already sits there: no row for the Coach. A row marked **Row** is in the thread file's
*Open matters*.

| # | Method | Lives now | Lean | |
|---|---|---|---|---|
| 1 | derive a key from a proof | `proof.wayinKeyFor(wayin)` (proof.ts) | Proof, strong | settled |
| 2 | open a way in | `wayin.tryOpen(proof)` (wayin.ts) | Wayin, strong | settled |
| 3 | make a way in | `Wayin.seal(vault, proof, holder, stamp, vaultKey)` | Wayin, moderate | **Row** |
| 3a | the session handle a seal hands back | `Wayin.seal`'s second unwrap | keep, moderate | **Row** |
| 3b | a way in's stamp (epoch, device, time) | built by the vault (`#newStamp`, `#draftVaultProps`) | Vault, weak | **Row** |
| 3c | a new passkey's fresh salt | `checkFreshSalt(proof)` (wayin.ts) | Proof, weak | **Row** |
| 4 | a new passphrase's strength | `#checkStrongEnough(proof.passphrase)` (vault.ts) | Proof for the read, moderate | **Row** |
| 5 | make a lease | `Lease.grant` builds; `#grantLease` writes | Lease builds, Vault writes: strong | settled |
| 5a | a lease's deadline | `#deadlineFromNow()` (vault.ts) | Vault, weak | **Row** |
| 6 | open a lease | `lease.tryOpen(holder)` (lease.ts) | Lease, strong | settled |
| 7 | seal a box | `Box.seal`, but `putBox` calls `planSeal` and `sealPlanned` itself | Box seals, strong; the split, weak | **Row** |
| 8 | open a box | `box.tryOpen(vaultKey)`; `vault.openBox(box)` with the key in hand | Box, strong | settled |
| 9 | one refresh when a box will not open | `#decipherOrCatchUp` (vault.ts) | out of the core | **Row** |
| 10 | ask for a proof | `Ask` (ask.ts); the vault holds `#asking` | Ask, strong | settled |
| 11 | `ensureLease` itself | `#ensureLease` (vault.ts) | Vault, strong | settled |
| 12 | which way in a proof is for | `#unwrapWith(standing, proof)` (vault.ts) | Vault, moderate | settled |
| 13 | the makers' argument order | `Box.seal`, `Wayin.seal`, `Lease.grant` | one order | **Row** |

## The arguments, row by row

**1. Derive a key from a proof.** Reads the proof's secret, and of the way in only `salt_b64` (a
passphrase) or `wayinCtx` (a passkey); the key deriver through `proof.vault`. All the crypto
(Argon2id or HKDF, the import as non-extractable, the zeroing) is in proof.ts. A test needs a
proof and a one-field stub. The other end, `wayin.keyFrom(proof)`, would read `proof.passphrase`
in Wayin. Settled.

**2. Open a way in.** Reads the way in's wrap, ctx, epoch against its holder, its deriver label,
and (passkey) its credential and salt against the proof's; one call into the proof. Every refusal
it makes is about the way in (`damaged_wayin`, `unknown_key_deriver`, `wrong_passkey` for another
credential). The other end, `proof.tryOpen(wayin)`, would read four of the way in's fields to
refuse about them. Settled.

**3. Make a way in.** Writes every field of the way in: the header, its ctx (the way in's own
fields and its vault's), the wrap. Reads of the proof: the key it makes, and a passkey's
credential and salt. Built as one static, with each kind's half in a keying helper
(`passphraseKeying`, `passkeyKeying`) chosen by `proof instanceof PassphraseProof`. That dispatch
is the case for the other end: it is polymorphism on the proof's kind, and a method on each proof
kind (`proof.keyingFor(vault, holder, stamp)`, handing back header, ctx and key) would replace
the `instanceof`. Against it: a passphrase proof would mint the way in's salt and write
`key_deriver_label`, and a proof would know the device, the epoch and the header of a record it
is not. From the caller, `Wayin.seal(this, newProof, standing, stamp, key)` reads as "seal a way
in"; `newProof.seal(...)` reads as sealing the proof. This thread built each kind's ctx once, in
its keying, so a passkey's HKDF `info` and its wrap's ctx are one value (B4's review). Lean:
Wayin, moderate.

**3a. The session handle.** Every seal unwraps its own fresh wrap once more, non-extractable,
and hands it back as `sessionKey`; only the creating unlock keeps it (`putWayin` drops it). Cost:
one AES-KW unwrap. For keeping: one return shape, three statics stayed one, and the unwrap proves
the wrap opens under its own ctx before anything is written. For dropping: a session handle is
the unlock's concern, and two of three callers discard it; the alternative is a seal that hands
back the wayinKey or an option, both worse. Lean: keep, moderate.

**3b. The stamp.** The vault builds `{ vault_key_epoch, device_id, registered_at }`: its clock,
its device id for the vault, the standing props' epoch. A first passphrase shares the vault
props' `registered_at` (one clock reading). `Box.seal` reads `vault.clock` itself for
`written_at`, so the two makers disagree. For the seal reading the clock: consistency with
`Box.seal`, and the convention (models reach the clock through `vault`). For the vault: the
device id and the epoch are the vault's anyway, and one reading stamps both the props and their
first way in. Lean: Vault, weak.

**3c. A new passkey's fresh salt.** `checkFreshSalt` reads only `proof.prfSaltB64`, refuses a
proof's shape, and runs twice: at the vault's door (`newProofOf`) and in `passkeyKeying`. By
fields read it is the proof's (a `PasskeyProof` static or method beside `parse`); by purpose it
is the sealing's. Lean: Proof, weak.

**4. A new passphrase's strength.** The vault reads `proof.passphrase` to hand it to
`checkStrongEnough(checker, passphrase, scope)`, twice (`#settleUnlock`'s create,
`#tryPutWayin`): the only places outside proof.ts that read a secret field. For the proof
(`proof.checkStrongEnough(checker, scope)`): the secret never leaves its class, as ruled. For
the vault: the checker, the scope and the once-per-handle log of an unchosen checker are the
vault's, and a new passphrase is no proof of anything. Both fit: the vault keeps the log and
passes its checker in. Lean: Proof for the read, moderate.

**5. Make a lease.** `Lease.grant` writes every lease field and does both crypto steps under
`leaseCtx` (its own fields). The write is the vault's, interleaved with the overtaken and outrun
checks before and after `putLease`, and the `delLease` an overtaken attempt needs: sequencing a
lease cannot see. `proof.lease(...)` is out: `grant` takes a key pair, and the take-up path has
no proof. Settled.

**5a. A lease's deadline.** `deadlineAfter(clockNow, leaseMillis)` on the vault. The lease
already reads `vault.clock` (`endsWithin`), so it could compute its own end given `leaseMillis`
on `LeaseVault`. But "every proof renews, nothing else moves the deadline" and the take-up's
leaseHours fit are vault policy. Lean: Vault, weak.

**6. Open a lease.** Reads its own fields, the holder's `vault_id` and `unlock_epoch`, the clock
through `vault`; one unwrap under its ctx. The fetch, the leaseHours fit, the discard and its
log line, the take-up guards are the vault's. Settled. (Built as `tryOpen(holder)`; the Contract
says `tryOpen(vault)`.)

**7. Seal a box.** `Box.seal` exists, but `putBox` calls its halves, `planSeal` and
`sealPlanned` (exported from box.ts, not from the package), to weigh the sidecar a store keeps
from the box it replaces against `maxWhisperBytes` before any key is made. Options: keep the
split; `Box.seal(..., { weigh })` or a byte limit; or `Box.seal` then weigh the sealed box
(crypto spent on a refused box, the simplest flow). Lean: Box seals, strong; the split, weak.
C2 rewrites `putBox` and can settle it.

**8. Open a box.** The box's wrap, ciphertext and ctx; the vault only holds the key. Settled.

**9. One refresh when a box will not open.** A re-read on a miss, which the sprint's ground rule
puts in an outer layer. Not a model placement: in or out of the core. Lean: out, at C4 (which
rewrites `getBox`/`openBox`), D1 adding it back outside if wanted.

**10. Ask for a proof.** `Ask` owns the gate's state (`why`, `lockLanded`, `attempt`, the one
answer and its check); the vault keeps which prompt is up (`#asking`) and lands a lock on it.
`Ask.raise` is now a symbol-keyed static no entry point exports. Settled.

**11. `ensureLease`.** Eleven statements of sequencing: hello, the closed check, `#whyAsk` (the
lease's `endsWithin`), the prompt up or a new one, the answer, hello again, the key check. No
crypto, no storage of its own. Settled.

**12. Which way in a proof is for.** Picks the slot by `proof.kind`, refuses `absent_wayin`
(ruled the vault's). Reads the vault props' two slots. Settled.

**13. The makers' argument order.** `Box.seal(vault, boxlabel, whisper, holder, vaultKey, opts)`,
`Wayin.seal(vault, proof, holder, stamp, vaultKey)`, `Lease.grant(vault, holder, vaultKeyPair,
askPassphraseAt)`: the key last in two, third in one. One order, `(vault, holder, ...what it
holds, key, opts)`, would read alike from each caller.
