import { fileURLToPath } from 'node:url'
import { Rolldown } from 'tsdown'
import { describe, expect, it } from 'vitest'
import * as safebyok from '../src/index'
import * as Validators from '../src/validators'

describe("the package's entry point", () => {
  it("exports exactly the public surface", () => {
    expect(Object.keys(safebyok)).to.have.members([
      'Argon2idWebV1', 'argon2idDeriver', 'argon2idWebV1Deriver', 'ensureSaltFits', 'parseKeyDeriverSpec',
      'openVault', 'eraseDamagedVault', 'parseLogger', 'MinPassphraseChars', 'passphraseLengthTest',
      'Ciphered', 'EpochMillis', 'FarFuture', 'FarPast', 'ForcePassphraseReentryHours', 'ForeverMillis', 'Lockbox', 'LockboxSummary', 'MaxLockboxes', 'MaxReentryHours', 'MaxUnlocks', 'MaxWhisperBytes', 'MinuteMillis', 'PasskeyEnvelope', 'PasskeySaltBytes', 'PassphraseEnvelope', 'PublicBag', 'UnlockEnvelope', 'UnlockMethodVals', 'VaultBundle', 'VaultScope', 'Whisper', 'wallClock',
      'AnyTextValidators', 'DefaultValidators', 'Label', 'LabelPattern', 'MaxLabelChars', 'MaxUserIdChars', 'NameFloor', 'NameFloorBytes', 'UserId', 'UserIdPattern', 'checkValidators',
      'VaultError', 'VaultErrorFamilyForKind', 'VaultErrorFamilyVals', 'VaultErrorKindVals', 'isVaultCondition', 'isVaultError',
      'VaultDB', 'Ckeys', 'Sanitizer', 'localVaultDB', 'memoryDeviceDB',
      'domStore', 'memoryStore',
      'stableJsonify',
    ])
  })

  it("exports every check and bound safebyok/validators does, as the same objects", () => {
    for (const [exportname, exported] of Object.entries(Validators)) {
      expect(safebyok[exportname as keyof typeof safebyok], exportname).to.eq(exported)
    }
  })

  it("exports the ckeys an adapter over a key-value store files rows under, as one namespace", () => {
    expect(Object.keys(safebyok.Ckeys)).to.have.members(['Delimiter', 'bundle', 'box', 'unlock', 'mark', 'boxPrefix', 'isBoxIn', 'boxlabelOf', 'isUnlock', 'isMark'])
  })

  it("exports the sanitizer an adapter throws through in place of a foreign error, as one namespace", () => {
    expect(Object.keys(safebyok.Sanitizer)).to.have.members(['refusalFor'])
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

// The supplied spec's label ships with openVault, which refuses a deriver wearing it without its
// parameters; Argon2id's implementation shows by the variants it names, Argon2d among them.
const Argon2Implementation = /argon2d/iu

describe("the main entry's tree-shaking", () => {
  it("leaves Argon2id out of an app that imports openVault alone", async () => {
    const shipped = await bundleOf('openVault')
    expect(shipped).to.include('openVault')
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
