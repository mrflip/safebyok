import { describe, expect, it } from 'vitest'
import * as TH from './test-helpers'
import { VaultRecordFields, ListedBoxFields, BoxFields, recordOf, selectionOf } from '../src/fields'

describe("selectionOf", () => {
  it("asks for each field, a ciphered one by its two halves", () => {
    expect(selectionOf([['boxlabel', 'plain'], ['whisper_ciphered', 'ciphered']])).to.eq('boxlabel whisper_ciphered { cipher_iv_b64 ciphertext_b64 }')
  })

  it("asks for a vault record's gate by its two ways in, as its second example shows", () => {
    expect(selectionOf([['gate', 'gate']])).to.eq('gate { passphrase passkey }')
    expect(selectionOf(VaultRecordFields)).to.eq('format applabel user_id vaultlabel vault_tok registered_at vault_epoch gate_epoch gate { passphrase passkey }')
  })

  it("asks for a listed box without either ciphered field", () => {
    expect(selectionOf(ListedBoxFields)).to.eq('format boxlabel revision_tok whisper_codec whisper_schema_version sidecar registered_at written_at')
  })
})

describe("recordOf", () => {
  it("keeps the fields asked for, a null one as null, leaving out a GraphQL client's __typename, as its example shows", () => {
    expect(recordOf({ vault_tok: 'v1', passkey: null, __typename: 'SafebyokVaultRecord' }, [['vault_tok', 'plain'], ['passkey', 'plain']])).to.deep.equal({ vault_tok: 'v1', passkey: null })
  })

  it("leaves out a field asked for that was not sent", () => {
    expect(recordOf({ vault_tok: 'v1' }, [['vault_tok', 'plain'], ['passkey', 'plain']])).to.deep.equal({ vault_tok: 'v1' })
  })

  it("gives back a whole box as it was, and a ciphered field as its two halves alone", () => {
    const box = TH.boxOf('openai', 'r1')
    expect(recordOf(box, BoxFields)).to.deep.equal(box)
    const answered = { ...box, whisper_ciphered: { ...box.whisper_ciphered, __typename: 'SafebyokCiphered' } }
    expect(recordOf(answered, BoxFields)).to.deep.equal(box)
  })

  it("gives back the vault record's gate as it was, its ways in never looked inside, and a novel vault's null gate as null", () => {
    const vaultRecord = TH.vaultRecordOf('u1', { gate: TH.gateOf('u1', { passphrase: TH.wayinOf('home_phrase'), passkey: TH.passkeyWayinOf('laptop') }) })
    expect(recordOf(vaultRecord, VaultRecordFields)).to.deep.equal(vaultRecord)
    expect(recordOf(TH.vaultRecordOf('u1'), VaultRecordFields)).to.deep.equal(TH.vaultRecordOf('u1'))
    expect(recordOf(TH.gatelessOf('u1'), VaultRecordFields)).to.deep.equal(TH.gatelessOf('u1'))
  })

  it("leaves a GraphQL client's __typename out of a gate, keeping its two ways in alone", () => {
    const vaultRecord = TH.vaultRecordOf('u1')
    const answered = { ...vaultRecord, gate: { ...vaultRecord.gate, __typename: 'SafebyokGate' } }
    expect(recordOf(answered, VaultRecordFields)).to.deep.equal(vaultRecord)
  })

  it("carries a box's sidecar as the JSON object it was written as, an empty one among them", () => {
    const box = TH.boxOf('openai', 'r1', { sidecar: { beta: 1, alpha: 'caf\u{E9}' } })
    expect(recordOf(box, BoxFields)).to.deep.include({ sidecar: { beta: 1, alpha: 'caf\u{E9}' } })
    expect(recordOf(TH.boxOf('openai', 'r1', { sidecar: {} }), BoxFields)).to.deep.include({ sidecar: {} })
  })

  it("drops a field the record has not got", () => {
    expect(recordOf({ ...TH.boxOf('openai', 'r1'), vault_tok: 'stray' }, BoxFields)).to.not.have.property('vault_tok')
  })

  const NotRecords = [
    [null,         'null'],
    [undefined,    'undefined'],
    ["a box",      'text'],
    [[1, 2],       'a list'],
  ] as const

  for (const [sent, blurb] of NotRecords) {
    it(`gives back ${blurb} as it is, for the VaultDB's validation to refuse`, () => {
      expect(recordOf(sent, BoxFields)).to.deep.equal(sent)
    })
  }

  it("gives back a ciphered field that is not an object as it is", () => {
    expect(recordOf({ whisper_ciphered: 'not halves' }, BoxFields)).to.deep.equal({ whisper_ciphered: 'not halves' })
  })
})
