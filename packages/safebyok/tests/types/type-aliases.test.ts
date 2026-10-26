import { describe, expect, expectTypeOf, it } from 'vitest'
import type * as Z from 'zod'
import type { BoxRecord } from '../../src/box'
import type { BankScope, VaultScope } from '../../src/checks/core-checks'
import * as Primitives from '../../src/checks/primitives'
import { type Ciphered, cipherCtx, makeBoxKey, makeVaultKey, wrapKeyUnder } from '../../src/crypto'
import type { VaultError } from '../../src/errors'
import * as TypeAliases from '../../src/types/type-aliases'
import {
  type Applabel, type Boxlabel, type BoxKeyWrapped, type ConsistencyWith, type Lifecycled, type PassphraseCleartext, type PassphraseSalt, type PrfSalt,
  type Refused, type RevisionTok, type UserId, type VaultKeyLeaseWrapped, type VaultKeyWayinWrapped, type Vaultlabel, type VaultTok, type WhisperCiphered,
  box_key_wrapped, passphraseCleartext, prf_salt_b64, revision_tok, salt_b64, vault_key_lease_wrapped, vault_key_wayin_wrapped, vault_tok, whisper_ciphered,
} from '../../src/types/type-aliases'
import type { LeaseRecord } from '../../src/types/types'
import type { PasskeyWayinRecord, PassphraseWayinRecord } from '../../src/vault-record'
import type { Vault } from '../../src/vault'
import * as TH from '../test-helpers'

describe("the names a host writes by hand", () => {
  it("are plain strings and numbers, so a host's own values pass as they are", () => {
    expectTypeOf<Applabel>().toEqualTypeOf<string>()
    expectTypeOf<Vaultlabel>().toEqualTypeOf<string>()
    expectTypeOf<Boxlabel>().toEqualTypeOf<string>()
    expectTypeOf<UserId>().toEqualTypeOf<string>()
    expectTypeOf<VaultTok>().toEqualTypeOf<string>()
    expectTypeOf<RevisionTok>().toEqualTypeOf<string>()
    expectTypeOf<TypeAliases.EpochMillis>().toEqualTypeOf<number>()
  })

  it("check a token as text that is not empty, refusing an empty one as 'bad_record' in a sentence", () => {
    for (const token of [vault_tok, revision_tok]) {
      expect(token.parse('Qm9vdA')).to.eq('Qm9vdA')
      const err = TH.expectSyncRefusal(() => token.parse(''), 'bad_record')
      expect(err.message).to.eq("A token is minted by safebyok, so it can't be empty")
    }
  })

  it("hand out EpochMillis as the same check the package keeps every time with", () => {
    expect(TypeAliases.EpochMillis).to.eq(Primitives.EpochMillis)
  })
})

describe("the branded fields", () => {
  it("are a record's fields by the names they check, as the first example shows", () => {
    expectTypeOf<PassphraseWayinRecord['salt_b64']>().toEqualTypeOf<PassphraseSalt>()
    expectTypeOf<PassphraseWayinRecord['vault_key_wayin_wrapped']>().toEqualTypeOf<VaultKeyWayinWrapped>()
    expectTypeOf<PasskeyWayinRecord['prf_salt_b64']>().toEqualTypeOf<PrfSalt>()
    expectTypeOf<PasskeyWayinRecord['vault_key_wayin_wrapped']>().toEqualTypeOf<VaultKeyWayinWrapped>()
    expectTypeOf<BoxRecord['box_key_wrapped']>().toEqualTypeOf<BoxKeyWrapped>()
    expectTypeOf<BoxRecord['whisper_ciphered']>().toEqualTypeOf<WhisperCiphered>()
    expectTypeOf<LeaseRecord['vault_key_lease_wrapped']>().toEqualTypeOf<VaultKeyLeaseWrapped>()
  })

  it("brand a key wrapped for its role where the record is made, as the second example shows", async () => {
    const ctx = cipherCtx({ test: 'brand' }, 'a test of the brand')
    const wrapped = await wrapKeyUnder(await makeVaultKey(), await makeBoxKey(), ctx)
    const branded = box_key_wrapped.parse(wrapped)
    expectTypeOf(branded).toEqualTypeOf<BoxKeyWrapped>()
    expect(branded).to.deep.equal(wrapped)
  })

  it("never trade places: a salt or a wrap of one role is no other's, and plain text or a bare Ciphered is none", () => {
    expectTypeOf<PassphraseSalt>().not.toExtend<PrfSalt>()
    expectTypeOf<PrfSalt>().not.toExtend<PassphraseSalt>()
    expectTypeOf<string>().not.toExtend<PassphraseSalt>()
    expectTypeOf<BoxKeyWrapped>().not.toExtend<WhisperCiphered>()
    expectTypeOf<VaultKeyWayinWrapped>().not.toExtend<VaultKeyLeaseWrapped>()
    expectTypeOf<Ciphered>().not.toExtend<BoxKeyWrapped>()
    expectTypeOf<BoxKeyWrapped>().toExtend<Ciphered>()
  })

  it("take what storage holds unbranded, so a check of a record read back needs no cast", () => {
    expectTypeOf<Z.input<typeof salt_b64>>().toEqualTypeOf<string>()
    expectTypeOf<Z.input<typeof box_key_wrapped>>().toEqualTypeOf<Ciphered>()
  })

  it("check a salt's shape and leave its length to its wayin, so a short salt passes here", () => {
    expect(salt_b64.parse('c2FsdA')).to.eq('c2FsdA')
    expect(prf_salt_b64.parse('c2FsdA')).to.eq('c2FsdA')
  })

  it("refuse an empty salt or a broken wrap as 'bad_record', quoting none of it", () => {
    TH.expectSyncRefusal(() => salt_b64.parse(''), 'bad_record')
    TH.expectSyncRefusal(() => prf_salt_b64.parse(42), 'bad_record')
    for (const role of [whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped]) {
      const err = TH.expectSyncRefusal(() => role.parse({ cipher_iv_b64: 'iv-TELLTALE' }), 'bad_record')
      expect(err.message).to.not.include('TELLTALE')
    }
  })
})

describe("passphraseCleartext", () => {
  it("hands back the text the user typed, branded for the key deriver, as its first example shows", () => {
    const typed = 'correct horse battery staple'
    const cleartext = passphraseCleartext.parse(typed)
    expectTypeOf(cleartext).toEqualTypeOf<PassphraseCleartext>()
    expect(cleartext).to.eq(typed)
  })

  it("refuses anything but text as 'bad_option', quoting none of it, as its second example shows", () => {
    const err = TH.expectSyncRefusal(() => passphraseCleartext.parse(42), 'bad_option')
    expect(err.message).to.eq("A passphrase is the text the user typed, as a string")
    const wrapped = TH.expectSyncRefusal(() => passphraseCleartext.parse({ passphrase: 'TELLTALE' }), 'bad_option')
    expect(wrapped.message).to.not.include('TELLTALE')
    expect(JSON.stringify(wrapped.meta)).to.not.include('TELLTALE')
  })

  it("takes a blank passphrase, which is the gating's to judge", () => {
    expect(passphraseCleartext.parse('')).to.eq('')
    expect(passphraseCleartext.parse(' '.repeat(3))).to.eq(' '.repeat(3))
  })

  it("is text a host's own key deriver takes as it is, but no plain text is one", () => {
    expectTypeOf<PassphraseCleartext>().toExtend<string>()
    expectTypeOf<string>().not.toExtend<PassphraseCleartext>()
  })
})

describe("Lifecycled and Refused", () => {
  type BankStage = Lifecycled<BankScope, 'made' | 'starting' | 'ready'> | Refused<BankScope>

  it("make a thing's stages one union, told apart by lifecycle, as Lifecycled's example shows", () => {
    expectTypeOf<BankStage['lifecycle']>().toEqualTypeOf<'made' | 'starting' | 'ready' | 'refused'>()
    expectTypeOf<Lifecycled<VaultScope>['lifecycle']>().toEqualTypeOf<'starting' | 'ready'>()
    expectTypeOf<Lifecycled<VaultScope>>().toExtend<VaultScope>()
  })

  it("carry the refusal on the refused stage alone, as Refused's example shows", () => {
    const showTrouble = (stage: BankStage): VaultError | null => {
      if (stage.lifecycle === 'refused') { return stage.err }
      expectTypeOf(stage).not.toHaveProperty('err')
      return null
    }
    expectTypeOf(showTrouble).returns.toEqualTypeOf<VaultError | null>()
    expectTypeOf<Refused<BankScope>>().toExtend<BankScope>()
  })
})

describe("ConsistencyWith", () => {
  it("is what a collaborator takes, and a Vault object is one, as its example shows", () => {
    expectTypeOf<ConsistencyWith<VaultScope>>().toHaveProperty('demandConsistentWith')
    expectTypeOf<Vault>().toExtend<ConsistencyWith<VaultScope>>()
    expectTypeOf<VaultScope>().not.toExtend<ConsistencyWith<VaultScope>>()
  })
})
