# Thread 4: where_prefix, one parse, said where (2026-10-28)

Branch `20261028-where_prefix`, stacked on #311 (`20261027-proving_tidy`, on main). Justify: not yet run.

## Proposed shape (before building)

Seven sites catch a `Validator` refusal and rethrow its kind with the message re-framed: a lead-in
before the failures (`In Bank.make's options: ...`), a sentence after them (`... . putBox()'s only
option is sidecar.`), or both. Their wording is asserted by tests and must stay.

**Zod offers no hook for this.** Its error maps (`z.config`, a parse's `error`) speak per issue,
and its formatters (`prettifyError`, `flattenError`) lay issues out; nothing frames the one message
our `refusalOf` already composes from the issues. So the framing goes where the message is made,
`src/checks/validator.ts`, not in a catch.

**Not an option on the `Validator` call.** The kind is per call, but the framing is per schema
(`makeBankOpts` and `bankVaultOpts` share a call and say different places) and, for `parseDbName`,
per *parse*: the lead-in names the function the host called (`browserOpts`, `idbDeviceDB`), a
runtime argument. A call-level option could not say it.

**So: the one parse takes a `saying`.** `parse(val, saying?)`, where
`Saying = { where?: string, advice?: string }`:

* `where` -- what was judged, before the failures: `In Bank.make's options: <failures>.`
* `advice` -- what to do, after them: `<failures>. putBox()'s only option is sidecar.`
* both: `In the bag naming the vault: <failures>. That bag holds ...`
* neither: `<failures>`, as today, so no other message changes.

With a saying, the failures end in a period, as every site writes them today. `meta.fieldnames`
is unchanged. The sentence a site adds stays at the site, as it is today; `Phrases` is not
touched. `parseConsistent` takes no saying: no site needs one.

Each of the seven becomes one line, `schema.parse(val, { where })`, and `isVaultError` leaves the
files that imported it only for this. `Refusing<SchemaT>` gains the overload; Zod's own
`parse(val, ParseContext)` is still typed beside it, as it is today, and still ignored.

The two `parseDbName`s stay two files: the core's judges `{ dbName }` strictly for `browserOpts`
and `idbDeviceDB`; `safebyok-indexeddb`'s judges `{ dbName, logger }` and says so in its lead-in.
They share the schema already (`Validators.idbOpts.extend`); what they shared besides was the
catch, which goes. One line each is left.
