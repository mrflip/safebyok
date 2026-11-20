import { type EX, Errors, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import { Bank } from './bank'
import { Device } from './device'
import type { Gate } from './gate'
import { NOVEL, PasskeyProving, PassphraseProving, type Proving } from './proving'
import { type BankGatingFriend, type BirthFriend, type GateDna, type ProvedCleartexts, CleartextChecks } from '../shapes/shapes-gateish'
import type { PutAskDraft } from '../shapes/shapes-asks'
import type { GateRecord } from '../shapes/shapes-thing'
import * as Throwers from '../refusals/throwers'

// == [The attempts]: birthBank, unlockBank, replacePassphrase, addPasskey, revokePasskey

// Each attempt checks its cleartexts, proves them, and makes its change through the bank's private verbs its friend carries.
// A cleartext goes only to checkedCleartexts, a strength check and a Proving builder, and a proving never leaves the attempt
// that built it but for those verbs (G9). Each vacates its cleartexts whatever its outcome (G2), and changes nothing where it
// refuses: a gate change writes the gate before it unlocks, so a refused write never unlocks.

/** Birth a bank of `device`'s scope from the user's new passphrase and optional passkey: write it, and unlock it.
 * Refuses `gate_made_elsewhere` if a live bank is already stored there.
 */
export async function birthBank(device: Device, cleartexts: unknown, friend: BirthFriend): Promise<Bank> {
  try {
    Checks.device.parse(device).demandEnabled()
    const { passphraseClear: passphraseCleartext, passkeyClear: passkeyCleartext } = checkedCleartexts(CleartextChecks.birth, cleartexts)
    // A birth's stamps are minted here, one pair per attempt.
    const { bankStamp, gateStamp } = Bank.mintStamps(device)
    const passphraseProving = await PassphraseProving.buildNovel(device, bankStamp, gateStamp, passphraseCleartext)
    const passkeyProving    = passkeyCleartext ? await PasskeyProving.buildNovel(device, bankStamp, gateStamp, passkeyCleartext) : null

    const main     = await passphraseProving.buildWayin(NOVEL)
    const passkey0 = await passkeyProving?.buildWayin(passphraseProving) ?? null
    const bankRecord = Bank.makeRecord({ ...bankStamp, maingate: { ...gateStamp, wayins: { main, passkey0 } } })
    return await friend.birth(bankRecord, passphraseProving)
  } finally {
    vacateCleartexts(cleartexts)
  }
}

/** Unlock `bank` by its passphrase or its passkey. */
export async function unlockBank(bank: Bank, cleartexts: unknown, friend: Pick<BankGatingFriend, 'unlockByProving'>): Promise<Bank> {
  try {
    bank.demandEnabled()
    const proof  = checkedCleartexts(CleartextChecks.unlock, cleartexts)
    const proved = await provingOf(bank.device, bank.maingate, proof)
    return await friend.unlockByProving(proved)
  } finally {
    vacateCleartexts(cleartexts)
  }
}

// Each gate change writes the main gate's next revision over the one it proved against, then unlocks the bank under a
// lease citing the gate it wrote. The bankKey does not change.

/** Replace the passphrase of `bank`, proved by the current passphrase or the passkey. */
export async function replacePassphrase(bank: Bank, cleartexts: unknown, friend: BankGatingFriend): Promise<Bank> {
  try {
    bank.demandEnabled()
    const { proof, nextPassphraseClear: nextPassphraseCleartext } = checkedCleartexts(CleartextChecks.passphraseReplace, cleartexts)
    if (proof.passphraseClear === nextPassphraseCleartext) { throw Throwers.samePassphrase() }
    await checkStrength(bank.device, nextPassphraseCleartext)
    const ante        = bank.maingate
    const proved      = await provingOf(bank.device, ante, proof)
    const nextProving = await PassphraseProving.buildNovel(bank.device, bank.stamp, ante.stamp, nextPassphraseCleartext)

    const main = await nextProving.buildWayin(proved)
    await friend.putGate(nextGateAsk(ante, { main, passkey0: ante.passkey0 }, 'replace_passphrase'))
    return await friend.unlockByProving(proved)
  } finally {
    vacateCleartexts(cleartexts)
  }
}

/** Add a passkey to `bank`, proved by its passphrase. Refuses while the gate has a passkey. */
export async function addPasskey(bank: Bank, cleartexts: unknown, friend: BankGatingFriend): Promise<Bank> {
  try {
    bank.demandEnabled()
    const { passphraseClear: passphraseCleartext, nextPasskeyClear: nextPasskeyCleartext } = checkedCleartexts(CleartextChecks.passkeyAdd, cleartexts)
    const ante = bank.maingate
    ante.demandPasskeyAddable()
    const proved         = await PassphraseProving.buildStored(bank.device, ante, passphraseCleartext)
    const passkeyProving = await PasskeyProving.buildNovel(bank.device, bank.stamp, ante.stamp, nextPasskeyCleartext)

    const passkey0 = await passkeyProving.buildWayin(proved)
    await friend.putGate(nextGateAsk(ante, { main: ante.main, passkey0 }, 'add_passkey'))
    return await friend.unlockByProving(proved)
  } finally {
    vacateCleartexts(cleartexts)
  }
}

/** Revoke the passkey of `bank`, proved by its passphrase or the passkey. With no passkey, the proof unlocks the bank and nothing is written. */
export async function revokePasskey(bank: Bank, cleartexts: unknown, friend: BankGatingFriend): Promise<Bank> {
  try {
    bank.demandEnabled()
    const proof  = checkedCleartexts(CleartextChecks.passkeyRevoke, cleartexts)
    const ante   = bank.maingate
    const proved = await provingOf(bank.device, ante, proof)

    if (ante.passkey0 !== null) { await friend.putGate(nextGateAsk(ante, { main: ante.main, passkey0: null }, 'revoke_passkey')) }
    return await friend.unlockByProving(proved)
  } finally {
    vacateCleartexts(cleartexts)
  }
}
// --

// == [An attempt's helpers]: checkedCleartexts, checkStrength, provingOf, nextGateAsk, vacateCleartexts, vacateAnswerAt

/** Check `cleartexts` with `checker`.
 * A throw that is not a VaultError, such as a host's getter throwing, is replaced by one that keeps nothing of it.
 */
function checkedCleartexts<CleartextsT>(checker: { parse: (cleartexts: unknown) => CleartextsT }, cleartexts: unknown): CleartextsT {
  try {
    return checker.parse(cleartexts)
  } catch (err) {
    throw Errors.isVaultError(err) ? err : Throwers.cleartextsThrew()
  }
}

/** Refuse `weak_passphrase` unless `device`'s strength checker judges `passphraseCleartext` strong. */
async function checkStrength(device: Device, passphraseCleartext: string): Promise<void> {
  const verdict = await device.judgeStrength(passphraseCleartext)
  if (! verdict.strong) { throw Throwers.weakPassphrase(verdict.reason) }
}

/** The proving of the way in of `gate` that `proof` is for: its passphrase wayin, or its passkey wayin. */
function provingOf(device: Device, gate: Gate, proof: ProvedCleartexts): Promise<Proving> {
  if (proof.passphraseClear === undefined) { return PasskeyProving.buildStored(gate, proof.passkeyClear) }
  return PassphraseProving.buildStored(device, gate, proof.passphraseClear)
}

// The ask cites the gate the attempt proved against, never the bank's main gate as it stands at the write: a gate change
// landed meanwhile is refused as stale, and the proof unlocks nothing.
/** The draft of the put that writes the next revision of `ante`, with `wayins`, over `ante`, under the storage policy of its change. */
function nextGateAsk(ante: Gate, wayins: GateDna['wayins'], policy: EX.StoragePolicy): PutAskDraft<GateRecord> {
  return { cited: ante.pickle(), record: ante.makeNextRecord(wayins), options: { policies: [policy] } }
}

/** Zero the PRF bytes of each passkey answer in `cleartexts`, the proof's and a new passkey's (G2). */
function vacateCleartexts(cleartexts: unknown): void {
  vacateAnswerAt(cleartexts, 'passkeyClear')
  vacateAnswerAt(cleartexts, 'nextPasskeyClear')
}

/** Zero the PRF bytes of the passkey answer at `fieldname` in `cleartexts`, if it has one. */
function vacateAnswerAt(cleartexts: unknown, fieldname: 'passkeyClear' | 'nextPasskeyClear'): void {
  // The reach-in may meet a getter or a proxy of the host's, which may throw: vacating is best effort, and never replaces the outcome it follows.
  // The cleartexts may be unchecked, as when the shape refuses, so nothing about them is assumed. An answer is single-use: once zeroed, a
  // second hand-in is refused by its all-zero bytes.
  try {
    const prfBytes: unknown = (cleartexts as Partial<Record<typeof fieldname, { prfBytes?: unknown } | null>> | null)?.[fieldname]?.prfBytes
    // A view, of this realm or another's (an iframe, jsdom): ArrayBuffer.isView reads the internal slot, where instanceof would miss it.
    if (ArrayBuffer.isView(prfBytes)) { new Uint8Array(prfBytes.buffer, prfBytes.byteOffset, prfBytes.byteLength).fill(0) }
    // A bare ArrayBuffer, as WebAuthn hands the PRF output, judged by its tag for the same reason.
    if (Object.prototype.toString.call(prfBytes) === '[object ArrayBuffer]') { new Uint8Array(prfBytes as ArrayBuffer).fill(0) }
  } catch { /* nothing left to vacate */ }
}
// --

// == [Checks]: Checks

// Defined here, not with the shapes: it names a model class.
/** The check of {@link birthBank}'s device, the one argument a bank's birth has no bank to vouch for. */
const Checks = Validator.Checkers('bad_record', ({ custom }) => ({
  device: custom<Device>((val) => val instanceof Device, BigPhrases.DeviceExpected),
}))
// --
