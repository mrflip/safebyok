import 'fake-indexeddb/auto'
import { omit } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import { VaultKin, bankScopeDuck, boxscopeDuck, leaseStampDuck, vaultScopeDuck, vaultStampButFormatDuck, vaultStampDuck } from '../../src/shapes/ducks'
import { VaultFormat } from '../../src/shapes/vault'
import * as TH from '../test-helpers'

const scope = TH.scopeOf('u1')
const record = TH.vaultRecordOf('u1')
const box = { ...scope, ...TH.boxOf('openai', 'b1') }

describe("VaultKin", () => {
  it("takes every record of the vault's kin, each field as its owner checks it, as its example shows", async () => {
    const lease = await TH.leaseOf('u1')
    for (const kin of [record, TH.gatelessOf('u1'), box, lease, TH.deviceRecordOf('u1'), { format: 'safebyok-tombstone-v1', ...scope, vault_epoch: 4 }]) {
      expect(VaultKin.partial().strict().safeParse(kin).success).to.be.true
    }
  })
})

describe("vaultScopeDuck", () => {
  const ScopeCases = [
    // whatever a caller has in hand:
    [scope,                                    'a scope'],
    [record,                                   'a vault record'],
    [box,                                      "a box record beside its scope: a box's scope passes as its vault's"],
    [TH.deviceRecordOf('u1'),                  'a device record'],
  ] as const

  for (const [thing, blurb] of ScopeCases) {
    it(`takes the scope alone from ${blurb}, frozen, as its first two examples show`, () => {
      const taken = vaultScopeDuck.parse(thing)
      expect(taken).to.deep.equal(scope)
      expect(Object.isFrozen(taken)).to.be.true
    })
  }

  it("takes the scope from a Vault object, whose own fields are its stamp", async () => {
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    expect(vaultScopeDuck.parse(vault)).to.deep.equal(vaultScopeDuck.parse(vault.stamp))
    TH.closeVault(vault)
  })

  const RefusedCases = [
    // a field none of the kin carries:
    [{ ...scope, vaultDB: {} },                  'a store, as its third example shows'],
    [{ ...scope, vautlabel: 'main' },            'a misspelt name'],
    // a field the kin carry, malformed, though the scope never reads it:
    [{ ...scope, vault_tok: '' },                'an empty vault_tok, as its fourth example shows'],
    [{ ...scope, gate_epoch: -1 },               'an epoch below 0'],
    [{ ...scope, format: 'safebyok-vault-v5' },  'a format none of the kin carries'],
    [{ ...record, gate: { passphrase: null } },  'a damaged gate'],
    // the scope itself:
    [omit(scope, ['vaultlabel']),                'a scope without its vaultlabel'],
    [{ ...scope, applabel: 'Acme' },             'an applabel that is not a label'],
  ] as const

  for (const [thing, blurb] of RefusedCases) {
    it(`refuses ${blurb} as 'bad_scope'`, () => {
      TH.expectSyncRefusal(() => vaultScopeDuck.parse(thing), 'bad_scope')
    })
  }
})

describe("bankScopeDuck and boxscopeDuck", () => {
  it("take a bank's scope from a vault's, and a box's from a box record beside its scope", () => {
    expect(bankScopeDuck.parse(record)).to.deep.equal({ applabel: 'acme', user_id: 'u1' })
    expect(boxscopeDuck.parse(box)).to.deep.equal({ ...scope, boxlabel: 'openai' })
  })

  it("refuses a vault record as a box's scope, which it lacks the boxlabel of", () => {
    TH.expectSyncRefusal(() => boxscopeDuck.parse(record), 'bad_scope')
  })
})

describe("the stamp ducks", () => {
  const stamp = { format: VaultFormat, ...scope, vault_tok: record.vault_tok, registered_at: record.registered_at }

  it("take a vault's stamp from its record, with and without its format, as the first example shows", () => {
    expect(vaultStampDuck.parse(record)).to.deep.equal(stamp)
    expect(vaultStampButFormatDuck.parse(record)).to.deep.equal(omit(stamp, ['format']))
  })

  it("take a vault's stamp from a Vault object", async () => {
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    expect(vaultStampDuck.parse(vault)).to.deep.equal(vault.stamp)
    TH.closeVault(vault)
  })

  it("refuse a box as a vault's stamp, as the second example shows: its registered_at is its own", () => {
    TH.expectSyncRefusal(() => vaultStampButFormatDuck.parse({ ...box, vault_tok: record.vault_tok }), 'bad_record')
  })

  it("refuse a stamp missing a field it binds", () => {
    TH.expectSyncRefusal(() => vaultStampButFormatDuck.parse(omit(record, ['registered_at'])), 'bad_record')
  })

  it("take a lease's stamp from its record, leaving out its key material", async () => {
    const lease = await TH.leaseOf('u1')
    expect(leaseStampDuck.parse(lease)).to.deep.equal(omit(lease, ['lease_key', 'vault_key_lease_wrapped']))
  })
})
