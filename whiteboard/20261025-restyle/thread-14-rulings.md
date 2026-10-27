# Thread 14: Refusals say less; validators go public (2026-10-27)

Branch `20261027-rulings`, PR (draft, number on first push), stacked on
[#286](https://github.com/mrflip/safebyok/pull/286). Justify: green at the first milestone.

* **Built** (so far):
  * Refusals repeat no key or value from their input (`packages/safebyok/src/checks/validator.ts`,
    `phrases.ts`). A field an object does not take is counted, never named, and the refusal lists
    the fields the object takes, read from the schema in the parse's error map
    (`issue.inst.shape`), never from the input. `refusalOf` joins the first eight issues'
    sentences, each prefixed by its path. Gone: `isSayable`, `SnakeFieldname`, `CamelFieldname`,
    `MaxSayableChars`, `sayable`, `UnsaidName`, `FailedItsCheck`, `storesInBag`.
  * `checkMakeBankOpts` is a parse and a catch that prefixes "In Bank.make's options:";
    `RenamedMakeBankOpts` and the pre-scan are gone. `checkBankVaultOpts` likewise.
  * `checkNoStoresIn` and `StoreFieldnamePattern` are gone (`bank.ts`): the vault bag keeps its
    scope and ignores the rest, a store in it included.
  * `optionsCheck` has no `notBagHint`; `hello()` and `ensureUnlocked()` say how to wrap them as
    an event handler in their fixed `said` text, every time.
  * `parseKeyDeriverSpec` refuses with one fixed sentence (`SpecRefused`); `SpecLimitForField`
    is gone.
  * `Wayin.make` parses with `WayinRecord.parse`, so it refuses the schema's own 'bad_record';
    `damagedWayinUnless` is gone.
* **Decisions taken**:
  * **A refusal still names a failing field by its path** (`vaultlabel: A label is ...`,
    `meta.fieldnames`). The audit floated saying every string key as a stand-in; the paths come
    from our fixed shapes, so they are our field names. The one schema that put input keys in a
    path was the whisper bag's `record`: the kit no longer hands out `rec`, and `whisperBag` is a
    `custom` check judging the object whole (a `record` safeParse inside it), so a sidecar's or
    whisper's keys never reach a path. `Whisper` itself never leaked (its union fails at the
    root); `Sidecar` did, one level deep.
  * The box format's JSON Schema snapshot changed with it: the sidecar renders as `{}` (a custom
    is unrepresentable) where it rendered the recursive JSON record. The stored shape is the same,
    so no format bump (the Coach's ruling); the guard no longer sees inside the sidecar.
* **Deviations**: none yet.
