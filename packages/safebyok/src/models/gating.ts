/** A form verb's gating: the form's cleartexts, hidden from anything that serializes, prints or spreads an object, and the change they prove, attempted once. */

import { omitBy } from 'es-toolkit'
import { type EX, type GX, Errors, Outcome, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import { Bank } from './bank'
import { Device } from './device'
import type { Gate } from './gate'
import { NOVEL, PasskeyProving, PassphraseProving, type Proving } from './proving'
import {
  type BankGatingFriend, type BirthCleartexts, type BirthGatingFriend, type GateDna, type GatingCleartexts, type PasskeyAddCleartexts, type PasskeyRevokeCleartexts,
  type PassphraseReplaceCleartexts, type ProvedCleartexts, type UnlockCleartexts, CleartextChecks,
} from '../shapes/shapes-gateish'
import type { PutAskDraft } from '../shapes/shapes-asks'
import type { GateRecord } from '../shapes/shapes-thing'
import * as Throwers from '../refusals/throwers'

// == [The gating]: Gating, GatingMarker

/** The text a gating shows wherever it is serialized or printed. */
const GatingMarker = '[gating]'

// A form mutation's variables stay in React Query's mutation cache, its devtools and the `useMutation` hook's state; a
// gating there shows none of its cleartexts, and is vacated once attempted. A cleartext goes from the gating only to its
// verb's body.
/** A form verb's cleartexts and the change they prove, to attempt once: make one with a {@link Bank} maker, such as {@link Bank.unlockGating}.
 * A spread copies none of its cleartexts, and JSON, `String()` and Node's inspect show only `'[gating]'`.
 */
export class Gating {
  /** The cleartexts adopted, or none once vacated. */
  #cleartexts: GatingCleartexts
  /** The verb's body, with the bank's friend it makes its change through. */
  readonly #body: (cleartexts: GatingCleartexts) => Promise<Bank>
  /** True once attempted or vacated. */
  #isSpent = false

  /** Adopt `cleartexts` for `body`: the PRF bytes of each passkey answer are copied, and those in the answer handed in are zeroed. */
  protected constructor(cleartexts: unknown, body: (cleartexts: GatingCleartexts) => Promise<Bank>) {
    this.#cleartexts = adoptedCleartextsOf(cleartexts)
    this.#body       = body
    Object.freeze(this)
  }

  /** Prove the cleartexts and make the verb's change, resolving the bank.
   * A gating is attempted once, and vacated whatever the outcome: make another for the next try.
   */
  async attempt(): Promise<Bank> {
    try {
      if (this.#isSpent) { throw Throwers.gatingSpent() }
      this.#isSpent = true
      return await this.#body(this.#cleartexts)
    } finally {
      this.vacate()
    }
  }

  /** {@link attempt}, resolving an `Outcome` instead of throwing. */
  tryAttempt(): Promise<Outcome.Outcome<Bank>> { return Outcome.outcomeOf(() => this.attempt()) }

  /** Zero the gating's passkey answers and drop its passphrases: an attempt refuses after. */
  vacate(): void {
    zeroAnswer(this.#cleartexts.passkeyCleartext)
    zeroAnswer(this.#cleartexts.nextPasskeyCleartext)
    this.#cleartexts = {}
    this.#isSpent    = true
  }

  /** `'[gating]'`, so `JSON.stringify` writes no cleartext. */
  toJSON(): string { return GatingMarker }

  /** `'[gating]'`, so a template string or `String()` writes no cleartext. */
  toString(): string { return GatingMarker }

  // Node's `util.inspect`, and the consoles and test runners built on it, ask for this symbol; keyed with Symbol.for, it
  // needs no import of Node's.
  /** `'[gating]'`, for Node's inspect. */
  [Symbol.for('nodejs.util.inspect.custom')](): string { return GatingMarker }
}
// --

// == [The form verbs' gatings]: BirthGating, UnlockGating, ReplacePassphraseGating, AddPasskeyGating, RevokePasskeyGating

/** A {@link Bank.birth} to attempt: make one with {@link Device.birthGating}. */
export class BirthGating extends Gating {
  constructor(device: Device, cleartexts: BirthCleartexts, friend: BirthGatingFriend) { super(cleartexts, (given) => birthBank(device, given, friend)) }
}

/** A {@link Bank.unlock} to attempt: make one with {@link Bank.unlockGating}. */
export class UnlockGating extends Gating {
  constructor(bank: Bank, cleartexts: UnlockCleartexts, friend: Pick<BankGatingFriend, 'unlockByProving'>) { super(cleartexts, (given) => unlockBank(bank, given, friend)) }
}

/** A {@link Bank.replacePassphrase} to attempt: make one with {@link Bank.replacePassphraseGating}. */
export class ReplacePassphraseGating extends Gating {
  constructor(bank: Bank, cleartexts: PassphraseReplaceCleartexts, friend: BankGatingFriend) { super(cleartexts, (given) => replacePassphrase(bank, given, friend)) }
}

/** A {@link Bank.addPasskey} to attempt: make one with {@link Bank.addPasskeyGating}. */
export class AddPasskeyGating extends Gating {
  constructor(bank: Bank, cleartexts: PasskeyAddCleartexts, friend: BankGatingFriend) { super(cleartexts, (given) => addPasskey(bank, given, friend)) }
}

/** A {@link Bank.revokePasskey} to attempt: make one with {@link Bank.revokePasskeyGating}. */
export class RevokePasskeyGating extends Gating {
  constructor(bank: Bank, cleartexts: PasskeyRevokeCleartexts, friend: BankGatingFriend) { super(cleartexts, (given) => revokePasskey(bank, given, friend)) }
}
// --

// == [The gatings' bodies]: birthBank, unlockBank, replacePassphrase, addPasskey, revokePasskey

// Each body checks its gating's cleartexts, proves them, and makes its change through the bank's private verbs its friend
// carries. A cleartext goes only to its check, a strength check and a Proving builder, and a proving never leaves the body
// that built it but for those verbs (G9). Its gating vacates the cleartexts whatever the outcome (G2), and a body changes
// nothing where it refuses: a gate change writes the gate before it unlocks, so a refused write never unlocks.
//
// Two invariants hold of every gating:
// * Gatings are pragmatically idempotent: a gating whose intent is demonstrably satisfied may resolve with success. It is not
//   required to check that at every, or any, opportunity.
// * A gating's contract is in its name: a gating whose intent is met may succeed even where its inputs would otherwise have
//   been refused. (`revokePasskey` on a gate with no passkey proves, unlocks and writes nothing.)

/** Store a new bank of `device`'s scope, with the user's new passphrase and optional passkey, and resolve it unlocked.
 * Refuses `gate_made_elsewhere` where a live bank is already stored.
 */
async function birthBank(device: Device, cleartexts: unknown, friend: BirthGatingFriend): Promise<Bank> {
  Checks.device.parse(device).demandEnabled()
  const { passphraseCleartext, passkeyCleartext } = CleartextChecks.birth.parse(cleartexts)
  // A birth's stamps are minted here, one pair per gating.
  const { bankStamp, gateStamp } = Bank.mintStamps(device)
  const passphraseProving = await PassphraseProving.buildNovel(device, bankStamp, gateStamp, passphraseCleartext)
  const passkeyProving    = passkeyCleartext ? await PasskeyProving.buildNovel(device, bankStamp, gateStamp, passkeyCleartext) : null

  const main     = await passphraseProving.buildWayin(NOVEL)
  const passkey0 = await passkeyProving?.buildWayin(passphraseProving) ?? null
  const bankRecord = Bank.makeRecord({ ...bankStamp, maingate: { ...gateStamp, wayins: { main, passkey0 } } })
  return await friend.birth(bankRecord, passphraseProving)
}

/** Unlock `bank` by its passphrase or its passkey. */
async function unlockBank(bank: Bank, cleartexts: unknown, friend: Pick<BankGatingFriend, 'unlockByProving'>): Promise<Bank> {
  bank.demandEnabled()
  const proof  = CleartextChecks.unlock.parse(cleartexts)
  const proved = await provingOf(bank.device, bank.maingate, proof)
  return await friend.unlockByProving(proved)
}

// Each gate change writes the main gate's next revision over the one it proved against, then unlocks the bank under a
// lease citing the gate it wrote. The bankKey does not change.

/** Replace the passphrase of `bank`, proved by the current passphrase or the passkey. */
async function replacePassphrase(bank: Bank, cleartexts: unknown, friend: BankGatingFriend): Promise<Bank> {
  bank.demandEnabled()
  const { proof, nextPassphraseCleartext } = CleartextChecks.passphraseReplace.parse(cleartexts)
  if (proof.passphraseCleartext === nextPassphraseCleartext) { throw Throwers.samePassphrase() }
  await checkStrength(bank.device, nextPassphraseCleartext)
  const ante        = bank.maingate
  const proved      = await provingOf(bank.device, ante, proof)
  const nextProving = await PassphraseProving.buildNovel(bank.device, bank.stamp, ante.stamp, nextPassphraseCleartext)

  const main = await nextProving.buildWayin(proved)
  await friend.putGate(nextGateAsk(ante, { main, passkey0: ante.passkey0 }, 'replace_passphrase'))
  return await friend.unlockByProving(proved)
}

/** Add a passkey to `bank`, proved by its passphrase.
 * Refuses while the gate already has a passkey.
 */
async function addPasskey(bank: Bank, cleartexts: unknown, friend: BankGatingFriend): Promise<Bank> {
  bank.demandEnabled()
  const { passphraseCleartext, nextPasskeyCleartext } = CleartextChecks.passkeyAdd.parse(cleartexts)
  const ante = bank.maingate
  ante.demandPasskeyAddable()
  const proved         = await PassphraseProving.buildStored(bank.device, ante, passphraseCleartext)
  const passkeyProving = await PasskeyProving.buildNovel(bank.device, bank.stamp, ante.stamp, nextPasskeyCleartext)

  const passkey0 = await passkeyProving.buildWayin(proved)
  await friend.putGate(nextGateAsk(ante, { main: ante.main, passkey0 }, 'add_passkey'))
  return await friend.unlockByProving(proved)
}

/** Revoke the passkey of `bank`, proved by its passphrase or the passkey.
 * With no passkey, the proof unlocks the bank and nothing is written.
 */
async function revokePasskey(bank: Bank, cleartexts: unknown, friend: BankGatingFriend): Promise<Bank> {
  bank.demandEnabled()
  const proof  = CleartextChecks.passkeyRevoke.parse(cleartexts)
  const ante   = bank.maingate
  const proved = await provingOf(bank.device, ante, proof)

  if (ante.passkey0 !== null) { await friend.putGate(nextGateAsk(ante, { main: ante.main, passkey0: null }, 'revoke_passkey')) }
  return await friend.unlockByProving(proved)
}
// --

// == [A body's helpers]: checkStrength, provingOf, nextGateAsk

/** Refuse `weak_passphrase` unless `device`'s strength checker judges `passphraseCleartext` strong. */
async function checkStrength(device: Device, passphraseCleartext: string): Promise<void> {
  const verdict = await device.judgeStrength(passphraseCleartext)
  if (! verdict.strong) { throw Throwers.weakPassphrase(verdict.reason) }
}

/** The proving of `proof`, built against `gate`'s passphrase wayin or its passkey wayin, whichever `proof` is for. */
function provingOf(device: Device, gate: Gate, proof: ProvedCleartexts): Promise<Proving> {
  if (proof.passphraseCleartext === undefined) { return PasskeyProving.buildStored(gate, proof.passkeyCleartext) }
  return PassphraseProving.buildStored(device, gate, proof.passphraseCleartext)
}

// The ask cites the gate the gating proved against, never the bank's main gate as it stands at the write: a gate change
// landed meanwhile is refused as stale, and the proof unlocks nothing.
/** The draft put ask that writes `ante`'s next revision, with `wayins`, over `ante`, under the storage `policy`. */
function nextGateAsk(ante: Gate, wayins: GateDna['wayins'], policy: EX.StoragePolicy): PutAskDraft<GateRecord> {
  return { cited: ante.pickle(), record: ante.makeNextRecord(wayins), options: { policies: [policy] } }
}
// --

// == [Adopting and vacating]: adoptedCleartextsOf, adoptedAnswerOf, isAnswerish, zeroAnswer, zeroBytes

/** A copy of `cleartexts` the gating owns, each passkey answer adopted, checked only for its fields.
 * A throw that is not a VaultError, such as a host's getter throwing, is replaced by one that carries nothing of it.
 */
function adoptedCleartextsOf(cleartexts: unknown): GatingCleartexts {
  // Declared outside the try, so a refusal zeroes the gating's copies of the passkey answers too (G2).
  let passkeyCleartext:     unknown
  let nextPasskeyCleartext: unknown
  try {
    // The passkey answers are adopted before the fields are checked, so a refusal leaves none of the host's PRF bytes unzeroed.
    const handed = (cleartexts ?? {}) as GatingCleartexts
    passkeyCleartext     = adoptedAnswerOf(handed.passkeyCleartext)
    nextPasskeyCleartext = adoptedAnswerOf(handed.nextPasskeyCleartext)
    // Typed as the host declared them: each body judges the values it takes.
    const given = CleartextChecks.gatingArgs.parse(cleartexts)
    return omitBy({ ...given, passkeyCleartext, nextPasskeyCleartext }, (val) => val === undefined) as GatingCleartexts
  } catch (err) {
    zeroAnswer(passkeyCleartext)
    zeroAnswer(nextPasskeyCleartext)
    throw Errors.isVaultError(err) ? err : Throwers.cleartextsThrew()
  }
}

// Every object kept is the gating's own, its fields read once here, so nothing a vacate reaches can be a host's getter.
/** A copy of `answer` with PRF bytes of its own, the PRF bytes of `answer` itself zeroed (G2), or anything but an object as given. */
function adoptedAnswerOf(answer: unknown): unknown {
  if ((typeof answer !== 'object') || (answer === null)) { return answer }
  const adopted: { prfBytes?: unknown } = { ...answer }
  const { prfBytes } = adopted
  if (Validator.isBytes(prfBytes)) { adopted.prfBytes = new Uint8Array(prfBytes) }
  zeroBytes(prfBytes)
  return adopted
}

/** True of an object whose PRF bytes are bytes the gating can copy and zero. */
function isAnswerish(answer: unknown): answer is GX.PasskeyAnswer {
  return (typeof answer === 'object') && (answer !== null) && Validator.isBytes((answer as { prfBytes?: unknown }).prfBytes)
}

/** Zero the PRF bytes of `answer`, the gating's own, if it has any. */
function zeroAnswer(answer: unknown): void {
  if (isAnswerish(answer)) { answer.prfBytes.fill(0) }
}

/** Zero `bytes` where they are a view or an ArrayBuffer, of this realm or another's. */
function zeroBytes(bytes: unknown): void {
  // A view, of this realm or another's (an iframe, jsdom): ArrayBuffer.isView reads the internal slot, where instanceof would miss it.
  if (ArrayBuffer.isView(bytes)) { new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).fill(0) }
  // A bare ArrayBuffer, as WebAuthn hands the PRF output, judged by its tag for the same reason.
  if (Object.prototype.toString.call(bytes) === '[object ArrayBuffer]') { new Uint8Array(bytes as ArrayBuffer).fill(0) }
}
// --

// == [Checks]: Checks

// Defined here, not with the shapes: it names a model class. Only a birth needs it: every other gating takes a bank,
// whose device is already checked.
/** The check of {@link birthBank}'s device. */
const Checks = Validator.Checkers('bad_record', ({ custom }) => ({
  device: custom<Device>((val) => val instanceof Device, BigPhrases.DeviceExpected),
}))
// --
