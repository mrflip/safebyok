# 20261115-adapter_loud

## Ruled: the act on a refusal the classifier throws after `replaced`

The Coach ruled `policied`, a bad act of the new core's own (2026-11-15), not `replaced`. Built here: `BadAct` in
`storage/vault-db.ts`, stamped as `meta.act` by `gateIssue` and `demandBornAtKept`, read by `answerForThrown`.

* Caveat: big types `RefusalMeta.act` as its own `BadAct`, so `PoliciedMeta` is cast (`as unknown as Errors.RefusalMeta`).
  A reader of `err.meta.act` typed by big will not expect `policied`.
* The born_at refusal is included: like a policy, it is a demand on the Thing stored, met after the table answers `replaced`.
  Its refusalkind stays `bad_record`.
* Rebuilt on #700 after #701..#704 merged: the stamp is on `demandReplaceable` and on `gateIssue` in `storage/policies.ts`.
