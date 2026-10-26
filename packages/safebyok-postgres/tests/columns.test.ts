import { describe, expect, it } from 'vitest'
import * as TH from './test-helpers'
import * as Columns from '../src/columns'
import { VaultRowColumns, ListedBoxColumns, BoxColumns, rowOfVaultRecord, vaultRecordOfRow } from '../src/columns'
import type { Column } from '../src/columns'

const Pair: Column[] = [['vault_tok', 'text'], ['registered_at', 'bigint']]

describe("Columns.names", () => {
  it("lists the columns' names, as an INSERT does", () => {
    expect(Columns.names(Pair)).to.eq('vault_tok, registered_at')
  })
})

describe("Columns.placeholders", () => {
  it("numbers a parameter for each column from the first, cast to its type", () => {
    expect(Columns.placeholders(Pair, 4)).to.eq('$4::text, $5::bigint')
  })

  it("casts a jsonb column's parameter, which arrives as JSON text", () => {
    expect(Columns.placeholders([['whisper_ciphered', 'jsonb']], 1)).to.eq('$1::jsonb')
  })
})

describe("Columns.placeholderOf", () => {
  it("is the one parameter holding a field", () => {
    expect(Columns.placeholderOf([['format', 'text'], ['vault_tok', 'text']], 'vault_tok', 4)).to.eq('$5::text')
  })

  it("throws for a field no column holds: a mistake in this package, never a host's", () => {
    expect(() => Columns.placeholderOf(Pair, 'boxlabel', 1)).to.throw('No column holds boxlabel')
  })
})

describe("Columns.selected", () => {
  it("reads a bigint as a double and a jsonb as text, the same from every driver", () => {
    expect(Columns.selected(Pair)).to.eq('vault_tok, registered_at::float8 AS registered_at')
    expect(Columns.selected([['whisper_ciphered', 'jsonb']])).to.eq('whisper_ciphered::text AS whisper_ciphered')
  })
})

describe("Columns.jsonSelected", () => {
  it("reads a jsonb column as its text and every other as it is, as its example shows", () => {
    expect(Columns.jsonSelected([['vault_tok', 'text'], ['sidecar', 'jsonb']])).to.eq('vault_tok, sidecar::text AS sidecar')
    expect(Columns.jsonSelected([['registered_at', 'bigint']])).to.eq('registered_at')
  })
})

describe("Columns.paramsOf", () => {
  it("is the record's values in column order, a null or missing field as null, as its example shows", () => {
    expect(Columns.paramsOf({ vault_tok: 'v1', passkey: null }, [['vault_tok', 'text'], ['passkey', 'jsonb']])).to.deep.equal(['v1', null])
    expect(Columns.paramsOf({ vault_tok: 'v1' }, [['vault_tok', 'text'], ['passkey', 'jsonb']])).to.deep.equal(['v1', null])
  })

  it("sends a jsonb value as its JSON text", () => {
    expect(Columns.paramsOf({ whisper_ciphered: TH.fakeCiphered('a1') }, [['whisper_ciphered', 'jsonb']]))
      .to.deep.equal(['{"cipher_iv_b64":"iv-a1","ciphertext_b64":"ct-a1"}'])
  })

  it("covers every column of a real vault record's row and a real box", () => {
    const row = rowOfVaultRecord(TH.vaultRecordOf('u1'))
    expect(Columns.paramsOf(row, VaultRowColumns)).to.not.include(undefined)
    expect(Columns.paramsOf(TH.boxOf('anthropic', 'a1'), BoxColumns)).to.not.include(undefined)
  })
})

describe("Columns.recordOf", () => {
  it("reads a null column as a null field, as its example shows", () => {
    expect(Columns.recordOf({ vault_tok: 'v1', passkey: null }, [['vault_tok', 'text'], ['passkey', 'jsonb']])).to.deep.equal({ vault_tok: 'v1', passkey: null })
  })

  it("leaves a column the row lacks out of the record", () => {
    expect(Columns.recordOf({ vault_tok: 'v1' }, [['vault_tok', 'text'], ['passkey', 'jsonb']])).to.deep.equal({ vault_tok: 'v1' })
  })

  it("parses a jsonb column's text, and leaves one a driver already parsed as it is", () => {
    const ciphered = TH.fakeCiphered('a1')
    expect(Columns.recordOf({ whisper_ciphered: JSON.stringify(ciphered) }, [['whisper_ciphered', 'jsonb']])).to.deep.equal({ whisper_ciphered: ciphered })
    expect(Columns.recordOf({ whisper_ciphered: ciphered }, [['whisper_ciphered', 'jsonb']])).to.deep.equal({ whisper_ciphered: ciphered })
  })

  it("hands back a row that is not an object as it is, for validation to refuse", () => {
    expect(Columns.recordOf(undefined, Pair)).to.be.undefined
    expect(Columns.recordOf('vault-tok', Pair)).to.eq('vault-tok')
  })

  it("rebuilds a box from its params' round trip", () => {
    const box = TH.boxOf('anthropic', 'a1')
    const row = Object.fromEntries(BoxColumns.map(([field], ii) => [field, Columns.paramsOf(box, BoxColumns)[ii]]))
    expect(Columns.recordOf(row, BoxColumns)).to.deep.equal(box)
  })
})

describe("ListedBoxColumns", () => {
  it("is every box column but the two ciphered ones", () => {
    expect(ListedBoxColumns.map(([field]) => field)).to.deep.equal(['format', 'boxlabel', 'revision_tok', 'whisper_codec', 'whisper_schema_version', 'sidecar', 'registered_at', 'written_at'])
  })
})

describe("rowOfVaultRecord and vaultRecordOfRow", () => {
  it("lays a vault record's gate into its two wayin columns, and nests them back, as their examples show", () => {
    const record = TH.vaultRecordOf('u1', { gate: TH.gateOf('u1', { passkey: TH.passkeyWayinOf('laptop') }) })
    const row = rowOfVaultRecord(record)
    expect(row).to.deep.equal({ ...TH.omitting(record, 'gate'), passphrase: record.gate.passphrase, passkey: record.gate.passkey })
    expect(vaultRecordOfRow(row)).to.deep.equal(record)
  })

  it("lays a novel vault's record as two null columns, and reads two nulls back as no gate", () => {
    const row = rowOfVaultRecord(TH.gatelessOf('u1'))
    expect(row).to.include({ passphrase: null, passkey: null })
    expect(vaultRecordOfRow(row)).to.deep.equal(TH.gatelessOf('u1'))
  })

  it("reads a passkey beside no passphrase as the damaged gate it is, never as a novel vault", () => {
    const row = { ...rowOfVaultRecord(TH.gatelessOf('u1')), passkey: TH.passkeyWayinOf('laptop') }
    expect(vaultRecordOfRow(row)).to.deep.include({ gate: { passphrase: null, passkey: TH.passkeyWayinOf('laptop') } })
  })

  it("hands back a row that is no object as it came, for the VaultDB's check to refuse", () => {
    expect(vaultRecordOfRow(null)).to.be.null
    expect(vaultRecordOfRow('nope')).to.eq('nope')
  })
})
