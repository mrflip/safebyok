/** A form verb's gating: the form's cleartexts, hidden from anything that serializes, prints or spreads an object, and the change they prove, attempted once. */

import { omitBy } from 'es-toolkit'
import { type EX, type GX, Errors, Outcome, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import { Bank } from './bank'
import { BaseBox } from './base-box'
import { Device } from './device'
import { Gate } from './gate'
import type { Wayin } from './wayin'
import { NOVEL, PasskeyProving, PassphraseProving, type Proving } from './proving'
import {
  type BirthCleartexts, type BirthGatingFriend, type GateDna, type GateGatingFriend, type GatingCleartexts, type PasskeyAddCleartexts, type PasskeyRevokeCleartexts,
  type PassphraseReplaceCleartexts, type ProvedCleartexts, type UnlockCleartexts, CleartextChecks,
} from '../shapes/shapes-gateish'
import type { PutAskDraft } from '../shapes/shapes-asks'
import type { StampedGate } from '../shapes/shapes-stamps'
import { Labelpath } from '../shapes/primitives'
import { type GateRecord, Shell } from '../shapes/shapes-thing'
import { BoxChecks } from '../shapes/shapes-thingkinds'
import * as Throwers from '../refusals/throwers'

// == [The gating]: Gating, GatingMarker

/** The text a gating shows wherever it is serialized or printed. */
const GatingMarker = '[gating]'

// A form mutation's variables stay in React Query's mutation cache, its devtools and the `useMutation` hook's state; a
// gating there shows none of its cleartexts, and is vacated once attempted. A cleartext goes from the gating only to its
// verb's body.
/** A form verb's cleartexts and the change they prove, to attempt once: make one with a {@link Gate} maker, such as {@link Gate.unlockGating}.
 * A spread copies none of its cleartexts, and JSON, `String()` and Node's inspect show only `'[gating]'`.
 */
export class Gating<ResolvedT = unknown> {
  /** The cleartexts adopted, or none once vacated. */
  #cleartexts: GatingCleartexts
  /** The verb's body, with the friend it makes its change through. */
  readonly #body: (cleartexts: GatingCleartexts) => Promise<ResolvedT>
  /** True once attempted or vacated. */
  #isSpent = false

  /** Adopt `cleartexts` for `body`: the PRF bytes of each passkey answer are copied, and those in the answer handed in are zeroed. */
  protected constructor(cleartexts: unknown, body: (cleartexts: GatingCleartexts) => Promise<ResolvedT>) {
    this.#cleartexts = adoptedCleartextsOf(cleartexts)
    this.#body       = body
    Object.freeze(this)
  }

  /** Prove the cleartexts and make the verb's change, resolving the gate, or the bank a birth stores.
   * A gating is attempted once, and vacated whatever the outcome: make another for the next try.
   */
  async attempt(): Promise<ResolvedT> {
    try {
      if (this.#isSpent) { throw Throwers.gatingSpent() }
      this.#isSpent = true
      return await this.#body(this.#cleartexts)
    } finally {
      this.vacate()
    }
  }

  /** {@link attempt}, resolving an `Outcome` instead of throwing. */
  tryAttempt(): Promise<Outcome.Outcome<ResolvedT>> { return Outcome.outcomeOf(() => this.attempt()) }

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
export class BirthGating extends Gating<Bank> {
  constructor(device: Device, cleartexts: BirthCleartexts, friend: BirthGatingFriend) { super(cleartexts, (given) => birthBank(device, given, friend)) }
}

/** A {@link Gate.unlock} to attempt: make one with {@link Gate.unlockGating}. */
export class UnlockGating extends Gating<Gate> {
  constructor(gate: Gate, cleartexts: UnlockCleartexts, friend: Pick<GateGatingFriend, 'unlockByProving'>) { super(cleartexts, (given) => unlockGate(gate, given, friend)) }
}

/** A {@link Gate.replacePassphrase} to attempt: make one with {@link Gate.replacePassphraseGating}. */
export class ReplacePassphraseGating extends Gating<Gate> {
  constructor(gate: Gate, cleartexts: PassphraseReplaceCleartexts, friend: GateGatingFriend) { super(cleartexts, (given) => replacePassphrase(gate, given, friend)) }
}

/** A {@link Gate.addPasskey} to attempt: make one with {@link Gate.addPasskeyGating}. */
export class AddPasskeyGating extends Gating<Gate> {
  constructor(gate: Gate, cleartexts: PasskeyAddCleartexts, friend: GateGatingFriend) { super(cleartexts, (given) => addPasskey(gate, given, friend)) }
}

/** A {@link Gate.revokePasskey} to attempt: make one with {@link Gate.revokePasskeyGating}. */
export class RevokePasskeyGating extends Gating<Gate> {
  constructor(gate: Gate, cleartexts: PasskeyRevokeCleartexts, friend: GateGatingFriend) { super(cleartexts, (given) => revokePasskey(gate, given, friend)) }
}
// --

// == [The gatings' bodies]: birthBank, unlockGate, replacePassphrase, addPasskey, revokePasskey

// Each body checks its gating's cleartexts, proves them, and makes its change through the gate's private verbs its friend
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
  const bankRecord = Bank.makeRecord(bankStamp)
  const rootShell  = BoxChecks.liveOrShell.parse(Shell.of({ ...device.scope, labelpath: Labelpath.RootBox }))
  const { vaultDB } = device
  // The root box is sealed under the lease of the gate the birth makes, and the bank stored is made with that gate,
  // unlocked. Where the birth refuses, or the vaultDB's answer is broken, the gate is swept, and no bank holds it.
  const gate = Gate.make(Gate.makeRecord({ ...gateStamp, wayins: { main, passkey0 } }), { device, vaultDB, bankStamp })
  try {
    await friend.unlockByProving(gate, passphraseProving)
    const root   = await gate.seal(BaseBox, rootShell, { sidecar: {} }, { whisper: {} })
    // The roots it answers, written or found stored, are then the bank's world in the device's BankMinder.
    const answer = await device.bankMinder.tryBirthBank(vaultDB, { ...device.scope, op: 'birth', bank: bankRecord, gate: gate.pickle(), root })
    if (! answer.ok) { throw answer.err }
    // The user must hear that their passphrase was not set: the bank stored is another's.
    if (answer.val.bank.revtok !== bankRecord.revtok) { throw Throwers.gateMadeElsewhere() }
    const bank = Bank.make(answer.val.bank, { device, vaultDB, gate })
    friend.attachBank(bank)
    return bank
  } catch (err) {
    gate.sweep()
    throw err
  }
}

/** Unlock `gate` by its passphrase or its passkey. */
async function unlockGate(gate: Gate, cleartexts: unknown, friend: Pick<GateGatingFriend, 'unlockByProving'>): Promise<Gate> {
  gate.demandEnabled()
  const proof  = CleartextChecks.unlock.parse(cleartexts)
  const proved = await provingOf(gate.device, gate, proof)
  return await friend.unlockByProving(proved)
}

// Each gate change reads the revision it proves against before its first await, writes the gate's next revision over
// that one, then unlocks the gate under a lease citing the revision written. The bankKey does not change.

/** Replace the passphrase of `gate`, proved by the current passphrase or the passkey. */
async function replacePassphrase(gate: Gate, cleartexts: unknown, friend: GateGatingFriend): Promise<Gate> {
  gate.demandEnabled()
  const { proof, nextPassphraseCleartext } = CleartextChecks.passphraseReplace.parse(cleartexts)
  if (proof.passphraseCleartext === nextPassphraseCleartext) { throw Throwers.samePassphrase() }
  const ante = anteOf(gate)
  await checkStrength(gate.device, nextPassphraseCleartext)
  const proved      = await provingOf(gate.device, ante, proof)
  const nextProving = await PassphraseProving.buildNovel(gate.device, ante.bankStamp, ante.stamp, nextPassphraseCleartext)

  const main = await nextProving.buildWayin(proved)
  await friend.putGate(nextGateAsk(ante, { main, passkey0: ante.passkey0 }, 'replace_passphrase'))
  return await friend.unlockByProving(proved)
}

/** Add a passkey to `gate`, proved by its passphrase.
 * Refuses while the gate already has a passkey.
 */
async function addPasskey(gate: Gate, cleartexts: unknown, friend: GateGatingFriend): Promise<Gate> {
  gate.demandEnabled()
  const { passphraseCleartext, nextPasskeyCleartext } = CleartextChecks.passkeyAdd.parse(cleartexts)
  gate.demandPasskeyAddable()
  const ante = anteOf(gate)
  const proved         = await PassphraseProving.buildStored(gate.device, ante, passphraseCleartext)
  const passkeyProving = await PasskeyProving.buildNovel(gate.device, ante.bankStamp, ante.stamp, nextPasskeyCleartext)

  const passkey0 = await passkeyProving.buildWayin(proved)
  await friend.putGate(nextGateAsk(ante, { main: ante.main, passkey0 }, 'add_passkey'))
  return await friend.unlockByProving(proved)
}

/** Revoke the passkey of `gate`, proved by its passphrase or the passkey.
 * With no passkey, the proof unlocks the gate and nothing is written.
 */
async function revokePasskey(gate: Gate, cleartexts: unknown, friend: GateGatingFriend): Promise<Gate> {
  gate.demandEnabled()
  const proof  = CleartextChecks.passkeyRevoke.parse(cleartexts)
  const ante   = anteOf(gate)
  const proved = await provingOf(gate.device, ante, proof)

  if (ante.passkey0 !== null) { await friend.putGate(nextGateAsk(ante, { main: ante.main, passkey0: null }, 'revoke_passkey')) }
  return await friend.unlockByProving(proved)
}
// --

// == [A body's helpers]: Ante, anteOf, checkStrength, provingOf, nextGateAsk

/** The revision of a gate a gate change proves against: its stamps, its record, which the write cites, and its wayins. */
interface Ante extends StampedGate {
  record:   GateRecord
  main:     Wayin
  passkey0: Wayin | null
}

/** The revision `gate` models now, as a gate change proves against it and carries it forward. */
function anteOf(gate: Gate): Ante {
  const record = gate.pickle()
  return { record, bankStamp: gate.bankStamp, stamp: gate.stamp, wayins: record.wayins, main: gate.main, passkey0: gate.passkey0 }
}

/** Refuse `weak_passphrase` unless `device`'s strength checker judges `passphraseCleartext` strong. */
async function checkStrength(device: Device, passphraseCleartext: string): Promise<void> {
  const verdict = await device.judgeStrength(passphraseCleartext)
  if (! verdict.strong) { throw Throwers.weakPassphrase(verdict.reason) }
}

/** The proving of `proof`, built against `gate`'s passphrase wayin or its passkey wayin, whichever `proof` is for. */
function provingOf(device: Device, gate: StampedGate, proof: ProvedCleartexts): Promise<Proving> {
  if (proof.passphraseCleartext === undefined) { return PasskeyProving.buildStored(gate, proof.passkeyCleartext) }
  return PassphraseProving.buildStored(device, gate, proof.passphraseCleartext)
}

// The ask cites the revision the gating proved against, never the gate as it stands at the write: a gate change landed
// meanwhile is refused as stale, and the proof unlocks nothing.
/** The draft put ask that writes the revision after `ante`, with `wayins`, over `ante`, under the storage `policy`. */
function nextGateAsk(ante: Ante, wayins: GateDna['wayins'], policy: EX.StoragePolicy): PutAskDraft<GateRecord> {
  return { cited: ante.record, record: Gate.makeNextRecord(ante.record, wayins), options: { policies: [policy] } }
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

// Defined here, not with the shapes: it names a model class. Only a birth needs it: every other gating takes a gate,
// whose device is already checked.
/** The check of {@link birthBank}'s device. */
const Checks = Validator.Checkers('bad_record', ({ custom }) => ({
  device: custom<Device>((val) => val instanceof Device, BigPhrases.DeviceExpected),
}))
// --
