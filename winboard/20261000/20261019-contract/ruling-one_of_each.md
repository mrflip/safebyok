# Ruling: one passphrase, one passkey (the Coach, 2026-10-19), for B4a and B4

*Orchestrator:* the matter, from `one_of_each-design.md`: store the passphrase and the passkey as
two slots of the vault props (`passphrase`, `passkey | null`, format `safebyok-vault-v5`) instead
of a list, dropping way-in ids, labels, `last_wayin` and `too_many_wayins`. Rec: option A, before
B4 builds.

The Coach's answer, word for word (a Coach note):

> The two big problems with the current flat-list-of-wayins: 1) which passphrase, exactly, are we
> requiring on the seven day tempo? 2) what is even the use case for this?
>
> There should be an object that carries { passphraseSomething, passkeySomething?, ...context }:
> each would represent a person, and the seven day prompt is just to prove that at least one
> person knows how to get in. We're not going to serve the use case; I'm justifying why there
> should be a group.
>
> I don't today know yet what the right structure of that object is, and whether it, or the
> passphrase/passkey deserve the name Wayin. I'm certain it won't be Vault in the long term, but
> having Vault be "the object that carries those" for the moment seems harmless; so would having
> vault carry them as a pojo. This should let you carry on with the current table structure.
> If we're wrong that just bodging them on to vault as you propose tenably a minimal code path, my
> second guess is to make two tables, one polymorphic on PassphraseProver/PasskeyProver and the
> other Wayin.

Rulings the same day on the design's questions:

- **Question 1** (can a passkey prove a passphrase change?): "The standard default must be to
  provide old passphrase to get new passkey or new passphrase. Don't know why, but it's how it's
  done everywhere else, and we don't invent crypto." Only the standing passphrase proves a new
  passphrase or a new passkey.
- **Question 2** (a second passkey: refuse or replace?): still open in *Open Matters*, with the
  Rec to replace. *Orchestrator (YOLO):* build replace, a two-way door; the row stands for the
  Coach to overrule.

*Orchestrator's reading:*
- Option A. The vault props carry `passphrase` (required) and `passkey` (or `null`) as plain records, in the existing vault table: the adapters' `wayins` column becomes two columns or fields, and there is no new table.
- The vault turns the records into live instances, per the model convention.
- The Wayin names stay for now. The Coach is unsure the grouping object or its members deserve the name, so don't rename toward a guess.
- Keep the code path minimal. If slots on the vault turn out not to be "tenably a minimal code path", stop and say so: the Coach's second guess is two tables, one polymorphic on `PassphraseProver`/`PasskeyProver` and the other `Wayin`.
