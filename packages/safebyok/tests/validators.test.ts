import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import * as Zod from 'zod'
import * as Validators from '../src/validators'
import * as PX from '../src/shapes/primitives'
import * as VX from '../src/shapes/vault'
import * as DX from '../src/shapes/device'
import * as FX from '../src/shapes/fields'
import * as BX from '../src/shapes/box'
import * as VDX from '../src/shapes/vault-db'
import * as OX from '../src/shapes/bank-opts'
import { VaultError } from '../src/errors'
import { Bank } from '../src/bank'
import { parseKeyDeriverSpec } from '../src/key-deriver-spec'
import { optionsCheck } from '../src/options'
import * as TH from './test-helpers'
import { makeWorld } from './vault/world'

/** The validators made in a `Validator` call that the namespace leaves out, each exported from its own module for the package's own use: held to the same rules as the namespace's. */
const InPackage = {
  boxBase: BX.boxBase, madeShape: BX.madeShape, madeUnder: BX.madeUnder, sealBoxProps: BX.sealBoxProps, freshPasskeyAnswer: VX.freshPasskeyAnswer, boxCiphered: BX.boxCiphered, leaseGrant: DX.leaseGrant, vaultStampButFormat: VX.vaultStampButFormat, whisperBag: BX.whisperBag,
  passphraseWayinHeader: VX.passphraseWayinHeader, passkeyWayinHeader: VX.passkeyWayinHeader, wayinkind: VX.wayinkind, device_id: FX.device_id, key_deriver_label: FX.key_deriver_label, credential_id: FX.credential_id,
  passphraseCleartext: VX.passphraseCleartext, listedBox: VDX.listedBox, listingAnswer: VDX.listingAnswer, storedVaultAnswer: VDX.storedVaultAnswer, storedRevision: VDX.storedRevision, storedVaultTok: VDX.storedVaultTok,
  declaredBoxes: OX.declaredBoxes, declaredBytes: OX.declaredBytes, leaseHoursAsMillis: OX.leaseHoursAsMillis, maxBoxes: OX.maxBoxes, maxWhisperBytes: OX.maxWhisperBytes, renewMinutesAsMillis: OX.renewMinutesAsMillis, staleMinutesAsMillis: OX.staleMinutesAsMillis, vaultMadeUnder: VX.vaultMadeUnder,
}

/** Every validator the package makes, the namespace's and its own. */
const EveryValidator = { ...Validators, ...InPackage }

/** What every input below carries, as a key and as a value: a refusal that holds it repeated its input. */
const Marker = 'zqxMarkerKey7'

/** The fields `schema` names, where it is an object: each is handed the marker, or a bag or list of it. */
const fieldnamesOf = (schema: unknown): string[] => (schema instanceof Zod.ZodObject ? Object.keys(schema.shape) : [])

/** Inputs for `schema`, each failing a check while carrying the marker as a key and as a value, at the top and one level down. */
const markedInputsOf = (schema: unknown): unknown[] => {
  const fieldnames = fieldnamesOf(schema)
  const fieldsAs = (val: unknown) => Object.fromEntries(fieldnames.map((fieldname) => [fieldname, val]))
  return [
    Marker,
    [Marker, { [Marker]: Marker }],
    { [Marker]: Marker },
    { ...fieldsAs(Marker), [Marker]: Marker },
    { ...fieldsAs({ [Marker]: Marker }), [Marker]: [Marker] },
    { ...fieldsAs([{ [Marker]: Marker }]), [`${Marker}_two`]: { [Marker]: undefined } },
    { [Marker]: undefined, nested: { [Marker]: new Date() } },
  ]
}

/** What a refusal of `attempt` says, every message, stack and field down through its causes; '' when it passes. */
const refusalTextOf = (attempt: () => unknown): string => {
  try {
    attempt()
    return ''
  } catch (err) {
    return TH.thrownText(err)
  }
}

describe("Validators", () => {
  it("parses a scope through the namespace, as its first example shows", () => {
    expect(Validators.vaultScope.parse({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
  })

  it("refuses an empty vault_tok in safeParse, as its second example shows", () => {
    expect(Validators.vault_tok.safeParse('').success).to.be.false
  })

  it("throws a VaultError from each parse but the three primitives', whose parse is Zod's own, those the namespace leaves out included", () => {
    for (const [valname, validator] of Object.entries(EveryValidator)) {
      const thrown = (() => { try { validator.parse(Symbol('nothing a validator takes')); return null } catch (err) { return err } })()
      expect(thrown, valname).to.be.instanceOf(Object.hasOwn(PX, valname) ? Zod.ZodError : VaultError)
    }
  })

  it("holds every validator as the same object its module exports", () => {
    expect(Validators.label).to.eq(PX.label)
  })

  it("leaves out the validators the package builds others from or checks its own steps with", () => {
    for (const valname of Object.keys(InPackage)) {
      expect(Object.hasOwn(Validators, valname), valname).to.be.false
    }
  })
})

describe("no refusal repeats its input", () => {
  for (const [valname, validator] of Object.entries(EveryValidator)) {
    it(`${valname}: quotes no key or value it was handed`, () => {
      for (const input of markedInputsOf(validator)) {
        expect(refusalTextOf(() => validator.parse(input)), valname).to.not.include(Marker)
      }
    })
  }

  it("Bank.make, bank.ensureVault and its options: quote no option, field or value they were handed", async () => {
    const world = makeWorld()
    const { vaultlabel: _vaultlabel, ...bankOpts } = world.optsWith()
    expect(refusalTextOf(() => Bank.make({ ...bankOpts, [Marker]: Marker } as typeof bankOpts))).to.include('There is a field it does not take').and.not.include(Marker)
    expect(refusalTextOf(() => Bank.make({ ...bankOpts, leaseHours: Marker } as unknown as typeof bankOpts))).to.include('leaseHours').and.not.include(Marker)
    const bank = Bank.make(bankOpts)
    const refusals = await Promise.all([
      bank.tryEnsureVault({ vaultlabel: Marker }),
      bank.tryEnsureVault({ vaultlabel: 'main', user_id: Marker }),
      bank.tryEnsureVault({ vaultlabel: 'main', vaultDB: Marker } as unknown as { vaultlabel: string }),
      bank.tryEnsureVault({ vaultlabel: 'main' }, { [Marker]: Marker } as object),
      bank.tryEnsureVault({ vaultlabel: 'main' }, { vaultDB: Marker } as unknown as object),
    ])
    for (const refusal of refusals) {
      expect(refusal.ok).to.be.false
      expect(TH.thrownText(refusal.err)).to.not.include(Marker)
    }
  })

  it("an options check, a vault's calls and a keyDeriverSpec: quote no option, field or value they were handed", async () => {
    const checkOpts = optionsCheck(({ unk }) => ({ sidecar: unk.optional() }), "Its only option is `sidecar`.")
    expect(refusalTextOf(() => checkOpts({ [Marker]: Marker }))).to.include('it takes only sidecar').and.not.include(Marker)
    const vault = await makeWorld().openUnlocked('pw')
    const hello = await vault.tryHello({ [Marker]: Marker } as unknown as { staleMinutes: number })
    const put = await vault.tryPutBox({ boxlabel: Marker, [Marker]: Marker } as unknown as { boxlabel: string }, Marker)
    const sidecar = await vault.tryPutBox({ boxlabel: 'anthropic', sidecar: { [Marker]: undefined } } as unknown as { boxlabel: string }, Marker)
    for (const refusal of [hello, put, sidecar]) {
      expect(refusal.ok).to.be.false
      expect(TH.thrownText(refusal.err)).to.not.include(Marker)
    }
    expect(refusalTextOf(() => parseKeyDeriverSpec({ [Marker]: Marker } as never))).to.include('algorithm: ').and.not.include(Marker)
  })
})
