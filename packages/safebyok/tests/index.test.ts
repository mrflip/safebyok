import { fileURLToPath } from 'node:url'
import { Rolldown } from 'tsdown'
import { describe, expect, it } from 'vitest'
import * as Zod from 'zod'
import * as safebyok from '../src/index'
import * as PX from '../src/shapes/primitives'
import * as CX from '../src/shapes/scopes'
import * as KX from '../src/shapes/key-deriver-spec'
import * as FX from '../src/shapes/fields'
import * as BX from '../src/shapes/box'
import * as VDX from '../src/shapes/vault-db'
import * as DX from '../src/shapes/device'
import * as VX from '../src/shapes/vault'
import * as OX from '../src/shapes/bank-opts'
import * as HX from '../src/shapes/host-code'
import * as MX from '../src/shapes/mask'

describe("the package's entry point", () => {
  it("exports exactly the public surface", () => {
    expect(Object.keys(safebyok)).to.have.members([
      'Argon2idWebV1', 'argon2idDeriver', 'argon2idWebV1Deriver', 'checkSaltFits', 'parseKeyDeriverSpec',
      'Bank', 'Vault', 'correctableKindVals', 'gatingKindVals', 'delDamagedVault', 'parseLogger', 'DefaultLogger', 'setDefaultLogger',
      'ciphered', 'deviceRecord', 'DeviceRecordFormat', 'epochMillis', 'FarFuture', 'FarPast', 'LeaseHours', 'ForeverMillis', 'Box', 'boxDamageVals', 'boxDamaged', 'BoxFormat', 'boxRecord', 'boxSparse', 'boxStamp', 'MaxBoxes', 'MaxLeaseHours', 'MaxWhisperBytes', 'MinuteMillis', 'passkeyWayinRecord', 'PasskeySaltBytes', 'passphraseWayinRecord', 'sidecar', 'StaleMinutes', 'wayinRecord', 'wayinKindVals', 'Wayin', 'PassphraseWayin', 'PasskeyWayin', 'Lease', 'leaseRecord', 'leaseStamp', 'gateRecord', 'gateSparse', 'passkeyWayinSparse', 'passphraseWayinSparse', 'VaultFormat', 'vaultSparse', 'vaultStamp', 'vaultTombstone', 'TombstoneFormat', 'vaultRecord', 'vaultScope', 'isGated', 'whisper', 'wallClock',
      'LabelPattern', 'MaxLabelChars', 'MaxUserIdChars', 'UserIdPattern', 'label', 'user_id', 'Kit', 'Validator', 'consistent', 'demandConsistent', 'verifyConsistent',
      'VaultError', 'RefusalFamilyForKind', 'refusalFamilyVals', 'refusalKindVals', 'isCondition', 'isVaultError', 'storageTroubleOf', 'outcomeOf', 'unexpectedError', 'valOf',
      'VaultDB', 'splitStoredBoxes', 'Scopepath', 'Expectations', 'Refusals', 'HostErrorSanitizer', 'localVaultDB', 'memoryDeviceDB', 'DeviceDB', 'deviceRecordOf',
      'bankScope', 'boxscope', 'bankScopepath', 'vaultScopepath', 'leaseScopepath', 'deviceScopepath', 'boxScopepath', 'vaultBag', 'bankBag', 'keyDeriverSpec', 'maskOpts', 'idbOpts',
      'vault_tok', 'revision_tok', 'salt_b64', 'prf_salt_b64', 'whisper_ciphered', 'box_key_wrapped', 'vault_key_wayin_wrapped', 'vault_key_lease_wrapped',
      'vaultDraft', 'passkeyAnswer', 'strengthChecker', 'passphraseVerdict', 'capacity', 'vaultRecordExpectation', 'boxGetExpectation', 'boxExpectation', 'vaultDelExpectation', 'boxDelExpectation', 'boxDeletion',
      'makeBankOpts', 'bankVaultOpts', 'vaultDBShape', 'deviceDBShape', 'clockShape', 'clockReading', 'keyDeriverShape', 'loggerShape', 'localVaultDBOptsShape',
      'domStore', 'memoryStore',
      'stableJsonify',
    ])
  })

  it("exports each name check and its bounds, as the same objects the vault checks with", () => {
    for (const [exportname, exported] of Object.entries(PX)) {
      expect(safebyok[exportname as keyof typeof safebyok], exportname).to.eq(exported)
    }
  })

  it("exports the scopepaths an adapter over a key-value store files rows under, as one namespace", () => {
    expect(Object.keys(safebyok.Scopepath)).to.have.members(['Delimiter', 'bank', 'vault', 'lease', 'device', 'box', 'bankScope', 'vaultScope', 'boxscope', 'isLease', 'isDevice', 'isBox', 'withinVaultScopepathPrefix', 'withinVaultScopepathPred'])
  })

  it("exports each validator a host or an adapter calls by name, no namespace of them, each the object its module makes, and Validator and its kit to make more", () => {
    const validatorsByName = Object.entries(safebyok).filter(([_exportname, exported]) => exported instanceof Zod.ZodType)
    expect(validatorsByName.map(([exportname]) => exportname)).to.have.members([
      'epochMillis', 'label', 'user_id',
      'bankScope', 'vaultScope', 'boxscope', 'bankScopepath', 'vaultScopepath', 'leaseScopepath', 'deviceScopepath', 'boxScopepath',
      'vault_tok', 'revision_tok', 'salt_b64', 'prf_salt_b64', 'whisper_ciphered', 'box_key_wrapped', 'vault_key_wayin_wrapped', 'vault_key_lease_wrapped', 'ciphered',
      'passphraseWayinRecord', 'passkeyWayinRecord', 'wayinRecord', 'gateRecord', 'vaultRecord', 'vaultSparse', 'vaultStamp', 'vaultTombstone', 'vaultDraft', 'gateSparse', 'passphraseWayinSparse', 'passkeyWayinSparse',
      'boxRecord', 'boxSparse', 'boxDamaged', 'boxStamp', 'leaseRecord', 'leaseStamp', 'deviceRecord', 'whisper', 'sidecar', 'capacity',
      'vaultRecordExpectation', 'boxGetExpectation', 'boxExpectation', 'vaultDelExpectation', 'boxDelExpectation', 'boxDeletion',
      'makeBankOpts', 'bankVaultOpts', 'vaultBag', 'bankBag', 'localVaultDBOptsShape', 'maskOpts', 'idbOpts',
      'vaultDBShape', 'deviceDBShape', 'clockShape', 'clockReading', 'keyDeriverShape', 'keyDeriverSpec', 'strengthChecker', 'passphraseVerdict', 'loggerShape', 'passkeyAnswer',
    ])
    const shapesModules: readonly object[] = [PX, CX, KX, FX, BX, VDX, DX, VX, OX, HX, MX]
    for (const [exportname, exported] of validatorsByName) {
      expect(shapesModules.some((shapesModule) => (shapesModule as Record<string, unknown>)[exportname] === exported), exportname).to.be.true
    }
    expect(safebyok.Validator('bad_option', ({ str }) => ({ named: str })).named.safeParse('acme').success).to.be.true
  })

  it("exports the sanitizer an adapter throws through in place of a foreign error, as one namespace", () => {
    expect(Object.keys(safebyok.HostErrorSanitizer)).to.have.members(['refusalFor'])
  })

  it("exports the refusals an adapter throws and unexpectedError, and the comparisons a key-value adapter makes, each as one namespace", () => {
    expect(Object.keys(safebyok.Refusals)).to.have.members(['StorageTroubleMessage', 'storageUnavailable', 'unexpectedError', 'staleDel', 'StaleDelMessage', 'staleVaultRecord', 'StaleVaultRecordMessage', 'staleBox', 'StaleBoxMessage', 'vaultMismatch', 'notPermitted', 'vaultFull', 'StorageBlockedMessage', 'storageBlocked', 'isStorageBlocked'])
    expect(Object.keys(safebyok.Expectations)).to.have.members(['isTombstone', 'vaultRecordMeets', 'vaultRecordRefusalOf', 'vaultMeets', 'vaultRecordPutOf', 'newLifeOf', 'tombstoneOf', 'boxRefusalOf', 'deletionOf'])
  })
})

const entrySource = fileURLToPath(new URL('../src/index.ts', import.meta.url))

/** The minified JavaScript a bundler ships for an app whose only import from safebyok is `imports`. */
const bundleOf = async (imports: string): Promise<string> => {
  const appModule = `export { ${imports} } from ${JSON.stringify(entrySource)}`
  const built = await Rolldown.build({
    input:    'app',
    platform: 'browser',
    write:    false,
    logLevel: 'silent',
    output:   { minify: true },
    plugins:  [{
      name:      'app_module',
      resolveId: (specifier) => (specifier === 'app' ? specifier : null),
      load:      (moduleId) => (moduleId === 'app' ? appModule : null),
    }],
  })
  return built.output.map((piece) => (piece.type === 'chunk' ? piece.code : '')).join('\n')
}

// The supplied spec's label ships with Bank.make, which refuses a deriver wearing it without its
// parameters; Argon2id's implementation shows by the variants it names, Argon2d among them.
const Argon2Implementation = /argon2d/iu

describe("the main entry's tree-shaking", () => {
  it("leaves Argon2id out of an app that imports Bank alone", async () => {
    const shipped = await bundleOf('Bank')
    expect(shipped).to.include('Bank.make')
    expect(shipped).to.include('argon2id_web_v1')
    expect(shipped).to.not.match(Argon2Implementation)
  }, 30_000)

  it("brings Argon2id in for an app that imports the deriver: the check above can fail", async () => {
    expect(await bundleOf('argon2idWebV1Deriver')).to.match(Argon2Implementation)
  }, 30_000)

  // A deriver over another Argon2id implementation (safebyok-fastkey) checks its spec this way.
  it("leaves Argon2id out of an app that imports only the spec check", async () => {
    const shipped = await bundleOf('parseKeyDeriverSpec')
    expect(shipped).to.include('keyDeriverSpec')
    expect(shipped).to.not.match(Argon2Implementation)
  }, 30_000)

  it("leaves Argon2id out of an app that imports only the supplied spec", async () => {
    const shipped = await bundleOf('Argon2idWebV1')
    expect(shipped).to.include('argon2id_web_v1')
    expect(shipped).to.not.match(Argon2Implementation)
  }, 30_000)
})
