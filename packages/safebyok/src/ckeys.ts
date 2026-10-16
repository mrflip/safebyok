import * as Z from 'zod/mini'
import { VaultError } from './errors'
import type { VaultScope } from './types'

/**
 * The ckeys safebyok's key-value adapters file rows under -- `localVaultDB`, `idbVaultDB`,
 * `idbDeviceDB` and `memoryDeviceDB`, and any adapter of your own over a key-value store: the
 * row's kind, then the scope, then (for a lockbox) its boxlabel, joined by one delimiter, `^`
 * unless the adapter was made with another:
 *
 *     vault^acme^u1^main
 *     box^acme^u1^main^anthropic
 *     unlock^acme^u1^main
 *     mark^acme^u1^main
 *
 * A name holding the delimiter is refused (kind 'bad_label') rather than joined, so no two rows
 * ever share a ckey, and every ckey splits back into the names it was made from. The default
 * validators admit neither `^` nor `/`, so an adapter joining on either holds every name they pass.
 * A row's ckey is part of what is stored: an adapter that files rows under these keeps them where
 * every other device's copy of the package looks for them.
 */

/** The delimiter a key-value adapter joins names on when it is made with no other: `^`. */
export const DefaultDelimiter = '^'

/**
 * The ckeys of one delimiter: what a key-value adapter files and finds its rows by. Each of
 * `bundle`, `box`, `unlock` and `mark` refuses, with kind 'bad_label', a name holding the
 * delimiter, naming the part and never quoting it.
 */
export type CkeyJoiner = {
  /** The one character the names are joined on, which no name may hold. */
  readonly delimiter: string
  /** The ckey of `scope`'s bundle: `vault^acme^u1^main`. */
  bundle: (scope: VaultScope) => string
  /** The ckey of the lockbox under `boxlabel` in `scope`: `box^acme^u1^main^anthropic`. */
  box: (scope: VaultScope, boxlabel: string) => string
  /** The ckey of `scope`'s remembered unlock, on a device's own storage: `unlock^acme^u1^main`. */
  unlock: (scope: VaultScope) => string
  /** The ckey of `scope`'s device mark, on a device's own storage: `mark^acme^u1^main`. */
  mark: (scope: VaultScope) => string
  /**
   * The text that begins the ckey of every lockbox in `scope`, and of nothing else safebyok
   * writes, `box^acme^u1^main^`: a store that scans by prefix, or by a key range from it, lists a
   * vault's lockboxes with it.
   */
  boxPrefix: (scope: VaultScope) => string
  /** A test for the ckeys of `scope`'s lockboxes, for filtering every ckey in a store: false for anything else, and for anything not text. */
  isBoxIn: (scope: VaultScope) => ((ckey: unknown) => ckey is string)
  /** The boxlabel a lockbox's ckey files it under, its last part; null for text {@link CkeyJoiner.box} would not give. */
  boxlabelOf: (ckey: string) => string | null
  /** True for each ckey {@link CkeyJoiner.unlock} gives, of any scope; false for any other text, and for anything not text. */
  isUnlock: (ckey: unknown) => ckey is string
  /** True for each ckey {@link CkeyJoiner.mark} gives, of any scope; false for any other text, and for anything not text. */
  isMark: (ckey: unknown) => ckey is string
}

/**
 * The ckeys joined on `delimiter`, one character: `^` when it is left out. Kind 'bad_option' for
 * anything but one character.
 *
 * @example joiner().box(scope, 'anthropic')                    // 'box^acme^u1^main^anthropic'
 * @example joiner('/').bundle(scope)                           // 'vault/acme/u1/main'
 * @example joiner().boxlabelOf('box^acme^u1^main^anthropic')   // 'anthropic'
 * @example joiner().box({ ...scope, user_id: 'a^b' }, 'x')     // throws: bad_label
 */
export const joiner = (delimiter?: string): CkeyJoiner => {
  const checked = Delimiter.safeParse(delimiter)
  if (! checked.success) {
    throw new VaultError('bad_option', `ckeyDelimiter is the one character a key-value store joins names on, which no name may then hold: leave it out for '${DefaultDelimiter}'.`)
  }
  const joinedOn = checked.data
  const join = (parts: readonly Part[]): string => parts.map(([said, part]) => partOf(joinedOn, said, part)).join(joinedOn)
  const boxPrefix = (scope: VaultScope) => `${join([['kind', 'box'], ...scopeParts(scope)])}${joinedOn}`
  const unlockPrefix = `unlock${joinedOn}`
  const markPrefix = `mark${joinedOn}`
  return Object.freeze({
    delimiter:  joinedOn,
    bundle:     (scope: VaultScope) => join([['kind', 'vault'], ...scopeParts(scope)]),
    box:        (scope: VaultScope, boxlabel: string) => join([['kind', 'box'], ...scopeParts(scope), ['boxlabel', boxlabel]]),
    unlock:     (scope: VaultScope) => join([['kind', 'unlock'], ...scopeParts(scope)]),
    mark:       (scope: VaultScope) => join([['kind', 'mark'], ...scopeParts(scope)]),
    boxPrefix,
    isBoxIn:    (scope: VaultScope) => {
      const prefix = boxPrefix(scope)
      return (ckey: unknown): ckey is string => typeof ckey === 'string' && ckey.startsWith(prefix)
    },
    boxlabelOf: (ckey: string) => {
      const parts = ckey.split(joinedOn)
      return parts.length === BoxParts && parts[0] === 'box' ? parts[BoxParts - 1] ?? null : null
    },
    isUnlock:   (ckey: unknown): ckey is string => typeof ckey === 'string' && ckey.startsWith(unlockPrefix),
    isMark:     (ckey: unknown): ckey is string => typeof ckey === 'string' && ckey.startsWith(markPrefix),
  })
}

/** One part of a ckey, beside what a refusal calls it: a row's kind, or one of its names. */
type Part = readonly [said: string, part: string]

/** A scope's three names, each beside what a refusal calls it. */
const scopeParts = (scope: VaultScope): Part[] => [['applabel', scope.applabel], ['user_id', scope.user_id], ['vaultlabel', scope.vaultlabel]]

/** A lockbox's ckey has five parts: its kind, the scope's three names, and its boxlabel. */
const BoxParts = 5

const Delimiter = Z._default(Z.string().check(Z.length(1)), DefaultDelimiter)

/** `part`, once it is free of the delimiter: kind 'bad_label' otherwise, naming the part and quoting none of it. */
const partOf = (delimiter: string, said: string, part: string): string => {
  if (part.includes(delimiter)) {
    throw new VaultError('bad_label', `That ${said} holds '${delimiter}', which this storage joins names on, so it can't be stored here: choose a ${said} without it.`)
  }
  return part
}
