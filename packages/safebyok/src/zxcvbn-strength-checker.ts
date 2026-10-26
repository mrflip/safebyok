import type { TranslationKeys, ZxcvbnFactory } from '@zxcvbn-ts/core'
import type { PassphraseVerdict, StrengthChecker } from './passphrase-strength'
import type { VaultScope } from './types/types'

/** The fewest characters {@link zxcvbnStrengthChecker} admits, before zxcvbn is asked.
 * NIST SP 800-63B asks for length, and against composition rules, which make passphrases harder to
 * remember and no harder to guess.
 */
export const MinPassphraseChars = 12

/** The least zxcvbn score, of 0 to 4, {@link zxcvbnStrengthChecker} admits.
 * zxcvbn calls 3 safely unguessable: it holds against an offline attack on a slow hash, which is
 * what a copy of the vault props meets under Argon2id.
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

// zxcvbn and its dictionaries load at the bank's hello, or the first passphrase checked, never at
// import: a bundler splits them into a chunk of their own, so importing browserOpts() costs a page
// nothing until a vault opens. Ranking the dictionaries takes some milliseconds more, once. The
// estimator keeps nothing of any passphrase between calls. A load that fails is forgotten, so the
// next one tries again.
const made: { estimator?: Promise<ZxcvbnFactory> } = {}

/** Load zxcvbn and build its estimator over the common-password dictionary and keyboard layouts, forgetting a load that fails. */
const loadEstimator = async (): Promise<ZxcvbnFactory> => {
  try {
    const [{ ZxcvbnFactory: Factory }, { adjacencyGraphs, dictionary }] = await Promise.all([import('@zxcvbn-ts/core'), import('@zxcvbn-ts/language-common')])
    return new Factory({ dictionary, graphs: adjacencyGraphs })
  } catch (err) {
    delete made.estimator
    throw err
  }
}

/** The one zxcvbn estimator, loaded at the first call, and loaded again at the next after one that failed. */
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

/** What zxcvbn hears as the user's own words: each name in the scope whole, and each run of letters or digits in it. */
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

/** The passphrase as zxcvbn judges it: see {@link zxcvbnStrengthChecker}. */
const checkWithZxcvbn = async (passphrase: string, scope?: VaultScope): Promise<PassphraseVerdict> => {
  if (codePointCount(passphrase) < MinPassphraseChars) { return TooShort }
  const estimator = await estimatorOf()
  const { score, feedback } = estimator.check(passphrase, userInputsOf(scope))
  if (score >= MinZxcvbnScore) { return Strong }
  return { strong: false, reason: reasonFor(feedback.warning) }
}

/** The `strengthChecker` `browserOpts()` supplies: strong with at least {@link MinPassphraseChars} code points and a zxcvbn score of at least {@link MinZxcvbnScore}.
 * So it turns away common passwords and ones like them, keyboard walks, repeats, sequences, dates,
 * and the vault's own names, whatever their length. It asks for no digit, capital or symbol. Its
 * reason names the pattern it found, never the passphrase, and says to add words. It keeps
 * nothing, and sends nothing anywhere.
 *
 * zxcvbn and its dictionary, about 216 kB brotlied, are a chunk of their own in a bundled app. Its
 * `load` fetches them, as `bank.hello()` does, or else its first call. After that, a call takes a few
 * milliseconds, so a field may call it on every keystroke. A load that fails throws, failing the
 * bank's hello, and the next load tries again.
 *
 * @param scope - The vault it is for, whose names zxcvbn treats as the user's own words. The vault
 *   always passes it.
 *
 * @example
 *   const bank = Bank.make({ applabel: 'acme', user_id: session.user_id, vaultDB, ...browserOpts() })  // brings it in
 * @example await zxcvbnStrengthChecker('correct horse battery staple')  // { strong: true }
 * @example await zxcvbnStrengthChecker('password1234')                  // { strong: false, reason: 'That is very like a commonly used password: add a few more words, less common ones.' }
 * @example await zxcvbnStrengthChecker('hunter2')                       // { strong: false, reason: 'A passphrase needs at least 12 characters: ...' }
 * @example await zxcvbnStrengthChecker.load()   // fetches zxcvbn and its dictionary, as bank.hello() does; throws if they will not load
 * @example await zxcvbnStrengthChecker('skylarkpinecone', { applabel: 'skylark', user_id: 'u1', vaultlabel: 'pinecone' })  // { strong: false, reason: 'That holds something about you or this site, ...' }
 */
export const zxcvbnStrengthChecker = Object.assign(checkWithZxcvbn, {
  load: async (): Promise<void> => { await estimatorOf() },
}) satisfies StrengthChecker
