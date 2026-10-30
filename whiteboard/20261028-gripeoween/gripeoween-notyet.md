# gripeoween: notyet

Reasonable, deferred: a design question stands in the way, or the Coach shelved it. Do not
anticipate these in an implementation. TODO.md's *Soonish* and NOTYET.md hold the full text; this
shelf adds what the sources since 2026-10-26 put beside them.

## New since the restyle

- GW-57 **The bank as the trouble pipeline.** Where a vault's trouble goes before there is a Vault
  object, and whether every vault's bad news bubbles to the bank. The Coach's "TODO that" (GW-06
  writes the entry); the design is this item.
- GW-58 **`heed` handing Outcomes, so the vault's rewraps go** (#321's open question): a
  contract-shaped change to `RefusalPolicy` for its own thread, after the catchsweep.
- GW-59 **Retire 'invalid_box' for 'bad_record'** and the other three validator_ducks questions (GW-23)
  that change a public name: each waits for the Coach, and then for a changeset of its own.
- GW-60 **May a whisper be `null`?** The Coach, on `getWhisper`'s refusal: "we do let you store null in
  whisper; maybe that's a mistake. Keep". A stored-shape question, so it waits for the next format
  bump.
- GW-61 **What "rollback" means** (TODO.md, the Coach 2026-10-26): the watermark, the device-record
  format rule, `vault_epoch` and `stale_write` each guard a different "going backwards"; one
  definition, then names. GW-24 (the damaged tombstone's counter) is a case of it.
- GW-62 **The vaultDB closest to the database owns validation** (TODO.md *Loud*): the facades re-check
  what their inner VaultDB checked. Settle after the catchsweep's verb rewrites (GW-27 says when).
- GW-63 **Tree shaking** (TODO.md *Optimizations*): `zod/mini` in the small entries alone, only if the
  standard bundle does not grow.
- GW-64 **The React lifecycle** (TODO.md): the caveat stays in `safebyok-react`'s README; the
  `set-state-in-effect` suppression is still at `bank-provider.tsx:312`. "Don't need a fix, do need
  the caveat."
- GW-65 **Accessibility** (TODO.md): the `created_elsewhere` advice under VoiceOver before 1.0;
  `aria-describedby` is already used in four places, so the fix, if needed, is one attribute.

## TODO.md *Soonish*, carried as written

Each has its design question named in TODO.md; none has moved since 2026-10-26.

- GW-66 Which wayins a rotation keeps; tombstone vaults and whether `vault_tok` is a check;
  `del()`'s edge cases; lock timing versus work in flight (three scenarios left, the newest from
  #312: a lock landing during a call's opening hello is not refused); the passphrase asked again
  once a vault has a passkey (G530); a passkey made for a refused `putWayin`; identity not tied to
  the backing database; changing a vault's scope means a new vault; a throwing `requestCleartext`
  always 'unexpected_error' (and its `del()` case from #312); "sensitive" and "host" flags on
  refusals (security.md l.2148 still says "still open"); redaction with batteries included; a
  redacting or wrapped logger for what touches key material; `vault.probe`; call-time work composed
  once; a wayin change racing this handle's refresh; cross-device invalidation by a token
  (security.md l.853 and l.966 point here); a "newer, don't touch" state for boxes; capacity on the
  Vault object; the stamp as a VaultDB parameter; whether `damaged_lease` calls `lock()`; "whisper
  unchanged" in `putBox`; who holds the lease's expiry; a policy for asking every time.

## TODO.md *Potential Optimizations*

- GW-67 A storage read begun before a create can undo it: "apologize for bad UX, keep control flow
  clean" (the Coach, 2026-10-21).

## NOTYET.md and RAGEBAIT, carried as written

- GW-68 Lock out a device; a passphrase hint; a `-utils`/`-bestpractices` package; the React binding
  under real assistive technology; a conflict handler; the Postgres adapter's own tests on a real
  server; one sentence per refusal. RAGEBAIT: storing without a sidecar keeps the old one; the
  demo's App tests depend on order.

## From the primitives sprint, flagged and not built

- GW-69 The conditional delete the DeviceDB does not have, so a revocation drops and does not erase
  (`revised-outcomes.md`, *What a read takes up*; `primitives-toldjaso.md` 1, 13, 14): a restored
  backup that rolls back boxes alone goes unnoticed; a refresh begun before a local box write puts
  the old entry back. Each waits on the rollback definition (GW-61) or the invalidation token.
