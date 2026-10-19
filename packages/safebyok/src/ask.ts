import type { Vault } from './vault'
import type { PasskeyAnswer } from './types'
import { VaultError } from './errors'
import { type Outcome, bad, outcomeOf, unexpectedError } from './outcome'

/** Why the vault asks for a proof: each `why` an {@link Ask} may carry. */
export const AskWhyVals = ['absent', 'locked', 'lease_ending'] as const
/**
 * Why the vault asks for a proof: `absent`, the vault has never been made, and this proof makes
 * it, its one passphrase; `locked`, the vault stands and this device holds no lease; or
 * `lease_ending`, this device's lease ends within the `renewMinutes` its call asked for.
 */
export type AskWhy = typeof AskWhyVals[number]

/** What a {@link GetProof} may answer: each of the three. */
export const ProofAnswerVals = ['unlocked', 'declined', 'carry_on'] as const
/**
 * What a {@link GetProof} answers: `unlocked`, an `attempt` was ok; `declined`, the user dismissed
 * the dialog, a lock landed, or there was no user to ask; or `carry_on`, the user would rather not
 * be asked now, which only a lease ending allows (`ask.why` `lease_ending`): the call goes on under
 * the lease that stands.
 */
export type ProofAnswer = typeof ProofAnswerVals[number]

/**
 * Your method, the one place UI meets the vault: handed an {@link Ask} whenever a call needs the
 * vault unlocked and it is not, it shows a dialog for `ask.why`, calls `ask.attempt(proof)` on each
 * submit, and answers once the dialog is done. The vault asks one at a time. It hears the
 * passphrase the user types: keep it on the device, and never log it or let it reach an error
 * tracker. Whatever it throws reaches the call that asked as kind 'unexpected_error', never a log.
 *
 * @example
 *   const getProof: GetProof = async (ask) => {
 *     if (navigator.userActivation?.isActive === false) { return ask.why === 'lease_ending' ? 'carry_on' : 'declined' }
 *     return await showPassphraseDialog(ask)   // resolves 'unlocked' once an attempt is ok, 'declined' on Cancel
 *   }
 */
export type GetProof = (ask: Ask) => ProofAnswer | Promise<ProofAnswer>

/** The vault's own run of one proof, for {@link Ask}: its unlock, standing down once `overtaken` is aborted. */
export type Attempter = (proof: string | PasskeyAnswer, opts: { wayinId?: string | undefined } | undefined, overtaken: AbortSignal) => Promise<Outcome<Vault>>

/**
 * One prompt, raised: the {@link Ask} handed to `getProof`, and the vault's handles on it. The
 * vault keeps this; a host sees only the ask.
 */
export type RaisedAsk = {
  ask:      Ask
  /** The one answer every caller waiting on this prompt shares: the answer, or why there is none. */
  answer:   Promise<Outcome<ProofAnswer>>
  /** A lock landed while the prompt is up: refuse every waiter, settle `lockLanded`, and stand any attempt down. */
  landLock: () => void
}

/**
 * One request for a proof, made by the vault when a call needs it unlocked and it is not, and
 * handed to your `getProof`. It carries why the vault asks, the vault itself (its fields live while
 * the dialog is up), `attempt`, which tries one proof, and `lockLanded`, which settles when a lock
 * wins and the dialog should close. Every caller that needs the vault while it is up waits on this
 * one prompt, and hears its one answer.
 *
 * @example
 *   const { ok, err } = await ask.attempt(passphrase)
 *   if (ok) { return 'unlocked' }
 *   if (err.refusalkind === 'wrong_passphrase') { showInPlace(err.message) }
 * @example void ask.lockLanded.then(() => { closeDialog('declined') })
 */
export class Ask {
  /** Why the vault asks: see {@link AskWhy}. `absent` is a create: offer strength advice. */
  readonly why: AskWhy
  /** The vault asking: its fields read live while the dialog is up. */
  readonly vault: Vault
  /**
   * Settles when a `lock()`, `close()` or `del()` lands while the prompt is up: every caller
   * waiting on it is refused 'vault_locked', and the dialog should close, answering `declined`.
   * It never settles otherwise.
   */
  readonly lockLanded: Promise<void>
  readonly #attempter: Attempter
  // Aborted when a lock lands: lockLanded settles, an attempt under way takes nothing up, and a
  // later one is refused.
  readonly #landed: AbortController

  private constructor(why: AskWhy, vault: Vault, attempter: Attempter, landed: AbortController, lockLanded: Promise<void>) {
    this.why = why
    this.vault = vault
    this.#attempter = attempter
    this.#landed = landed
    this.lockLanded = lockLanded
  }

  /**
   * Try one proof: the passphrase the user typed, or a passkey's answer (`safebyok-react`'s
   * `askPasskey` gets one), aimed at one way in by `opts.wayinId` when given. Resolves the vault,
   * unlocked, or the refusal, as `unlock()` refuses: `wrong_passphrase` and `wrong_passkey` to show
   * in place and ask again (on `absent`, `weak_passphrase` and `created_elsewhere` too);
   * `absent_wayin` and `damaged_wayin` to offer another way in; and
   * `vault_locked` -- a lock won, under this attempt or before it -- `storage_unavailable`, or any
   * other, to close the dialog, answering `declined`. Once `lockLanded` has settled, it refuses
   * 'vault_locked' at once.
   *
   * @example const { ok, err } = await ask.attempt(passphrase)
   * @example const { ok } = await ask.attempt(passkey)   // from askPasskey(ask.vault.wayins)
   */
  attempt = async (proof: string | PasskeyAnswer, opts?: { wayinId?: string | undefined }): Promise<Outcome<Vault>> => {
    if (this.#landed.signal.aborted) { return bad(lockLandedError()) }
    return await this.#attempter(proof, opts, this.#landed.signal)
  }

  /**
   * Raise one prompt: make the ask and hand it to `getProof` (none answers `declined`). The
   * vault's, one per prompt; the answer is checked here, once, for every caller that waits on it.
   */
  static raise(why: AskWhy, vault: Vault, attempter: Attempter, getProof: GetProof | null): RaisedAsk {
    const landed = new AbortController()
    const ask = new Ask(why, vault, attempter, landed, onAbort(landed.signal, () => undefined))
    const lockedOut = onAbort(landed.signal, () => bad(lockLandedError()))
    // Whichever comes first: an answer that comes after a lock is dropped.
    const answer = Promise.race([outcomeOf(() => ask.#answerFrom(getProof), unexpectedError), lockedOut])
    return { ask, answer, landLock: () => { landed.abort() } }
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

const lockLandedError = () => new VaultError('vault_locked', 'The vault was locked while it was asking for a proof, so nothing was unlocked and the prompt is over. Ask again when the user wants the vault.')
