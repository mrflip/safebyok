import { ZxcvbnFactory, type TranslationKeys } from '@zxcvbn-ts/core'
import { adjacencyGraphs, dictionary } from '@zxcvbn-ts/language-common'
import { StrongVerdict, passphraseLengthTest, type PassphraseVerdict } from './passphrase-strength'

/**
 * The least zxcvbn score {@link zxcvbnPassphraseTest} admits, of 0 to 4: 3, which zxcvbn calls
 * safely unguessable, holding against an offline attack on a slow hash -- what a copy of the
 * vault's bundle meets, under Argon2id.
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

// Ranking the dictionaries takes some milliseconds, so it waits for the first passphrase tested,
// never an import (browserOpts' own, unbundled, loads this module too); the estimator, made once,
// keeps nothing of any passphrase between calls.
const made: { estimator?: ZxcvbnFactory } = {}

/** The one zxcvbn estimator, over the common-password dictionary and the keyboard layouts. */
const estimatorOf = (): ZxcvbnFactory => {
  made.estimator ??= new ZxcvbnFactory({ dictionary, graphs: adjacencyGraphs })
  return made.estimator
}

/** The reason a weak passphrase is weak, from zxcvbn's warning key (or none). */
const reasonFor = (warning: string | null): string => {
  const saying = (warning !== null && Object.hasOwn(SayingForWarning, warning)) ? SayingForWarning[warning as WarningKey] : PlainSaying
  return `${saying}${Remedy}`
}

/**
 * A `PassphraseStrengthTest` that also knows what guessers try first: strong when the
 * passphrase passes `passphraseLengthTest` (at least 12 characters) and zxcvbn, through
 * `@zxcvbn-ts/core` and its common-password dictionary, scores it at least {@link MinZxcvbnScore}
 * of 4. So it turns away common passwords and ones very like them, keyboard walks, repeats,
 * sequences and dates, whatever their length; and asks for no digit, capital or symbol. Its
 * reason names the pattern it found, never the passphrase, and says to add words.
 *
 * Synchronous, and a few milliseconds a call (its first call spends about 15 more setting up),
 * so a field may call it on every keystroke. It carries about 216 kB of dictionary (minified and
 * brotlied): import it from `safebyok/browser` only where you use it; `browserOpts()` does not
 * bring it in.
 *
 * @param passphrase - The passphrase as the user typed it.
 * @returns `{ strong: true }`, or `{ strong: false, reason }` saying what makes it weak and what to do.
 *
 * @example
 *   const vault = await openVault({ ...opts, ...browserOpts(), passphraseStrengthTest: zxcvbnPassphraseTest })
 * @example zxcvbnPassphraseTest('correct horse battery staple')  // { strong: true }
 * @example zxcvbnPassphraseTest('password1234')                  // { strong: false, reason: 'That is very like a commonly used password: add a few more words, less common ones.' }
 * @example zxcvbnPassphraseTest('hunter2')                       // { strong: false, reason: 'A passphrase needs at least 12 characters: ...' }
 */
export const zxcvbnPassphraseTest = (passphrase: string): PassphraseVerdict => {
  const longEnough = passphraseLengthTest(passphrase)
  if (! longEnough.strong) { return longEnough }
  const { score, feedback } = estimatorOf().check(passphrase)
  if (score >= MinZxcvbnScore) { return StrongVerdict }
  return { strong: false, reason: reasonFor(feedback.warning) }
}
