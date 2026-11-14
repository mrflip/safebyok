# eslint-plugin-jsdoc: what it holds against our doc blocks

For the Coach, 2026-11-05. A trial in a throwaway worktree; nothing was committed and the worktree has been removed.

* **Plugin**: `eslint-plugin-jsdoc@65.4.2`. That is the newest release past `minimumReleaseAge`; 65.4.3 is twelve days old.
  Its peer range is `eslint ^7 || ^8 || ^9 || ^10`, and it loaded in our flat config with no shim.
* **ESLint** 10.13.0, **typescript-eslint** 8.72.1, TypeScript 6.0.3, node 24.21.0.
* **Commit evaluated**: `origin/main` at `fa7ff8e5` (merge of #498), the tree the reform's counts come from.
* **Method**: each rule was run alone at `error` on `packages/safebyok/src` (41 files, 765 doc blocks), through a minimal
  config holding only that rule, so each count is clean. The recommended set was then run whole inside the real
  `eslint.config.mjs`. Scratch files held the Coach's sample blocks and a set of negative controls (a bare `/**`, a
  refusal catalog, empty blocks, undocumented exports, a dangling `{@link}`). Every control fired and every sample passed.
* **Docs**: the npm tarball does not ship `docs/rules/*.md`. The README links to them, but they exist only on GitHub. The
  option names below come from the installed rules' own JSON schemas (`src/rules/*.js`), which are authoritative for 65.4.2.

## The draft's guesses, checked

* `publicOnly`, `contexts`, `require`, `mainDescription` (string, or `{ match, message }`), `message`: all exist as guessed.
* **`noZeroLineText` does the opposite of what 3c wants.** It *refuses* text on the `/**` line. Its default is already
  `true`, and so is `flat/recommended`'s, so the default produces **89 hits on src**: every multi-line block whose
  first line rests on the `/**`. The plugin has no option that refuses a bare `/**`. The plugin's `no-restricted-syntax`
  can, with a selector on the parsed comment: `JsdocBlock[delimiterLineBreak="\n"]`. It has 0 hits on src today
  (rg agrees), 29 in `tests/test-helpers*`.
* AST selectors as `contexts` all work: `TSTypeAliasDeclaration`, `TSInterfaceDeclaration`, `TSPropertySignature`,
  `TSMethodSignature`, `PropertyDefinition`, child combinators, and `:not(:has(...))`. Two catches:
  * `publicOnly` filters a bare `VariableDeclaration` context only loosely: 265 hits, locals included. Name the export
    in the selector instead: `ExportNamedDeclaration > VariableDeclaration`.
  * `publicOnly` exempts `private`, `#private` **and `protected`** methods. Storable's protected surface needs no block
    under it.
* The draft's catalog regex `'[a-z_]+'` gets **3 hits on src, all false positives**. Each is an option value, not a
  refusal kind: `'gone'`, `'full'`, `'sparse'` at storable.ts:224; `ifAbsent: 'fail'` / `'nil'` at listing.ts:155 and
  vault.ts:311. Requiring an underscore (`'[a-z]+_[a-z_]+'`) gives 0 false positives and still fires on the controls.
  It misses the four one-word kinds (`'declined'`, `'passphrase'`, `'camped'`, `'disabled'`). Today's src has **no
  catalog left in a member's main description**: 0 hits.

## Recommended configuration

```js
// packages/safebyok/eslint.config.mjs
import jsdoc from 'eslint-plugin-jsdoc'

  // == [Doc blocks] ==
  // STYLE.md *Comments and doc blocks*: only rules that remove content or fix the shape; no count caps.
  {
    name: 'safebyok/doc-blocks',
    files: ['src/**/*.ts', 'tests/test-helpers.ts', 'tests/test-helpers/*.ts'],
    plugins: { jsdoc },
    rules: {
      // #a-helper-gets-a-phrase: every export has a block -- functions, classes and their public methods, consts,
      // type aliases (one derived by `typeof`, beside the const or checker it names, is exempt), interfaces.
      'jsdoc/require-jsdoc': ['error', {
        publicOnly:        true,
        enableFixer:       false,   // the fixer inserts an empty block, which no-blank-blocks then refuses
        checkConstructors: false,   // the class doc covers it
        require:  { FunctionDeclaration: true, ClassDeclaration: true, MethodDefinition: true },
        contexts: [
          'ExportNamedDeclaration > VariableDeclaration',
          'ExportNamedDeclaration > TSTypeAliasDeclaration:not(:has(TSTypeQuery))',
          'ExportNamedDeclaration > TSInterfaceDeclaration',
          'TSMethodSignature',
        ],
      }],
      // The first line rests on the /** (never a bare /** on its own line), so the block reads with the code folded.
      'jsdoc/no-restricted-syntax': ['error', { contexts: [{
        comment: 'JsdocBlock[delimiterLineBreak="\\n"]',
        message: 'The first line rests on the /**, so the block reads folded: STYLE.md, Comments and doc blocks',
      }] }],
      // The same shape at the other end: a multi-line block closes on a line of its own. noZeroLineText must be false:
      // its default, true, refuses exactly the first-line-on-the-/** shape the house writes.
      'jsdoc/multiline-blocks': ['error', { noZeroLineText: false, noFinalLineText: true }],
      // #no-refusal-catalog: no two quoted snake_case kinds in a member's description; class and module docs are not listed.
      'jsdoc/match-description': ['error', {
        mainDescription: {
          match:   "^(?![\\s\\S]*'[a-z]+_[a-z_]+'[\\s\\S]*'[a-z]+_[a-z_]+')",
          message: 'A doc block names no refusal catalog; one kind a caller branches on may stay: STYLE.md #no-refusal-catalog',
        },
        contexts: ['MethodDefinition', 'FunctionDeclaration', 'VariableDeclaration', 'PropertyDefinition',
                   'TSPropertySignature', 'TSMethodSignature'],
      }],
      // #name-the-act: a block opens with its sentence, not with a tag; and a block is never empty.
      'jsdoc/require-description': ['error', { contexts: ['any'] }],
      'jsdoc/no-blank-blocks':     'error',
      // #three-questions: a block that only restates the member's name says nothing a caller needs.
      'jsdoc/informative-docs':    'error',
      // The {@link} bullet and #point-dont-redefine: a {@link} names something in scope in its file.
      'jsdoc/no-undefined-types':  'error',
      // The @param/@returns bullet: no {Type} in a tag (TypeScript holds the types), and no misspelt or invented tag.
      'jsdoc/no-types':            ['error', { contexts: ['any'] }],
      'jsdoc/check-tag-names':     ['error', { typed: true }],
      // Later lines start with ` * `, aligned under the first asterisk.
      'jsdoc/require-asterisk-prefix': 'error',
      'jsdoc/check-alignment':         'error',
    },
  },
```

The block goes before `safebyok/untyped-config-files`. Land it at `warn` and sweep, then `error`, as 3c says.

**Run whole, inside the real config: 281 hits on src, all three of the plugin's rules that fire, 0 hits from any other
rule.** `require-jsdoc` 277, `no-undefined-types` 2, `multiline-blocks` 2. Every hit is a true one, so **no
`eslint-disable` is needed anywhere in src.** On `tests/test-helpers*`: 70 hits (39 missing blocks, 28 bare `/**`,
3 dangling links).

The 277 missing blocks break down as:

| Kind | Hits | Example |
|-|-:|-|
| Exported `const` (throwers 69, phrases 21, checkers, enums) | 139 | throwers.ts:44 `export const insecureContext = (): VaultError => ...` |
| Public method or getter of an exported class (getters 21) | 92 | bank.ts:65 `get vaultListing()`; vault.ts:164 `tryUnlock()` |
| Exported type alias not derived by `typeof` | 35 | vault-db-new.ts:24 `export type GotAct = 'got' \| 'gotvoid' \| 'gotgone'` |
| Exported class | 7 | bank.ts:27 `export class Bank`; proving.ts:122 `PassphraseProving` |
| Interface method signature | 3 | basederiver.ts:10, `KeyDeriver`'s methods |
| Exported interface | 1 | basederiver.ts:6 |

The other four:

* `no-undefined-types` at shapes-gateish.ts:24, `{@link wayinKindVals}`: the const lives in shapes-enums.ts, unimported.
* `no-undefined-types` at storable.ts:219, `{@link lifeTokPathOf}`: a protected method, which STYLE.md says goes in
  backticks.
* `multiline-blocks` at vault.ts:171 and :408: text before the closing `*/`.

## Per-rule table

Counts are on `packages/safebyok/src` at `fa7ff8e5`, each rule alone.

| Rule | Options tried | Hits | What it forces | Verdict |
|-|-|-:|-|-|
| `require-jsdoc` | as recommended | 277 | A block on every export (table above) | **Adopt.** Wanted (1). |
| ″ `+ TSPropertySignature` | context | +126 | A block on every field of every exported object type | Reject: fields are named and typed; blocks on them would restate the name |
| ″ `+ PropertyDefinition` | context | +58 | A block on every public class field (`readonly clock: Clock`) | Reject, same reason |
| ″ constructors | `checkConstructors: true` | +7 | A block on `constructor(opts)` | Off: the class doc covers it |
| ″ derived types | without `:not(:has(TSTypeQuery))` | +63 | `/** A Damagekind. */` above `type Damagekind = typeof damagekindVals[number]` | Exempt: a block there would restate its neighbour |
| ″ default | `{}` (functions only) | 0 | Nothing: src has no undocumented `function` declarations, it uses arrow consts | Inert as shipped |
| `no-restricted-syntax` | `JsdocBlock[delimiterLineBreak="\n"]` | 0 | Nothing today. Refuses a bare `/**`, the next draft's included | **Adopt.** Wanted (2). |
| `multiline-blocks` | `noZeroLineText: true` (default) | 89 | Moving every resting first line down off the `/**` | **Reject the default:** it fights the house shape |
| ″ | `noZeroLineText: false` | 2 | Moving text off the `*/` line (vault.ts:171, :408) | **Adopt** |
| `match-description` | draft regex `'[a-z_]+'` | 3 | Nothing true: all 3 are option values | Reject the draft regex |
| ″ | `'[a-z]+_[a-z_]+'`, member contexts | 0 | Nothing today. Fires on a catalog; class and module docs pass | **Adopt.** Wanted (3). |
| ″ | default regex (capital, final `.`) | (fights the samples) | A full stop at the end of every description | Reject |
| `require-description` | `contexts: ['any']` | 0 | Nothing today. A block that opens with a tag is refused | **Adopt** (4) |
| `no-blank-blocks` | default | 0 | Nothing today. Refuses `/** */` and `/**\n *\n */` | **Adopt** (4) |
| `informative-docs` | default | 0 | Nothing today. Refuses `/** The record shape. */` on `RecordShape` | **Adopt.** The guard `require-jsdoc` needs |
| `no-undefined-types` | default | 2 | Fixing two dangling `{@link}`s | **Adopt.** It holds STYLE.md's `{@link}` rule |
| `no-types` | `contexts: ['any']` | 0 | Nothing today. Refuses `@param {string} x` | **Adopt.** It removes content |
| `check-tag-names` | `typed: true` | 0 | Nothing today. Refuses `@return`, `@note`, and `@typedef` in TS | **Adopt** (4): tag hygiene |
| `require-asterisk-prefix` | default | 0 | Nothing today. Every later line starts ` * ` | **Adopt.** The sample shape |
| `check-alignment` | default | 0 | Nothing today. Asterisks in one column | **Adopt.** Fixable, no pressure |
| `no-multi-asterisks` | default | 1 | errors.ts:9, a ` * * **Misuse**` bullet: refuses STYLE.md's `*` bullets | Reject the default |
| ″ | `allowWhitespace: true` | 2 | The same two lines `multiline-blocks` reports, reported again | Reject: adds nothing |
| `no-bad-blocks` | default / `ignore: ['__PURE__', …]` | 1 / 0 | The 1 is `/* @__PURE__ */` (argon2id-webv1.ts:19) | Reject: `require-jsdoc` already catches a single-star block |
| `check-param-names` | default | 5 | All 5 are subsets that STYLE.md allows (`@param` only where it adds) | Reject |
| ″ | `disableMissingParamChecks: true` (and `checkDestructured: false`) | 1 | crypto.ts:183, a false positive: it reads the object-typed 4th param `usages` as destructured | Reject: it would need an `eslint-disable` |
| `tag-lines` | default / `'any'` | 71 / 0 | No blank line before the first tag | Reject: a layout choice STYLE.md never made |
| `no-blank-block-descriptions` | default | 16 | The same, from the other side | Reject, same reason |
| `sort-tags` | default | 6 | No blank line between a `@param` and an `@example` | Reject, same reason |
| `check-indentation` | default | 5 | Unindented `@param` continuations; would refuse STYLE.md's two-space nested bullets | Reject |
| `check-line-alignment` | default | 4 | A particular wrap indent on `@param` continuations | Reject, same reason |
| `require-description-complete-sentence` | default | 11 | A capital and a final `.` on every description and bullet | Reject: fights 3 of the 4 samples, and is punctuation, not content |
| `text-escaping` | `escapeHTML` / `escapeMarkdown` | 2 / 378 | `&lt;` for `Promise<…>`; no backticks at all | Reject |
| `convert-to-jsdoc-comments` | `enableFixer: false` | 6 | Turning `//` reason comments into `/** */` | Reject: fights `#reason-goes-above` |
| `lines-before-block` | default | 0 | Nothing; a `//` comment directly above a block passes | Leave off: no gain |
| `require-param` / `require-returns` | default | 420 / 288 | A narrated `@param`/`@returns` on every function | **Reject**: the slop itself |
| `valid-types`, `check-types`, `check-syntax`, `empty-tags`, `escape-inline-tags`, `normalize-see-links` | default | 0 each | Nothing | Leave off: no types in our tags to check |
| `flat/recommended-typescript` preset | whole | 874 | require-param 420, require-returns 288, multiline-blocks 89, tag-lines 71, … | **Never extend a preset**; name each rule |

## Rejected rules

* `multiline-blocks` with `noMultilineBlocks`, `minimumLengthForMultiline` or `requireSingleLineUnderCount`, and
  `tag-lines` with `maxBlockLines`: count caps.
* `multiline-blocks` at its defaults (`noZeroLineText: true`): refuses the house shape, 89 hits.
* `require-param`, `require-returns`, `require-throws`, `require-example`: they force narration and catalogs.
  `require-throws` is a refusal catalog in tag form.
* `require-description-complete-sentence`, and `match-description` at its default regex: punctuation policing that fails
  the Coach's own samples.
* `check-types`, `valid-types`, `require-param-type`, `require-returns-type`, `no-undefined-types` for `@param {T}`: type
  nagging that TypeScript covers. We keep `no-undefined-types` only because it also checks `{@link}`.
* `tag-lines`, `no-blank-block-descriptions`, `sort-tags`, `check-indentation`, `check-line-alignment`: layout rulings
  STYLE.md has not made. Two of them would refuse its nested bullets or wrapped continuations.
* `text-escaping`: escapes the Markdown and generics a reader needs to see.
* `convert-to-jsdoc-comments`: turns a maintainer's `//` reason into a doc block.
* `check-param-names`: one false positive that only an `eslint-disable` would clear.
* `no-multi-asterisks`, `no-bad-blocks`: false positives on STYLE.md bullets and `@__PURE__`, and nothing beyond what
  the adopted rules already catch.
* `require-jsdoc` on `TSPropertySignature` and `PropertyDefinition`: 184 blocks on fields, each an invitation to
  restate a name.

## The Coach's sample blocks

The samples were placed in a class in a scratch `src/` file, with `isEnabled` in scope.

| Sample | Recommended set | Rules that fight it |
|-|-|-|
| `/** Vault **or tombstone** listed at `scope`, null if absent. */` | pass | `text-escaping` (escapeMarkdown) |
| A multi-line block, first line on the `/**`, later lines ` * ` | pass | `multiline-blocks` default (no text on the 0th line); `require-description-complete-sentence` and default `match-description` (no final `.`); `text-escaping` |
| `@see \`sealedRecordOf\` in models/box.ts for what "encrypted" and "sealed" imply` | pass | `text-escaping` (backticks in a tag). `valid-types` and `check-tag-names` accept free text after `@see` |
| ` * - \`ifPresent:fail\` (default): ...` bullets after the `@see` | pass | `require-description-complete-sentence` |
| `{@link isEnabled}`, `{@link Bench.create}` | pass | none. `no-undefined-types` resolves both, and refuses `{@link nowhereAtAll}` |
| `// reason` on the line above a block (#reason-goes-above) | pass | `convert-to-jsdoc-comments` would fight it if ever enabled. `lines-before-block` does not |

One quirk with no fix: comment-parser files every line after a tag under that tag. So in the `create` sample, the
bullets belong to the `@see`, not to the main description, and the catalog rule reads only the main description. A
catalog written as bullets under a tag escapes it. `tags: { see: …, param: … }` could extend the regex to those tags if
that is ever wanted.

## Opinion

The changes this set forces are good. They are also almost all one change. Of the 281 hits, 277 are missing blocks,
and they come in four piles:

* **Throwers** (69): one-line arrow consts whose name and phrase are the whole contract. Each wants a true sentence,
  such as `/** Refuses a vault call made before Bank.hello. */`. That sentence is useful, and it puts the thrower's
  kind where 3a says it belongs.
* **Public methods and getters of the models** (92): real API with no block. This is the debt the rule exists for.
* **Hand-written exported types** (35): mostly answer and option types in vault-db-new.ts and shapes-vaultish.ts, which
  a caller does read.
* **Phrases.ts strings** (21): the one place I think the rule is wrong. The string is the message; a block above it can
  only say "the message for an insecure context". Exempt that file or not: an open question below.

The other four hits are true faults: two dangling links, and two blocks closing on a text line.

Nothing in the set measures length, and nothing pushes toward compression. `informative-docs` stands against the
opposite failure, the padding a forced block invites. It is weak, though: it catches only a block made of the name plus
`a`/`the`/`of`. `/** The phrase for an insecure context. */` passes.

The plugin is blind to everything in section 1. It parses tags, not sentences, so a gapped list, a verbless lead, a
participial absolute, the stand-in "one" and the reason chain all pass. The single content rule it can host is a
regex on the main description. That regex can catch quoted kinds; it cannot catch a semicolon chain without becoming
the semicolon ban 3c rightly refused. `#name-the-act`, `#purpose-not-path` and `#purpose-not-machinery` stay with
reviewers.

On maintenance: the plugin is the boring choice. It has existed since 2015, has 905 releases and about 7.8M weekly
downloads, and supports ESLint 10. It is also fast-moving: 65.0.0 shipped on 2026-09-28, with six releases in the last
three weeks. Expect majors every few months through Dependabot, and expect option semantics to drift; its own source
notes a stale schema default for `exemptEmptyConstructors`. Its docs are not in the tarball, so an agent checking an
option must read the rule's schema in `node_modules` or go to GitHub. It adds 16 transitive dev dependencies.

On speed: the 12 rules cost about 0.44 s of rule time, of about 3.5 s for the whole src lint (wall 5.8 s). Of that,
0.21 s is `no-undefined-types`, which walks scope for every `{@link}`. `sonarjs/deprecation` alone costs 0.83 s.

On interaction: the house already turns off `unicorn/no-asterisk-prefix-in-documentation-comments` and
`unicorn/single-line-block-comment-style`. If either came back on, it would contradict `require-asterisk-prefix` and
the one-line block. A comment on each should say so. No `@stylistic` comment rule is on, so nothing collides there.

## Open questions

1. **Phrases**: should `src/helpers/phrases.ts` be exempt from `require-jsdoc` (21 hits)? The string is its own
   documentation and the module doc covers the file. I lean towards exempting it with a files-level override.
2. **Getters** (21 of the 92 method hits): `get snapshot()`, `get subscribe()`. Keep them in, as the rule does by
   default, or `checkGetters: false`? I lean towards keeping them: they are public API.
3. **Protected members**: `publicOnly` exempts them, so Storable's subclass surface needs no block. Add
   `'MethodDefinition[accessibility="protected"]'` to `contexts` if it should.
4. **The catalog regex**: requiring an underscore misses the four one-word kinds. The exact alternative is an
   alternation built from `refusalKindVals`, read into the config. That is exact, but the config would then depend on
   src. I recommend the underscore form.
5. **First-sentence shape** (4): a third-person lead on a function (`Stores`, `Refuses`, `Demands`, `Returns`, 16 verbs
   tried) gets 10 hits through `match-description`, against the imperative `Create a new box`. It is a word list, and
   3a does not yet say imperative. Rule on the mood first; it could then land at `warn`.
6. **Tests**: apply the set to `tests/test-helpers*` (the published `safebyok/testing` entry; 70 hits)? The draft's
   `vitest/valid-title` `mustNotMatch` with `'[a-z_]+'` gets 250 hits on tests. With `'[a-z]+_[a-z_]+'` it gets 203.
   It needs `allowArguments: true`, or the bulk case lists' variable titles add 10 `titleMustBeString` hits. That is
   the reason the rule is off today.
