import { ZxcvbnFactory } from '@zxcvbn-ts/core'
import * as Phrases from './phrases'
import { StrongVerdict, type StrengthChecker } from './passphrase-strength'
import { objCheck } from './validator'
import * as CX from '../shapes/shapes-core'
import type { BankScope } from '../shapes/shapes-core'
import * as GX from '../shapes/shapes-gateish'
import type { PassphraseVerdict } from '../shapes/shapes-gateish'

// == [Thresholds]: MinPassphraseChars, MinZxcvbnScore

/** The fewest characters {@link zxcvbnStrengthChecker} admits in a new passphrase. */
export const MinPassphraseChars = 12

/** The lowest zxcvbn score, of 0 to 4, {@link zxcvbnStrengthChecker} admits in a new passphrase. */
export const MinZxcvbnScore = 3
// --

// == [The checker]: checkerArgs, graphemeCount, makeZxcvbnStrengthChecker, zxcvbnStrengthChecker

/** What the checker is handed: the passphrase as typed, and the scope of its bank. */
const checkerArgs = objCheck(({ passphraseCleartext, bankScope }) => ({ typed: passphraseCleartext, scope: bankScope }), 'bad_option', [GX, CX])

// Intl.Segmenter is missing from browsers before 2024 and from React Native's Hermes; there each code point counts as one.
/** How many characters `typed` contains, as its reader counts them. */
function graphemeCount(typed: string): number {
  return typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(typed)].length : (typed.match(/./gsu) ?? []).length
}

// The dictionary is most of zxcvbn's weight, so it comes in as a chunk of its own, at the device's ensureBank, never at import.
// A failed import leaves the judge unbuilt, so the next load tries again.
/** A strength checker with a zxcvbn judge of its own, built over the common dictionary at its first load. */
function makeZxcvbnStrengthChecker() {
  let judgeLoaded: ZxcvbnFactory | undefined
  async function loadJudge(): Promise<ZxcvbnFactory> {
    if (judgeLoaded === undefined) {
      const { dictionary, adjacencyGraphs } = await import('@zxcvbn-ts/language-common')
      judgeLoaded ??= new ZxcvbnFactory({ dictionary, graphs: adjacencyGraphs, useLevenshteinDistance: true })
    }
    return judgeLoaded
  }
  const judgeStrength = async (passphrase: string, bankScope: BankScope): Promise<PassphraseVerdict> => {
    const { typed, scope: { user_id, banklabel } } = checkerArgs.parse({ typed: passphrase, scope: bankScope })
    if (graphemeCount(typed) < MinPassphraseChars) { return { strong: false, reason: Phrases.passphraseTooShort(MinPassphraseChars) } }
    let judge: ZxcvbnFactory
    try {
      judge = await loadJudge()
    } catch {
      return { strong: false, reason: Phrases.PassphraseUnjudged }
    }
    const { score } = judge.check(typed, [user_id, banklabel])
    return score >= MinZxcvbnScore ? StrongVerdict : { strong: false, reason: Phrases.PassphraseGuessable }
  }
  const load = async (): Promise<void> => { await loadJudge() }
  return Object.freeze(Object.assign(judgeStrength, { load }))
}

/** The strength checker a browser app hands `Device.make`: {@link MinPassphraseChars} characters, then a zxcvbn score of {@link MinZxcvbnScore}. */
export const zxcvbnStrengthChecker: StrengthChecker & { readonly load: () => Promise<void> } = /* @__PURE__ */ makeZxcvbnStrengthChecker()
// --
