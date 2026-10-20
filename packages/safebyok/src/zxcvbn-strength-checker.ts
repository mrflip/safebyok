import type { TranslationKeys, ZxcvbnFactory } from '@zxcvbn-ts/core'
import type { PassphraseVerdict } from './passphrase-strength'
import type { VaultScope } from './types'

/**
 * The fewest characters {@link zxcvbnStrengthChecker} admits, before zxcvbn is asked: 12. NIST SP
 * 800-63B asks for length, and against composition rules (a digit, a capital, a symbol), which
 * make passphrases harder to remember and no harder to guess.
 */
export const MinPassphraseChars = 12

/**
 * The least zxcvbn score {@link zxcvbnStrengthChecker} admits, of 0 to 4: 3, which zxcvbn calls
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

// zxcvbn and its dictionaries load at the first passphrase checked, never at import: a bundler
// splits them into a chunk of their own, so browserOpts() costs a page nothing until a passphrase
// is chosen. Ranking the dictionaries takes some milliseconds more, once. The estimator keeps
// nothing of any passphrase between calls. A load that fails is forgotten, so the next call tries
// again.
const made: { estimator?: Promise<ZxcvbnFactory | null> } = {}

/**
 * What a failed load answers: weak, as the checker cannot tell a common password from a good one
 * without its dictionary, with a reason that says to try again, as a retry may mend it.
 */
const Unloaded: PassphraseVerdict = Object.freeze({
  strong: false,
  reason: "This passphrase couldn't be checked just now: the passphrase checker didn't load, perhaps because the connection dropped. Nothing was saved. Try again shortly; if it fails every time, reload the page.",
})

/**
 * Loads zxcvbn and builds its estimator, over the common-password dictionary and the keyboard
 * layouts; null for a load that failed, which is forgotten so the next call loads again.
 */
const loadEstimator = async (): Promise<ZxcvbnFactory | null> => {
  try {
    const [{ ZxcvbnFactory: Factory }, { adjacencyGraphs, dictionary }] = await Promise.all([import('@zxcvbn-ts/core'), import('@zxcvbn-ts/language-common')])
    return new Factory({ dictionary, graphs: adjacencyGraphs })
  } catch {
    delete made.estimator
    return null
  }
}

/** The one zxcvbn estimator, loaded at the first call; null while it will not load. */
const estimatorOf = (): Promise<ZxcvbnFactory | null> => {
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
 * The `strengthChecker` for a browser, which `browserOpts()` supplies: strong when the
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
 * it a few milliseconds, so a field may call it on every keystroke. Its strength is that
 * dictionary: without it, it cannot tell a common password from a good one, so a load that fails
 * answers weak, its reason saying to try again shortly, and the next call loads again. It never
 * throws, keeps nothing, and sends nothing anywhere.
 *
 * @param passphrase - The passphrase as the user typed it.
 * @param scope - The vault it is for, whose names zxcvbn treats as the user's own words. Optional
 *   when calling it by hand; the vault always passes it.
 * @returns `{ strong: true }`, or `{ strong: false, reason }` saying what makes it weak and what to do.
 *
 * @example
 *   const vault = Vault.make({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, ...browserOpts() })  // brings it in
 * @example await zxcvbnStrengthChecker('correct horse battery staple')  // { strong: true }
 * @example await zxcvbnStrengthChecker('password1234')                  // { strong: false, reason: 'That is very like a commonly used password: add a few more words, less common ones.' }
 * @example await zxcvbnStrengthChecker('hunter2')                       // { strong: false, reason: 'A passphrase needs at least 12 characters: ...' }
 * @example await zxcvbnStrengthChecker('skylarkpinecone', { applabel: 'skylark', user_id: 'u1', vaultlabel: 'pinecone' })  // { strong: false, reason: 'That holds something about you or this site, ...' }
 */
export const zxcvbnStrengthChecker = async (passphrase: string, scope?: VaultScope): Promise<PassphraseVerdict> => {
  if (codePointCount(passphrase) < MinPassphraseChars) { return TooShort }
  const estimator = await estimatorOf()
  if (estimator === null) { return Unloaded }
  const { score, feedback } = estimator.check(passphrase, userInputsOf(scope))
  if (score >= MinZxcvbnScore) { return Strong }
  return { strong: false, reason: reasonFor(feedback.warning) }
}
