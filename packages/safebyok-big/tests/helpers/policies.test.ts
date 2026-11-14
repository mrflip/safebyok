import { describe, expect, it } from 'vitest'
import * as Phrases from '../../src/helpers/phrases'
import { StorageDemandsDispatcher, add_passkey, demandStorage, replace_passphrase, revoke_passkey } from '../../src/helpers/policies'
import type { StoredGateRows } from '../../src/helpers/policies'
import { VaultError, rowsOfRefusal } from '../../src/refusals/errors'
import type { GatePutAsk, GateRecord } from '../../src/shapes/shapes-bankdb'
import { storagePolicyVals } from '../../src/shapes/shapes-enums'
import { Now, bankAt, gateAt, gatePutAskOf, mainWayin, otherMainWayin, passkey0Wayin } from '../test-helpers/bankdb-world'

const parent    = bankAt()
const bareGate  = gateAt()
const keyedGate = gateAt(0, 'bank1', { main: mainWayin, passkey0: passkey0Wayin })
const otherPasskey0Wayin = { ...passkey0Wayin, credential_id: 'cred2' }

/** The rows stored under `gate`, as a policy reads them. */
function storedOver(gate: GateRecord): StoredGateRows { return { parent, gate } }

/** `ask` with its record registered later than the gate row it replaces. */
function registeredLater(ask: GatePutAsk): GatePutAsk { return { ...ask, record: { ...ask.record, registered_at: Now + 5 } } }

/** The VaultError `demand` throws, failing the test where it throws none. */
function refusalOf(demand: () => unknown): VaultError {
  try { demand() } catch (err) { if (err instanceof VaultError) { return err } throw err }
  return expect.fail('the policy passed where it should have refused')
}

/** A table of one policy's cases: the ask, the gate row stored, and the reason it refuses, or null where it passes. */
type PolicyCase = readonly [ask: GatePutAsk, gate: GateRecord, why: string | null, blurb: string]

/** Registers `cases` against `policy`: each passes, or refuses gate_issue for its reason with the rows stored. */
function describePolicy(policy: (ask: GatePutAsk, stored: StoredGateRows) => true, cases: readonly PolicyCase[]): void {
  for (const [ask, gate, why, blurb] of cases) {
    it(blurb, () => {
      if (why === null) {
        expect(policy(ask, storedOver(gate))).to.be.true
        return
      }
      const err = refusalOf(() => policy(ask, storedOver(gate)))
      expect(err.refusalkind).to.eq('gate_issue')
      expect(err.message).to.eq(Phrases.gateIssue(why))
      expect(rowsOfRefusal(err)).to.deep.include({ parent, dbhas: gate })
    })
  }
}

describe("replace_passphrase", () => {
  const replace = gatePutAskOf('replace_passphrase', bareGate, { main: otherMainWayin })
  describePolicy(replace_passphrase, [
    [replace,                                                                                         bareGate,  null,                          'passes a record that replaces only the main wayin'],
    [gatePutAskOf('replace_passphrase', keyedGate, { main: otherMainWayin, passkey0: passkey0Wayin }), keyedGate, null,                          'passes a record that keeps the passkey wayin stored'],
    // each demand, in order:
    [registeredLater(replace),                                                                        bareGate,  Phrases.RegisteredAtNotStored, 'refuses a record whose registered_at is not the stored one'],
    [{ ...replace, expected: { ...replace.expected, wayins: { main: otherMainWayin } } },              bareGate,  Phrases.ProvedWayinMoved,      'refuses an expected main wayin that is not the stored one'],
    [gatePutAskOf('replace_passphrase', bareGate, { main: otherMainWayin, passkey0: passkey0Wayin }),  bareGate,  Phrases.OtherWayinMoved,       'refuses a record that adds a passkey wayin'],
    [gatePutAskOf('replace_passphrase', keyedGate, { main: otherMainWayin }),                          keyedGate, Phrases.OtherWayinMoved,       'refuses a record that drops the passkey wayin'],
    // more than one demand failed:
    [registeredLater(gatePutAskOf('replace_passphrase', keyedGate, { main: otherMainWayin })),         keyedGate, Phrases.RegisteredAtNotStored, 'refuses for the first demand a record fails'],
  ])
})

describe("add_passkey", () => {
  const add = gatePutAskOf('add_passkey', bareGate, { main: mainWayin, passkey0: passkey0Wayin })
  describePolicy(add_passkey, [
    [add,                                                                                             bareGate,  null,                          'passes a record that adds only a passkey wayin'],
    // each demand, in order:
    [registeredLater(add),                                                                            bareGate,  Phrases.RegisteredAtNotStored, 'refuses a record whose registered_at is not the stored one'],
    [gatePutAskOf('add_passkey', keyedGate, { main: mainWayin, passkey0: otherPasskey0Wayin }),        keyedGate, Phrases.PasskeyStored,         'refuses a passkey over one stored'],
    [gatePutAskOf('add_passkey', bareGate, { main: mainWayin }),                                       bareGate,  Phrases.PasskeyNotAdded,       'refuses a record with no passkey wayin'],
    [gatePutAskOf('add_passkey', bareGate, { main: otherMainWayin, passkey0: passkey0Wayin }),         bareGate,  Phrases.OtherWayinMoved,       'refuses a record that also moves the main wayin'],
  ])
})

describe("revoke_passkey", () => {
  const revoke = gatePutAskOf('revoke_passkey', keyedGate, { main: mainWayin })
  describePolicy(revoke_passkey, [
    [revoke,                                                                                          keyedGate, null,                          'passes a record that drops only the passkey wayin'],
    // each demand, in order:
    [registeredLater(revoke),                                                                         keyedGate, Phrases.RegisteredAtNotStored, 'refuses a record whose registered_at is not the stored one'],
    [gatePutAskOf('revoke_passkey', bareGate, { main: mainWayin }),                                    bareGate,  Phrases.NoPasskeyStored,       'refuses a gate with no passkey wayin stored'],
    [gatePutAskOf('revoke_passkey', keyedGate, { main: mainWayin, passkey0: passkey0Wayin }),          keyedGate, Phrases.PasskeyNotRevoked,     'refuses a record that keeps the passkey wayin'],
    [gatePutAskOf('revoke_passkey', keyedGate, { main: otherMainWayin }),                              keyedGate, Phrases.OtherWayinMoved,       'refuses a record that also moves the main wayin'],
  ])
})

describe("StorageDemandsDispatcher", () => {
  it("has a function for every storage policy", () => {
    expect(Object.keys(StorageDemandsDispatcher)).to.have.members([...storagePolicyVals])
    for (const policy of storagePolicyVals) { expect(StorageDemandsDispatcher[policy]).to.be.a('function') }
  })
})

describe("demandStorage(ask, stored)", () => {
  it("passes an ask its named policy passes", () => {
    expect(demandStorage(gatePutAskOf('add_passkey', bareGate, { main: mainWayin, passkey0: passkey0Wayin }), storedOver(bareGate))).to.be.true
  })

  // The same change is refused or passed by the policy the ask names, never by the change alone.
  it("applies the policy the ask names, and no other", () => {
    const dropped = { main: mainWayin }
    expect(demandStorage(gatePutAskOf('revoke_passkey', keyedGate, dropped), storedOver(keyedGate))).to.be.true
    expect(refusalOf(() => demandStorage(gatePutAskOf('replace_passphrase', keyedGate, dropped), storedOver(keyedGate))).message).to.eq(Phrases.gateIssue(Phrases.OtherWayinMoved))
    expect(refusalOf(() => demandStorage(gatePutAskOf('add_passkey', keyedGate, dropped), storedOver(keyedGate))).message).to.eq(Phrases.gateIssue(Phrases.PasskeyStored))
  })

  it.each(storagePolicyVals)("refuses where %s refuses", (policy) => {
    const ask = registeredLater(gatePutAskOf(policy, keyedGate, keyedGate.wayins))
    expect(refusalOf(() => demandStorage(ask, storedOver(keyedGate))).refusalkind).to.eq('gate_issue')
  })
})
