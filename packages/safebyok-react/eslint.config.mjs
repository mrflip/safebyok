// eslint.config.mjs -- the React binding's lint, cut from the core's (packages/safebyok/), which is
// the authority on house style: where the two disagree, the core's is right and this one is the
// bug. What this one adds is React's layer (hooks, JSX, accessibility) and .tsx files.
//
import { defineConfig, globalIgnores } from 'eslint/config'
import js                              from '@eslint/js'
import tseslint                        from 'typescript-eslint'
import unicorn                         from 'eslint-plugin-unicorn'
import sonarjs                         from 'eslint-plugin-sonarjs'
import importX                         from 'eslint-plugin-import-x'
import stylistic                       from '@stylistic/eslint-plugin'
import vitest                          from '@vitest/eslint-plugin'
import chaiExpect                      from 'eslint-plugin-chai-expect'
import chaiFriendly                    from 'eslint-plugin-chai-friendly'
import react                           from 'eslint-plugin-react'
import reactHooks                      from 'eslint-plugin-react-hooks'
import jsxA11y                         from 'eslint-plugin-jsx-a11y'

/** Everything we lint. */
const SourceFiles = ['**/*.{js,mjs,cjs,ts,mts,cts,tsx}']

/**
 * Every assertion method `expect` carries in `tests/`, read from vitest's chai registry
 * (`chai.Assertion.prototype`), not from memory: chai's methods and its chainable methods,
 * vitest's chai-style spy methods, and the few Jest matchers STYLE.md allows. Left uncalled at the
 * end of a chain, any one of them asserts nothing.
 */
const ChaiMethods = [
  // chai's chainable methods: a property mid-chain, a method at its end
  'a', 'an', 'contain', 'contains', 'include', 'includes', 'length', 'lengthOf',
  // chai's methods
  'above', 'approximately', 'below', 'by', 'change', 'changes', 'closeTo', 'containSubset',
  'decrease', 'decreases', 'eq', 'eql', 'eqls', 'equal', 'equals', 'greaterThan',
  'greaterThanOrEqual', 'gt', 'gte', 'haveOwnProperty', 'haveOwnPropertyDescriptor', 'increase',
  'increases', 'instanceOf', 'instanceof', 'key', 'keys', 'least', 'lessThan', 'lessThanOrEqual',
  'lt', 'lte', 'match', 'matches', 'members', 'most', 'oneOf', 'ownProperty',
  'ownPropertyDescriptor', 'property', 'respondTo', 'respondsTo', 'satisfies', 'satisfy', 'string',
  'Throw', 'throw', 'throws', 'within',
  // vitest's chai-style spy methods, and its snapshot
  'callCount', 'calledAfter', 'calledBefore', 'calledOnceWith', 'calledWith', 'lastCalledWith',
  'lastReturnedWith', 'matchSnapshot', 'nthCalledWith', 'nthReturnedWith', 'returned',
  'returnedTimes', 'returnedWith',
  // Jest's, where STYLE.md allows them
  'toHaveBeenCalled', 'toHaveBeenCalledOnce', 'toHaveBeenCalledWith', 'toMatchSnapshot', 'toThrow',
]

/**
 * chai's terminating properties past the plugin's own (`ok`, `true`, `false`, `null`, `undefined`,
 * `exist`, `empty`, `arguments`), from the same registry: each asserts on being read, so a call
 * after it is a mistake.
 */
const ChaiTerminators = [
  'callable', 'called', 'calledOnce', 'calledThrice', 'calledTwice', 'exists', 'extensible',
  'finite', 'frozen', 'iterable', 'NaN', 'numeric', 'sealed',
]

export default defineConfig([
  globalIgnores([
    'dist/**',
    'coverage/**',
    '**/*.generated.*',
  ]),

  // == [1. Stock defaults] ==

  js.configs.recommended,

  // == [2. Strictness layer] ==

  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  unicorn.configs.recommended,
  sonarjs.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,

  // Type-aware rules need the TS project. The import resolver reads a workspace package from its
  // src/, through the `@safebyok/source` condition the tsconfig asks for too (tsconfig.base.json),
  // so lint never depends on a dist/ that may be missing or stale.
  {
    name: 'safebyok-react/type-aware',
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          conditionNames: ['@safebyok/source', 'types', 'import', 'esm2020', 'es2020', 'es2015', 'require', 'node', 'node-addons', 'browser', 'default'],
        },
      },
    },
  },

  // == [2b. React] ==
  // Hooks correctness first, then JSX hygiene and accessibility.
  {
    name: 'safebyok-react/react',
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    extends: [
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    // 'detect' would be righter, but eslint-plugin-react 7.37.5 detects via an API eslint 10
    // removed (context.getFilename); pin the version until the plugin catches up.
    // As of 2026-10-16 neither plugin has a release that declares eslint 10: eslint-plugin-react
    // 7.37.5 allows up to ^9.7 and eslint-plugin-jsx-a11y 6.10.2 up to ^9, so `pnpm peers check`
    // reports both as unmet. They lint under eslint 10 here; raise them when either releases.
    settings: { react: { version: '19.3' } },
    rules: {
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // == [3a. House style] ==
  {
    name: 'safebyok-react/house-style',
    files: SourceFiles,
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/comma-dangle':                   ['warn', 'always-multiline'],
      '@stylistic/eol-last':                       ['warn', 'always'],
      '@stylistic/function-call-argument-newline': ['warn', 'consistent'],
      '@stylistic/function-paren-newline':         ['warn', 'consistent'],
      '@stylistic/generator-star-spacing':         ['warn', { before: true, after: true }],
      '@stylistic/indent':                         ['warn', 2, { SwitchCase: 0 }],
      '@stylistic/linebreak-style':                ['error', 'unix'],
      '@stylistic/no-mixed-operators':             ['error'],
      '@stylistic/no-multiple-empty-lines':        ['warn'],
      '@stylistic/no-trailing-spaces':             ['warn'],
      '@stylistic/semi':                           ['warn', 'never'],
      '@stylistic/brace-style':                    ['warn', '1tbs', { allowSingleLine: true }],
      'curly':                                     ['error', 'all'],
      'id-length':                                 ['error', { min: 2, exceptions: ['Z', '_'] }],
      // '@stylistic/space-unary-ops' is not carried: its `!` override also fires on
      // TypeScript's postfix non-null assertion (`arr[0]!`), which it cannot distinguish
      // from the negation operator the rule is aimed at.

      // Off because we align values into columns, and quote style is a
      // by-hand convention (STYLE.md).
      '@stylistic/key-spacing':                    'off',
      '@stylistic/max-len':                        'off',
      '@stylistic/multiline-ternary':              'off',
      '@stylistic/newline-per-chained-call':       'off',
      '@stylistic/no-multi-spaces':                'off',
      '@stylistic/object-curly-newline':           'off',
      '@stylistic/object-property-newline':        'off',
      '@stylistic/padded-blocks':                  'off',
      '@stylistic/quotes':                         'off',

      'func-style':                                ['error', 'declaration', { allowArrowFunctions: true }],
      'no-constructor-return':                     ['error'],
      'no-dupe-else-if':                           ['error'],
      'no-else-return':                            ['warn'],
      'no-implicit-coercion':                      ['error', { allow: ['!!'] }],
      'no-implicit-globals':                       ['error'],
      'no-negated-condition':                      ['error'],
      // STYLE.md: const by default, let where genuinely reassigned, never var.
      'no-var':                                    ['error'],
      'no-unsafe-negation':                        ['error', { enforceForOrderingRelations: true }],
      'prefer-destructuring':                      ['warn', { object: true, array: false }],

      'arrow-body-style':                          ['off'],
      'camelcase':                                 ['off'],
      'class-methods-use-this':                    ['off'],
      'lines-between-class-members':               ['off'],
      'max-classes-per-file':                      ['off'],
      'no-await-in-loop':                          ['off'],
      'no-continue':                               ['off'],
      'no-inner-declarations':                     ['off'],
      'no-restricted-syntax':                      ['off'],
      'no-underscore-dangle':                      ['off'],
      'no-useless-rename':                         ['off'],
      'prefer-template':                           ['off'],

      '@typescript-eslint/default-param-last':     ['error'],
      '@typescript-eslint/no-misused-promises':    ['error'],
      '@typescript-eslint/explicit-module-boundary-types': ['off'],
      '@typescript-eslint/naming-convention':      ['off'],
      '@typescript-eslint/no-this-alias':          ['off'],
      '@typescript-eslint/no-use-before-define':   ['off'],
      '@typescript-eslint/no-useless-constructor': ['off'],
      '@typescript-eslint/return-await':           ['warn', 'error-handling-correctness-only'], // use this when it's warranted

      'import-x/no-named-as-default':        'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-useless-path-segments':   'off',
      'import-x/prefer-default-export':      'off',
      // No extension enforcement: the bundler resolves extensionless imports, the grain of the
      // wider ecosystem, so import-x/extensions (either direction) isn't set here at all.
      'import-x/no-extraneous-dependencies': ['error', {
        devDependencies: ['tests/**', '**/*.config.{ts,mts,mjs}', 'eslint.config.mjs'],
        optionalDependencies: false,
        peerDependencies: true,
      }],

      'consistent-this': ['error', 'self'],
      'no-global-assign': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern:         '^_[a-zA-Z0-9]',
        argsIgnorePattern:         '^_[a-zA-Z0-9]',
        caughtErrorsIgnorePattern: '^_[a-zA-Z0-9]',
      }],
    },
  },

  // == [3b. A library that holds secrets] ==
  // A library writes nothing to the console: what it has to say goes back to its caller, who
  // decides what may be logged. A stray debug line is how a key ends up in someone's log drain.
  // Randomness is the platform's CSPRNG (`crypto.getRandomValues`), never Math.random.
  {
    name: 'safebyok-react/secret-keeping',
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-console':              'error',
      'no-eval':                 'error',
      'no-new-func':             'error',
      'no-restricted-properties': ['error', {
        object:   'Math',
        property: 'random',
        message:  'Use crypto.getRandomValues: Math.random is not a source of secret randomness.',
      }],
    },
  },

  // == [3c. Runs everywhere the host app does] ==
  // src/ is platform-neutral: no Node module, and none of Node's globals. The tests and configs run
  // under Node, so the TS project types Node's globals for them, and only this rule keeps src/ clean.
  {
    name: 'safebyok-react/platform-neutral',
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'import-x/no-nodejs-modules': 'error',
      'no-restricted-globals': ['error', ...['Buffer', 'process', 'global', 'require', '__dirname', '__filename', 'setImmediate'].map((nodeGlobal) => ({
        name:    nodeGlobal,
        message: `${nodeGlobal} is Node's alone: src/ runs in browsers, Node, Bun and the frameworks on them (CLAUDE.md).`,
      }))],
    },
  },

  // == [3d. Plugin defaults our own documents contradict] ==
  // Each of these is a reasonable default that STYLE.md rules out explicitly. Turned off here
  // rather than disabled at every call site.
  {
    name: 'safebyok-react/house-overrides',
    files: SourceFiles,
    rules: {
      // STYLE.md sanctions the one-line doc block: `/** Brief statement, if that's truly enough */`.
      'unicorn/single-line-block-comment-style': 'off',
      // STYLE.md's doc blocks are TSDoc's, each line led by ` * `, as every editor folds and
      // renders them.
      'unicorn/no-asterisk-prefix-in-documentation-comments': 'off',
      // null is load-bearing: a stored record says "nothing here" with null, never by leaving a
      // field out.
      'unicorn/no-null': 'off',
      // A model declares its fields first, then its statics: the field list is the documentation,
      // and it belongs at the top.
      'unicorn/consistent-class-member-order': 'off',
      // STYLE.md's tag glossary is deliberate and specific: `idx`, `val`, `str`, `num`, `obj`,
      // `arr`, `props` -- and `err`, where the rule's replacement (`error`) is the one name
      // STYLE.md forbids outright.
      'unicorn/name-replacements': 'off',
      // Booleans are named for what they say (`locked`, `stale`); an is- prefix on every binding
      // of one would be a translation layer, and it fights `prefer-destructuring`, which is on.
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/filename-case': ['error', { cases: { kebabCase: true } }],
      // Taste: `type FooT = Z.output<...>` cannot be an interface, so its neighbours should not
      // have to be either.
      '@typescript-eslint/consistent-type-definitions': 'off',
      // STYLE.md: "Use `err`, never `error`". The rule's own default is the forbidden name.
      'unicorn/catch-error-name': ['error', { name: 'err' }],
      // STYLE.md endorses the guard clause, and asks that visual weight match didactic weight: a
      // guard is not a choice between two values, and should not have to read like one.
      'unicorn/prefer-ternary': 'off',
      // Written for JavaScript, where a return type is only what the code happens to return. Here
      // it is declared, and a declared union (`WhisperJson`) is the contract, not an accident.
      'sonarjs/function-return-type': 'off',
      // A second no-unused-vars, without the house's `_` for a binding left unused on purpose (a
      // field dropped by destructuring): typescript-eslint's, configured above, is the one.
      'sonarjs/no-unused-vars': 'off',
      // A shape's name says what it means even where two shapes are one type (`LeaseSparse =
      // LeaseStamp`): the rule calls that alias redundant, where the guidance asks for it.
      'sonarjs/redundant-type-aliases': 'off',
      // `() => undefined` returns undefined and `() => {}` returns void, which TypeScript keeps
      // apart: the rule's fix of an arrow body changes the type, so it leaves arrow bodies alone.
      'unicorn/no-useless-undefined': ['error', { checkArrowFunctionBody: false }],
      // The lib target stops at ES2023 in every tsconfig, and two rules want a newer one. Off
      // until it moves, both together: `Iterator#toArray()` is ES2025, the rule's fix does not
      // typecheck, and `prefer-spread` refuses the bare `Array.from` beside it; and
      // `Promise.withResolvers` is ES2024.
      'unicorn/prefer-iterator-to-array':       'off',
      'unicorn/prefer-promise-with-resolvers':  'off',
    },
  },

  // STYLE.md, *Naming*: these say nothing about what they hold. Only bindings are refused -- a
  // variable, a parameter, a destructured name -- never a property, so `{ name: 'AES-GCM' }`, as
  // WebCrypto spells its algorithms, stays legal.
  {
    name: 'safebyok-react/forbidden-names',
    files: SourceFiles,
    rules: {
      'no-restricted-syntax': ['error', ...[
        'VariableDeclarator > Identifier.id',
        ':function > Identifier.params',
        ':function > AssignmentPattern.params > Identifier.left',
        'ObjectPattern > Property > Identifier.value',
        'ArrayPattern > Identifier.elements',
      ].map((binding) => ({
        selector: `${binding}[name=/^(key|name|value|node|error|query)$/]`,
        message:  'Name it for what it holds (STYLE.md, Naming): a cryptographic key by its role (vaultKey, boxKey: VOCABULARY.md), a map key `ckey`, `err` for an error, `vaultlabel` over `name`.',
      }))],
    },
  },

  // A config file's whole job is the call it exports. The package itself is `sideEffects: false`,
  // so the rule stays on everywhere else.
  {
    name: 'safebyok-react/config-files',
    files: ['*.config.{ts,mts,mjs}', 'eslint.config.mjs'],
    rules: {
      'unicorn/no-top-level-side-effects': 'off',
    },
  },

  // These are all good ideas to enforce, but forbidding access to @ts-expect-error
  // etc can send the coach-coder development loop into a tailspin.
  // Use them judiciously, and ALWAYS report it in chat.
  {
    name: 'safebyok-react/can-we-be-adults-yes-we-can',
    files: SourceFiles,
    rules: {
      '@typescript-eslint/ban-ts-comment':                'off',
      '@typescript-eslint/no-explicit-any':               'off',
      '@typescript-eslint/no-non-null-assertion':         'off',
    },
  },

  // This file and any other loose script sit outside the TS project, so the
  // type-aware rules above cannot run on them. Last, so it wins.
  {
    name: 'safebyok-react/untyped-config-files',
    files: ['**/*.mjs', '**/*.js', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // == [Tests] ==
  {
    name: 'safebyok-react/tests',
    files: ['tests/**/*.{ts,tsx}'],
    extends: [vitest.configs.recommended],
    rules: {
      'vitest/no-disabled-tests': 'warn',
      'vitest/no-focused-tests': 'warn',
      // A type-level test asserts with `expectTypeOf` and has no runtime to check. Without
      // this the only way to satisfy the rule is to pad it with a token runtime assertion,
      // which tells the reader nothing about what the test is for. A helper of the tests' own
      // whose name begins `expect` asserts too, and counts as the test's assertion: as
      // `expectRefusal` (safebyok/testing, called as `TH.expectRefusal` outside its own
      // module) asserts on the rejection it is handed.
      'vitest/expect-expect': ['error', {
        assertFunctionNames: ['expect*', 'TH.expect*'],
      }],
      // A bulk example list indexes a namespace by a name from its table, which this rule cannot
      // follow. tsc checks the same thing properly, and does.
      'import-x/namespace': 'off',
      // Same ground as vitest/expect-expect above, but with no way to name our own assertion
      // helpers. One rule enforcing this is enough, and that one is the one we can configure.
      'sonarjs/assertions-in-tests': 'off',
      // STYLE.md mandates bulk example lists, whose `it(blurb, ...)` title is a variable by
      // construction.
      'vitest/valid-title': 'off',
    },
  },

  // chai's property assertions (`to.be.true`, `.null`, `.empty`) are the house style (STYLE.md),
  // and vitest/valid-expect reports every one as a matcher left uncalled, with no option to allow
  // them. So it is off, and eslint-plugin-chai-expect stands guard in its place: a bare
  // `expect(x)` (missing-assertion), a method left uncalled (no-uncalled-method, which knows only
  // the methods named in ChaiMethods), and a property called as a method. chai-friendly's
  // no-unused-expressions lets an expect chain stand as a statement, and still reports any other
  // expression that does nothing.
  {
    name: 'safebyok-react/tests-chai',
    files: ['tests/**/*.{ts,tsx}'],
    plugins: { 'chai-expect': chaiExpect, 'chai-friendly': chaiFriendly },
    rules: {
      'vitest/valid-expect':                       'off',
      'chai-expect/missing-assertion':             'error',
      'chai-expect/no-uncalled-method':            ['error', { methods: ChaiMethods }],
      'chai-expect/terminating-properties':        ['error', { properties: ChaiTerminators }],
      'chai-expect/no-inner-compare':              'error',
      'chai-expect/no-inner-literal':              'error',
      '@typescript-eslint/no-unused-expressions':  'off',
      'chai-friendly/no-unused-expressions':       'error',
    },
  },
])
