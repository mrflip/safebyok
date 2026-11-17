# Thread 4: docs_rulings (2026-10-16)

Branch `20261016-docs_rulings`, PR [#101](https://github.com/mrflip/safebyok/pull/101), cut from main. Justify: green, 9 test suites (documents only; an empty changeset).

* **Built**: in `TODO.md`, under *Soonish* ahead of *Pluggable label validator*, the Coach's question
  "What exactly are we guaranteeing with these validators..." as a heading, with a line each for
  refused text reaching `snapshot.boxes` (#93, "no changes"), control characters in notes, lone
  surrogates, server-side names taken as any text (#95) and `unlocklabel` with no validator slot
  (#95). Also under *Soonish*: *Group error messages?*, *Storing over a damaged box can race*,
  and *Does Convex need a `getUserId` of that name?* (the Coach's question verbatim). A new
  section, *Rulings from gripes_part2*, before *Sand in the sandals*, lists the four no-thread
  rulings. `STYLE.md`, *Tests*: a helper named `expect...` must assert, or take another name.
* **Decisions taken**: *Pluggable label validator* and *Validating the user id* stay where they
  are, untouched, and the new entry says they are the same question for two fields. The plan said
  to fold them in "if the same question", and "move, don't rewrite"; moving them would have made
  a large non-additive hunk in a file other sessions edit. Folding them is a two-minute move.
* **Deviations**: none otherwise. Every TODO hunk is additive; nothing was added to *NOT YET*.
* **Discoveries**: the lint rule behind the `expect*` convention is `vitest/expect-expect` with
  `assertFunctionNames: ['expect*', 'TH.expect*']` in `packages/safebyok/eslint.config.mjs`.
* **For the Coach**: the lines about control characters, lone surrogates and the Convex setup check
  are written for the code threads 1 and 2 build; if either lands differently, correct the line.
