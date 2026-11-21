# Thread 4: giver_boxes (2026-11-21)

Branch `20261121-giver_boxes`, PR #801, stacked on #799. Proved: `safebyok-react-lean` lint, typecheck, test (3 files, 102: `react-giver` 87, `react-bridge` 9, `knock-knock` 6).

* **Built** (`packages/safebyok-react-lean/src/giver/`)
  - **One query factory**, `boxQueryOf(userid, labelpath)` in `makeBankGiver`, over `boxQueryBaseOf` (key, fetch, defaults) plus `select: nullifyThing`. Three doors onto it:
    - `Knock.useBox(labelpath, opts?)`: `useQuery` with the userid `useShownSnapshot` shows. `data` is the live record (whisper sealed), null for nothing stored or deleted, undefined while pending or signed out. `opts` are React Query's and override ours; a host `select` gets the whole item (record, tombstone, shell).
    - `Knock.boxQuery(labelpath)`: the slot's userid when called, for loaders and prefetches.
    - `SOK.useQueryOptions()`: `{ [banklabel]: { box(labelpath) } }`, memoized on the shown userid, typed by the config's banklabel (`reactGiver` is now generic over it, so `sok.knock.box` typechecks).
    - Signed out: key `['sok', null, banklabel, 'box/<lp>']`, `queryFn: skipToken`; `queryClient.query` of it rejects (TanStack's "Missing queryFn").
  - `Knock.keys`: `box(labelpath)`, `under(labelpath?)` (the item key less its `'!'`; no labelpath: every box), reading the slot when called.
  - `nullifyThing` (`giver-defaults.ts`, exported from the package): tombstone or shell → null, sparse → undefined, live → itself.
  - Writes, each one try, each `await device.hello()` then `slot.demandVault()`: `putBoxOnce(boxNamed, patch, secrets)`, `delBox(boxNamed)`, `putBoxAction(boxNamed, { whisperOf, sidecarOf? })`. `BoxNamed` is a host labelpath or a scoped object (a record); either way only its labelpath is used, and the write cites the newest revision the minder has heard of, as the dream says. A locked bank refuses `bank_locked` (no waiting for the unlock form, unlike `withWhisper`).
  - **How `putBoxAction` is wired to a form** (for thread 7): `const [result, putAction, isPutting] = useActionState(Knock.putBoxAction('jokes', { whisperOf: (form) => ({ apiKey: form.get('apiKey') as string }), sidecarOf: (whisper) => ({ mask: … }) }), null)`, `<form action={putAction}><WhisperInput name="apiKey" />…</form>`. Make it at module scope or under `useMemo`. It never rejects: `result` is `{ box, error: null }` or `{ box: null, error }` (`PutBoxActionResult`), `error` a refusal or what the host's callback threw, as thrown. It reads both callbacks, then **empties every field of the FormData** before its first await (in a `finally`, so also when `whisperOf` throws). `sidecarOf` left out keeps the stored sidecar; a new box then refuses for want of one.
  - Deleted: `old-giver.ts`, `minder-bank.ts`, `bridgeDevice`, the `GiverDevice`/`GiverBank` types and `Checks.device` in `shapes-giver.ts`, `bankQueryKey`, `shownRecordOf`, `fake-giver-world.ts`, `minder-giver-world.ts`, `old-giver.test`, `minder-giver.test`. `useBoxRecord` is gone (the dream does not name it); knock-knock uses `useBox`.
  - Provider world (`tests/test-helpers/provider-world.ts`): `isWatching: false`, `counts.gets`, `pauseGets`, `pauseAnswers`, and `_cheat_device()` (a spy on `Device.make`), so a test can `minder.list('box')`, which no hook does yet.

* **Ported and retired**
  - `react-bridge.test` (9, new over the provider world): newer revision without a get; `dataUpdatedAt` is when the minder heard (clock mocked to tick per read); stale and still showing the older record while a listed newer one is fetched; a refused get invalidates without refetching; nothing copied into an item no hook made; four orders of late answer vs watch/list news.
  - `old-giver.test`'s `useBoxRecord`/`boxRecordQueryOptions` cases became `useBox`/`boxQuery` cases in `react-giver.test`.
  - Retired: `giverBankOfMinder`/`giverBankOfVault` cases (code gone); the bridge's bank-end reset, unmount stop, catch-up-on-start and removal cases (bridge starts before any get and never stops; nothing ends); the order cases' "bridge starts" step.

* **Decisions made**
  - **Every field emptied, not only those read.** Tracking which fields `whisperOf` read needs a FormData wrapper; emptying all is one loop and cannot miss a field. Cost: `useFormStatus().data` shows nothing while the write runs. Thread 5's `formActionOf` (private) does the same job for gate forms; a later thread may share one helper.
  - **`putBoxAction` resolves, never rejects**: a rejection from a `useActionState` action goes to the error boundary.
  - **`under` covers items only.** Item keys put the kind before the labels, so one prefix cannot also cover listings. Thread 8, adding list keys, must invalidate both (two calls, or a predicate). With flat labelpaths `under('jokes')` covers only `jokes`.
  - **No `useMutation` behind the writes**: `putBoxAction` is for `useActionState`, and `putBoxOnce`'s secrets must not be a mutation's variables (rule 2). A host wraps `putBoxOnce` in `useMutation` only with the whisper made inside `mutationFn`.
  - `useBox` spreads `boxQueryBaseOf` with its own typed `select` rather than spreading `boxQueryOf`: TanStack's generics will not retype the factory's `select` for a host's `SelT` without a double cast.

* **Deviations**
  - The dream's `ensureQueryData` is deprecated in our TanStack (5.107: "Use queryClient.query"); doc examples and tests use `queryClient.query`.
  - "By the time any of these resolves, every useBox showing that box shows what was written": what holds at resolve is that the **host's query** holds it (tested); the hook re-renders on TanStack's next notify tick.

* **Discoveries**
  - **Tracked props in tests**: React Query re-renders a hook only for result fields read in render. A `renderHook` returning the whole result and a test reading only `isSuccess` then never sees `data` change. Read the fields in render (bridge tests destructure) or wait on `data` first.
  - The bridge holds rule 7 (confirmed by #799's review): the host refetch reaches `minder.get` after `await device.hello()`, outside the minder's subscriber. Kept.
  - Box labelpaths are one level (`MaxLabelsUnder.box = 1`): `box/jokes/dad` is not a box.

* **For the Coach**
  - `keys.under` cannot cover listings by one key prefix (above). Recommend a predicate-based `keys.underPred` or two keys when thread 8 lands, rather than changing the minder's key grammar.

* **Looked up**: the plan's thread 4 entry (`rg -n giver_boxes`), the design's *Rules for the hooks* section, the survey's section 5.
