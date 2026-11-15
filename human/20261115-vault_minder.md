# vault_minder: open questions on the ThingMinder

PR [#700](https://github.com/mrflip/safebyok/pull/700); design in `whiteboard/20261114-vault_db/design-minder.md`.

1. **A fork: keep one, or serve nothing?** Built as ruled: the incoming record wins, and the scope is asked again.
   Serving nothing until the refresh lands, as a rollback does, would give both impossibilities one remedy, at the
   cost of a cache with nothing to serve for the length of one get.
2. **`ThingMinder` or `VaultMinder`?** Built as `ThingMinder`.
3. **One minder per kind per bank**, each holding its own watch of the bank. The wiring above can share one watch,
   since `receive` is public.
4. **Box ops' listing**: answered in chat that a listing of a tombstone or a void parent answers `gotgone` or
   `gotvoid` with `val: []` under `ifAbsent: 'nil'`; that a refusal's `dbhas` is `[]` under `gone` and `void` and null
   only where the answer is in doubt; and that `dbhas` is never absent.
