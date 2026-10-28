# The sweep: rules from the Coach (2026-10-27)

Round 2 of thread `validator_ducks`. The Coach, on the first round:

> I intend validators to be the principal means of, in one line, extracting and validating local
> data. [...] The point is that 95% of preconditions and argument remixing seem to be well handled
> by the parsing validator, so just make it the norm. Don't write if-then statements except where
> truly unique; don't write hand-picks where there's a defined schema.

> the goal is that it accepts everything legitimately offered. We have validation up the wazoo.
> There are a few number of places where the validation is actually useful and a strict field
> check is necessary. The reason we're doing this is to reduce code and the cognitive burden of
> analyzing it.

> The goal is not to simplify maintenance of that file, it's to be perfectly clear to a developer
> who has hit a validation error.

> We've had no public release -- this is part of tightening our interface for that. Our goal is
> clarity and simplicity because safety follows from those.

## What that means at a site

* **A precondition is one line**: `const { a, b } = Schema.parse(thing)`, using a schema that
  already exists in `src/shapes/` (or a module-level `Validator` call beside the function when
  none fits). At most a one-line specific check beside it, for a rule Zod does not express or a
  comparison with what the callee holds.
* **No hand-picks where a schema exists.** `{ applabel: x.applabel, user_id: x.user_id,
  vaultlabel: x.vaultlabel }` is `vaultScope.parse(x)`; `{ vault_tok: x.vault_tok, gate_epoch:
  x.gate_epoch }` is `VaultRecordExpectation.parse(x)` (or whichever shape names it).
* **No if-then precondition** (`if (typeof x !== 'string') throw ...`, `safeParse` then throw a
  sentence of its own) where a schema's `parse` says the same. The `Validator` message names the
  failing field and what it expected: that is the message a developer should see. Where the kind
  must differ from the schema's own call's, make the schema again in a module-level `Validator`
  call of that kind (a wrapped schema re-wraps cleanly: check it).
* **Shapes taken from a thing strip** (scope, stamp, sparse): a Vault object, a record, a snapshot
  all pass. Records stay strict. `BoxStamp` is strict on purpose. `vaultBag` refuses only a store.
* **Catches.** A catch that only re-kinds or re-words a refusal the caller already gets in a
  usable kind goes. A catch that names the call a host made (`Bank.make's options: ...`) may stay
  as one line. A catch that zeroes secrets, maps damaged storage to `damaged_*`, keeps a
  passphrase out of an error, or moves state stays.
* **A parse that serves no purpose goes**: one whose result is discarded and whose input was
  already parsed where it entered the package, or which checks fields the callee never reads.
  A check whose vacuity is in any doubt stays.
* **Pre-1.0: no compatibility.** A refusal's kind or message may change. Update the tests to
  assert the new behaviour (never loosen a check to keep an old test), and list each change a host
  could see in your report, for the changeset.
* **Hands off** (thread `vault_params` is rewriting them): in `vault.ts` `#readBox`, `#boxUnder`,
  `#storedBase`, `#updateBoxListingOf`, the lease take-up and lease-in-force checks, `#damagedBase`
  and the `vaultTok` parameter on the box path; `proving.ts` `#unwrap`; `gating.ts` `#gatedOf`;
  `bank.ts` `vaultPartsOf`. Imports in those files are fine.
* **Don't delete a sentence from `phrases.ts`** even if it goes unused; the merge does that.
* STYLE.md: *Validation*, *Shapes and duck typing*, *Comments and doc blocks*, *Tests*. Every doc
  block you touch still says what a caller is told.
