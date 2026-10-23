import { vi } from 'vitest'
import type { Gating, GatingKind, RequestCleartext } from '../../src/gating'
import { type Outcome, good, valOf } from '../../src/outcome'
import type { PasskeyAnswer, WayinSummary } from '../../src/types'
import type { Vault } from '../../src/vault'
import { eventually } from './timing'

/**
 * A user at the dialog, for tests: a `requestCleartext` that answers each gating as a test
 * scripted it, and the calls that script it -- an unlock, a change to the ways in, a deletion --
 * each raising its gating and answering it in one step, as a naked client answering its own
 * `requestCleartext` would. A vault knows nothing of these: it raises gatings, and the host's
 * `requestCleartext` answers them.
 */

/** How a test answers one gating: attempts on it, and resolves once done, as a dialog closing does. */
export type GatingAnswer = (gating: Gating) => Promise<void>

// The answer each vault's next gating hears, taken once. A vault with none scripted is declined.
const scripts = new WeakMap<Vault, GatingAnswer>()

/** A `requestCleartext` that answers each gating with the answer {@link answering} (or a helper here) scripted for its vault, once, and declines one with none: {@link memoryVaultOpts}' default.
 *
 * @example Bank.make({ ...opts, requestCleartext: TH.scriptedRequestCleartext })
 */
export const scriptedRequestCleartext: RequestCleartext = async (gating) => {
  const answer = scripts.get(gating.vault)
  if (answer === undefined) { return }
  scripts.delete(gating.vault)
  await answer(gating)
}

/** Script `vault`'s next gating to be answered by `answer`, as the user at the dialog: a vault made with {@link scriptedRequestCleartext} hands it there.
 *
 * @example
 *   TH.answering(vault, async (gating) => { gating.decline() })
 *   await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
 */
export const answering = (vault: Vault, answer: GatingAnswer): void => {
  scripts.set(vault, answer)
}

/** Have `vault` unlocked as a user typing `cleartext` would: `ensureUnlocked()`, its gating answered with the passphrase or a passkey's answer, resolving the outcome.
 * A vault already unlocked resolves at once, nothing tried. A novel vault's `initialize_gate`
 * takes a passphrase as its first. The attempt's refusal, when it made one, is the outcome's,
 * though the gating then stays open and is declined: a wrong passphrase reads as 'wrong_passphrase'.
 *
 * @example const { ok, err } = await TH.tryUnlock(vault, 'wrong')   // err.refusalkind: 'wrong_passphrase'
 */
export const tryUnlock = async (vault: Vault, cleartext: string | PasskeyAnswer): Promise<Outcome<void>> => {
  let attempted: Outcome<Vault> | null = null
  answering(vault, async (gating) => { attempted = await unlockAttempt(gating, cleartext) })
  const ensured = await vault.tryEnsureUnlocked()
  scripts.delete(vault)
  const made = attempted as Outcome<Vault> | null
  if (made !== null && ! made.ok) { return made }
  return ensured.ok ? good(undefined) : ensured
}

/** {@link tryUnlock}, throwing its refusal.
 *
 * @example await TH.unlock(vault, 'correct horse battery staple')
 * @example await TH.unlock(vault, await TH.passkeyOf('laptop'))
 */
export const unlock = async (vault: Vault, cleartext: string | PasskeyAnswer): Promise<void> => {
  valOf(await tryUnlock(vault, cleartext))
}

/** Put a way into `vault` as a user would: `putWayin` of `newProof`'s slot, its gating answered with `passphrase` and `newProof`, resolving the new way in's summary as the snapshot then shows it.
 * A novel vault's `initialize_gate` takes `passphrase` as its first, and `newProof` beside it when
 * it is a passkey's answer.
 *
 * @example const summary = await TH.putWayin(vault, passphrase, 'a new passphrase')
 * @example await TH.putWayin(vault, passphrase, await TH.passkeyOf('laptop'))
 */
export const tryPutWayin = async (vault: Vault, passphrase: string, newProof: string | PasskeyAnswer): Promise<Outcome<WayinSummary>> => {
  let attempted: Outcome<Vault> | null = null
  answering(vault, async (gating) => { attempted = await putAttempt(gating, passphrase, newProof) })
  const slotlabel = typeof newProof === 'string' ? 'passphrase' : 'passkey'
  const put = await vault.tryPutWayin(slotlabel)
  scripts.delete(vault)
  const made = attempted as Outcome<Vault> | null
  if (made !== null && ! made.ok) { return made }
  if (! put.ok) { return put }
  const summary = slotlabel === 'passphrase' ? vault.passphrase : vault.passkey
  if (summary === null) { throw new Error('putWayin resolved, but the snapshot shows no way in at its slot.') }
  return good(summary)
}

/** {@link tryPutWayin}, throwing its refusal. */
export const putWayin = async (vault: Vault, passphrase: string, newProof: string | PasskeyAnswer): Promise<WayinSummary> => valOf(await tryPutWayin(vault, passphrase, newProof))

/** Take `vault`'s passkey away as a user would: `delWayin('passkey')`, its gating answered with `passphrase`.
 *
 * @example await TH.delWayin(vault, passphrase)
 */
export const tryDelWayin = async (vault: Vault, passphrase: string): Promise<Outcome<Vault>> => {
  let attempted: Outcome<Vault> | null = null
  answering(vault, async (gating) => { attempted = gating.gatingkind === 'del_passkey' ? await gating.attempt(passphrase) : null })
  const removed = await vault.tryDelWayin('passkey')
  scripts.delete(vault)
  const made = attempted as Outcome<Vault> | null
  if (made !== null && ! made.ok) { return made }
  return removed
}

/** {@link tryDelWayin}, throwing its refusal. */
export const delWayin = async (vault: Vault, passphrase: string): Promise<Vault> => valOf(await tryDelWayin(vault, passphrase))

/** Delete `vault` as a user would: `del()`, its gating answered with `passphrase`.
 *
 * @example await TH.del(vault, passphrase)   // the Vault object is gone
 */
export const tryDel = async (vault: Vault, passphrase: string): Promise<Outcome<void>> => {
  let attempted: Outcome<Vault> | null = null
  answering(vault, async (gating) => { attempted = gating.gatingkind === 'del_vault' ? await gating.attempt(passphrase) : null })
  const deleted = await vault.tryDel()
  scripts.delete(vault)
  const made = attempted as Outcome<Vault> | null
  if (made !== null && ! made.ok) { return made }
  return deleted
}

/** {@link tryDel}, throwing its refusal. */
export const del = async (vault: Vault, passphrase: string): Promise<void> => {
  valOf(await tryDel(vault, passphrase))
}

/** A user at a dialog the test holds open: a `requestCleartext` spy that keeps each gating it is handed, unanswered, until the test closes it.
 * `asked(nth)` resolves the gating it was handed `nth` (0, the first, by default), once handed; the
 * test attempts on it as the user would. `close()` closes every dialog so far, as Cancel does: a
 * gating still open then is declined. Count the dialogs raised with `requestCleartext`'s calls.
 *
 * @example
 *   const dialog = TH.heldDialog()
 *   const vault = await world.open({ requestCleartext: dialog.requestCleartext })
 *   const ensuring = vault.tryEnsureUnlocked()
 *   const gating = TH.asKind(await dialog.asked(), 'unlock_vault')
 *   await gating.attemptPassphrase('pw')
 */
export const heldDialog = () => {
  const closers: (() => void)[] = []
  const gatings: Gating[] = []
  const requestCleartext = vi.fn<RequestCleartext>((gating) => new Promise<void>((settle) => {
    closers.push(settle)
    gatings.push(gating)
  }))
  const asked = async (nth = 0): Promise<Gating> => {
    await eventually(() => gatings.length > nth)
    const gating = gatings[nth]
    if (gating === undefined) { throw new Error(`requestCleartext was never handed gating ${String(nth)}.`) }
    return gating
  }
  const close = () => { for (const settle of closers) { settle() } }
  return { requestCleartext, asked, close }
}

/** `gating` narrowed to the kind `gatingkind` names, for its kind's attempts; throws, naming both kinds, for any other.
 *
 * @example const gating = TH.asKind(await dialog.asked(), 'change_passphrase')   // gating.attempt(current, next)
 */
export const asKind = <KindT extends GatingKind>(gating: Gating, gatingkind: KindT): Extract<Gating, { gatingkind: KindT }> => {
  if (gating.gatingkind !== gatingkind) { throw new Error(`Expected a ${gatingkind} gating, but was handed ${gating.gatingkind}.`) }
  return gating as Extract<Gating, { gatingkind: KindT }>
}

/** The attempt an unlock makes on `gating`: a passphrase or a passkey's answer on `unlock_vault`, a first passphrase on `initialize_gate`; null for any other kind, which it leaves to be declined. */
const unlockAttempt = async (gating: Gating, cleartext: string | PasskeyAnswer): Promise<Outcome<Vault> | null> => {
  if (gating.gatingkind === 'unlock_vault') {
    return typeof cleartext === 'string' ? await gating.attemptPassphrase(cleartext) : await gating.attemptPasskey(cleartext)
  }
  if (typeof cleartext === 'string' && gating.gatingkind === 'initialize_gate') { return await gating.attempt(cleartext) }
  return null
}

/** The attempt a change to the ways in makes on `gating`, by its kind; null for a kind it does not answer. */
const putAttempt = async (gating: Gating, passphrase: string, newProof: string | PasskeyAnswer): Promise<Outcome<Vault> | null> => {
  switch (gating.gatingkind) {
  case 'change_passphrase': { return typeof newProof === 'string' ? await gating.attempt(passphrase, newProof) : null }
  case 'put_passkey': { return typeof newProof === 'string' ? null : await gating.attempt(passphrase, newProof) }
  case 'initialize_gate': { return await gating.attempt(passphrase, typeof newProof === 'string' ? undefined : newProof) }
  default: { return null }
  }
}
