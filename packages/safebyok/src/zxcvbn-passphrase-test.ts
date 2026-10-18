import type { TranslationKeys, ZxcvbnFactory } from '@zxcvbn-ts/core'
import { VaultError } from './errors'
import type { PassphraseVerdict } from './passphrase-strength'
import type { VaultScope } from './types'

/**
 * The fewest characters {@link zxcvbnPassphraseTest} admits, before zxcvbn is asked: 12. NIST SP
 * 800-63B asks for length, and against composition rules (a digit, a capital, a symbol), which
 * make passphrases harder to remember and no harder to guess.
 */
export const MinPassphraseChars = 12

/**
 * The least zxcvbn score {@link zxcvbnPassphraseTest} admits, of 0 to 4: 3, which zxcvbn calls
 * safely unguessable, holding against an offline attack on a slow hash -- what a copy of the
 * vault's props meets, under Argon2id.
 */
export const MinZxcvbnScore = 3

/** A warning zxcvbn may give, by the key it gives it under. */
type WarningKey = keyof TranslationKeys['warnings']

/** What to say of each pattern zxcvbn warns of, in the vault's own words: never a composition rule. */
const SayingForWarning: Readonly<Record<WarningKey, string>> = {
  straightRow:       'That runs along a row of the keyboard, which guessers try early',
  keyPattern:        'That is a keyboard pattern, which guessers try early',
  simpleRepeat:      'That repeats one character, which makes it easy to guess',
  extendedRepeat:    'That repeats a pattern, which makes it easy to guess',
  sequences:         'That holds a common sequence, such as abc or 1234, which guessers try early',
  recentYears:       'That holds a recent year, which guessers try early',
  dates:             'That holds a date, which guessers try early',
  topTen:            'That is one of the ten most used passwords',
  topHundred:        'That is one of the hundred most used passwords',
  common:            'That is a commonly used password',
  similarToCommon:   'That is very like a commonly used password',
  wordByItself:      'A single word on its own is easy to guess',
  namesByThemselves: 'A name on its own is easy to guess',
  commonNames:       'Common names are easy to guess',
  userInputs:        'That holds something about you or this site, which guessers try first',
  pwned:             'That has appeared in a data breach',
}

/** What to say when zxcvbn finds a passphrase weak but names no pattern. */
const PlainSaying = 'That would be easy to guess'

/** What to do, after whatever was said: more words, never a digit, a capital or a symbol. */
const Remedy = ': add a few more words, less common ones.'

// zxcvbn and its dictionaries load at the first passphrase tested, never at import: a bundler
// splits them into a chunk of their own, so browserOpts() costs a page nothing until a passphrase
// is chosen. Ranking the dictionaries takes some milliseconds more, once. The estimator keeps
// nothing of any passphrase between calls. A load that fails is forgotten, so the next call tries
// again.
const made: { estimator?: Promise<ZxcvbnFactory> } = {}

/**
 * What a failed load says. Its kind is `storage_unavailable`, the one that means "a retry may mend
 * it": a chunk the page could not fetch is a resource out of reach, as storage out of reach is, and
 * a host already shows that kind in place with a way to try again.
 */
const LoadFailedSaid = "The passphrase checker could not be loaded -- the connection may have dropped, or the app was updated meanwhile -- so this passphrase was not checked, and nothing was made of it. Try again shortly; if it fails every time, reload the page. The failed load is this error's cause."

/**
 * Loads zxcvbn and builds its estimator, over the common-password dictionary and the keyboard
 * layouts; forgets a load that failed, and refuses with kind 'storage_unavailable', the load's own
 * failure its cause (it never saw a passphrase).
 */
const loadEstimator = async (): Promise<ZxcvbnFactory> => {
  try {
    const [{ ZxcvbnFactory: Factory }, { adjacencyGraphs, dictionary }] = await Promise.all([import('@zxcvbn-ts/core'), import('@zxcvbn-ts/language-common')])
    return new Factory({ dictionary, graphs: adjacencyGraphs })
  } catch (err) {
    delete made.estimator
    throw new VaultError('storage_unavailable', LoadFailedSaid, { cause: err })
  }
}

/** The one zxcvbn estimator, loaded at the first call. */
const estimatorOf = (): Promise<ZxcvbnFactory> => {
  made.estimator ??= loadEstimator()
  return made.estimator
}

/** How many Unicode code points `text` holds: NIST's count of characters, a lone surrogate counting one. */
const codePointCount = (text: string): number => (text.match(/./gsu) ?? []).length

/** The verdict that admits, frozen; its own, so that browserOpts() brings in no validation code with it. */
const Strong: PassphraseVerdict = Object.freeze({ strong: true })

/** The verdict on a passphrase shorter than {@link MinPassphraseChars}. */
const TooShort: PassphraseVerdict = Object.freeze({ strong: false, reason: `A passphrase needs at least ${String(MinPassphraseChars)} characters: a few words together make one long enough, and easy to remember.` })

/**
 * What zxcvbn hears as the user's own words: each name in the scope whole, and each run of
 * letters or digits in it ('acme', 'jo', 'example' of a user id 'jo@example.com'), since a
 * passphrase built from them is the first a guesser who knows the user tries.
 */
const userInputsOf = (scope: VaultScope | undefined): string[] => {
  if (scope === undefined) { return [] }
  const names = [scope.applabel, scope.user_id, scope.vaultlabel]
  const parts = names.flatMap((label) => label.split(/[^\p{L}\p{N}]+/u))
  return [...new Set([...names, ...parts])].filter((word) => word !== '')
}

/** The reason a weak passphrase is weak, from zxcvbn's warning key (or none). */
const reasonFor = (warning: string | null): string => {
  const saying = (warning !== null && Object.hasOwn(SayingForWarning, warning)) ? SayingForWarning[warning as WarningKey] : PlainSaying
  return `${saying}${Remedy}`
}

/**
 * The `passphraseStrengthTest` for a browser, which `browserOpts()` supplies: strong when the
 * passphrase has at least {@link MinPassphraseChars} (12) characters, each Unicode code point
 * counting one, and zxcvbn, through `@zxcvbn-ts/core` and its common-password dictionary, scores
 * it at least {@link MinZxcvbnScore} of 4. So it turns away short passphrases, common passwords
 * and ones very like them, keyboard walks, repeats, sequences, dates, and the vault's own names --
 * the applabel, the user's id and the vaultlabel in `scope`, whole or in part -- whatever their
 * length; and asks for no digit, capital or symbol. Its reason names the pattern it found, never
 * the passphrase, and says to add words.
 *
 * It answers through a promise: zxcvbn and its dictionary, about 216 kB minified and brotlied,
 * load at its first call, as a chunk of their own in a bundled app, so a page that never chooses a
 * passphrase never fetches them. That first call takes the fetch and about 15 ms more; each after
 * it a few milliseconds, so a field may call it on every keystroke. A load that fails rejects with
 * kind 'storage_unavailable', which a retry may mend -- the vault's refusal at Create, shown in
 * place -- and the next call tries again. It keeps nothing and sends nothing anywhere.
 *
 * @param passphrase - The passphrase as the user typed it.
 * @param scope - The vault it is for, whose names zxcvbn treats as the user's own words. Optional
 *   when calling it by hand; the vault always passes it.
 * @returns `{ strong: true }`, or `{ strong: false, reason }` saying what makes it weak and what to do.
 *
 * @example
 *   const vault = Vault.make({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, ...browserOpts() })  // brings it in
 * @example await zxcvbnPassphraseTest('correct horse battery staple')  // { strong: true }
 * @example await zxcvbnPassphraseTest('password1234')                  // { strong: false, reason: 'That is very like a commonly used password: add a few more words, less common ones.' }
 * @example await zxcvbnPassphraseTest('hunter2')                       // { strong: false, reason: 'A passphrase needs at least 12 characters: ...' }
 * @example await zxcvbnPassphraseTest('skylarkpinecone', { applabel: 'skylark', user_id: 'u1', vaultlabel: 'pinecone' })  // { strong: false, reason: 'That holds something about you or this site, ...' }
 */
export const zxcvbnPassphraseTest = async (passphrase: string, scope?: VaultScope): Promise<PassphraseVerdict> => {
  if (codePointCount(passphrase) < MinPassphraseChars) { return TooShort }
  const estimator = await estimatorOf()
  const { score, feedback } = estimator.check(passphrase, userInputsOf(scope))
  if (score >= MinZxcvbnScore) { return Strong }
  return { strong: false, reason: reasonFor(feedback.warning) }
}
