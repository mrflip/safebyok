# Thread 1: react_fruit (2026-11-22)

Branch `20261122-react_fruit`, stacked on #817 (`20261122-react_targets`). Proved: see the PR's **Tests:** line.

Five small fixes in `packages/safebyok-react-lean`, one commit each (the dependency change its own `deps:` commit).

* **Built**
  1. `WhisperText`: the two spans carry different `key`s, so Hide unmounts the one holding the text. New test (an element as `masked`) failed before the fix.
  2. React 19.0 floor: `useEffectEvent` comes from `use-effect-event` (2.0.4, modified 2026-08-27) in `useStageChange` and `WhisperMask`. Peer and dev dependency of `safebyok-react-lean`, a dependency of both demos; `react` and `react-dom` peers are `^19.0.0`. `react-hooks/exhaustive-deps` still recognises the imported hook (probe: a plain closure called in an effect is flagged, `useEffectEvent`'s is not).
  3. `'use client'`: tsdown's `banner` option (a function of `fileName`) puts it on the six built entry files; `testing` and the shared chunks have none.
  4. `takeField(form, fieldname)` in `src/giver/take-field.ts`, exported from the root, validating both arguments; `form-action.ts` imports it; `useUnlock`'s `@example` uses it. `tests/giver/take-field.test.ts`.
  5. `PutBoxActionResult.err` is an `Error`: `putBoxAction` passes what it caught through the core's `sanitizeForeignError` (from `safebyok/storage`). Demo casts removed.
* **Decisions made**
  * Item 3: a source-level `'use client'` survives the build (the first line of all six files was the directive) but rolldown warns `MODULE_LEVEL_DIRECTIVE` on each entry, and `failOnWarn: 'ci-only'` fails `CI=true pnpm build` on it. rolldown has no `checks` switch for it. So the source files carry none and `tsdown.config.ts` carries the `banner`.
  * Item 5: the core already exports `sanitizeForeignError`, so no second helper. Its wrapping differs a little from the handoff's wording: a thrown string becomes `new Error(string)` with no `cause`, and null/undefined an Error with a fixed message and no `cause`; any other value is wrapped with it as `cause`.
  * Item 4: `fieldname` is `str.min(1)`, as `useDraft`'s is; an empty fieldname now refuses `bad_record` in `formActionOf` too, where it used to read a field named ''.
* **Deviations**: item 3 (banner, not a source directive) and item 5 (string and null cases) above.
* **Discoveries**
  * Nothing else in `src` needs React later than 19.0: imports are `createContext`, `useContext`, `useCallback`, `useEffect`, `useMemo`, `useRef`, `useState`, `useSyncExternalStore`, `useId`, `useFormStatus`, `flushSync`; ref cleanups, `ref` as a prop and `useActionState` are 19.0.
  * `tests/giver/knock-knock.test.tsx` keeps a private `takeText` of its own, the same as the one that moved; left alone (no tidying).
  * A later regression of item 3 is caught by nothing today. Cheapest durable check: a `postbuild` script in the package, `node -e` reading the first line of the six files and exiting 1 unless it is the directive; not built.
* **For the Coach**: whether `takeField` should refuse an empty `fieldname` (a `FormData` may name one), and whether to add the `postbuild` check.
