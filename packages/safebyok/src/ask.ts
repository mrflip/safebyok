import type { Vault } from './vault'
import type { PasskeyAnswer } from './types'
import { VaultError } from './errors'
import { type Outcome, bad, outcomeOf, unexpectedError } from './outcome'

/** Why the vault asks for a proof: each `why` an {@link Ask} may carry. */
export const AskWhyVals = ['absent', 'locked', 'lease_ending'] as const
/** Why the vault asks for a proof: `absent`, `locked` or `lease_ending`.
 * `absent`: the vault has never been made, and this proof's passphrase makes it. `locked`: the
 * vault stands and this device holds no lease. `lease_ending`: this device's lease ends within the
 * `renewMinutes` its call asked for.
 */
export type AskWhy = typeof AskWhyVals[number]

/** What a {@link GetProof} may answer: each of the three. */
export const ProofAnswerVals = ['unlocked', 'declined', 'carry_on'] as const
/** What a {@link GetProof} answers: `unlocked`, `declined` or `carry_on`.
 * `unlocked`: an `attempt` was ok. `declined`: the user dismissed the dialog, a lock landed, or
 * there was no user to ask. `carry_on`: the user would rather not be asked now, and the call goes
 * on under the lease that stands; only `lease_ending` allows it.
 */
export type ProofAnswer = typeof ProofAnswerVals[number]

/** Your method, the one place UI meets the vault: handed an {@link Ask}, it shows a dialog and answers once it is done.
 * The vault asks when a call needs it unlocked and it is not. Call `ask.attempt(proof)` on each submit. The vault asks one at a time. It hears the passphrase
 * the user types: keep it on the device, and never log it or let it reach an error tracker.
 * Whatever it throws refuses the call that asked 'unexpected_error', and is never logged. An answer
 * outside {@link ProofAnswerVals}, or `carry_on` outside `lease_ending`, refuses it 'bad_option'.
 *
 * @example
 *   const getProof: GetProof = async (ask) => {
 *     if (navigator.userActivation?.isActive === false) { return ask.why === 'lease_ending' ? 'carry_on' : 'declined' }
 *     return await showPassphraseDialog(ask)   // resolves 'unlocked' once an attempt is ok, 'declined' on Cancel
 *   }
 */
export type GetProof = (ask: Ask) => ProofAnswer | Promise<ProofAnswer>

/** The vault's own run of one proof, for {@link Ask}: its unlock, refused when `promptOver` is aborted by the time the unlock's turn starts. */
export type Attempter = (proof: string | PasskeyAnswer, promptOver: AbortSignal) => Promise<Outcome<Vault>>

/** The name of the one maker of an {@link Ask}, exported by no entry point, so only the vault raises a prompt. */
export const raiseAsk = Symbol('Ask.raise')

/** One prompt, raised: the {@link Ask} handed to `getProof`, and what the vault keeps to answer and end it. */
export type RaisedAsk = {
  ask:      Ask
  /** The one answer every caller waiting on this prompt shares: the answer, or why there is none. */
  answer:   Promise<Outcome<ProofAnswer>>
  /** A lock landed while the prompt is up: refuse every waiter, settle `lockLanded`, and stand every attempt down. */
  landLock: () => void
}

/** One request for a proof, handed to your {@link GetProof} when a call needs the vault unlocked and it is not.
 * Every call that needs the vault while it is up waits on this one prompt, and hears its one answer.
 *
 * @example
 *   const { ok, err } = await ask.attempt(passphrase)
 *   if (ok) { return 'unlocked' }
 *   if (err.refusalkind === 'wrong_passphrase') { showInPlace(err.message) }
 * @example void ask.lockLanded.then(() => { closeDialog('declined') })
 */
export class Ask {
  /** Why the vault asks. `absent` is a create: offer strength advice. */
  readonly why: AskWhy
  /** The vault asking, its fields live while the dialog is up. */
  readonly vault: Vault
  /** Settles only when a `lock()`, `close()` or `del()` lands while the prompt is up: close the dialog, answering `declined`.
   * Every call waiting on the prompt is then refused 'vault_locked'.
   */
  readonly lockLanded: Promise<void>
  readonly #attempter: Attempter
  // Aborted when a lock lands: lockLanded settles.
  readonly #landed: AbortController
  // Aborted when the prompt is over -- a lock landed, or the ask was answered -- so an attempt
  // under way takes nothing up, and a later one is refused.
  readonly #over: AbortController

  private constructor(why: AskWhy, vault: Vault, attempter: Attempter, landed: AbortController, over: AbortController, lockLanded: Promise<void>) {
    this.why = why
    this.vault = vault
    this.#attempter = attempter
    this.#landed = landed
    this.#over = over
    this.lockLanded = lockLanded
  }

  /** Try one proof, the passphrase typed or a passkey's answer: resolves the vault unlocked, or the refusal as `unlock()` refuses.
   * Show 'wrong_passphrase' and 'wrong_passkey' in place and ask again; on `absent`, so too
   * 'weak_passphrase' and 'created_elsewhere'. On 'absent_wayin' and 'damaged_wayin', offer the
   * other wayin. On anything else, 'vault_locked' among it, close the dialog, answering `declined`.
   *
   * Once the prompt is over (`lockLanded` settled, or the ask answered), it refuses 'vault_locked'
   * at once. An attempt still under way then unlocks nothing: a Cancel stays cancelled, and a lock wins.
   *
   * @example const { ok, err } = await ask.attempt(passphrase)
   * @example const { ok } = await ask.attempt(passkey)   // from askPasskey(ask.vault.passkey)
   */
  attempt = async (proof: string | PasskeyAnswer): Promise<Outcome<Vault>> => {
    if (this.#landed.signal.aborted) { return bad(lockLandedError()) }
    if (this.#over.signal.aborted) { return bad(answeredError()) }
    return await this.#attempter(proof, this.#over.signal)
  }

  /** Raise one prompt: hand a new ask to `getProof`, checking its answer once for every waiting caller.
   * With no `getProof`, the answer is `declined`.
   */
  static [raiseAsk](why: AskWhy, vault: Vault, attempter: Attempter, getProof: GetProof | null): RaisedAsk {
    const landed = new AbortController()
    const over = new AbortController()
    const ask = new Ask(why, vault, attempter, landed, over, onAbort(landed.signal, () => undefined))
    const lockedOut = onAbort(landed.signal, () => bad(lockLandedError()))
    // Whichever comes first: an answer that comes after a lock is dropped. The answer ends the
    // prompt for its attempts too, before any waiter hears it: an attempt still running once the
    // vault stops tracking this ask -- after a Cancel, or a second submit -- would otherwise unlock
    // the vault after a later lock() had returned.
    const answered = async () => {
      const outcome = await Promise.race([outcomeOf(() => ask.#answerFrom(getProof), unexpectedError), lockedOut])
      over.abort()
      return outcome
    }
    const answer = answered()
    return { ask, answer, landLock: () => { landed.abort(); over.abort() } }
  }

  /** What `getProof` answers, checked: anything but the three, or `carry_on` outside `lease_ending`, is misuse. */
  async #answerFrom(getProof: GetProof | null): Promise<ProofAnswer> {
    if (getProof === null) { return 'declined' }
    let answered: unknown
    try {
      answered = await getProof(this)
    } catch (err) {
      // A bug in getProof, a VaultError it let escape too: never a refusal of the call that asked.
      throw unexpectedError(err)
    }
    // Neither refusal quotes the answer: a getProof gone wrong could hand back the passphrase.
    if (! ProofAnswerVals.includes(answered as ProofAnswer)) {
      throw new VaultError('bad_option', "getProof answers one of 'unlocked', 'declined' or 'carry_on': fix the getProof passed to Vault.make.")
    }
    if (answered === 'carry_on' && this.why !== 'lease_ending') {
      throw new VaultError('bad_option', "getProof answered 'carry_on', which only a lease ending allows (ask.why 'lease_ending'): answer 'unlocked' once an attempt is ok, or 'declined'.")
    }
    return answered as ProofAnswer
  }
}

/** A promise of what `settled` makes, once `signal` is aborted. */
const onAbort = <ValT>(signal: AbortSignal, settled: () => ValT): Promise<ValT> => new Promise((settle) => {
  signal.addEventListener('abort', () => { settle(settled()) }, { once: true })
})

const answeredError = () => new VaultError('vault_locked', 'This prompt was already answered, so this proof was not tried and nothing was unlocked. Ask again when the user wants the vault.')

const lockLandedError = () => new VaultError('vault_locked', 'The vault was locked while it was asking for a proof, so nothing was unlocked and the prompt is over. Ask again when the user wants the vault.')
